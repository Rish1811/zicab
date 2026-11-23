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

const addPending = (driverId, dateKey, { seconds = 0, from = null, to = null, mocked = 0 }) => {
  const key = `${driverId}|${dateKey}`;
  const entry = pending.get(key) || { driverId, dateKey, seconds: 0, first: null, last: null, mocked: 0 };
  entry.seconds += seconds;
  entry.mocked += mocked;
  if (from && (!entry.first || from < entry.first)) entry.first = from;
  if (to && (!entry.last || to > entry.last)) entry.last = to;
  pending.set(key, entry);
};

/// Credits [fromMs, toMs) to the India-time days it spans.
const creditSpan = (driverId, fromMs, toMs) => {
  let cursor = fromMs;
  while (cursor < toMs) {
    const dateKey = istDateKey(cursor);
    const dayEnd = istDayEnd(dateKey).getTime();
    const segmentEnd = Math.min(dayEnd, toMs);
    addPending(driverId, dateKey, {
      seconds: (segmentEnd - cursor) / 1000,
      from: new Date(cursor),
      to: new Date(segmentEnd),
    });
    cursor = segmentEnd;
  }
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
  creditSpan(id, previous.lastAt, at);
};

/// Writes the buffered time to the database. Safe to call any time.
export const flushDriverActivity = async () => {
  if (!pending.size) return;
  const entries = [...pending.values()];
  pending.clear();
  const ops = entries
    .filter((entry) => entry.seconds > 0 || entry.mocked > 0)
    .map((entry) => ({
      updateOne: {
        filter: { driverId: entry.driverId, dateKey: entry.dateKey },
        update: {
          $inc: { activeSeconds: Math.round(entry.seconds), mockedPings: entry.mocked },
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
      addPending(entry.driverId, entry.dateKey, {
        seconds: entry.seconds,
        from: entry.first,
        to: entry.last,
        mocked: entry.mocked,
      });
    }
  }
};

/// Active seconds per dateKey for one driver, including what is still
/// buffered in this process (so "today" is live to the minute).
export const getDriverActivityDays = async (driverId, fromKey, toKey) => {
  const rows = await DriverActivityDay.find({ driverId, dateKey: { $gte: fromKey, $lte: toKey } })
    .select('dateKey activeSeconds firstActiveAt lastActiveAt mockedPings')
    .lean();
  const byDay = new Map(rows.map((row) => [row.dateKey, { ...row }]));
  for (const entry of pending.values()) {
    if (entry.driverId !== String(driverId) || entry.dateKey < fromKey || entry.dateKey > toKey) continue;
    const row = byDay.get(entry.dateKey) || { dateKey: entry.dateKey, activeSeconds: 0 };
    row.activeSeconds = Number(row.activeSeconds || 0) + entry.seconds;
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
