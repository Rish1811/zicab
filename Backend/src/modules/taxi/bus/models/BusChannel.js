import mongoose from 'mongoose';

// An external system that sells seats on ZI Bus inventory: another booking
// platform, or an operator's own reservation/counter software. ZI Bus is the
// single source of truth for the seat map. A channel pushes its sales in
// through the channel API (and they lock the same seats our riders see), and
// it receives our sales and cancellations on its webhook so it can mirror them.
const busChannelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Short stable identifier shown on bookings and seat holds, e.g. "redbus".
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    kind: {
      type: String,
      enum: ['ota', 'operator_system', 'counter', 'other'],
      default: 'ota',
    },
    // Only the hash is stored; the plain key is shown once when generated.
    apiKeyHash: {
      type: String,
      default: '',
      index: true,
    },
    apiKeyPrefix: {
      type: String,
      default: '',
      trim: true,
    },
    webhookUrl: {
      type: String,
      default: '',
      trim: true,
    },
    webhookSecret: {
      type: String,
      default: '',
    },
    // Buses this channel may sell. Empty means every active bus.
    busServiceIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TaxiBusService' }],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastInboundAt: {
      type: Date,
      default: null,
    },
    lastWebhookAt: {
      type: Date,
      default: null,
    },
    lastWebhookStatus: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

export const BusChannel =
  mongoose.models.TaxiBusChannel || mongoose.model('TaxiBusChannel', busChannelSchema);
