import mongoose from 'mongoose';

/**
 * Prepaid balance of a bus vendor - a bus operator account (role bus_driver)
 * or a fleet owner (role owner). The vendor tops it up online and each seat
 * sold at the counter is paid for from it.
 *
 * `balance` only ever changes through one conditional $inc (see
 * busVendorWalletService), so two bookings at once can't spend the same money.
 */
const busVendorWalletSchema = new mongoose.Schema(
  {
    accountType: { type: String, enum: ['bus_driver', 'owner'], required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true },
);

busVendorWalletSchema.index({ accountType: 1, accountId: 1 }, { unique: true });

/**
 * One movement of a vendor's balance. A top-up starts `pending` when its
 * Razorpay order is made and becomes `completed` once (claimed with a
 * conditional update) when the payment is verified, so the same payment can't
 * be credited twice by a double tap, a retry and the reconciliation job.
 */
const busVendorWalletTransactionSchema = new mongoose.Schema(
  {
    accountType: { type: String, enum: ['bus_driver', 'owner'], required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: {
      type: String,
      enum: ['top_up', 'booking_charge', 'booking_refund', 'admin_credit', 'admin_debit'],
      required: true,
    },
    // Signed: positive adds to the balance, negative takes from it.
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: null },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusBooking', default: null },
    bookingCode: { type: String, default: '' },
    seatLabels: { type: [String], default: [] },
    orderId: { type: String, default: '' },
    paymentId: { type: String, default: '' },
    note: { type: String, default: '' },
    by: { type: String, default: '' },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

busVendorWalletTransactionSchema.index({ accountType: 1, accountId: 1, createdAt: -1 });
// One credit per Razorpay order, enforced by the database.
busVendorWalletTransactionSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'string', $gt: '' } } },
);
// One wallet charge per booking.
busVendorWalletTransactionSchema.index(
  { bookingId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'booking_charge' } },
);

export const BusVendorWallet =
  mongoose.models.BusVendorWallet || mongoose.model('BusVendorWallet', busVendorWalletSchema);

export const BusVendorWalletTransaction =
  mongoose.models.BusVendorWalletTransaction
  || mongoose.model('BusVendorWalletTransaction', busVendorWalletTransactionSchema);
