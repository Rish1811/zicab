import mongoose from 'mongoose';

// A settlement the platform has paid out to a dhaba. A dhaba's balance due is
// what it earned on served orders (amount less commission) minus these.
const dhabaPayoutSchema = new mongoose.Schema(
  {
    dhabaId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDhaba', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ['bank_transfer', 'upi', 'cash', 'other'], default: 'bank_transfer' },
    reference: { type: String, default: '', trim: true },
    note: { type: String, default: '', trim: true },
    // Orders served up to this date are covered by the payout (informational).
    periodTo: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

export const DhabaPayout =
  mongoose.models.TaxiDhabaPayout || mongoose.model('TaxiDhabaPayout', dhabaPayoutSchema);
