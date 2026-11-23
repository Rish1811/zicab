import mongoose from 'mongoose';

/// Admin settings for Ride On My Way (driver destination mode). One document.
const onMyWaySettingSchema = new mongoose.Schema(
  {
    scope: { type: String, default: 'default', unique: true },
    enabled: { type: Boolean, default: true },
    // Rides completed in destination mode per driver per India-time day.
    usesPerDay: { type: Number, default: 2, min: 0 },
    // A ride may lengthen the driver's way home by this much (the larger of
    // the two).
    maxDetourPercent: { type: Number, default: 25, min: 0 },
    maxDetourKm: { type: Number, default: 3, min: 0 },
    // The drop must leave the driver at least this much closer to home.
    minProgressPercent: { type: Number, default: 30, min: 0, max: 100 },
    maxHours: { type: Number, default: 3, min: 0.25 },
    arriveRadiusMeters: { type: Number, default: 500, min: 50 },
    // Empty = every vehicle type / city.
    vehicleTypeIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    serviceLocationIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    includeParcels: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const OnMyWaySetting =
  mongoose.models.TaxiOnMyWaySetting || mongoose.model('TaxiOnMyWaySetting', onMyWaySettingSchema);
