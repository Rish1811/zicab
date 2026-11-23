import mongoose from 'mongoose';

export const REWARD_CLAIM_STATUS = ['pending', 'approved', 'delivered', 'rejected'];

const rewardClaimSchema = new mongoose.Schema(
  {
    // Owner of the claim: a TaxiUser id, or a TaxiDriver id when audience is 'driver'.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiUser', required: true, index: true },
    audience: { type: String, enum: ['user', 'driver'], default: 'user', index: true },
    rewardId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiRewardLevel', required: true },
    // Snapshot so the claim still reads correctly if the admin edits or
    // deletes the reward later.
    rewardTitle: { type: String, default: '' },
    rewardImage: { type: String, default: '' },
    rewardType: { type: String, default: 'gift' },
    walletAmount: { type: Number, default: 0 },
    rideCount: { type: Number, default: 0 },
    completedRidesAtClaim: { type: Number, default: 0 },
    status: { type: String, enum: REWARD_CLAIM_STATUS, default: 'pending', index: true },
    adminNote: { type: String, default: '', trim: true },
    // Optional delivery details the rider sends with a gift claim.
    address: { type: String, default: '', trim: true },
    size: { type: String, default: '', trim: true },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

rewardClaimSchema.index({ userId: 1, rewardId: 1 }, { unique: true });

export const RewardClaim =
  mongoose.models.TaxiRewardClaim || mongoose.model('TaxiRewardClaim', rewardClaimSchema);
