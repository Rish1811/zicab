import mongoose from 'mongoose';

// Audit trail of every seat change exchanged with a channel, in both
// directions. Outbound rows double as the webhook retry queue.
const busChannelEventSchema = new mongoose.Schema(
  {
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusChannel',
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
    },
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      default: null,
    },
    scheduleId: { type: String, default: '' },
    travelDate: { type: String, default: '' },
    seatIds: { type: [String], default: [] },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      default: null,
    },
    externalRef: { type: String, default: '' },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'delivered', 'failed', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null, index: true },
    lastError: { type: String, default: '' },
    responseCode: { type: Number, default: 0 },
  },
  { timestamps: true },
);

busChannelEventSchema.index({ direction: 1, status: 1, nextAttemptAt: 1 });
busChannelEventSchema.index({ channelId: 1, createdAt: -1 });
// Keep the log bounded: events older than 90 days are dropped.
busChannelEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const BusChannelEvent =
  mongoose.models.TaxiBusChannelEvent || mongoose.model('TaxiBusChannelEvent', busChannelEventSchema);
