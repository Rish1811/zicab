import mongoose from 'mongoose';

// A bus company. Its people sign in with the existing Owner accounts (one or
// many per company) and its buses point at it through BusService.operatorId,
// so bookings, earnings and commission roll up per company instead of per
// free-text operator name.
const busOperatorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    contactName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    // ZI Bus's share of each ticket sold on ZI Bus for this company's buses.
    commissionPercent: { type: Number, default: 10, min: 0, max: 100 },
    ownerIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TaxiOwner' }],
      default: [],
    },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

busOperatorSchema.index({ name: 1 });
busOperatorSchema.index({ ownerIds: 1 });

export const BusOperator =
  mongoose.models.TaxiBusOperator || mongoose.model('TaxiBusOperator', busOperatorSchema);
