import { BusBooking } from '../../user/models/BusBooking.js';
import { BusSeatHold } from '../../user/models/BusSeatHold.js';
import { cancelDhabaOrdersForBooking, confirmDhabaOrdersForBooking } from './dhabaService.js';
import { publishBusSeatChange } from './busSeatSyncService.js';
import { razorpayApi, refundRazorpayPayment } from './busRefundService.js';

/**
 * Confirming and refunding paid ZI Bus bookings.
 *
 * Every path that acts on a booking's payment - the rider's verify call (which
 * a double tap can send twice), the reconciliation job, four API processes -
 * first CLAIMS the booking with a conditional update. Only the claimant may
 * lock or delete its seats and refund it, so two of them can never confirm and
 * refund the same payment, or delete each other's seat locks.
 */

const CLAIM_STALE_MS = 3 * 60 * 1000;
const MAX_REFUND_ATTEMPTS = 8;
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const unclaimed = (now = new Date()) => ({
  $or: [{ 'payment.claimedAt': null }, { 'payment.claimedAt': { $lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
});

/// The booking, claimed for this caller, or null when someone else holds it.
export const claimBusBookingPayment = async (filter) =>
  BusBooking.findOneAndUpdate(
    { ...filter, ...unclaimed() },
    { $set: { 'payment.claimedAt': new Date() } },
    { returnDocument: 'after' },
  );

const releaseClaim = async (booking) => {
  if (!booking) return;
  booking.payment.claimedAt = null;
  await booking.save();
};

const isRefunded = (booking) => String(booking.payment?.status || '').endsWith('_refunded');

/// Refunds the whole payment (seats + food) of a booking that could not be
/// honoured, recording the outcome so a failed refund is retried by the
/// reconciliation job instead of being forgotten. Call only while claimed.
export const refundClaimedBooking = async (booking, reason) => {
  const paymentId = String(booking.payment?.paymentId || '');
  if (!paymentId || isRefunded(booking)) {
    return isRefunded(booking);
  }

  try {
    const refund = await refundRazorpayPayment({
      paymentId,
      amount: roundMoney(Number(booking.amount || 0) + Number(booking.foodAmount || 0)),
      notes: { bookingCode: booking.bookingCode || '', reason },
    });
    booking.payment.status = `${reason}_refunded`;
    booking.payment.refundId = refund?.id || '';
    booking.payment.refundedAt = new Date();
    booking.payment.refundError = '';
    return true;
  } catch (error) {
    const message = String(error?.message || '');
    // Already refunded on Razorpay's side (an earlier attempt that we failed
    // to record): treat as done.
    if (/fully refunded|already been refunded|exceeds|greater than/i.test(message)) {
      booking.payment.status = `${reason}_refunded`;
      booking.payment.refundedAt = booking.payment.refundedAt || new Date();
      booking.payment.refundError = '';
      return true;
    }
    booking.payment.status = `${reason}_refund_pending`;
    booking.payment.refundAttempts = Number(booking.payment.refundAttempts || 0) + 1;
    booking.payment.refundError = message.slice(0, 300);
    console.error('[bus] refund failed', booking.bookingCode, message);
    return false;
  }
};

/// Seats can't be honoured: release them (only this booking's own locks),
/// drop its food orders and refund the payment.
const failClaimedBooking = async (booking, { status, reason, paymentId }) => {
  booking.status = status;
  if (paymentId) booking.payment.paymentId = paymentId;
  booking.payment.status = reason;
  booking.expiresAt = null;
  await booking.save();

  const removed = await BusSeatHold.deleteMany({ bookingId: booking._id, status: { $in: ['held', 'booked'] } });
  await cancelDhabaOrdersForBooking(booking._id, { reason: 'Seat payment could not be completed' });
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

  await refundClaimedBooking(booking, reason);
  booking.payment.claimedAt = null;
  await booking.save();
};

/**
 * A rider's payment for this booking is captured: confirm the seats if they are
 * still held for it, otherwise refund. Idempotent and safe to call from the
 * verify endpoint and the reconciliation job at the same time.
 *
 * Returns { outcome, booking, message }, outcome one of:
 *   confirmed | already_confirmed | in_progress | refunded | cancelled
 */
export const finalizeBusBookingPayment = async ({ bookingId, paymentId, signature = '' }) => {
  const booking = await claimBusBookingPayment({
    _id: bookingId,
    status: { $in: ['pending', 'expired', 'failed'] },
  });

  if (!booking) {
    const current = await BusBooking.findById(bookingId);
    if (!current) return { outcome: 'missing', booking: null };
    if (current.status === 'confirmed') return { outcome: 'already_confirmed', booking: current };
    if (current.status === 'cancelled') return { outcome: 'cancelled', booking: current };
    return { outcome: 'in_progress', booking: current };
  }

  const now = new Date();

  if (booking.status !== 'pending') {
    // Expired or failed earlier while the rider was paying: give it back.
    await failClaimedBooking(booking, {
      status: booking.status,
      reason: booking.status === 'failed' ? 'seat_conflict' : 'expired',
      paymentId,
    });
    return { outcome: 'refunded', booking, message: 'Seat hold expired before the payment was confirmed.' };
  }

  if (booking.expiresAt && booking.expiresAt <= now) {
    await failClaimedBooking(booking, { status: 'expired', reason: 'expired', paymentId });
    return { outcome: 'refunded', booking, message: 'Seat hold expired before the payment was confirmed.' };
  }

  // Lock the seats only while this booking's holds are still live, so the
  // expiry sweeper can't free a seat in the gap.
  const lockResult = await BusSeatHold.updateMany(
    { bookingId: booking._id, status: 'held', expiresAt: { $gt: now } },
    { $set: { status: 'booked', expiresAt: null } },
  );
  const alreadyBooked = await BusSeatHold.countDocuments({ bookingId: booking._id, status: 'booked' });

  if (alreadyBooked !== booking.seatIds.length) {
    await failClaimedBooking(booking, { status: 'failed', reason: 'seat_conflict', paymentId });
    return { outcome: 'refunded', booking, message: 'Some selected seats are no longer reserved for this payment.' };
  }

  booking.status = 'confirmed';
  booking.expiresAt = null;
  booking.payment.paymentId = paymentId;
  if (signature) booking.payment.signature = signature;
  booking.payment.status = 'paid';
  booking.payment.paidAt = new Date();
  booking.payment.claimedAt = null;
  await booking.save();

  await confirmDhabaOrdersForBooking(booking);
  if (lockResult.modifiedCount > 0) {
    publishBusSeatChange({
      busServiceId: booking.busServiceId,
      scheduleId: booking.scheduleId,
      travelDate: booking.travelDate,
      change: 'booked',
      seatIds: booking.seatIds,
      bookingId: booking._id,
    });
  }
  return { outcome: 'confirmed', booking };
};

/**
 * Catches what the rider's app never reported:
 *  - a booking paid on Razorpay whose app closed before verifying (it is
 *    confirmed if its seats are still held, otherwise refunded);
 *  - refunds that failed earlier, retried a few times.
 */
export const reconcileBusPayments = async () => {
  const now = new Date();
  const summary = { checked: 0, confirmed: 0, refunded: 0, retried: 0 };

  // 1. Paid on Razorpay, never verified by the app.
  const unverified = await BusBooking.find({
    'payment.provider': 'razorpay',
    'payment.orderId': { $ne: '' },
    'payment.paymentId': '',
    status: { $in: ['pending', 'expired'] },
    createdAt: { $gte: new Date(now.getTime() - 6 * 3600_000), $lte: new Date(now.getTime() - 90_000) },
    $or: [{ 'payment.lastCheckedAt': null }, { 'payment.lastCheckedAt': { $lt: new Date(now.getTime() - 5 * 60_000) } }],
  })
    .select('_id payment.orderId')
    .limit(25)
    .lean();

  for (const item of unverified) {
    // Mark checked first (conditionally), so the other processes skip it.
    const marked = await BusBooking.updateOne(
      { _id: item._id, 'payment.paymentId': '', ...unclaimed(now) },
      { $set: { 'payment.lastCheckedAt': now } },
    );
    if (marked.modifiedCount !== 1) continue;
    summary.checked += 1;
    try {
      const payments = await razorpayApi({ path: `/orders/${item.payment.orderId}/payments` });
      const captured = (payments?.items || []).find((payment) => payment.status === 'captured');
      if (!captured) continue;
      const result = await finalizeBusBookingPayment({ bookingId: item._id, paymentId: captured.id });
      if (result.outcome === 'confirmed') summary.confirmed += 1;
      if (result.outcome === 'refunded') summary.refunded += 1;
    } catch (error) {
      console.error('[bus-reconcile] order check failed', String(item.payment?.orderId), error.message);
    }
  }

  // 2. Refunds that failed earlier.
  const stranded = await BusBooking.find({
    status: { $in: ['expired', 'failed'] },
    'payment.paymentId': { $ne: '' },
    'payment.status': { $not: /_refunded$/ },
    'payment.refundAttempts': { $lt: MAX_REFUND_ATTEMPTS },
  })
    .select('_id')
    .limit(25)
    .lean();

  for (const item of stranded) {
    const booking = await claimBusBookingPayment({ _id: item._id, status: { $in: ['expired', 'failed'] } });
    if (!booking) continue;
    summary.retried += 1;
    const reason = String(booking.payment.status || 'expired').replace(/_refund_pending$/, '') || 'expired';
    if (await refundClaimedBooking(booking, reason)) summary.refunded += 1;
    await releaseClaim(booking);
  }

  return summary;
};

let reconcileTimer = null;

export const startBusPaymentReconciler = (intervalMs = 2 * 60_000) => {
  if (reconcileTimer) return;
  const run = () =>
    reconcileBusPayments()
      .then((summary) => {
        if (summary.confirmed || summary.refunded) console.log('[bus-reconcile]', JSON.stringify(summary));
      })
      .catch((error) => console.error('[bus-reconcile] failed', error.message));
  // Spread the four processes out a little.
  setTimeout(run, 20_000 + Math.floor(Math.random() * 20_000));
  reconcileTimer = setInterval(run, intervalMs);
  reconcileTimer.unref?.();
};

const CANCEL_CLAIM_STALE_MS = 3 * 60 * 1000;

/// One cancellation at a time per booking (rider, owner and admin all go
/// through this): two requests could otherwise both pass the seat checks and
/// both refund. Returns the claimed booking, or null.
export const claimBusBookingCancellation = async (filter) =>
  BusBooking.findOneAndUpdate(
    {
      ...filter,
      status: 'confirmed',
      $or: [
        { cancelClaimedAt: null },
        { cancelClaimedAt: { $lt: new Date(Date.now() - CANCEL_CLAIM_STALE_MS) } },
      ],
    },
    { $set: { cancelClaimedAt: new Date() } },
    { returnDocument: 'after' },
  );

export const releaseBusBookingCancellation = (bookingId) =>
  BusBooking.updateOne({ _id: bookingId }, { $set: { cancelClaimedAt: null } });

/// Runs `work` while holding the booking's cancellation claim. When the
/// booking is confirmed but already claimed, refuses; otherwise (not
/// confirmed, missing) lets `work` give its normal answer.
export const withBusCancellationClaim = async (filter, work) => {
  const claimed = await claimBusBookingCancellation(filter);
  if (!claimed) {
    const current = await BusBooking.findOne(filter).select('status').lean();
    if (current?.status === 'confirmed') {
      const error = new Error('A cancellation for this booking is already in progress. Please wait a moment.');
      error.statusCode = 409;
      throw error;
    }
    return work();
  }
  try {
    return await work();
  } finally {
    await releaseBusBookingCancellation(claimed._id);
  }
};
