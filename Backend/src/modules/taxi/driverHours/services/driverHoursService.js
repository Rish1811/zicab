import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { runRedisCommand } from '../../../../infrastructure/redis/redisClient.js';
import { ServiceLocation } from '../../admin/models/ServiceLocation.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { DriverChallenge } from '../../challenges/models/DriverChallenge.js';
import { DriverChallengeProgress } from '../../challenges/models/DriverChallengeProgress.js';
import { forceDriverOffline } from '../../driver/controllers/driverController.js';
import { Driver } from '../../driver/models/Driver.js';
import { DriverActivityDay } from '../../driver/models/DriverActivityDay.js';
import { DriverLocationHistory } from '../../driver/models/DriverLocationHistory.js';
import { Zone } from '../../driver/models/Zone.js';
import {
  dateKeysBetween,
  getDriverActivityDays,
  getPendingActivity,
  istDateKey,
  istDayEnd,
  istDayStart,
  lastLocationTimes,
  MAX_GAP_MS,
} from '../../driver/services/driverActivityService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';
import { Ride } from '../../user/models/Ride.js';

/// The admin Driver Hours page: who is working now, how long everyone worked,
/// one driver's day in detail, and the drivers worth a look (online with GPS
/// off, fake GPS, behind on a challenge).
///
/// Built on the activity clock (driverActivityService): active time from live
/// location while online or on a trip, split into on-trip and waiting, plus
/// "ghost" time - marked online but sending no location.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const GHOST_ALERT_MS = 10 * 60 * 1000;
const COMPLETED_TRIP_TYPES = ['ride', 'intercity', 'parcel'];

const minutesOf = (seconds) => Math.floor((Number(seconds) || 0) / 60);
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const oid = (value) => new mongoose.Types.ObjectId(String(value));
const validId = (value) => mongoose.isValidObjectId(String(value || ''));

const readDateKey = (value, label, fallback) => {
  if (!value && fallback) return fallback;
  const key = String(value || '').trim().slice(0, 10);
  if (!DATE_KEY.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) {
    throw new ApiError(400, `${label} must be a date (YYYY-MM-DD)`);
  }
  return key;
};

const readRange = (query = {}, maxDays = 62) => {
  const today = istDateKey();
  const to = readDateKey(query.to, 'To', today);
  const from = readDateKey(query.from, 'From', to);
  if (from > to) throw new ApiError(400, 'From must be on or before To');
  if (dateKeysBetween(from, to).length > maxDays) throw new ApiError(400, `Pick at most ${maxDays} days`);
  return { from, to };
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/// Driver filter from the page's city / vehicle type / search inputs.
const driverFilter = ({ serviceLocationId, vehicleTypeId, search } = {}) => {
  const filter = { deletedAt: null };
  const and = [];
  if (validId(serviceLocationId)) filter.service_location_id = oid(serviceLocationId);
  if (validId(vehicleTypeId)) {
    and.push({ $or: [{ vehicleTypeId: oid(vehicleTypeId) }, { vehicleTypeIds: oid(vehicleTypeId) }] });
  }
  const term = String(search || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    and.push({ $or: [{ name: pattern }, { phone: pattern }, { vehicleNumber: pattern }] });
  }
  if (and.length) filter.$and = and;
  return filter;
};

const hasDriverFilter = (query = {}) =>
  validId(query.serviceLocationId) || validId(query.vehicleTypeId) || Boolean(String(query.search || '').trim());

const DRIVER_FIELDS = 'name phone vehicleNumber vehicleType vehicleTypeId service_location_id isOnline isOnRide locationUpdatedAt zoneId profileImage incentiveTracking.currentOnlineStartedAt';

/// Names for the vehicle types, cities and zones a list of drivers refers to.
const lookupNames = async (drivers) => {
  const ids = (field) => [...new Set(drivers.map((d) => d[field]).filter(Boolean).map(String))].filter(validId);
  const [vehicles, locations, zones] = await Promise.all([
    Vehicle.find({ _id: { $in: ids('vehicleTypeId') } }).select('name').lean(),
    ServiceLocation.find({ _id: { $in: ids('service_location_id') } }).select('name service_location_name').lean(),
    Zone.find({ _id: { $in: ids('zoneId') } }).select('name').lean(),
  ]);
  return {
    vehicle: new Map(vehicles.map((v) => [String(v._id), v.name || ''])),
    city: new Map(locations.map((l) => [String(l._id), l.service_location_name || l.name || ''])),
    zone: new Map(zones.map((z) => [String(z._id), z.name || ''])),
  };
};

const driverCard = (driver, names) => ({
  id: String(driver._id),
  name: driver.name || '',
  phone: driver.phone || '',
  vehicleNumber: driver.vehicleNumber || '',
  vehicleType: names.vehicle.get(String(driver.vehicleTypeId || '')) || driver.vehicleType || '',
  city: names.city.get(String(driver.service_location_id || '')) || '',
  profileImage: driver.profileImage || '',
});

/// Completed trips, driver earnings and fares per driver between two instants.
const tripsByDriver = async (start, end, driverIds = null) => {
  const match = {
    status: 'completed',
    serviceType: { $in: COMPLETED_TRIP_TYPES },
    completedAt: { $gte: start, $lt: end },
    driverId: driverIds ? { $in: driverIds.map(oid) } : { $ne: null },
  };
  const rows = await Ride.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$driverId',
        trips: { $sum: 1 },
        earnings: { $sum: { $ifNull: ['$driverEarnings', 0] } },
        fares: { $sum: { $ifNull: ['$fare', 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
};

/// Ride offers each driver got, turned down and won, for rides dispatched
/// between two instants. Acceptance = rides they took / offers they got.
const offersByDriver = async (start, end) => {
  const window = { $gte: start, $lt: end };
  const [offered, rejected, accepted] = await Promise.all([
    Ride.aggregate([
      { $match: { createdAt: window } },
      { $unwind: '$dispatchTracking.notifiedDriverIds' },
      { $group: { _id: '$dispatchTracking.notifiedDriverIds', count: { $sum: 1 } } },
    ]),
    Ride.aggregate([
      { $match: { createdAt: window } },
      { $unwind: '$dispatchTracking.rejectedDriverIds' },
      { $group: { _id: '$dispatchTracking.rejectedDriverIds', count: { $sum: 1 } } },
    ]),
    Ride.aggregate([
      { $match: { createdAt: window, driverId: { $ne: null } } },
      { $group: { _id: '$driverId', count: { $sum: 1 } } },
    ]),
  ]);
  const result = new Map();
  const add = (rows, field) => rows.forEach((row) => {
    const id = String(row._id);
    const entry = result.get(id) || { offered: 0, rejected: 0, accepted: 0 };
    entry[field] += row.count;
    result.set(id, entry);
  });
  add(offered, 'offered');
  add(rejected, 'rejected');
  add(accepted, 'accepted');
  return result;
};

const statusOf = (driver, lastSeen, now) => {
  if (driver.isOnRide) return 'on_trip';
  if (!driver.isOnline) return 'offline';
  return lastSeen && now - lastSeen <= MAX_GAP_MS ? 'active' : 'ghost';
};

/* ---------------- 1. Live board ---------------- */

export const getLiveBoard = async (query = {}) => {
  const now = Date.now();
  const today = istDateKey(now);
  const activityRows = await DriverActivityDay.find({ dateKey: today })
    .select('driverId activeSeconds onTripSeconds ghostSeconds mockedPings firstActiveAt lastActiveAt')
    .lean();
  const pending = getPendingActivity(today);
  const activeIds = [...new Set([
    ...activityRows.map((row) => String(row.driverId)),
    ...pending.keys(),
  ])].filter(validId);

  const drivers = await Driver.find({
    ...driverFilter(query),
    $or: [{ isOnline: true }, { isOnRide: true }, { _id: { $in: activeIds.map(oid) } }],
  }).select(DRIVER_FIELDS).limit(2000).lean();

  const [lastSeen, names, trips] = await Promise.all([
    lastLocationTimes(drivers),
    lookupNames(drivers),
    tripsByDriver(istDayStart(today), istDayEnd(today), drivers.map((d) => d._id)),
  ]);
  const activityById = new Map(activityRows.map((row) => [String(row.driverId), row]));

  const rows = drivers.map((driver) => {
    const id = String(driver._id);
    const stored = activityById.get(id) || {};
    const buffered = pending.get(id) || {};
    const seen = lastSeen.get(id) || null;
    const trip = trips.get(id) || {};
    return {
      ...driverCard(driver, names),
      status: statusOf(driver, seen, now),
      lastLocationAt: seen ? new Date(seen) : null,
      lastLocationSecondsAgo: seen ? Math.max(0, Math.round((now - seen) / 1000)) : null,
      zone: names.zone.get(String(driver.zoneId || '')) || '',
      onlineSince: driver.isOnline ? driver.incentiveTracking?.currentOnlineStartedAt || null : null,
      activeMinutes: minutesOf(Number(stored.activeSeconds || 0) + Number(buffered.seconds || 0)),
      onTripMinutes: minutesOf(Number(stored.onTripSeconds || 0) + Number(buffered.tripSeconds || 0)),
      ghostMinutes: minutesOf(Number(stored.ghostSeconds || 0) + Number(buffered.ghostSeconds || 0)),
      mockedPings: Number(stored.mockedPings || 0) + Number(buffered.mocked || 0),
      firstActiveAt: stored.firstActiveAt || null,
      trips: trip.trips || 0,
      earnings: round2(trip.earnings),
    };
  });

  const counts = { active: 0, on_trip: 0, ghost: 0, offline: 0 };
  rows.forEach((row) => { counts[row.status] += 1; });
  const order = { on_trip: 0, active: 1, ghost: 2, offline: 3 };
  const status = String(query.status || '');
  const items = rows
    .filter((row) => !status || row.status === status)
    .sort((a, b) => order[a.status] - order[b.status] || b.activeMinutes - a.activeMinutes);

  return { date: today, generatedAt: new Date(now), counts, items };
};

/* ---------------- 2. Hours report ---------------- */

const SORTS = {
  active: (row) => row.activeMinutes,
  days: (row) => row.daysWorked,
  avg: (row) => row.avgMinutesPerDay,
  trips: (row) => row.trips,
  earnings: (row) => row.earnings,
  acceptance: (row) => (row.acceptanceRate ?? -1),
  ghost: (row) => row.ghostMinutes,
  fake: (row) => row.mockedPings,
};

export const getHoursReport = async (query = {}) => {
  const { from, to } = readRange(query);
  const start = istDayStart(from);
  const end = istDayEnd(to);

  const [activity, trips, offers] = await Promise.all([
    DriverActivityDay.aggregate([
      { $match: { dateKey: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$driverId',
          days: { $sum: { $cond: [{ $gte: ['$activeSeconds', 60] }, 1, 0] } },
          days8h: { $sum: { $cond: [{ $gte: ['$activeSeconds', 8 * 3600] }, 1, 0] } },
          active: { $sum: '$activeSeconds' },
          trip: { $sum: { $ifNull: ['$onTripSeconds', 0] } },
          ghost: { $sum: { $ifNull: ['$ghostSeconds', 0] } },
          mocked: { $sum: { $ifNull: ['$mockedPings', 0] } },
          first: { $min: '$firstActiveAt' },
          last: { $max: '$lastActiveAt' },
        },
      },
    ]),
    tripsByDriver(start, end),
    offersByDriver(start, end),
  ]);

  const activityById = new Map(activity.map((row) => [String(row._id), row]));
  const ids = [...new Set([...activityById.keys(), ...trips.keys()])].filter(validId);
  const drivers = await Driver.find({ _id: { $in: ids.map(oid) }, ...driverFilter(query) })
    .select(DRIVER_FIELDS).lean();
  const names = await lookupNames(drivers);

  const items = drivers.map((driver) => {
    const id = String(driver._id);
    const a = activityById.get(id) || {};
    const t = trips.get(id) || {};
    const o = offers.get(id) || { offered: 0, rejected: 0, accepted: 0 };
    const activeMinutes = minutesOf(a.active);
    const daysWorked = a.days || 0;
    return {
      ...driverCard(driver, names),
      daysWorked,
      days8h: a.days8h || 0,
      activeMinutes,
      avgMinutesPerDay: daysWorked ? Math.round(activeMinutes / daysWorked) : 0,
      onTripMinutes: minutesOf(a.trip),
      waitingMinutes: Math.max(0, activeMinutes - minutesOf(a.trip)),
      ghostMinutes: minutesOf(a.ghost),
      mockedPings: a.mocked || 0,
      trips: t.trips || 0,
      earnings: round2(t.earnings),
      offersReceived: o.offered,
      offersRejected: o.rejected,
      offersAccepted: o.accepted,
      acceptanceRate: o.offered ? Math.round((Math.min(o.accepted, o.offered) / o.offered) * 100) : null,
      firstActiveAt: a.first || null,
      lastActiveAt: a.last || null,
    };
  });

  const sortKey = SORTS[query.sort] ? query.sort : 'active';
  const direction = query.order === 'asc' ? 1 : -1;
  items.sort((x, y) => (SORTS[sortKey](x) - SORTS[sortKey](y)) * direction);

  const working = items.filter((row) => row.daysWorked > 0);
  const totalActive = items.reduce((sum, row) => sum + row.activeMinutes, 0);
  const summary = {
    totalActiveHours: Math.round((totalActive / 60) * 10) / 10,
    driversActive: working.length,
    avgHoursPerDriver: working.length ? Math.round((totalActive / 60 / working.length) * 10) / 10 : 0,
    avgHoursPerDay: working.length
      ? Math.round((totalActive / 60 / Math.max(1, working.reduce((s, r) => s + r.daysWorked, 0))) * 10) / 10
      : 0,
    driverDays8h: items.reduce((sum, row) => sum + row.days8h, 0),
    onTripHours: Math.round((items.reduce((s, r) => s + r.onTripMinutes, 0) / 60) * 10) / 10,
    ghostHours: Math.round((items.reduce((s, r) => s + r.ghostMinutes, 0) / 60) * 10) / 10,
    fakeGpsDrivers: items.filter((row) => row.mockedPings > 0).length,
    trips: items.reduce((s, r) => s + r.trips, 0),
  };

  return { from, to, sort: sortKey, summary, items };
};

/* ---------------- 3. Attendance sheet ---------------- */

export const getAttendance = async (query = {}) => {
  const month = MONTH_KEY.test(String(query.month || '')) ? String(query.month) : istDateKey().slice(0, 7);
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const days = dateKeysBetween(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`);

  const rows = await DriverActivityDay.find({ dateKey: { $gte: days[0], $lte: days[days.length - 1] } })
    .select('driverId dateKey activeSeconds')
    .lean();
  const byDriver = new Map();
  rows.forEach((row) => {
    const id = String(row.driverId);
    const entry = byDriver.get(id) || {};
    entry[row.dateKey] = minutesOf(row.activeSeconds);
    byDriver.set(id, entry);
  });

  const drivers = await Driver.find({ _id: { $in: [...byDriver.keys()].map(oid) }, ...driverFilter(query) })
    .select(DRIVER_FIELDS).lean();
  const names = await lookupNames(drivers);
  const items = drivers.map((driver) => {
    const minutes = byDriver.get(String(driver._id)) || {};
    const values = days.map((day) => minutes[day] || 0);
    return {
      ...driverCard(driver, names),
      minutes: values,
      totalMinutes: values.reduce((a, b) => a + b, 0),
      daysWorked: values.filter((m) => m >= 1).length,
      days8h: values.filter((m) => m >= 480).length,
    };
  }).sort((a, b) => b.totalMinutes - a.totalMinutes);

  return { month, days, items };
};

/* ---------------- 4. One driver ---------------- */

const hourlyMinutes = (hours) => Array.from({ length: 24 }, (_, hour) => minutesOf((hours || {})[hour] ?? (hours || {})[String(hour)]));

export const getDriverDetail = async (driverId, query = {}) => {
  if (!validId(driverId)) throw new ApiError(400, 'Invalid driver');
  const today = istDateKey();
  const date = readDateKey(query.date, 'Date', today);
  const driver = await Driver.findById(driverId).select(DRIVER_FIELDS).lean();
  if (!driver) throw new ApiError(404, 'Driver not found');

  const from30 = istDateKey(istDayStart(date).getTime() - 29 * DAY_MS);
  const [activityDays, names, lastSeen, dayTrips, progress] = await Promise.all([
    getDriverActivityDays(driverId, from30, date),
    lookupNames([driver]),
    lastLocationTimes([driver]),
    Ride.find({
      driverId: oid(driverId),
      $or: [
        { completedAt: { $gte: istDayStart(date), $lt: istDayEnd(date) } },
        { acceptedAt: { $gte: istDayStart(date), $lt: istDayEnd(date) } },
      ],
    })
      .select('status serviceType fare driverEarnings pickupAddress dropAddress pickupLocation dropLocation acceptedAt startedAt completedAt estimatedDistanceMeters')
      .sort({ acceptedAt: 1 })
      .limit(100)
      .lean(),
    DriverChallengeProgress.find({ driverId: oid(driverId) }).sort({ updatedAt: -1 }).limit(5).lean(),
  ]);

  const challenges = progress.length
    ? await DriverChallenge.find({ _id: { $in: progress.map((p) => p.challengeId) } }).select('title requiredDays startDate endDate').lean()
    : [];
  const challengeById = new Map(challenges.map((c) => [String(c._id), c]));
  const day = activityDays.get(date) || {};
  const seen = lastSeen.get(String(driver._id)) || null;

  return {
    driver: {
      ...driverCard(driver, names),
      status: statusOf(driver, seen, Date.now()),
      lastLocationAt: seen ? new Date(seen) : null,
      zone: names.zone.get(String(driver.zoneId || '')) || '',
      onlineSince: driver.isOnline ? driver.incentiveTracking?.currentOnlineStartedAt || null : null,
    },
    date,
    // Oldest first, one entry per day, for the 30-day bar chart.
    daily: dateKeysBetween(from30, date).map((key) => {
      const row = activityDays.get(key) || {};
      return {
        dateKey: key,
        activeMinutes: minutesOf(row.activeSeconds),
        onTripMinutes: minutesOf(row.onTripSeconds),
        ghostMinutes: minutesOf(row.ghostSeconds),
      };
    }),
    day: {
      activeMinutes: minutesOf(day.activeSeconds),
      onTripMinutes: minutesOf(day.onTripSeconds),
      ghostMinutes: minutesOf(day.ghostSeconds),
      mockedPings: Number(day.mockedPings || 0),
      firstActiveAt: day.firstActiveAt || null,
      lastActiveAt: day.lastActiveAt || null,
      hasHourly: Boolean(day.hourlyActive || day.hourlyGhost),
      hourly: {
        active: hourlyMinutes(day.hourlyActive),
        trip: hourlyMinutes(day.hourlyTrip),
        ghost: hourlyMinutes(day.hourlyGhost),
      },
    },
    trips: dayTrips.map((ride) => ({
      id: String(ride._id),
      status: ride.status,
      serviceType: ride.serviceType,
      fare: round2(ride.fare),
      driverEarnings: round2(ride.driverEarnings),
      pickupAddress: ride.pickupAddress || '',
      dropAddress: ride.dropAddress || '',
      pickup: ride.pickupLocation?.coordinates || null,
      drop: ride.dropLocation?.coordinates || null,
      acceptedAt: ride.acceptedAt || null,
      startedAt: ride.startedAt || null,
      completedAt: ride.completedAt || null,
      distanceKm: round2((Number(ride.estimatedDistanceMeters) || 0) / 1000),
    })),
    challenges: progress.map((row) => {
      const challenge = challengeById.get(String(row.challengeId)) || {};
      return {
        id: String(row.challengeId),
        title: challenge.title || '',
        requiredDays: challenge.requiredDays || 0,
        qualifiedDays: row.qualifiedDays.length,
        status: row.status,
        startDate: challenge.startDate || '',
        endDate: challenge.endDate || '',
      };
    }),
  };
};

/// The driver's location trail for one day (kept 30 days), thinned to at most
/// MAX_ROUTE_POINTS, plus that day's pickups and drops.
const MAX_ROUTE_POINTS = 2000;

export const getDriverRoute = async (driverId, query = {}) => {
  if (!validId(driverId)) throw new ApiError(400, 'Invalid driver');
  const date = readDateKey(query.date, 'Date', istDateKey());
  const points = await DriverLocationHistory.find({
    driverId: oid(driverId),
    createdAt: { $gte: istDayStart(date), $lt: istDayEnd(date) },
  })
    .select('location createdAt speed')
    .sort({ createdAt: 1 })
    .limit(20000)
    .lean();
  const step = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  const thinned = points.filter((_, index) => index % step === 0 || index === points.length - 1);
  return {
    date,
    totalPoints: points.length,
    points: thinned
      .filter((p) => Array.isArray(p.location?.coordinates))
      .map((p) => ({ lat: p.location.coordinates[1], lng: p.location.coordinates[0], at: p.createdAt })),
  };
};

/* ---------------- 5. Alerts ---------------- */

export const getAlerts = async (query = {}) => {
  const now = Date.now();
  const today = istDateKey(now);
  const weekAgo = istDateKey(now - 6 * DAY_MS);

  const online = await Driver.find({ isOnline: true, ...driverFilter(query) }).select(DRIVER_FIELDS).lean();
  const lastSeen = await lastLocationTimes(online);
  const ghostDrivers = online.filter((driver) => {
    const seen = lastSeen.get(String(driver._id));
    return !driver.isOnRide && (!seen || now - seen > GHOST_ALERT_MS);
  });

  const fakeRows = await DriverActivityDay.find({ dateKey: { $gte: weekAgo, $lte: today }, mockedPings: { $gt: 0 } })
    .select('driverId dateKey mockedPings')
    .sort({ dateKey: -1 })
    .lean();
  const fakeDriverIds = [...new Set(fakeRows.map((row) => String(row.driverId)))];
  const fakeDrivers = fakeDriverIds.length
    ? await Driver.find({ _id: { $in: fakeDriverIds.map(oid) }, ...driverFilter(query) }).select(DRIVER_FIELDS).lean()
    : [];

  // Behind on a running challenge: still able to win, but counting days
  // slower than the target needs.
  const running = await DriverChallenge.find({ active: true, startDate: { $lte: today }, endDate: { $gte: today } }).lean();
  const behind = [];
  for (const challenge of running) {
    const periodDays = dateKeysBetween(challenge.startDate, challenge.endDate).length;
    const elapsed = Math.max(1, dateKeysBetween(challenge.startDate, today).length - 1);
    const daysLeft = dateKeysBetween(today, challenge.endDate).length;
    const rows = await DriverChallengeProgress.find({ challengeId: challenge._id, status: 'in_progress' }).lean();
    for (const row of rows) {
      const counted = row.qualifiedDays.length;
      const needed = challenge.requiredDays - counted;
      const reachable = needed <= daysLeft;
      const onPace = counted / elapsed >= challenge.requiredDays / periodDays;
      if (reachable && !onPace) {
        behind.push({ challengeId: String(challenge._id), challengeTitle: challenge.title, driverId: String(row.driverId), counted, needed, daysLeft });
      }
    }
  }
  const behindDrivers = behind.length
    ? await Driver.find({ _id: { $in: behind.map((b) => oid(b.driverId)) }, ...driverFilter(query) }).select(DRIVER_FIELDS).lean()
    : [];

  const names = await lookupNames([...online, ...fakeDrivers, ...behindDrivers]);
  const fakeById = new Map(fakeDrivers.map((d) => [String(d._id), d]));
  const behindById = new Map(behindDrivers.map((d) => [String(d._id), d]));

  return {
    ghost: ghostDrivers.map((driver) => {
      const seen = lastSeen.get(String(driver._id));
      return {
        ...driverCard(driver, names),
        lastLocationAt: seen ? new Date(seen) : null,
        silentMinutes: seen ? Math.round((now - seen) / 60000) : null,
        onlineSince: driver.incentiveTracking?.currentOnlineStartedAt || null,
      };
    }).sort((a, b) => (b.silentMinutes ?? 1e9) - (a.silentMinutes ?? 1e9)),
    fakeGps: fakeRows
      .filter((row) => fakeById.has(String(row.driverId)))
      .map((row) => ({ ...driverCard(fakeById.get(String(row.driverId)), names), dateKey: row.dateKey, mockedPings: row.mockedPings })),
    behindPace: behind
      .filter((row) => behindById.has(row.driverId))
      .map((row) => ({ ...driverCard(behindById.get(row.driverId), names), ...row })),
  };
};

/* ---------------- 6. When drivers work ---------------- */

export const getHeatmap = async (query = {}) => {
  const { from, to } = readRange(query, 92);
  const filter = { dateKey: { $gte: from, $lte: to } };
  if (hasDriverFilter(query)) {
    const drivers = await Driver.find(driverFilter(query)).select('_id').limit(20000).lean();
    filter.driverId = { $in: drivers.map((d) => d._id) };
  }
  const rows = await DriverActivityDay.find({ ...filter, hourlyActive: { $exists: true } }).select('dateKey hourlyActive').lean();

  // grid[weekday 0=Mon][hour] = active driver-seconds
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const weekdayOf = (dateKey) => (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7;
  rows.forEach((row) => {
    const weekday = weekdayOf(row.dateKey);
    Object.entries(row.hourlyActive || {}).forEach(([hour, seconds]) => {
      const h = Number(hour);
      if (h >= 0 && h < 24) grid[weekday][h] += Number(seconds) || 0;
    });
  });
  // Days with hourly data, per weekday, to turn totals into an average.
  const daysWithData = [...new Set(rows.map((row) => row.dateKey))];
  const dayCount = Array(7).fill(0);
  daysWithData.forEach((key) => { dayCount[weekdayOf(key)] += 1; });

  return {
    from,
    to,
    daysWithData: daysWithData.length,
    // Average number of drivers active in each hour of each weekday.
    avgActiveDrivers: grid.map((hours, weekday) => hours.map((seconds) => (
      dayCount[weekday] ? Math.round((seconds / 3600 / dayCount[weekday]) * 10) / 10 : 0
    ))),
  };
};

/* ---------------- 7. Force offline ---------------- */

export const forceOffline = async (driverId) => {
  if (!validId(driverId)) throw new ApiError(400, 'Invalid driver');
  const driver = await forceDriverOffline(driverId);
  if (!driver) throw new ApiError(409, 'This driver is already offline');
  sendPushNotificationToEntities({
    driverIds: [String(driverId)],
    title: 'You are offline',
    body: 'Your location was off, so you were set offline. Go online again when you are ready to take rides.',
    data: { type: 'forced_offline' },
  }).catch(() => {});
  return { id: String(driverId), isOnline: false };
};

/* ---------------- 8. Live positions (God's Eye) ---------------- */

/// Where every online or on-trip driver is right now, for the God's Eye map to
/// move cars smoothly. Read from the live location cache the socket handlers
/// write on every fix (falls back to the database copy, at most 15 s old).
export const getLivePositions = async () => {
  const now = Date.now();
  const drivers = await Driver.find({ deletedAt: null, $or: [{ isOnline: true }, { isOnRide: true }] })
    .select('_id location heading locationUpdatedAt isOnline isOnRide')
    .limit(5000)
    .lean();
  const cached = drivers.length
    ? await runRedisCommand(
        (client) => client.mGet(drivers.map((d) => `driver:${d._id}:location`)),
        { label: 'god eye positions' },
      ).catch(() => null)
    : null;
  const values = cached?.ok && Array.isArray(cached.value) ? cached.value : [];

  const items = drivers.map((driver, index) => {
    let live = null;
    try {
      live = JSON.parse(values[index] || 'null');
    } catch {
      live = null;
    }
    const liveAt = Number(live?.updatedAt) || 0;
    const dbAt = driver.locationUpdatedAt ? new Date(driver.locationUpdatedAt).getTime() : 0;
    const useLive = Array.isArray(live?.coordinates) && liveAt >= dbAt;
    const coordinates = useLive ? live.coordinates : driver.location?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return null;
    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    const seen = Math.max(liveAt, dbAt) || null;
    const heading = Number(useLive ? live.heading : driver.heading);
    return {
      id: String(driver._id),
      lat,
      lng,
      heading: Number.isFinite(heading) ? heading : null,
      speed: useLive && Number.isFinite(Number(live.speed)) ? Number(live.speed) : null,
      updatedAt: seen ? new Date(seen) : null,
      status: statusOf(driver, seen, now),
    };
  }).filter(Boolean);

  return { serverTime: new Date(now), items };
};
