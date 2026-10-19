import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: 'Meals', trim: true },
    price: { type: Number, required: true, min: 0 },
    isVeg: { type: Boolean, default: true },
    image: { type: String, default: '', trim: true },
    available: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Which bus runs halt at this dhaba, and how long after departure they get
// there. The expected arrival (and so the 30-minute order alert) is computed
// from this; live GPS refines it once the trip is running.
const busStopLinkSchema = new mongoose.Schema(
  {
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
    },
    // Empty means every schedule of that bus.
    scheduleId: { type: String, default: '', trim: true },
    minutesAfterDeparture: { type: Number, required: true, min: 0 },
    haltMinutes: { type: Number, default: 20, min: 0 },
  },
  { _id: true },
);

const dhabaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, default: '', trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
    address: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    highway: { type: String, default: '', trim: true },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    image: { type: String, default: '', trim: true },
    // Platform share of each food order, in percent.
    commissionPercent: { type: Number, default: 10, min: 0, max: 100 },
    menu: { type: [menuItemSchema], default: [] },
    busStops: { type: [busStopLinkSchema], default: [] },
    acceptingOrders: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
    fcmTokenWeb: { type: String, default: '' },
    fcmTokenMobile: { type: String, default: '' },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

dhabaSchema.index({ 'busStops.busServiceId': 1, active: 1 });

export const Dhaba = mongoose.models.TaxiDhaba || mongoose.model('TaxiDhaba', dhabaSchema);
