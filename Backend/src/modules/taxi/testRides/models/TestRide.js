import mongoose from 'mongoose';

/// A test ride sent from the admin panel: a ride offer that looks exactly like
/// a real one on the driver's phone but books nothing. Kept in its own
/// collection - never in rides - so it can never reach trips, reports,
/// earnings, rider apps, surge, challenges or acceptance figures.
const offerSchema = new mongoose.Schema(
  {
    // The id the driver's phone sees as the ride id.
    offerId: { type: String, required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', required: true },
    // sent | accepted | rejected | expired | skipped
    status: { type: String, default: 'sent' },
    skipReason: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    responseMs: { type: Number, default: null },
    // app | lock_screen
    answeredVia: { type: String, default: '' },
    // What the offer showed, in the shape the driver app's offer list reads.
    ride: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const testRideSchema = new mongoose.Schema(
  {
    createdBy: {
      adminId: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: '' },
    },
    // drivers | zone | city | all
    target: { type: String, default: 'drivers' },
    zoneId: { type: mongoose.Schema.Types.ObjectId, default: null },
    zoneName: { type: String, default: '' },
    serviceLocationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    vehicleTypeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    windowSeconds: { type: Number, default: 25 },
    expiresAt: { type: Date, required: true },
    offers: { type: [offerSchema], default: [] },
  },
  { timestamps: true },
);

testRideSchema.index({ 'offers.offerId': 1 });
testRideSchema.index({ 'offers.driverId': 1, createdAt: -1 });
testRideSchema.index({ createdAt: -1 });

export const TestRide = mongoose.models.TaxiTestRide || mongoose.model('TaxiTestRide', testRideSchema);
