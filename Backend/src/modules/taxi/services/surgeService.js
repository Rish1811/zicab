import { cellToBoundary, cellToLatLng, greatCircleDistance, gridDisk, latLngToCell } from 'h3-js';
import { runRedisCommand } from '../../../infrastructure/redis/redisClient.js';
import { SurgeSetting } from '../admin/models/SurgeSetting.js';
import { Driver } from '../driver/models/Driver.js';

/**
 * Automatic, demand-driven surge - the hexagon map Rapido and Uber drivers see.
 *
 * The city is cut into H3 hexagons. Demand is the number of distinct riders
 * who asked for a price with their pickup in a hexagon (every quote passes
 * through GET /users/set-prices with lat/lng). Supply is the free drivers in
 * it, counted the way dispatch counts them. Both are summed over the hexagon
 * and its six neighbours, so a surge follows an area rather than one block.
 *
 * Once a minute one API instance (whichever holds the Redis lock) recomputes
 * every hexagon with recent demand and writes the result to Redis, where every
 * instance reads it when quoting. A surge holds for `hold_minutes` once set, so
 * prices do not flicker and the driver map can say when it ends.
 *
 * The rider is billed the fare the app quotes, so applying the multiplier to
 * the quote is applying it to the charge.
 */

const CYCLE_MS = 60 * 1000;
const LOCK_KEY = 'surge:engine:lock';
const ACTIVE_KEY = 'surge:active';
const SETTINGS_TTL_MS = 30 * 1000;
// Legal ceiling for the combined multiplier (Motor Vehicle Aggregator
// Guidelines 2025), whatever the scheduled windows and settings say.
export const ABSOLUTE_MAX_MULTIPLIER = 2;

const SETTING_FIELDS = [
  'enabled',
  'resolution',
  'window_minutes',
  'min_demand',
  'trigger_ratio',
  'ratio_step',
  'step',
  'max_multiplier',
  'hold_minutes',
];

let settingsCache = { value: null, at: 0 };
// Used only when Redis is unavailable, so a single instance still works.
const memory = { demand: new Map(), active: new Map() };
let engineTimer = null;

const minuteBucket = (time = Date.now()) => Math.floor(time / 60000);
const demandKey = (res, bucket, hex) => `surge:dem:${res}:${bucket}:${hex}`;
const demandHexesKey = (res, bucket) => `surge:demhex:${res}:${bucket}`;
const round2 = (value) => Math.round(value * 100) / 100;

const serializeSettings = (doc) => {
  const defaults = new SurgeSetting().toObject();
  const source = doc || defaults;
  return Object.fromEntries(SETTING_FIELDS.map((field) => [field, source[field] ?? defaults[field]]));
};

export const getSurgeSettings = async ({ fresh = false } = {}) => {
  if (!fresh && settingsCache.value && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }
  const doc = await SurgeSetting.findOne({ key: 'default' }).lean();
  const value = serializeSettings(doc);
  settingsCache = { value, at: Date.now() };
  return value;
};

export const updateSurgeSettings = async (payload = {}) => {
  const update = {};
  for (const field of SETTING_FIELDS) {
    if (payload[field] === undefined || payload[field] === '') continue;
    update[field] = field === 'enabled' ? Boolean(payload[field]) : Number(payload[field]);
  }
  if (update.max_multiplier !== undefined) {
    update.max_multiplier = Math.min(ABSOLUTE_MAX_MULTIPLIER, Math.max(1, update.max_multiplier));
  }
  if (update.resolution !== undefined) {
    update.resolution = Math.min(9, Math.max(7, Math.round(update.resolution)));
  }

  const doc = await SurgeSetting.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  settingsCache = { value: null, at: 0 };

  if (!doc.enabled) {
    await writeActive(new Map());
  }
  return serializeSettings(doc);
};

const isValidPoint = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Counts a rider asking for a price at a pickup. Distinct riders are counted
 * with a HyperLogLog per hexagon per minute, so the app refreshing its prices
 * every minute does not multiply one rider into a crowd.
 */
export const recordSurgeDemand = async ({ lat, lng, requester }) => {
  if (!isValidPoint(lat, lng) || !requester) return;
  const settings = await getSurgeSettings();
  if (!settings.enabled) return;

  const res = settings.resolution;
  const hex = latLngToCell(lat, lng, res);
  const bucket = minuteBucket();
  const ttlSeconds = (settings.window_minutes + 5) * 60;

  const result = await runRedisCommand(
    async (client) => {
      await client
        .multi()
        .pfAdd(demandKey(res, bucket, hex), String(requester))
        .expire(demandKey(res, bucket, hex), ttlSeconds)
        .sAdd(demandHexesKey(res, bucket), hex)
        .expire(demandHexesKey(res, bucket), ttlSeconds)
        .exec();
    },
    { label: 'surge demand' },
  );

  if (!result.ok) {
    const key = `${res}:${bucket}:${hex}`;
    if (!memory.demand.has(key)) memory.demand.set(key, new Set());
    memory.demand.get(key).add(String(requester));
  }
};

const readActive = async () => {
  const result = await runRedisCommand((client) => client.hGetAll(ACTIVE_KEY), { label: 'surge read' });
  if (!result.ok) return new Map(memory.active);
  return new Map(
    Object.entries(result.value || {}).map(([hex, json]) => {
      try {
        return [hex, JSON.parse(json)];
      } catch {
        return [hex, null];
      }
    }).filter(([, value]) => value),
  );
};

async function writeActive(active) {
  memory.active = new Map(active);
  await runRedisCommand(
    async (client) => {
      const tx = client.multi().del(ACTIVE_KEY);
      if (active.size > 0) {
        tx.hSet(ACTIVE_KEY, Object.fromEntries([...active].map(([hex, entry]) => [hex, JSON.stringify(entry)])));
        tx.expire(ACTIVE_KEY, 3600);
      }
      await tx.exec();
    },
    { label: 'surge write' },
  );
}

/// Distinct riders across a set of hexagons over the window.
const countDemand = async (settings, hexes, buckets) => {
  const keys = hexes.flatMap((hex) => buckets.map((bucket) => demandKey(settings.resolution, bucket, hex)));
  const result = await runRedisCommand((client) => client.pfCount(keys), { label: 'surge count' });
  if (result.ok) return Number(result.value) || 0;

  const riders = new Set();
  for (const hex of hexes) {
    for (const bucket of buckets) {
      for (const rider of memory.demand.get(`${settings.resolution}:${bucket}:${hex}`) || []) riders.add(rider);
    }
  }
  return riders.size;
};

const hexesWithDemand = async (settings, buckets) => {
  const result = await runRedisCommand(
    (client) => client.sUnion(buckets.map((bucket) => demandHexesKey(settings.resolution, bucket))),
    { label: 'surge hexes' },
  );
  if (result.ok) return result.value || [];

  const hexes = new Set();
  for (const key of memory.demand.keys()) {
    const [res, bucket, hex] = key.split(':');
    if (Number(res) === settings.resolution && buckets.includes(Number(bucket))) hexes.add(hex);
  }
  return [...hexes];
};

/// Free drivers per hexagon - the same availability test dispatch uses.
const freeDriversByHex = async (settings) => {
  const drivers = await Driver.find({
    isOnline: true,
    isOnRide: false,
    deletedAt: null,
    'location.coordinates.0': { $ne: 0 },
    $or: [{ owner_id: { $ne: null } }, { 'wallet.isBlocked': { $ne: true } }],
  })
    .select('location')
    .lean();

  const counts = new Map();
  for (const driver of drivers) {
    const [lng, lat] = driver.location?.coordinates || [];
    if (!isValidPoint(lat, lng)) continue;
    const hex = latLngToCell(lat, lng, settings.resolution);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return counts;
};

/// Riders per free driver -> multiplier. Below `min_demand` riders, or below
/// `trigger_ratio`, there is no surge.
export const multiplierForRatio = (settings, demand, supply) => {
  if (demand < settings.min_demand) return 1;
  const ratio = demand / Math.max(1, supply);
  if (ratio < settings.trigger_ratio) return 1;
  const steps = 1 + Math.floor((ratio - settings.trigger_ratio) / settings.ratio_step);
  const cap = Math.min(settings.max_multiplier, ABSOLUTE_MAX_MULTIPLIER);
  return round2(Math.min(cap, 1 + steps * settings.step));
};

/// One pass over every hexagon with recent demand, and its neighbours.
export const runSurgeCycle = async () => {
  const settings = await getSurgeSettings({ fresh: true });
  if (!settings.enabled) {
    await writeActive(new Map());
    return { enabled: false, active: 0 };
  }

  const now = Date.now();
  const current = minuteBucket(now);
  const buckets = Array.from({ length: settings.window_minutes }, (_, index) => current - index);

  const demandHexes = await hexesWithDemand(settings, buckets);
  const candidates = new Set(demandHexes.flatMap((hex) => gridDisk(hex, 1)));
  const supplyByHex = candidates.size ? await freeDriversByHex(settings) : new Map();
  const previous = await readActive();
  const holdMs = settings.hold_minutes * 60 * 1000;
  const next = new Map();

  for (const hex of candidates) {
    const area = gridDisk(hex, 1);
    const demand = await countDemand(settings, area, buckets);
    const supply = area.reduce((sum, cell) => sum + (supplyByHex.get(cell) || 0), 0);
    const multiplier = multiplierForRatio(settings, demand, supply);
    const held = previous.get(hex);
    const heldLive = held && held.until > now && held.resolution === settings.resolution;

    if (multiplier > 1 && (!heldLive || multiplier >= held.multiplier)) {
      // New or rising surge: (re)start the hold.
      next.set(hex, { multiplier, until: now + holdMs, demand, supply, resolution: settings.resolution, since: heldLive ? held.since : now });
    } else if (heldLive) {
      // Demand eased: keep the surge until its hold runs out.
      next.set(hex, { ...held, demand, supply });
    }
  }

  // Surges whose area had no demand at all this cycle still run their hold out.
  for (const [hex, held] of previous) {
    if (!next.has(hex) && held.until > now && held.resolution === settings.resolution) next.set(hex, held);
  }

  await writeActive(next);
  pruneMemory(current - settings.window_minutes);
  return { enabled: true, demandHexes: demandHexes.length, active: next.size };
};

const pruneMemory = (oldestBucket) => {
  for (const key of memory.demand.keys()) {
    if (Number(key.split(':')[1]) < oldestBucket) memory.demand.delete(key);
  }
};

/// The automatic surge at a pickup, or multiplier 1.
export const getSurgeAt = async (lat, lng) => {
  const none = { multiplier: 1, ends_at: null, hex: null };
  if (!isValidPoint(lat, lng)) return none;
  const settings = await getSurgeSettings();
  if (!settings.enabled) return none;

  const hex = latLngToCell(lat, lng, settings.resolution);
  const result = await runRedisCommand((client) => client.hGet(ACTIVE_KEY, hex), { label: 'surge lookup' });
  let entry = null;
  if (result.ok && result.value) {
    try {
      entry = JSON.parse(result.value);
    } catch {
      entry = null;
    }
  } else if (!result.ok) {
    entry = memory.active.get(hex) || null;
  }

  if (!entry || entry.until <= Date.now() || entry.resolution !== settings.resolution) return { ...none, hex };
  return { multiplier: entry.multiplier, ends_at: new Date(entry.until).toISOString(), hex };
};

/**
 * Active surge hexagons for a map - the driver app's surge view and the admin
 * page. Each carries its outline, so a client can draw it without H3.
 */
export const listActiveSurges = async ({ lat, lng, radiusKm = 15 } = {}) => {
  const now = Date.now();
  const active = await readActive();
  const centre = isValidPoint(lat, lng) ? [lat, lng] : null;

  return [...active]
    .filter(([, entry]) => entry.until > now && entry.multiplier > 1)
    .map(([hex, entry]) => {
      const [hexLat, hexLng] = cellToLatLng(hex);
      return {
        hex,
        multiplier: entry.multiplier,
        ends_at: new Date(entry.until).toISOString(),
        ends_in_minutes: Math.max(0, Math.ceil((entry.until - now) / 60000)),
        demand: entry.demand,
        supply: entry.supply,
        center: { lat: hexLat, lng: hexLng },
        boundary: cellToBoundary(hex).map(([pointLat, pointLng]) => ({ lat: pointLat, lng: pointLng })),
        distance_km: centre ? round2(greatCircleDistance(centre, [hexLat, hexLng], 'km')) : null,
      };
    })
    .filter((surge) => surge.distance_km === null || surge.distance_km <= radiusKm)
    .sort((a, b) => b.multiplier - a.multiplier);
};

/// Runs a cycle every minute on whichever instance holds the lock.
export const startSurgeEngineLoop = () => {
  if (engineTimer) return;

  const run = async () => {
    const lock = await runRedisCommand(
      (client) => client.set(LOCK_KEY, String(process.pid), { NX: true, PX: CYCLE_MS - 5000 }),
      { label: 'surge lock' },
    );
    // No Redis: every instance runs its own cycle on its own memory.
    if (lock.ok && lock.value !== 'OK') return;
    try {
      await runSurgeCycle();
    } catch (error) {
      console.error('Surge cycle failed', error);
    }
  };

  engineTimer = setInterval(run, CYCLE_MS);
  engineTimer.unref?.();
  run();
};
