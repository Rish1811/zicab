import mongoose from 'mongoose';

/**
 * Editable content for the public marketing site.
 *
 * One document, same shape as the other admin settings models: a unique `scope`
 * plus Mixed sections, so sections can gain fields without a migration.
 *
 * The fleet section is deliberately absent — vehicles come from the existing
 * admin vehicle catalog (`/users/vehicle-types`) so there is one place to manage
 * them rather than two that can disagree.
 */
const landingContentSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    // [{ id, title, desc, icon }] — icon is a lucide name resolved by the client
    services: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{ title, desc, icon }]
    valueProps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{ name, photo, rating, trips, experience, vehicle, badge, city }]
    drivers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{ name, subtitle }]
    partners: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // [{ name, note }]
    launchCities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // { email, whatsapp, whatsappDisplay, tollFree, tollFreeLive, address, addressShort, mapsUrl }
    contact: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const LandingContent =
  mongoose.models.TaxiLandingContent || mongoose.model('TaxiLandingContent', landingContentSchema);
