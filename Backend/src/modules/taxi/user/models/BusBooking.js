import crypto from 'node:crypto';
import mongoose from 'mongoose';

const passengerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    age: {
      type: Number,
      default: null,
    },
    gender: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
  },
  { _id: false },
);

const cancelledSeatSchema = new mongoose.Schema(
  {
    seatId: {
      type: String,
      default: '',
      trim: true,
    },
    seatLabel: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    chargeAmount: {
      type: Number,
      default: 0,
    },
    refundStatus: {
      type: String,
      default: '',
      trim: true,
    },
    refundId: {
      type: String,
      default: '',
      trim: true,
    },
    refundProcessedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const busBookingSchema = new mongoose.Schema(
  {
    // Empty for seats sold by an external channel (another booking platform
    // or the operator's own inventory system) - see `channel` below.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
      index: true,
    },
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
      index: true,
    },
    bookingCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    // Passenger-facing ticket number, issued the moment a booking is
    // confirmed (see the pre-save hook below). bookingCode stays the internal
    // reference used for seat holds and payment receipts.
    pnr: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },
    scheduleId: {
      type: String,
      required: true,
      trim: true,
    },
    travelDate: {
      type: String,
      required: true,
      trim: true,
    },
    seatIds: {
      type: [String],
      default: [],
    },
    seatLabels: {
      type: [String],
      default: [],
    },
    passenger: {
      type: passengerSchema,
      default: () => ({}),
    },
    amount: {
      type: Number,
      default: 0,
    },
    bookingSource: {
      type: String,
      enum: ['user', 'bus_driver', 'admin', 'channel'],
      default: 'user',
      index: true,
    },
    channel: {
      channelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiBusChannel',
        default: null,
      },
      code: { type: String, default: '', trim: true },
      name: { type: String, default: '', trim: true },
      externalRef: { type: String, default: '', trim: true },
    },
    // Where the passenger gets on and off, picked from the bus's stops.
    boardingPoint: {
      stopId: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      pointName: { type: String, default: '', trim: true },
      time: { type: String, default: '', trim: true },
    },
    droppingPoint: {
      stopId: { type: String, default: '', trim: true },
      city: { type: String, default: '', trim: true },
      pointName: { type: String, default: '', trim: true },
      time: { type: String, default: '', trim: true },
    },
    // Set when the conductor checks the ticket in at the door.
    boarding: {
      boardedAt: { type: Date, default: null },
      boardedBy: { type: String, default: '' },
    },
    // Food pre-booked from partner dhabas. It is charged in the same payment
    // as the seats but kept out of `amount`, so the seat cancellation and
    // refund maths (which divide `amount` per seat) are unaffected.
    foodAmount: {
      type: Number,
      default: 0,
    },
    reservedByDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusDriver',
      default: null,
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    routeSnapshot: {
      originCity: { type: String, default: '' },
      destinationCity: { type: String, default: '' },
      departureTime: { type: String, default: '' },
      arrivalTime: { type: String, default: '' },
      durationHours: { type: String, default: '' },
      busName: { type: String, default: '' },
      operatorName: { type: String, default: '' },
      coachType: { type: String, default: '' },
      busCategory: { type: String, default: '' },
      registrationNumber: { type: String, default: '' },
      driverName: { type: String, default: '' },
      driverPhone: { type: String, default: '' },
    },
    payment: {
      provider: { type: String, default: 'razorpay' },
      orderId: { type: String, default: '', index: true },
      paymentId: { type: String, default: '' },
      signature: { type: String, default: '' },
      status: { type: String, default: 'pending' },
      paidAt: { type: Date, default: null },
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellation: {
      allowed: { type: Boolean, default: false },
      appliedRuleId: { type: String, default: '' },
      appliedRuleLabel: { type: String, default: '' },
      refundType: { type: String, default: '' },
      refundValue: { type: Number, default: 0 },
      hoursBeforeDeparture: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      chargeAmount: { type: Number, default: 0 },
      notes: { type: String, default: '' },
    },
    cancelledSeats: {
      type: [cancelledSeatSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

// No 0/O or 1/I, so a PNR read out over the phone can't be misheard.
const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateBusPnr = () => {
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += PNR_ALPHABET[crypto.randomInt(PNR_ALPHABET.length)];
  }
  return `ZB${suffix}`;
};

busBookingSchema.pre('save', function assignPnrOnConfirm() {
  if (this.status === 'confirmed' && !this.pnr) {
    this.pnr = generateBusPnr();
  }
});

busBookingSchema.index({ status: 1, expiresAt: 1 });
busBookingSchema.index({ pnr: 1 }, { unique: true, sparse: true });
busBookingSchema.index(
  { 'channel.channelId': 1, 'channel.externalRef': 1 },
  {
    unique: true,
    partialFilterExpression: { 'channel.externalRef': { $type: 'string', $gt: '' } },
    name: 'unique_channel_external_ref',
  },
);
busBookingSchema.index({ busServiceId: 1, travelDate: 1, scheduleId: 1, status: 1 });

export const BusBooking =
  mongoose.models.TaxiBusBooking || mongoose.model('TaxiBusBooking', busBookingSchema);
