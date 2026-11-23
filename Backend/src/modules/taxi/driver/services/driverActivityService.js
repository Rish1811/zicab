import { runRedisCommand } from '../../../../infrastructure/redis/redisClient.js';
import { Driver } from '../models/Driver.js';
import { DriverActivityDay } from '../models/DriverActivityDay.js';

/// The driver activity clock: how long each driver really worked each day.
///
/// Time is credited from the phone's location updates, not from the Online /
/// Offline taps. The app sends one about every 30 s while online (more often on
/// a trip); each update credits the time since the previous one when that gap
/// is at most MAX_GAP_MS - the same 3 minutes dispatch uses to call a GPS fix
/// fresh. A longer silence (phone died, app killed, no signal) credits nothing,
/// where the toggle-based count kept running all night.
///
/// A gap is only credited when both ends of it counted: the driver was online
/// (or on a trip) and the fix was not from a fake-GPS app.
///
/// Kept in memory per process and flushed to DriverActivityDay every minute. A
/// driver's socket stays on one process (nginx ip_hash), so this is accurate; a
/// reconnect to another process loses at most one gap. A restart loses at most
/// the last unflushed minute.

export const MAX_GAP_MS = 3 * 60 * 1000;
const FLUSH_INTERVAL_MS = 60 * 1000;
const ONLINE_CACHE_MS = 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/// 'YYYY-MM-DD' of the India-time day [at] falls in.
export const istDateKey = (at = Date.now()) => new Date(Number(at) + IST_OFFSET_MS).toISOString().slice(0, 10);

/// The instant the India-time day [dateKey] starts.
export const istDayStart = (dateKey) => new Date(Date.parse(`${dateKey}T00:00:00.000Z`) - IST_OFFSET_MS);

export const istDayEnd = (dateKey) => new Date(istDayStart(dateKey).getTime() + DAY_MS);

/// Every dateKey from [fromKey] to [toKey], both included.
export const dateKeysBetween = (fromKey, toKey) => {
  const keys = [];
  let cursor = Date.parse(`${fromKey}T00:00:00.000Z`);
  const end = Date.parse(`${toKey}T00:00:00.000Z`);
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) return keys;
  while (cursor <= end && keys.length < 400) {
    keys.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += DAY_MS;
  }
  return keys;
};

// driverId -> { lastAt, lastCounted }
const lastPing = new Map();
// `${driverId}|${dateKey}` -> { driverId, dateKey, seconds, first, last, mocked }
const pending = new Map();
// driverId -> { online, at }
const onlineCache = new Map();

const isDriverOnline = async (driverId) => {
  const cached = onlineCache.get(driverId);
  if (cached && Date.now() - cached.at < ONLINE_CACHE_MS) return cached.online;
  const driver = await Driver.findById(driverId).select('isOnline').lean().catch(() => null);
  const online = Boolean(driver?.isOnline);
  onlineCache.set(driverId, { online, at: Date.now() });
  return online;
};

/// Forget the cached online flag, so going offline stops the clock at once.
export const markDriverOnlineState = (driverId, online) => {
  if (!driverId) return;
  onlineCache.set(String(driverId), { online: Boolean(online), at: Date.now() });
  if (!online) {
    const previous = lastPing.get(String(driverId));
    if (previous) lastPing.set(String(driverId), { ...previous, lastCounted: false });
  }
};

const HOUR_MS = 60 * 60 * 1000;

/// India-time hour of the day (0-23) [at] falls in.
export const istHour = (at) => new Date(Number(at) + IST_OFFSET_MS).getUTCHours();

const emptyEntry = (driverId, dateKey) => ({
  driverId,
  dateKey,
  seconds: 0,
  tripSeconds: 0,
  ghostSeconds: 0,
  hours: {},
  tripHours: {},
  ghostHours: {},
  first: null,
  last: null,
  mocked: 0,
});

const addPending = (driverId, dateKey, {
  seconds = 0,
  tripSeconds = 0,
  ghostSeconds = 0,
  hour = null,
  from = null,
  to = null,
  mocked = 0,
}) => {
  const key = `${driverId}|${dateKey}`;
  const entry = pending.get(key) || emptyEntry(driverId, dateKey);
  entry.seconds += seconds;
  entry.tripSeconds += tripSeconds;
  entry.ghostSeconds += ghostSeconds;
  entry.mocked += mocked;
  if (hour !== null) {
    if (seconds) entry.hours[hour] = (entry.hours[hour] || 0) + seconds;
    if (tripSeconds) entry.tripHours[hour] = (entry.tripHours[hour] || 0) + tripSeconds;
    if (ghostSeconds) entry.ghostHours[hour] = (entry.ghostHours[hour] || 0) + ghostSeconds;
  }
  if (from && (!entry.first || from < entry.first)) entry.first = from;
  if (to && (!entry.last || to > entry.last)) entry.last = to;
  pending.set(key, entry);
};

/// Splits [fromMs, toMs) at India-time hour boundaries (which are also day
/// boundaries) and hands each piece to [credit].
const eachHourSegment = (fromMs, toMs, credit) => {
  let cursor = fromMs;
  while (cursor < toMs) {
    const segmentEnd = Math.min(toMs, (Math.floor((cursor + IST_OFFSET_MS) / HOUR_MS) + 1) * HOUR_MS - IST_OFFSET_MS);
    credit(istDateKey(cursor), istHour(cursor), (segmentEnd - cursor) / 1000, cursor, segmentEnd);
    cursor = segmentEnd;
  }
};

/// Credits [fromMs, toMs) as active time (and on-trip time when [onTrip]).
const creditSpan = (driverId, fromMs, toMs, onTrip = false) => {
  eachHourSegment(fromMs, toMs, (dateKey, hour, seconds, from, to) => {
    addPending(driverId, dateKey, {
      seconds,
      tripSeconds: onTrip ? seconds : 0,
      hour,
      from: new Date(from),
      to: new Date(to),
    });
  });
};

/// Credits [fromMs, toMs) as "ghost online": marked online, but the phone sent
/// no location (GPS off, app killed, no signal). Never counts as active time.
export const creditGhostSpan = (driverId, fromMs, toMs) => {
  eachHourSegment(fromMs, toMs, (dateKey, hour, seconds) => {
    addPending(String(driverId), dateKey, { ghostSeconds: seconds, hour });
  });
};

/**
 * One location update from a driver's phone.
 *
 * @param onTrip   the driver has an accepted or ongoing ride (counts as work
 *                 even if the online flag says otherwise)
 * @param isMocked the phone reported the fix as coming from a fake-GPS app
 */
export const recordDriverLocationPing = async ({ driverId, at = Date.now(), onTrip = false, isMocked = false }) => {
  if (!driverId) return;
  const id = String(driverId);
  const counts = !isMocked && (onTrip || await isDriverOnline(id));
  const previous = lastPing.get(id);
  lastPing.set(id, { lastAt: at, lastCounted: counts });

  if (isMocked) addPending(id, istDateKey(at), { mocked: 1 });
  if (!counts || !previous?.lastCounted) return;

  const gap = at - previous.lastAt;
  if (!(gap > 0) || gap > MAX_GAP_MS) return;
  creditSpan(id, previous.lastAt, at, onTrip);
};

/// Writes the buffered time to the database. Safe to call any time.
export const flushDriverActivity = async () => {
  if (!pending.size) return;
  const entries = [...pending.values()];
  pending.clear();
  const hourIncrements = (field, hours) => Object.fromEntries(
    Object.entries(hours).map(([hour, seconds]) => [`${field}.${hour}`, Math.round(seconds)]),
  );
  const ops = entries
    .filter((entry) => entry.seconds > 0 || entry.mocked > 0 || entry.ghostSeconds > 0)
    .map((entry) => ({
      updateOne: {
        filter: { driverId: entry.driverId, dateKey: entry.dateKey },
        update: {
          $inc: {
            activeSeconds: Math.round(entry.seconds),
            onTripSeconds: Math.round(entry.tripSeconds),
            ghostSeconds: Math.round(entry.ghostSeconds),
            mockedPings: entry.mocked,
            ...hourIncrements('hourlyActive', entry.hours),
            ...hourIncrements('hourlyTrip', entry.tripHours),
            ...hourIncrements('hourlyGhost', entry.ghostHours),
          },
          ...(entry.first || entry.last
            ? {
                ...(entry.first ? { $min: { firstActiveAt: entry.first } } : {}),
                ...(entry.last ? { $max: { lastActiveAt: entry.last } } : {}),
              }
            : {}),
          $setOnInsert: { driverId: entry.driverId, dateKey: entry.dateKey },
        },
        upsert: true,
      },
    }));
  if (!ops.length) return;
  try {
    await DriverActivityDay.bulkWrite(ops, { ordered: false });
  } catch (error) {
    // Put the time back so the next flush tries again rather than losing it.
    console.error('[activity] flush failed', error?.message);
    for (const entry of entries) {
      const key = `${entry.driverId}|${entry.dateKey}`;
      const current = pending.get(key);
      if (!current) {
        pending.set(key, entry);
        continue;
      }
      // Merge back into whatever arrived since.
      current.seconds += entry.seconds;
      current.tripSeconds += entry.tripSeconds;
      current.ghostSeconds += entry.ghostSeconds;
      current.mocked += entry.mocked;
      for (const [field, hours] of [['hours', entry.hours], ['tripHours', entry.tripHours], ['ghostHours', entry.ghostHours]]) {
        for (const [hour, seconds] of Object.entries(hours)) current[field][hour] = (current[field][hour] || 0) + seconds;
      }
      if (entry.first && (!current.first || entry.first < current.first)) current.first = entry.first;
      if (entry.last && (!current.last || entry.last > current.last)) current.last = entry.last;
    }
  }
};

/// Active seconds per dateKey for one driver, including what is still
/// buffered in this process (so "today" is live to the minute).
export const getDriverActivityDays = async (driverId, fromKey, toKey) => {
  const rows = await DriverActivityDay.find({ driverId, dateKey: { $gte: fromKey, $lte: toKey } })
    .select('dateKey activeSeconds onTripSeconds ghostSeconds hourlyActive hourlyTrip hourlyGhost firstActiveAt lastActiveAt mockedPings')
    .lean();
  const byDay = new Map(rows.map((row) => [row.dateKey, { ...row }]));
  for (const entry of pending.values()) {
    if (entry.driverId !== String(driverId) || entry.dateKey < fromKey || entry.dateKey > toKey) continue;
    const row = byDay.get(entry.dateKey) || { dateKey: entry.dateKey, activeSeconds: 0, onTripSeconds: 0, ghostSeconds: 0 };
    row.activeSeconds = Number(row.activeSeconds || 0) + entry.seconds;
    row.onTripSeconds = Number(row.onTripSeconds || 0) + entry.tripSeconds;
    row.ghostSeconds = Number(row.ghostSeconds || 0) + entry.ghostSeconds;
    for (const [field, hours] of [['hourlyActive', entry.hours], ['hourlyTrip', entry.tripHours], ['hourlyGhost', entry.ghostHours]]) {
      row[field] = { ...(row[field] || {}) };
      for (const [hour, seconds] of Object.entries(hours)) row[field][hour] = Number(row[field][hour] || 0) + seconds;
    }
    byDay.set(entry.dateKey, row);
  }
  return byDay;
};

let flushTimer = null;

export const startDriverActivityFlushLoop = () => {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushDriverActivity().catch(() => {});
    // Drivers silent for longer than a gap can be forgotten.
    const cutoff = Date.now() - MAX_GAP_MS * 2;
    for (const [id, ping] of lastPing) if (ping.lastAt < cutoff) lastPing.delete(id);
    for (const [id, cached] of onlineCache) if (Date.now() - cached.at > ONLINE_CACHE_MS * 5) onlineCache.delete(id);
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  // A restart (pm2 sends SIGINT, kill_timeout 8 s) writes the buffered minute
  // first. Never waits more than 5 s for the database.
  const flushOnExit = () => {
    setTimeout(() => process.exit(0), 5000).unref?.();
    flushDriverActivity().finally(() => process.exit(0));
  };
  process.once('SIGINT', flushOnExit);
  process.once('SIGTERM', flushOnExit);
};

// --- Ghost online ----------------------------------------------------------
//
// A driver can be marked online while their phone sends nothing: GPS off, app
// killed, no signal. They get no rides (dispatch skips stale GPS) but look
// online. Once a minute, one process (Redis lock) credits that minute as
// ghost time to every such driver, so the Driver Hours page can show it.

const GHOST_SWEEP_MS = 60 * 1000;
const GHOST_LOCK_KEY = 'lock:driver-ghost-sweep';
let ghostTimer = null;

/// The freshest location time per driver: the live cache the socket handlers
/// write on every fix, or the throttled database copy (at most 15 s old).
export const lastLocationTimes = async (drivers) => {
  const ids = drivers.map((driver) => String(driver._id));
  const cached = ids.length
    ? await runRedisCommand(
        (client) => client.mGet(ids.map((id) => `driver:${id}:location`)),
        { label: 'driver location cache read' },
      ).catch(() => null)
    : null;
  const values = cached?.ok && Array.isArray(cached.value) ? cached.value : [];
  const result = new Map();
  drivers.forEach((driver, index) => {
    let fromCache = 0;
    try {
      fromCache = Number(JSON.parse(values[index] || 'null')?.updatedAt) || 0;
    } catch {
      fromCache = 0;
    }
    const fromDb = driver.locationUpdatedAt ? new Date(driver.locationUpdatedAt).getTime() : 0;
    result.set(String(driver._id), Math.max(fromCache, fromDb) || null);
  });
  return result;
};

export const runGhostSweep = async (now = Date.now()) => {
  const online = await Driver.find({ isOnline: true, deletedAt: null }).select('_id locationUpdatedAt').lean();
  if (!online.length) return 0;
  const lastSeen = await lastLocationTimes(online);
  let count = 0;
  for (const driver of online) {
    const seen = lastSeen.get(String(driver._id));
    if (seen && now - seen <= MAX_GAP_MS) continue;
    // The minute since the last sweep, but never before the phone went quiet.
    const from = Math.max(now - GHOST_SWEEP_MS, seen ? seen + MAX_GAP_MS : now - GHOST_SWEEP_MS);
    if (from >= now) continue;
    creditGhostSpan(driver._id, from, now);
    count += 1;
  }
  return count;
};

export const startDriverGhostSweepLoop = () => {
  if (ghostTimer) return;
  const run = async () => {
    const lock = await runRedisCommand(
      (client) => client.set(GHOST_LOCK_KEY, String(process.pid), { NX: true, PX: GHOST_SWEEP_MS - 5000 }),
      { label: 'ghost sweep lock' },
    );
    if (lock.ok && lock.value !== 'OK') return;
    try {
      await runGhostSweep();
    } catch (error) {
      console.error('[activity] ghost sweep failed', error?.message);
    }
  };
  ghostTimer = setInterval(run, GHOST_SWEEP_MS);
  ghostTimer.unref?.();
};

/// Time this process has buffered but not yet written for [dateKey], per
/// driver - so live views are current to the second rather than the minute.
export const getPendingActivity = (dateKey) => {
  const result = new Map();
  for (const entry of pending.values()) {
    if (entry.dateKey !== dateKey) continue;
    result.set(entry.driverId, {
      seconds: entry.seconds,
      tripSeconds: entry.tripSeconds,
      ghostSeconds: entry.ghostSeconds,
      mocked: entry.mocked,
    });
  }
  return result;
};
