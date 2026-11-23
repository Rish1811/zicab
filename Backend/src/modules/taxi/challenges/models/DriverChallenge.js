import mongoose from 'mongoose';

/// A driver challenge the admin runs, e.g. "26 days online = full tank CNG
/// free". A day counts when the driver was active (activity clock, see
/// driverActivityService) for at least `minActiveMinutes` and completed at
/// least `minTrips` trips; `requiredDays` such days between `startDate` and
/// `endDate` win the reward.
const driverChallengeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    terms: { type: [String], default: [] },
    bannerImage: { type: String, default: '', trim: true },

    // India-time 'YYYY-MM-DD', both days included.
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },

    requiredDays: { type: Number, required: true, min: 1 },
    minActiveMinutes: { type: Number, default: 480, min: 0 },
    minTrips: { type: Number, default: 1, min: 0 },

    // Who may take part; empty means everyone.
    vehicleTypeIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TaxiVehicle' }], default: [] },
    serviceLocationIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TaxiServiceLocation' }], default: [] },

    rewardLabel: { type: String, default: '', trim: true },
    // Credited to the driver's wallet when the claim is paid. 0 = a reward
    // handed over outside the app (admin marks it paid).
    rewardAmount: { type: Number, default: 0, min: 0 },
    // Pay straight away when the driver claims; off = admin approves each one.
    autoPay: { type: Boolean, default: true },

    active: { type: Boolean, default: true },
    // The last day the nightly evaluation has judged.
    evaluatedThrough: { type: String, default: '' },
  },
  { timestamps: true },
);

driverChallengeSchema.index({ active: 1, startDate: 1, endDate: 1 });

export const DriverChallenge =
  mongoose.models.TaxiDriverChallenge || mongoose.model('TaxiDriverChallenge', driverChallengeSchema);
