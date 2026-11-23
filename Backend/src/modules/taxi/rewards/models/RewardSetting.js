import mongoose from 'mongoose';

// Single document (scope 'default') holding the per-ride cashback rules.
const rewardSettingSchema = new mongoose.Schema(
  {
    scope: { type: String, default: 'default', unique: true },
    cashbackEnabled: { type: Boolean, default: false },
    cashbackPercent: { type: Number, default: 0, min: 0, max: 100 },
    // 0 = no cap.
    maxCashbackPerRide: { type: Number, default: 0, min: 0 },
    minFareForCashback: { type: Number, default: 0, min: 0 },
    rewardsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const RewardSetting =
  mongoose.models.TaxiRewardSetting || mongoose.model('TaxiRewardSetting', rewardSettingSchema);
