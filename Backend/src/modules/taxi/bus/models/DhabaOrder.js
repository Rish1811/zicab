import mongoose from 'mongoose';

export const DHABA_ORDER_STATUSES = Object.freeze([
  'awaiting_payment', // created with the seat hold, not paid yet
  'placed', // paid; visible to the dhaba as upcoming
  'notified', // the ~30 minute alert has gone out
  'accepted',
  'preparing',
  'ready',
  'served',
  'cancelled',
  'expired', // the seat payment never completed
]);

// What the dhaba itself may move an order to, from each status.
export const DHABA_STATUS_TRANSITIONS = Object.freeze({
  placed: ['accepted', 'preparing', 'cancelled'],
  notified: ['accepted', 'preparing', 'cancelled'],
  accepted: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready'],
  ready: ['served'],
});

const orderItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    isVeg: { type: Boolean, default: true },
  },
  { _id: false },
);

const dhabaOrderSchema = new mongoose.Schema(
  {
    orderCode: { type: String, required: true, unique: true, trim: true },
    dhabaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDhaba',
      required: true,
      index: true,
    },
    busBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
    },
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
    },
    scheduleId: { type: String, required: true },
    travelDate: { type: String, required: true },
    items: { type: [orderItemSchema], default: [] },
    amount: { type: Number, required: true, min: 0 },
    commissionPercent: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    passengerName: { type: String, default: '' },
    passengerPhone: { type: String, default: '' },
    passengerCount: { type: Number, default: 1 },
    seatLabels: { type: [String], default: [] },
    bus: {
      busName: { type: String, default: '' },
      operatorName: { type: String, default: '' },
      registrationNumber: { type: String, default: '' },
      driverName: { type: String, default: '' },
      driverPhone: { type: String, default: '' },
      originCity: { type: String, default: '' },
      destinationCity: { type: String, default: '' },
      departureTime: { type: String, default: '' },
    },
    pnr: { type: String, default: '' },
    expectedArrivalAt: { type: Date, default: null },
    // When the "bus is ~30 minutes away" alert is due. Live GPS can pull it
    // earlier; the notifier claims an order atomically so it fires once even
    // with several backend instances running.
    notifyAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: DHABA_ORDER_STATUSES,
      default: 'awaiting_payment',
      index: true,
    },
    statusHistory: {
      type: [
        new mongoose.Schema(
          {
            status: String,
            at: { type: Date, default: Date.now },
            by: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    refund: {
      amount: { type: Number, default: 0 },
      refundId: { type: String, default: '' },
      status: { type: String, default: '' },
    },
    cancelReason: { type: String, default: '' },
  },
  { timestamps: true },
);

dhabaOrderSchema.index({ status: 1, notifyAt: 1 });
dhabaOrderSchema.index({ dhabaId: 1, travelDate: 1, status: 1 });

export const DhabaOrder =
  mongoose.models.TaxiDhabaOrder || mongoose.model('TaxiDhabaOrder', dhabaOrderSchema);
