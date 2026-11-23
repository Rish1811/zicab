import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { runRedisCommand } from '../../../../infrastructure/redis/redisClient.js';
import { Driver } from '../../driver/models/Driver.js';
import { istDateKey } from '../../driver/services/driverActivityService.js';
import { OnMyWaySetting } from '../models/OnMyWaySetting.js';

/// Ride On My Way - driver destination mode, as Uber's "Set destination".
///
/// A driver heading home sets a destination; while it is on they are only
/// offered rides that take them closer to it. A ride qualifies when
///   - the detour is small: driver -> pickup -> drop -> home is at most
///     maxDetourPercent (or maxDetourKm, the larger) longer than driver -> home;
///   - the drop leaves the driver at least minProgressPercent closer to home.
/// Straight-line distances, so matching stays instant.
///
/// The mode switches off by itself near the destination, after maxHours, or
/// when the driver turns it off. Each ride completed in the mode uses one of
/// the day's usesPerDay; turning it on and off costs nothing.

const toRad = (deg) => (deg * Math.PI) / 180;
export const distanceMeters = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

const validCoords = (coords) => Array.isArray(coords) && coords.length === 2
  && coords.every((v) => Number.isFinite(Number(v))) && !(Number(coords[0]) === 0 && Number(coords[1]) === 0);

/* ---------------- settings ---------------- */

const SETTINGS_TTL_MS = 60 * 1000;
let settingsCache = { value: null, at: 0 };

const serializeSettings = (doc = {}) => ({
  enabled: doc.enabled !== false,
  usesPerDay: Number(doc.usesPerDay ?? 2),
  maxDetourPercent: Number(doc.maxDetourPercent ?? 25),
  maxDetourKm: Number(doc.maxDetourKm ?? 3),
  minProgressPercent: Number(doc.minProgressPercent ?? 30),
  maxHours: Number(doc.maxHours ?? 3),
  arriveRadiusMeters: Number(doc.arriveRadiusMeters ?? 500),
  vehicleTypeIds: (doc.vehicleTypeIds || []).map(String),
  serviceLocationIds: (doc.serviceLocationIds || []).map(String),
  includeParcels: doc.includeParcels !== false,
});

export const getOnMyWaySettings = async ({ fresh = false } = {}) => {
  if (!fresh && settingsCache.value && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const doc = await OnMyWaySetting.findOne({ scope: 'default' }).lean().catch(() => null);
  settingsCache = { value: serializeSettings(doc || {}), at: Date.now() };
  return settingsCache.value;
};

export const updateOnMyWaySettings = async (body = {}) => {
  const number = (value, label, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(400, `${label} must be between ${min} and ${max}`);
    return n;
  };
  const ids = (list) => (Array.isArray(list) ? list : []).filter((id) => mongoose.isValidObjectId(String(id))).map((id) => new mongoose.Types.ObjectId(String(id)));
  const doc = await OnMyWaySetting.findOneAndUpdate(
    { scope: 'default' },
    {
      $set: {
        enabled: body.enabled !== false,
        usesPerDay: Math.floor(number(body.usesPerDay ?? 2, 'Uses per day', 0, 20)),
        maxDetourPercent: number(body.maxDetourPercent ?? 25, 'Maximum detour %', 0, 200),
        maxDetourKm: number(body.maxDetourKm ?? 3, 'Maximum detour km', 0, 50),
        minProgressPercent: number(body.minProgressPercent ?? 30, 'Minimum progress %', 0, 100),
        maxHours: number(body.maxHours ?? 3, 'Time limit', 0.25, 24),
        arriveRadiusMeters: number(body.arriveRadiusMeters ?? 500, 'Arrival radius', 50, 5000),
        vehicleTypeIds: ids(body.vehicleTypeIds),
        serviceLocationIds: ids(body.serviceLocationIds),
        includeParcels: body.includeParcels !== false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  settingsCache = { value: serializeSettings(doc), at: Date.now() };
  return settingsCache.value;
};

/* ---------------- the rule ---------------- */

/// Whether a driver in destination mode may be offered this ride. All points
/// are GeoJSON [lng, lat].
export const isRideOnMyWay = ({ driverCoords, pickupCoords, dropCoords, homeCoords, settings }) => {
  if (![driverCoords, pickupCoords, dropCoords, homeCoords].every(validCoords)) return false;
  const direct = distanceMeters(driverCoords, homeCoords);
  const via = distanceMeters(driverCoords, pickupCoords)
    + distanceMeters(pickupCoords, dropCoords)
    + distanceMeters(dropCoords, homeCoords);
  const allowedDetour = Math.max(direct * (settings.maxDetourPercent / 100), settings.maxDetourKm * 1000);
  if (via - direct > allowedDetour) return false;
  const remaining = distanceMeters(dropCoords, homeCoords);
  return remaining <= direct * (1 - settings.minProgressPercent / 100);
};

/// The driver's destination when their mode is on and in time, else null.
export const activeDestination = (driver, now = Date.now()) => {
  const mode = driver?.destinationMode;
  if (!mode?.enabled) return null;
  if (mode.expiresAt && new Date(mode.expiresAt).getTime() <= now) return null;
  const coords = mode.destination?.coordinates;
  return validCoords(coords) ? coords.map(Number) : null;
};

/// Applied in matching: drivers in destination mode keep only rides on their
/// way; everyone else is untouched.
export const filterDriversForOnMyWay = ({ drivers, pickupCoords, dropCoords, serviceType, settings }) => {
  if (!settings?.enabled) return drivers;
  return drivers.filter((driver) => {
    const home = activeDestination(driver);
    if (!home) return true;
    if (serviceType === 'parcel' && !settings.includeParcels) return false;
    if (!validCoords(dropCoords)) return false;
    return isRideOnMyWay({
      driverCoords: driver.location?.coordinates,
      pickupCoords,
      dropCoords,
      homeCoords: home,
      settings,
    });
  });
};

/* ---------------- driver side ---------------- */

const usesToday = (driver) => {
  const usage = driver?.onMyWayUsage || {};
  return usage.dateKey === istDateKey() ? Number(usage.count || 0) : 0;
};

const eligibility = (driver, settings) => {
  if (!settings.enabled) return 'Ride On My Way is not available right now.';
  const vehicles = [driver.vehicleTypeId, ...(driver.vehicleTypeIds || [])].filter(Boolean).map(String);
  if (settings.vehicleTypeIds.length && !vehicles.some((id) => settings.vehicleTypeIds.includes(id))) {
    return 'Ride On My Way is not available for your vehicle type.';
  }
  if (settings.serviceLocationIds.length && !settings.serviceLocationIds.includes(String(driver.service_location_id || ''))) {
    return 'Ride On My Way is not available in your city yet.';
  }
  return '';
};

const serializeStatus = (driver, settings) => {
  const home = activeDestination(driver);
  const used = usesToday(driver);
  const why = eligibility(driver, settings);
  return {
    available: !why,
    unavailableReason: why,
    usesPerDay: settings.usesPerDay,
    usesToday: used,
    usesLeft: Math.max(0, settings.usesPerDay - used),
    maxHours: settings.maxHours,
    active: Boolean(home),
    destination: home
      ? {
          lat: home[1],
          lng: home[0],
          label: driver.destinationMode?.label || '',
          startedAt: driver.destinationMode?.startedAt || null,
          expiresAt: driver.destinationMode?.expiresAt || null,
        }
      : null,
    home: validCoords(driver.onMyWayHome?.coordinates)
      ? { lat: driver.onMyWayHome.coordinates[1], lng: driver.onMyWayHome.coordinates[0], label: driver.onMyWayHome.label || 'Home' }
      : null,
  };
};

const DRIVER_FIELDS = 'isOnline isOnRide location vehicleTypeId vehicleTypeIds service_location_id destinationMode onMyWayHome onMyWayUsage';

const loadDriver = async (driverId) => {
  const driver = await Driver.findById(driverId).select(DRIVER_FIELDS).lean();
  if (!driver) throw new ApiError(404, 'Driver not found');
  return driver;
};

export const getDriverOnMyWay = async (driverId) => serializeStatus(await loadDriver(driverId), await getOnMyWaySettings());

const readPoint = (body) => {
  const lat = Number(body?.lat ?? body?.latitude);
  const lng = Number(body?.lng ?? body?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(400, 'Choose a destination on the map');
  }
  return [lng, lat];
};

export const startDriverOnMyWay = async (driverId, body = {}) => {
  const [driver, settings] = await Promise.all([loadDriver(driverId), getOnMyWaySettings({ fresh: true })]);
  const why = eligibility(driver, settings);
  if (why) throw new ApiError(400, why);
  if (!driver.isOnline) throw new ApiError(400, 'Go online first, then turn on Ride On My Way.');
  if (usesToday(driver) >= settings.usesPerDay) {
    throw new ApiError(400, `You have used Ride On My Way ${settings.usesPerDay} time(s) today. It resets at midnight.`);
  }
  const destination = readPoint(body);
  const { findZoneByPickup } = await import('../../services/matchingService.js');
  const zone = await findZoneByPickup(destination).catch(() => null);
  if (!zone) throw new ApiError(400, 'That destination is outside the areas ZI CAB serves.');
  if (validCoords(driver.location?.coordinates) && distanceMeters(driver.location.coordinates, destination) < 2000) {
    throw new ApiError(400, 'You are already close to that destination.');
  }

  const now = new Date();
  const mode = {
    enabled: true,
    destination: { type: 'Point', coordinates: destination },
    label: String(body.label || '').trim().slice(0, 120) || zone.name || 'Destination',
    startedAt: now,
    expiresAt: new Date(now.getTime() + settings.maxHours * 3600 * 1000),
    startLocation: validCoords(driver.location?.coordinates) ? { type: 'Point', coordinates: driver.location.coordinates } : null,
  };
  const update = { destinationMode: mode };
  if (body.saveAsHome) update.onMyWayHome = { coordinates: destination, label: String(body.label || 'Home').trim().slice(0, 60) || 'Home' };
  await Driver.updateOne({ _id: driverId }, { $set: update });
  rememberDestination(String(driverId), destination, mode.expiresAt, settings.arriveRadiusMeters);
  return getDriverOnMyWay(driverId);
};

export const stopDriverOnMyWay = async (driverId, reason = 'driver') => {
  const result = await Driver.updateOne(
    { _id: driverId, 'destinationMode.enabled': true },
    { $set: { 'destinationMode.enabled': false, 'destinationMode.endedAt': new Date(), 'destinationMode.endReason': reason } },
  );
  arrivalCache.delete(String(driverId));
  return result.modifiedCount > 0;
};

export const saveDriverOnMyWayHome = async (driverId, body = {}) => {
  const coords = readPoint(body);
  await Driver.updateOne({ _id: driverId }, { $set: { onMyWayHome: { coordinates: coords, label: String(body.label || 'Home').trim().slice(0, 60) || 'Home' } } });
  return getDriverOnMyWay(driverId);
};

/// A ride accepted in destination mode completed: one use of today's allowance.
export const recordOnMyWayUse = async (driverId) => {
  const today = istDateKey();
  const reset = await Driver.updateOne(
    { _id: driverId, 'onMyWayUsage.dateKey': { $ne: today } },
    { $set: { onMyWayUsage: { dateKey: today, count: 1 } } },
  );
  if (!reset.modifiedCount) {
    await Driver.updateOne({ _id: driverId, 'onMyWayUsage.dateKey': today }, { $inc: { 'onMyWayUsage.count': 1 } });
  }
};

/* ---------------- auto-off ---------------- */

// driverId -> { coords, expiresAt, radius } for drivers in destination mode,
// so each location update checks arrival without a database read.
const arrivalCache = new Map();
const rememberDestination = (driverId, coords, expiresAt, radius) => {
  arrivalCache.set(driverId, { coords, expiresAt: expiresAt ? new Date(expiresAt).getTime() : null, radius });
};

const notifyEnded = async (driverId, reason) => {
  const { emitToDriver } = await import('../../services/dispatchService.js');
  emitToDriver(String(driverId), 'onMyWay:ended', { reason });
  const { sendPushNotificationToEntities } = await import('../../services/pushNotificationService.js');
  sendPushNotificationToEntities({
    driverIds: [String(driverId)],
    title: reason === 'arrived' ? 'You have arrived' : 'Ride On My Way ended',
    body: reason === 'arrived'
      ? 'Ride On My Way is off - you get all ride offers again.'
      : 'Your time is up - you get all ride offers again.',
    data: { type: 'on_my_way_ended', reason },
  }).catch(() => {});
};

/// Called on every driver location update: switches the mode off on arrival.
export const checkOnMyWayArrival = async (driverId, coords) => {
  const entry = arrivalCache.get(String(driverId));
  if (!entry || !validCoords(coords)) return;
  if (distanceMeters(coords, entry.coords) > entry.radius) return;
  arrivalCache.delete(String(driverId));
  if (await stopDriverOnMyWay(driverId, 'arrived')) await notifyEnded(driverId, 'arrived');
};

const SWEEP_MS = 60 * 1000;
const LOCK_KEY = 'lock:on-my-way-sweep';
let sweepTimer = null;

/// Every minute, in every process: reload who is in destination mode (for the
/// arrival check); in one process (Redis lock): switch off expired modes.
export const runOnMyWaySweep = async ({ expire = true } = {}) => {
  const settings = await getOnMyWaySettings({ fresh: true });
  const drivers = await Driver.find({ 'destinationMode.enabled': true }).select('_id destinationMode').lean();
  arrivalCache.clear();
  const now = Date.now();
  const expired = [];
  for (const driver of drivers) {
    const mode = driver.destinationMode || {};
    if (mode.expiresAt && new Date(mode.expiresAt).getTime() <= now) {
      expired.push(String(driver._id));
      continue;
    }
    if (validCoords(mode.destination?.coordinates)) {
      rememberDestination(String(driver._id), mode.destination.coordinates, mode.expiresAt, settings.arriveRadiusMeters);
    }
  }
  if (expire) {
    for (const driverId of expired) {
      if (await stopDriverOnMyWay(driverId, 'expired')) await notifyEnded(driverId, 'expired');
    }
  }
  return { active: arrivalCache.size, expired: expired.length };
};

export const startOnMyWayLoop = () => {
  if (sweepTimer) return;
  const run = async () => {
    const lock = await runRedisCommand(
      (client) => client.set(LOCK_KEY, String(process.pid), { NX: true, PX: SWEEP_MS - 5000 }),
      { label: 'on-my-way sweep lock' },
    );
    const holdsLock = !(lock.ok && lock.value !== 'OK');
    await runOnMyWaySweep({ expire: holdsLock }).catch((error) => console.error('[on-my-way] sweep failed', error?.message));
  };
  sweepTimer = setInterval(run, SWEEP_MS);
  sweepTimer.unref?.();
  setTimeout(run, 15000).unref?.();
};
