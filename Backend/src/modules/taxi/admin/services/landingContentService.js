import { LandingContent } from '../models/LandingContent.js';
import { defaultLandingContent } from '../data/defaultLandingContent.js';

/**
 * Content for the public marketing site.
 *
 * Reads are cached briefly: the landing page is the busiest route on the site
 * and this content changes rarely, so it should not hit Mongo on every visit.
 * Writes drop the cache immediately so admin edits show up on the next load.
 */

const SECTIONS = ['services', 'valueProps', 'drivers', 'partners', 'launchCities', 'contact'];
const CACHE_TTL_MS = 60_000;

let cache = { value: null, expiresAt: 0 };

export const invalidateLandingContentCache = () => {
  cache = { value: null, expiresAt: 0 };
};

const serialize = (doc) => {
  const out = {};
  for (const key of SECTIONS) {
    const value = doc?.[key];
    const isEmpty = Array.isArray(value) ? value.length === 0 : !value || !Object.keys(value).length;
    // fall back per-section, so a half-filled document still renders a full page
    out[key] = isEmpty ? defaultLandingContent[key] : value;
  }
  return out;
};

/** Creates the document from the defaults on first call. */
export const getLandingContent = async ({ fresh = false } = {}) => {
  if (!fresh && cache.value && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  // upsert with $setOnInsert so an existing document is never overwritten
  const doc = await LandingContent.findOneAndUpdate(
    { scope: 'default' },
    { $setOnInsert: { scope: 'default', ...defaultLandingContent } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  const value = serialize(doc);
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
};

export const updateLandingContent = async (payload = {}) => {
  const $set = {};
  for (const key of SECTIONS) {
    if (payload[key] !== undefined) {
      $set[key] = payload[key];
    }
  }

  if (!Object.keys($set).length) {
    return getLandingContent({ fresh: true });
  }

  await LandingContent.updateOne({ scope: 'default' }, { $set }, { upsert: true });
  invalidateLandingContentCache();
  return getLandingContent({ fresh: true });
};
