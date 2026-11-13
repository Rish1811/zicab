import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusSeatHold } from '../../user/models/BusSeatHold.js';
import { BusVendorWallet, BusVendorWalletTransaction } from '../models/BusVendorWallet.js';
import { razorpayApi } from './busRefundService.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import { claimBusBookingPayment } from './busPaymentService.js';
import { publishBusSeatChange } from './busSeatSyncService.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';

/**
 * The bus vendor's prepaid wallet: top it up online, pay for counter seats
 * from it, get cancelled seats back into it.
 *
 * Every balance change runs in a MongoDB transaction together with the record
 * that explains it, so the balance and the history can't disagree. Spending
 * is a conditional $inc (balance >= amount), so two bookings at once can't
 * spend the same rupees.
 */

export const VENDOR_HOLD_MINUTES = 10;
export const VENDOR_WALLET_PROVIDER = 'vendor_wallet';
const MIN_TOP_UP = 1;
const MAX_TOP_UP = 200000;

const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const isOn = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

/** True when counter seats must be paid for (wallet or online) before they are booked. */
export const isVendorPrepaidRequired = async () => isOn((await getTransportRideSettings())?.bus_vendor_prepaid);

/** Whose wallet: the logged-in bus operator or fleet owner. */
export const vendorAccountFromAuth = (auth = {}) => {
  const accountType = auth.role === 'owner' ? 'owner' : auth.role === 'bus_driver' ? 'bus_driver' : '';
  if (!accountType || !mongoose.Types.ObjectId.isValid(String(auth.sub || ''))) {
    throw new ApiError(403, 'Only bus operators and fleet owners have a bus wallet');
  }
  return { accountType, accountId: new mongoose.Types.ObjectId(String(auth.sub)) };
};

const accountFilter = ({ accountType, accountId }) => ({ accountType, accountId });

const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const serializeTransaction = (row) => ({
  id: String(row._id),
  type: row.type,
  amount: round(row.amount),
  balanceAfter: row.balanceAfter === null || row.balanceAfter === undefined ? null : round(row.balanceAfter),
  status: row.status,
  bookingCode: row.bookingCode || '',
  seatLabels: row.seatLabels || [],
  note: row.note || '',
  createdAt: row.createdAt,
});

export const getVendorWallet = async (account, { limit = 30 } = {}) => {
  const [wallet, transactions, prepaidRequired] = await Promise.all([
    BusVendorWallet.findOne(accountFilter(account)).lean(),
    BusVendorWalletTransaction.find({ ...accountFilter(account), status: 'completed' })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, Number(limit) || 30)))
      .lean(),
    isVendorPrepaidRequired(),
  ]);
  return {
    balance: round(wallet?.balance || 0),
    currency: wallet?.currency || 'INR',
    prepaidRequired,
    holdMinutes: VENDOR_HOLD_MINUTES,
    transactions: transactions.map(serializeTransaction),
  };
};

/** Adds or takes money inside a transaction; returns the new balance. */
const moveBalance = async (session, account, amount, { allowNegative = false } = {}) => {
  const change = round(amount);
  const filter = accountFilter(account);
  if (change < 0 && !allowNegative) filter.balance = { $gte: -change };
  const wallet = await BusVendorWallet.findOneAndUpdate(
    filter,
    { $inc: { balance: change }, $setOnInsert: { currency: 'INR' } },
    { returnDocument: 'after', upsert: change >= 0, session },
  );
  if (!wallet) return null;
  return round(wallet.balance);
};

// ---- top-up ---------------------------------------------------------------

export const createVendorTopUpOrder = async (account, amountInput) => {
  const amount = round(amountInput);
  if (!Number.isFinite(amount) || amount < MIN_TOP_UP || amount > MAX_TOP_UP) {
    throw new ApiError(400, `Top-up must be between ₹${MIN_TOP_UP} and ₹${MAX_TOP_UP}`);
  }
  const { keyId } = await resolveConfiguredGatewayCredentials('razor_pay');
  const order = await razorpayApi({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `bvw_${String(account.accountId).slice(-8)}_${Date.now().toString(36)}`,
      notes: { purpose: 'bus_vendor_wallet', accountType: account.accountType, accountId: String(account.accountId) },
    },
  });
  await BusVendorWalletTransaction.create({
    ...accountFilter(account),
    type: 'top_up',
    amount,
    status: 'pending',
    orderId: order.id,
    note: 'Wallet top-up',
    by: `${account.accountType}:${String(account.accountId)}`,
  });
  return { keyId, orderId: order.id, amount: order.amount, currency: order.currency || 'INR' };
};

/** Credits a paid top-up exactly once. Returns the new balance, or null if it was already credited. */
const creditTopUp = async (orderId, paymentId) =>
  runInTransaction(async (session) => {
    const pending = await BusVendorWalletTransaction.findOneAndUpdate(
      { orderId, type: 'top_up', status: 'pending' },
      { $set: { status: 'completed', paymentId } },
      { returnDocument: 'after', session },
    );
    if (!pending) return null;
    const balance = await moveBalance(session, pending, pending.amount);
    pending.balanceAfter = balance;
    await pending.save({ session });
    return balance;
  });

export const verifyVendorTopUp = async (account, body = {}) => {
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  const signature = String(body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }
  const { keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  if (expected !== signature) throw new ApiError(400, 'Invalid payment signature');

  const topUp = await BusVendorWalletTransaction.findOne({ orderId, type: 'top_up', ...accountFilter(account) }).lean();
  if (!topUp) throw new ApiError(404, 'Top-up not found');

  await creditTopUp(orderId, paymentId);
  return getVendorWallet(account);
};

// ---- paying for held seats --------------------------------------------------

/**
 * Pays a held counter booking from the wallet: takes the fare, locks the
 * seats and confirms the booking, all or nothing. The booking is claimed
 * first so the hold sweeper can't expire it half way.
 */
export const payHeldBookingFromWallet = async (account, bookingId, { actor = '' } = {}) => {
  const booking = await claimBusBookingPayment({
    _id: bookingId,
    status: 'pending',
    'payment.provider': VENDOR_WALLET_PROVIDER,
    'payment.orderId': '',
  });
  if (!booking) {
    const current = await BusBooking.findById(bookingId).lean();
    if (current?.status === 'confirmed') throw new ApiError(409, 'This booking is already paid');
    if (current?.payment?.orderId) throw new ApiError(409, 'An online payment was started for these seats. Finish it, or release the seats and start again.');
    if (current && current.status !== 'pending') throw new ApiError(409, 'The 10 minutes are over and the seats were released. Pick them again.');
    throw new ApiError(409, 'This booking is being paid right now. Try again in a moment.');
  }

  const release = async () => {
    await BusBooking.updateOne({ _id: booking._id }, { $set: { 'payment.claimedAt': null } });
  };

  const now = new Date();
  if (!booking.expiresAt || booking.expiresAt <= now) {
    await release();
    throw new ApiError(409, 'The 10 minutes are over and the seats were released. Pick them again.');
  }

  const amount = round(booking.amount);
  try {
    const balance = await runInTransaction(async (session) => {
      const after = await moveBalance(session, account, -amount);
      if (after === null) {
        throw new ApiError(402, `Not enough balance. This booking needs ₹${amount}. Recharge your wallet and pay within the 10 minutes.`);
      }

      const locked = await BusSeatHold.updateMany(
        { bookingId: booking._id, status: 'held', expiresAt: { $gt: now } },
        { $set: { status: 'booked', expiresAt: null } },
        { session },
      );
      if (locked.modifiedCount !== booking.seatIds.length) {
        throw new ApiError(409, 'The seats are no longer held for this booking. Pick them again.');
      }

      const [charge] = await BusVendorWalletTransaction.create([{
        ...accountFilter(account),
        type: 'booking_charge',
        amount: -amount,
        balanceAfter: after,
        status: 'completed',
        bookingId: booking._id,
        bookingCode: booking.bookingCode || '',
        seatLabels: booking.seatLabels || [],
        note: 'Seats booked at the counter',
        by: actor,
      }], { session });

      await BusBooking.updateOne(
        { _id: booking._id, status: 'pending' },
        {
          $set: {
            status: 'confirmed',
            expiresAt: null,
            'payment.status': 'paid',
            'payment.paymentId': String(charge._id),
            'payment.paidAt': new Date(),
            'payment.claimedAt': null,
          },
        },
        { session },
      );
      return after;
    });

    publishBusSeatChange({
      busServiceId: booking.busServiceId,
      scheduleId: booking.scheduleId,
      travelDate: booking.travelDate,
      change: 'booked',
      seatIds: booking.seatIds,
      bookingId: booking._id,
    });
    return { balance, booking: await BusBooking.findById(booking._id).lean() };
  } catch (error) {
    await release();
    throw error;
  }
};

/** Gives a vendor back what cancelled wallet-paid seats cost. */
export const refundSeatsToVendorWallet = async ({ booking, amount, seatLabels = [], actor = '' }) => {
  const refund = round(amount);
  if (refund <= 0) return null;
  const charge = await BusVendorWalletTransaction.findOne({ bookingId: booking._id, type: 'booking_charge' }).lean();
  if (!charge) return null;
  const account = { accountType: charge.accountType, accountId: charge.accountId };
  return runInTransaction(async (session) => {
    const balance = await moveBalance(session, account, refund);
    await BusVendorWalletTransaction.create([{
      ...account,
      type: 'booking_refund',
      amount: refund,
      balanceAfter: balance,
      status: 'completed',
      bookingId: booking._id,
      bookingCode: booking.bookingCode || '',
      seatLabels,
      note: 'Cancelled seats',
      by: actor,
    }], { session });
    return balance;
  });
};

/** Lets go of a held booking the vendor no longer wants (before paying). */
export const releaseHeldBooking = async (bookingId) => {
  const booking = await claimBusBookingPayment({ _id: bookingId, status: 'pending' });
  if (!booking) return false;
  booking.status = 'expired';
  booking.expiresAt = null;
  booking.payment.status = 'released';
  booking.payment.claimedAt = null;
  await booking.save();
  const removed = await BusSeatHold.deleteMany({ bookingId: booking._id, status: 'held' });
  if (removed.deletedCount > 0) {
    publishBusSeatChange({
      busServiceId: booking.busServiceId,
      scheduleId: booking.scheduleId,
      travelDate: booking.travelDate,
      change: 'released',
      seatIds: booking.seatIds,
      bookingId: booking._id,
    });
  }
  return true;
};

// ---- admin ------------------------------------------------------------------

export const adjustVendorWallet = async ({ accountType, accountId, amount, note, adminId }) => {
  const change = round(amount);
  if (!['bus_driver', 'owner'].includes(accountType) || !mongoose.Types.ObjectId.isValid(String(accountId || ''))) {
    throw new ApiError(400, 'Pick a bus vendor');
  }
  if (!Number.isFinite(change) || change === 0 || Math.abs(change) > MAX_TOP_UP) {
    throw new ApiError(400, 'Enter an amount, e.g. 500 to add or -200 to take away');
  }
  if (!String(note || '').trim()) throw new ApiError(400, 'Write the reason');
  const account = { accountType, accountId: new mongoose.Types.ObjectId(String(accountId)) };
  return runInTransaction(async (session) => {
    const balance = await moveBalance(session, account, change);
    if (balance === null) throw new ApiError(409, 'The wallet does not have that much to take away');
    await BusVendorWalletTransaction.create([{
      ...account,
      type: change > 0 ? 'admin_credit' : 'admin_debit',
      amount: change,
      balanceAfter: balance,
      status: 'completed',
      note: String(note).trim().slice(0, 200),
      by: `admin:${String(adminId || '')}`,
    }], { session });
    return { balance };
  });
};

// ---- catching what the vendor's browser never reported ----------------------

/**
 * A top-up paid on Razorpay whose window was closed before it reported back:
 * look the order up and credit it. Called from the bus payment reconciler.
 */
export const reconcileVendorTopUps = async () => {
  const now = Date.now();
  const pending = await BusVendorWalletTransaction.find({
    type: 'top_up',
    status: 'pending',
    createdAt: { $gte: new Date(now - 24 * 3600_000), $lte: new Date(now - 90_000) },
    $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(now - 5 * 60_000) } }],
  })
    .select('_id orderId')
    .limit(25)
    .lean();

  let credited = 0;
  for (const item of pending) {
    const marked = await BusVendorWalletTransaction.updateOne(
      { _id: item._id, status: 'pending', $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(now - 5 * 60_000) } }] },
      { $set: { lastCheckedAt: new Date() } },
    );
    if (marked.modifiedCount !== 1) continue;
    try {
      const payments = await razorpayApi({ path: `/orders/${item.orderId}/payments` });
      const captured = (payments?.items || []).find((payment) => payment.status === 'captured');
      if (captured && (await creditTopUp(item.orderId, captured.id)) !== null) credited += 1;
    } catch (error) {
      console.error('[bus-vendor-wallet] top-up check failed', item.orderId, error.message);
    }
  }
  return { credited };
};

/** Every bus vendor with their balance, for the admin wallet page. */
export const listVendorWallets = async () => {
  const [{ BusDriver }, { Owner }, { BusService }] = await Promise.all([
    import('../../driver/models/BusDriver.js'),
    import('../../admin/models/Owner.js'),
    import('../../admin/models/BusService.js'),
  ]);
  const ownerIds = (await BusService.distinct('ownerId')).filter(Boolean);
  const [busDrivers, owners, wallets] = await Promise.all([
    BusDriver.find({}).select('name phone busName').lean(),
    Owner.find({ _id: { $in: ownerIds } }).select('name owner_name company_name mobile phone').lean(),
    BusVendorWallet.find({}).lean(),
  ]);
  const balanceOf = new Map(wallets.map((w) => [`${w.accountType}:${String(w.accountId)}`, round(w.balance)]));
  const rows = [
    ...busDrivers.map((item) => ({
      accountType: 'bus_driver',
      accountId: String(item._id),
      name: item.busName ? `${item.name || 'Bus operator'} (${item.busName})` : item.name || 'Bus operator',
      phone: item.phone || '',
    })),
    ...owners.map((item) => ({
      accountType: 'owner',
      accountId: String(item._id),
      name: item.company_name || item.owner_name || item.name || 'Fleet owner',
      phone: item.mobile || item.phone || '',
    })),
  ].map((row) => ({ ...row, balance: balanceOf.get(`${row.accountType}:${row.accountId}`) || 0 }));
  return rows.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
};

export const listVendorWalletTransactions = async ({ accountType, accountId }) => {
  if (!['bus_driver', 'owner'].includes(accountType) || !mongoose.Types.ObjectId.isValid(String(accountId || ''))) {
    throw new ApiError(400, 'Pick a bus vendor');
  }
  const rows = await BusVendorWalletTransaction.find({ accountType, accountId, status: 'completed' })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return rows.map((row) => ({ ...serializeTransaction(row), by: row.by || '' }));
};
