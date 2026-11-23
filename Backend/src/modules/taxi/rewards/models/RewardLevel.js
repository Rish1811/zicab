import mongoose from 'mongoose';

// One milestone on the rider's rewards ladder ("5 rides -> Food Kit").
// Everything shown in the app comes from here, so admins can add, reorder
// or retire rewards without an app release.
const rewardLevelSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    rideCount: { type: Number, required: true, min: 1 },
    image: { type: String, default: '', trim: true },
    // 'coupon' rewards credit walletAmount as ride-only cashback when the
    // admin approves the claim; 'gift' rewards are physical items.
    rewardType: { type: String, enum: ['gift', 'coupon'], default: 'gift' },
    walletAmount: { type: Number, default: 0, min: 0 },
    // Who the ladder is for. Rows from before drivers had rewards have no
    // value and are rider rewards.
    audience: { type: String, enum: ['user', 'driver'], default: 'user', index: true },
    active: { type: Boolean, default: true, index: true },
    // When the reward stops being offered. Null = never expires. Admins set
    // it as "expires in N days"; once past, the reward disappears from the
    // apps and can no longer be claimed (existing claims are untouched).
    expiresAt: { type: Date, default: null, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const RewardLevel =
  mongoose.models.TaxiRewardLevel || mongoose.model('TaxiRewardLevel', rewardLevelSchema);
