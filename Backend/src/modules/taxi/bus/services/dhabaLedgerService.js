import mongoose from 'mongoose';
import { DhabaOrder } from '../models/DhabaOrder.js';
import { DhabaPayout } from '../models/DhabaPayout.js';

// Orders a passenger has paid for that the dhaba has not finished yet.
const OPEN_STATUSES = ['placed', 'notified', 'accepted', 'preparing', 'ready'];

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const toIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

const emptyLedger = () => ({
  servedOrders: 0,
  gross: 0,
  commission: 0,
  earned: 0,
  paid: 0,
  payoutCount: 0,
  lastPayoutAt: null,
  balance: 0,
  openOrders: 0,
  openAmount: 0,
});

/// Earnings on served orders (food amount less the platform commission),
/// what has been paid out, and the balance still owed, per dhaba.
/// `dhabaIds` null means every dhaba with any activity.
export const computeDhabaLedgers = async (dhabaIds = null) => {
  const scope = dhabaIds ? { dhabaId: { $in: toIds(dhabaIds) } } : {};
  const [served, open, paid] = await Promise.all([
    DhabaOrder.aggregate([
      { $match: { ...scope, status: 'served' } },
      { $group: { _id: '$dhabaId', orders: { $sum: 1 }, gross: { $sum: '$amount' }, commission: { $sum: '$commissionAmount' } } },
    ]),
    DhabaOrder.aggregate([
      { $match: { ...scope, status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$dhabaId', orders: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    DhabaPayout.aggregate([
      { $match: scope },
      { $group: { _id: '$dhabaId', amount: { $sum: '$amount' }, count: { $sum: 1 }, last: { $max: '$paidAt' } } },
    ]),
  ]);

  const ledgers = new Map();
  const ledgerFor = (id) => {
    const key = String(id);
    if (!ledgers.has(key)) ledgers.set(key, emptyLedger());
    return ledgers.get(key);
  };
  (dhabaIds || []).forEach((id) => ledgerFor(id));

  served.forEach((row) => {
    const ledger = ledgerFor(row._id);
    ledger.servedOrders = row.orders;
    ledger.gross = money(row.gross);
    ledger.commission = money(row.commission);
  });
  open.forEach((row) => {
    const ledger = ledgerFor(row._id);
    ledger.openOrders = row.orders;
    ledger.openAmount = money(row.amount);
  });
  paid.forEach((row) => {
    const ledger = ledgerFor(row._id);
    ledger.paid = money(row.amount);
    ledger.payoutCount = row.count;
    ledger.lastPayoutAt = row.last || null;
  });
  ledgers.forEach((ledger) => {
    ledger.earned = money(ledger.gross - ledger.commission);
    ledger.balance = money(ledger.earned - ledger.paid);
  });
  return ledgers;
};

/// One dhaba's ledger with a month-by-month breakdown (by travel date) and
/// its payout history.
export const getDhabaLedger = async (dhabaId, { months = 6 } = {}) => {
  const id = new mongoose.Types.ObjectId(String(dhabaId));
  const [ledgers, monthly, payouts] = await Promise.all([
    computeDhabaLedgers([dhabaId]),
    DhabaOrder.aggregate([
      { $match: { dhabaId: id, status: 'served' } },
      {
        $group: {
          _id: { $substrBytes: ['$travelDate', 0, 7] },
          orders: { $sum: 1 },
          gross: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: months },
    ]),
    DhabaPayout.find({ dhabaId: id }).sort({ paidAt: -1 }).limit(100).lean(),
  ]);

  return {
    ...ledgers.get(String(dhabaId)),
    months: monthly.map((row) => ({
      month: row._id,
      orders: row.orders,
      gross: money(row.gross),
      commission: money(row.commission),
      earned: money(row.gross - row.commission),
    })),
    payouts: payouts.map(serializeDhabaPayout),
  };
};

export const serializeDhabaPayout = (payout) => ({
  id: String(payout._id),
  dhabaId: String(payout.dhabaId),
  amount: money(payout.amount),
  method: payout.method || 'bank_transfer',
  reference: payout.reference || '',
  note: payout.note || '',
  periodTo: payout.periodTo || '',
  paidAt: payout.paidAt || payout.createdAt || null,
});
