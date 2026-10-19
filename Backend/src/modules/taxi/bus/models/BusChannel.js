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
    // How bookings get from the channel to us. 'push_api': the channel calls
    // our channel API itself. Anything else is a connector we run: we poll
    // the channel's own system and reconcile its seat sales into ZI Bus (see
    // bus/connectors). Used for operator software that can't call us.
    connector: {
      type: {
        type: String,
        default: 'push_api',
        trim: true,
      },
      baseUrl: { type: String, default: '', trim: true },
      authHeader: { type: String, default: 'Authorization', trim: true },
      // Kept server side only; never serialized back to the admin panel.
      authValue: { type: String, default: '' },
      // Connector-specific settings, e.g. paths and response field names.
      options: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      pollSeconds: { type: Number, default: 120, min: 30, max: 3600 },
      daysAhead: { type: Number, default: 7, min: 0, max: 30 },
      nextPollAt: { type: Date, default: null, index: true },
      lastPolledAt: { type: Date, default: null },
      lastPollStatus: { type: String, default: '' },
    },
    // Which of the channel's own trips is which ZI Bus run.
    tripMappings: {
      type: [
        new mongoose.Schema(
          {
            busServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiBusService', required: true },
            scheduleId: { type: String, required: true, trim: true },
            externalTripId: { type: String, required: true, trim: true },
            // Their seat label -> our seat id, where the two differ.
            seatMap: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
          },
          { _id: true },
        ),
      ],
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
