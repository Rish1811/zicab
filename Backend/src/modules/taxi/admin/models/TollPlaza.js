import mongoose from 'mongoose';

/**
 * A toll plaza on an outstation route, with what each vehicle type pays there.
 *
 * An outstation trip whose road route passes within `radius_meters` of the
 * plaza is charged its toll: the one-way price, and for a round trip the
 * return price for the way back (most Indian plazas discount a return within
 * 24 hours). The toll is part of the fare the rider is quoted and goes in full
 * to the driver, who pays it.
 */
const tollPriceSchema = new mongoose.Schema(
  {
    vehicle_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiVehicle',
      required: true,
    },
    one_way: { type: Number, default: 0, min: 0 },
    // The fare for the way back on a round trip. Zero means "same as one way".
    return_trip: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const tollPlazaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    highway: { type: String, default: '', trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      // [lng, lat]
      coordinates: { type: [Number], required: true },
    },
    // How close a route has to pass to be charged. Route lines from the map
    // providers are simplified on long trips, so this is generous.
    radius_meters: { type: Number, default: 250, min: 50, max: 2000 },
    service_location_ids: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    prices: { type: [tollPriceSchema], default: [] },
    active: { type: Boolean, default: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

tollPlazaSchema.index({ location: '2dsphere' });
tollPlazaSchema.index({ active: 1 });

export const TollPlaza =
  mongoose.models.TaxiTollPlaza || mongoose.model('TaxiTollPlaza', tollPlazaSchema);
