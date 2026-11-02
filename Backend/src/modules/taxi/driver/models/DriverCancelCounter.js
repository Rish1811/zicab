import mongoose from 'mongoose';

/// How many rides a driver has cancelled in one limit period (see
/// driverCancelLimitService). Counted here rather than from the rides so the
/// limit can be taken atomically: two cancels at once can't both get the last one.
const driverCancelCounterSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      required: true,
    },
    // e.g. day:2026-11-02, week:2026-11-02 (its Monday), month:2026-11
    periodKey: {
      type: String,
      required: true,
      trim: true,
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

driverCancelCounterSchema.index({ driverId: 1, periodKey: 1 }, { unique: true });

export const DriverCancelCounter =
  mongoose.models.TaxiDriverCancelCounter ||
  mongoose.model('TaxiDriverCancelCounter', driverCancelCounterSchema);
