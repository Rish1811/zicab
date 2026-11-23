import mongoose from 'mongoose';

export const CHALLENGE_PROGRESS_STATUS = ['in_progress', 'completed', 'claimed', 'paid', 'rejected'];

/// One driver's standing in one challenge: the days that counted and the
/// reward's way from completed to paid.
const driverChallengeProgressSchema = new mongoose.Schema(
  {
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriverChallenge', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', required: true },
    qualifiedDays: { type: [String], default: [] },
    qualifiedCount: { type: Number, default: 0 },
    status: { type: String, enum: CHALLENGE_PROGRESS_STATUS, default: 'in_progress' },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paidAmount: { type: Number, default: 0 },
    adminNote: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

driverChallengeProgressSchema.index({ challengeId: 1, driverId: 1 }, { unique: true });
driverChallengeProgressSchema.index({ challengeId: 1, qualifiedCount: -1 });
driverChallengeProgressSchema.index({ challengeId: 1, status: 1 });

export const DriverChallengeProgress =
  mongoose.models.TaxiDriverChallengeProgress
  || mongoose.model('TaxiDriverChallengeProgress', driverChallengeProgressSchema);
