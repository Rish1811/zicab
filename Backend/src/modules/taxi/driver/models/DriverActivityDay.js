import mongoose from 'mongoose';

/// A driver's real working time on one India-time day, measured from the
/// phone's location updates while online or on a trip (driverActivityService).
///
/// The older `incentiveTracking.dailyActivity` on the driver counted the time
/// between the Online and Offline taps, so a phone that died online counted the
/// whole night. This is what driver challenges ("26 days online") are judged on.
const driverActivityDaySchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      required: true,
    },
    // 'YYYY-MM-DD' in India time.
    dateKey: {
      type: String,
      required: true,
    },
    activeSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstActiveAt: {
      type: Date,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
    // Location updates the phone flagged as coming from a fake-GPS app. They
    // never count as active time; kept so admin can see who tried.
    mockedPings: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

driverActivityDaySchema.index({ driverId: 1, dateKey: 1 }, { unique: true });
driverActivityDaySchema.index({ dateKey: 1, activeSeconds: -1 });

export const DriverActivityDay =
  mongoose.models.TaxiDriverActivityDay || mongoose.model('TaxiDriverActivityDay', driverActivityDaySchema);
