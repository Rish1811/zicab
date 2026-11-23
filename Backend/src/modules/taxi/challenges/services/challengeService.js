import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { runRedisCommand } from '../../../../infrastructure/redis/redisClient.js';
import { Driver } from '../../driver/models/Driver.js';
import { DriverActivityDay } from '../../driver/models/DriverActivityDay.js';
import {
  dateKeysBetween,
  getDriverActivityDays,
  istDateKey,
  istDayEnd,
  istDayStart,
} from '../../driver/services/driverActivityService.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';
import { Ride } from '../../user/models/Ride.js';
import { DriverChallenge } from '../models/DriverChallenge.js';
import { CHALLENGE_PROGRESS_STATUS, DriverChallengeProgress } from '../models/DriverChallengeProgress.js';

/// Driver challenges: "be active N days in this period, win a reward".
///
/// A day counts when the driver's activity clock (location-based, see
/// driverActivityService) reached `minActiveMinutes` and they completed
/// `minTrips` trips that India-time day. Past days are judged by a sweep
/// (every 15 min, one process at a time); today is shown live.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TRIP_SERVICE_TYPES = ['ride', 'intercity', 'parcel'];
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_LOCK_KEY = 'lock:driver-challenge-sweep';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const minutesOf = (seconds) => Math.floor((Number(seconds) || 0) / 60);
const idList = (values) => (Array.isArray(values) ? values : [])
  .map((value) => String(value?._id || value?.id || value || '').trim())
  .filter((value) => mongoose.isValidObjectId(value));

const previousDateKey = (dateKey) => istDateKey(istDayStart(dateKey).getTime() - 1);

/* ---------------- eligibility and counting ---------------- */

const driverEligibilityFilter = (challenge) => {
  const filter = { deletedAt: null };
  const vehicleIds = idList(challenge.vehicleTypeIds);
  if (vehicleIds.length) {
    filter.$or = [
      { vehicleTypeId: { $in: vehicleIds } },
      { vehicleTypeIds: { $in: vehicleIds } },
    ];
  }
  const locationIds = idList(challenge.serviceLocationIds);
  if (locationIds.length) filter.service_location_id = { $in: locationIds };
  return filter;
};

const isDriverEligible = (challenge, driver) => {
  if (!driver) return false;
  const vehicleIds = idList(challenge.vehicleTypeIds);
  if (vehicleIds.length) {
    const driverVehicles = new Set([driver.vehicleTypeId, ...(driver.vehicleTypeIds || [])].filter(Boolean).map(String));
    if (!vehicleIds.some((id) => driverVehicles.has(id))) return false;
  }
  const locationIds = idList(challenge.serviceLocationIds);
  if (locationIds.length && !locationIds.includes(String(driver.service_location_id || ''))) return false;
  return true;
};

/// Completed trips per driver on one India-time day.
const tripsOnDay = async (driverIds, dateKey) => {
  if (!driverIds.length) return new Map();
  const rows = await Ride.aggregate([
    {
      $match: {
        driverId: { $in: driverIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
        status: 'completed',
        serviceType: { $in: TRIP_SERVICE_TYPES },
        completedAt: { $gte: istDayStart(dateKey), $lt: istDayEnd(dateKey) },
      },
    },
    { $group: { _id: '$driverId', trips: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.trips]));
};

const dayQualifies = (challenge, activeSeconds, trips) =>
  minutesOf(activeSeconds) >= Number(challenge.minActiveMinutes || 0)
  && Number(trips || 0) >= Number(challenge.minTrips || 0);

/* ---------------- the sweep ---------------- */

const notify = (driverIds, title, body, data = {}) => {
  if (!driverIds.length) return;
  sendPushNotificationToEntities({ driverIds, title, body, data: { type: 'driver_challenge', ...data } })
    .catch((error) => console.error('[challenge] push failed', error?.message));
};

/// Judges one finished day for one challenge. Idempotent.
export const evaluateChallengeDay = async (challenge, dateKey, { announce = false } = {}) => {
  const minSeconds = Number(challenge.minActiveMinutes || 0) * 60;
  const activeRows = await DriverActivityDay.find({ dateKey, activeSeconds: { $gte: minSeconds } })
    .select('driverId activeSeconds')
    .lean();
  if (!activeRows.length) return { qualified: 0 };

  const eligible = await Driver.find({
    _id: { $in: activeRows.map((row) => row.driverId) },
    ...driverEligibilityFilter(challenge),
  }).select('_id').lean();
  const eligibleIds = new Set(eligible.map((driver) => String(driver._id)));
  const candidates = activeRows.filter((row) => eligibleIds.has(String(row.driverId)));
  const trips = await tripsOnDay(candidates.map((row) => row.driverId), dateKey);
  const winners = candidates
    .filter((row) => dayQualifies(challenge, row.activeSeconds, trips.get(String(row.driverId))))
    .map((row) => String(row.driverId));

  const newlyCounted = [];
  for (const driverId of winners) {
    const before = await DriverChallengeProgress.findOneAndUpdate(
      { challengeId: challenge._id, driverId },
      {
        $addToSet: { qualifiedDays: dateKey },
        $setOnInsert: { challengeId: challenge._id, driverId, status: 'in_progress' },
      },
      { upsert: true, returnDocument: 'before' },
    ).lean();
    if (!before?.qualifiedDays?.includes(dateKey)) newlyCounted.push(driverId);
  }

  // qualifiedCount mirrors the array for sorting; completion is decided here.
  const progressRows = await DriverChallengeProgress.find({ challengeId: challenge._id, driverId: { $in: newlyCounted } });
  const completedNow = [];
  for (const row of progressRows) {
    row.qualifiedCount = row.qualifiedDays.length;
    if (row.status === 'in_progress' && row.qualifiedCount >= challenge.requiredDays) {
      row.status = 'completed';
      row.completedAt = new Date();
      completedNow.push(String(row.driverId));
    }
    await row.save();
  }

  if (announce) {
    const reward = challenge.rewardLabel || 'your reward';
    for (const row of progressRows) {
      const driverId = String(row.driverId);
      if (completedNow.includes(driverId)) continue;
      const left = Math.max(0, challenge.requiredDays - row.qualifiedCount);
      notify([driverId], 'Yesterday counted ✅', `Day ${row.qualifiedCount} of ${challenge.requiredDays} done - ${left} more for ${reward}.`, {
        challengeId: String(challenge._id),
      });
    }
    notify(completedNow, 'Challenge complete 🎉', `You did ${challenge.requiredDays} days! Claim ${reward} in the app.`, {
      challengeId: String(challenge._id),
    });
  }

  return { qualified: winners.length, newlyCounted: newlyCounted.length, completed: completedNow.length };
};

/// Judges every finished day not yet judged, for every running challenge.
export const runChallengeSweep = async () => {
  const yesterday = previousDateKey(istDateKey());
  const challenges = await DriverChallenge.find({ active: true, startDate: { $lte: yesterday } });
  for (const challenge of challenges) {
    const from = challenge.evaluatedThrough && challenge.evaluatedThrough >= challenge.startDate
      ? istDateKey(istDayEnd(challenge.evaluatedThrough).getTime())
      : challenge.startDate;
    const to = challenge.endDate < yesterday ? challenge.endDate : yesterday;
    if (from > to) continue;
    for (const dateKey of dateKeysBetween(from, to)) {
      // Only yesterday is announced; catching up on older days stays quiet.
      await evaluateChallengeDay(challenge, dateKey, { announce: dateKey === yesterday });
      challenge.evaluatedThrough = dateKey;
      await DriverChallenge.updateOne({ _id: challenge._id }, { $set: { evaluatedThrough: dateKey } });
    }
  }
};

let sweepTimer = null;

export const startDriverChallengeLoop = () => {
  if (sweepTimer) return;
  const run = async () => {
    const lock = await runRedisCommand(
      (client) => client.set(SWEEP_LOCK_KEY, String(process.pid), { NX: true, PX: SWEEP_INTERVAL_MS - 30000 }),
      { label: 'challenge sweep lock' },
    );
    // No Redis: each instance sweeps; every write is idempotent.
    if (lock.ok && lock.value !== 'OK') return;
    try {
      await runChallengeSweep();
    } catch (error) {
      console.error('[challenge] sweep failed', error);
    }
  };
  sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  setTimeout(run, 20000).unref?.();
};

/* ---------------- driver view ---------------- */

const serializeChallenge = (challenge) => ({
  id: String(challenge._id),
  title: challenge.title,
  description: challenge.description || '',
  terms: challenge.terms || [],
  bannerImage: challenge.bannerImage || '',
  startDate: challenge.startDate,
  endDate: challenge.endDate,
  requiredDays: challenge.requiredDays,
  minActiveMinutes: challenge.minActiveMinutes,
  minTrips: challenge.minTrips,
  rewardLabel: challenge.rewardLabel || '',
  rewardAmount: roundMoney(challenge.rewardAmount),
  autoPay: challenge.autoPay !== false,
  active: challenge.active !== false,
  vehicleTypeIds: idList(challenge.vehicleTypeIds),
  serviceLocationIds: idList(challenge.serviceLocationIds),
  evaluatedThrough: challenge.evaluatedThrough || '',
  createdAt: challenge.createdAt,
  updatedAt: challenge.updatedAt,
});

const buildDriverView = async (challenge, driverId, { withDays = false } = {}) => {
  const today = istDateKey();
  const progress = await DriverChallengeProgress.findOne({ challengeId: challenge._id, driverId }).lean();
  const qualifiedSet = new Set(progress?.qualifiedDays || []);

  const lastShown = challenge.endDate < today ? challenge.endDate : today;
  const activity = challenge.startDate <= lastShown
    ? await getDriverActivityDays(driverId, challenge.startDate, lastShown)
    : new Map();

  const inPeriodToday = today >= challenge.startDate && today <= challenge.endDate;
  const todayTrips = inPeriodToday ? (await tripsOnDay([driverId], today)).get(String(driverId)) || 0 : 0;
  const todaySeconds = inPeriodToday ? Number(activity.get(today)?.activeSeconds || 0) : 0;
  const todayQualifies = inPeriodToday && dayQualifies(challenge, todaySeconds, todayTrips);

  // Days still to play, today included when it has not counted yet.
  const futureDays = today > challenge.endDate
    ? 0
    : dateKeysBetween(today < challenge.startDate ? challenge.startDate : today, challenge.endDate).length;
  const counted = qualifiedSet.size + (todayQualifies && !qualifiedSet.has(today) ? 1 : 0);
  const stillNeeded = Math.max(0, challenge.requiredDays - counted);
  const playableDays = futureDays - (todayQualifies ? 1 : 0);

  const view = {
    ...serializeChallenge(challenge),
    qualifiedDays: counted,
    daysLeft: futureDays,
    stillNeeded,
    reachable: stillNeeded <= Math.max(0, playableDays) || stillNeeded === 0,
    // Only the nightly check completes a challenge; reaching the target with
    // today's time shows as 'completes tonight' until then.
    status: progress?.status || 'in_progress',
    completesTonight: stillNeeded === 0 && (progress?.status || 'in_progress') === 'in_progress',
    claim: progress
      ? {
          status: progress.status,
          claimedAt: progress.claimedAt,
          paidAt: progress.paidAt,
          paidAmount: roundMoney(progress.paidAmount),
          adminNote: progress.adminNote || '',
        }
      : null,
    today: inPeriodToday
      ? {
          dateKey: today,
          activeMinutes: minutesOf(todaySeconds),
          trips: todayTrips,
          qualifies: todayQualifies,
        }
      : null,
  };

  if (withDays) {
    view.days = dateKeysBetween(challenge.startDate, challenge.endDate).map((dateKey) => ({
      dateKey,
      activeMinutes: dateKey <= lastShown ? minutesOf(activity.get(dateKey)?.activeSeconds) : 0,
      qualified: qualifiedSet.has(dateKey) || (dateKey === today && todayQualifies),
      isToday: dateKey === today,
      isFuture: dateKey > today,
    }));
  }

  return view;
};

const findDriverForChallenges = async (driverId) => {
  const driver = await Driver.findById(driverId).select('vehicleTypeId vehicleTypeIds service_location_id deletedAt').lean();
  if (!driver || driver.deletedAt) throw new ApiError(404, 'Driver not found');
  return driver;
};

/// Running and recently ended challenges this driver can take part in.
export const listDriverChallenges = async (driverId) => {
  const driver = await findDriverForChallenges(driverId);
  const today = istDateKey();
  // Ended ones stay listed for 30 days so a winner can still claim.
  const showFrom = istDateKey(istDayStart(today).getTime() - 30 * 24 * 60 * 60 * 1000);
  const challenges = await DriverChallenge.find({ active: true, endDate: { $gte: showFrom } }).sort({ startDate: 1 });
  const views = [];
  for (const challenge of challenges) {
    if (!isDriverEligible(challenge, driver)) continue;
    const view = await buildDriverView(challenge, driverId);
    // An ended challenge is only worth showing to someone with a reward in it.
    if (challenge.endDate < today && !['completed', 'claimed', 'paid'].includes(view.status)) continue;
    views.push(view);
  }
  return views;
};

const loadChallenge = async (challengeId) => {
  if (!mongoose.isValidObjectId(challengeId)) throw new ApiError(400, 'Invalid challenge');
  const challenge = await DriverChallenge.findById(challengeId);
  if (!challenge) throw new ApiError(404, 'Challenge not found');
  return challenge;
};

export const getDriverChallenge = async (driverId, challengeId) => {
  const [driver, challenge] = await Promise.all([findDriverForChallenges(driverId), loadChallenge(challengeId)]);
  if (!challenge.active || !isDriverEligible(challenge, driver)) throw new ApiError(404, 'Challenge not found');
  return buildDriverView(challenge, driverId, { withDays: true });
};

/// Pays a completed challenge into the driver's wallet. Moves the row to
/// 'paid' first, atomically, so two taps (or an admin and a driver at once)
/// can never pay twice; puts it back if the credit fails.
const payProgress = async ({ challenge, progressId, fromStatuses, amount, note }) => {
  const paidAmount = roundMoney(amount);
  const row = await DriverChallengeProgress.findOneAndUpdate(
    { _id: progressId, challengeId: challenge._id, status: { $in: fromStatuses } },
    {
      $set: {
        status: 'paid',
        paidAt: new Date(),
        paidAmount,
        ...(note !== undefined ? { adminNote: note } : {}),
      },
    },
    { returnDocument: 'before' },
  );
  if (!row) throw new ApiError(409, 'This reward has already been handled');
  if (paidAmount > 0) {
    try {
      await applyDriverWalletAdjustment({
        driverId: row.driverId,
        amount: paidAmount,
        type: 'adjustment',
        description: `Challenge reward: ${challenge.rewardLabel || challenge.title}`,
        metadata: { source: 'driver_challenge', challengeId: String(challenge._id), progressId: String(row._id) },
      });
    } catch (error) {
      await DriverChallengeProgress.updateOne(
        { _id: row._id },
        { $set: { status: row.status, paidAt: null, paidAmount: 0 } },
      );
      throw error;
    }
  }
  notify([String(row.driverId)], 'Reward paid 🎉', paidAmount > 0
    ? `Rs ${paidAmount} for "${challenge.title}" is in your wallet.`
    : `Your reward for "${challenge.title}" is approved.`, { challengeId: String(challenge._id) });
  return DriverChallengeProgress.findById(row._id).lean();
};

export const claimDriverChallenge = async (driverId, challengeId) => {
  const challenge = await loadChallenge(challengeId);
  // A claim right after midnight should not wait for the sweep to judge
  // yesterday.
  await runChallengeSweep().catch(() => {});
  const progress = await DriverChallengeProgress.findOne({ challengeId: challenge._id, driverId });
  if (!progress || !['completed', 'claimed', 'paid'].includes(progress.status)) {
    const left = Math.max(0, challenge.requiredDays - Number(progress?.qualifiedDays?.length || 0));
    throw new ApiError(400, `Complete ${left} more day(s) to claim this reward. Today counts from tomorrow.`);
  }
  if (progress.status !== 'completed') return buildDriverView(challenge, driverId, { withDays: true });

  if (challenge.autoPay !== false) {
    await payProgress({ challenge, progressId: progress._id, fromStatuses: ['completed'], amount: challenge.rewardAmount });
  } else {
    await DriverChallengeProgress.updateOne(
      { _id: progress._id, status: 'completed' },
      { $set: { status: 'claimed', claimedAt: new Date() } },
    );
  }
  return buildDriverView(challenge, driverId, { withDays: true });
};

/* ---------------- admin ---------------- */

const readDateKey = (value, label) => {
  const key = String(value || '').trim().slice(0, 10);
  if (!DATE_KEY.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) {
    throw new ApiError(400, `${label} must be a date (YYYY-MM-DD)`);
  }
  return key;
};

const buildChallengePayload = (body = {}) => {
  const title = String(body.title || '').trim();
  if (!title) throw new ApiError(400, 'Title is required');
  const startDate = readDateKey(body.startDate, 'Start date');
  const endDate = readDateKey(body.endDate, 'End date');
  if (endDate < startDate) throw new ApiError(400, 'End date must be on or after the start date');
  const periodDays = dateKeysBetween(startDate, endDate).length;
  const requiredDays = Math.floor(Number(body.requiredDays));
  if (!(requiredDays >= 1)) throw new ApiError(400, 'Required days must be at least 1');
  if (requiredDays > periodDays) throw new ApiError(400, `Required days cannot be more than the ${periodDays} days in the period`);
  const minActiveMinutes = Math.round(Number(body.minActiveMinutes ?? 480));
  if (!(minActiveMinutes >= 0 && minActiveMinutes <= 24 * 60)) throw new ApiError(400, 'Minimum active time must be 0-24 hours');
  const minTrips = Math.floor(Number(body.minTrips ?? 1));
  if (!(minTrips >= 0)) throw new ApiError(400, 'Minimum trips cannot be negative');
  const rewardAmount = roundMoney(body.rewardAmount);
  if (rewardAmount < 0 || rewardAmount > 100000) throw new ApiError(400, 'Reward amount must be 0-100000');

  return {
    title,
    description: String(body.description || '').trim(),
    terms: (Array.isArray(body.terms) ? body.terms : String(body.terms || '').split('\n'))
      .map((line) => String(line).trim())
      .filter(Boolean)
      .slice(0, 20),
    bannerImage: String(body.bannerImage || '').trim(),
    startDate,
    endDate,
    requiredDays,
    minActiveMinutes,
    minTrips,
    vehicleTypeIds: idList(body.vehicleTypeIds),
    serviceLocationIds: idList(body.serviceLocationIds),
    rewardLabel: String(body.rewardLabel || '').trim(),
    rewardAmount,
    autoPay: body.autoPay !== false,
    active: body.active !== false,
  };
};

export const listChallenges = async () =>
  (await DriverChallenge.find({}).sort({ startDate: -1, createdAt: -1 }).lean()).map(serializeChallenge);

export const createChallenge = async (body) => serializeChallenge(await DriverChallenge.create(buildChallengePayload(body)));

export const updateChallenge = async (challengeId, body) => {
  const challenge = await loadChallenge(challengeId);
  const payload = buildChallengePayload(body);
  // Changing the rules or the start re-judges the period from the beginning;
  // days already counted stay counted.
  const rulesChanged = payload.startDate !== challenge.startDate
    || payload.minActiveMinutes !== challenge.minActiveMinutes
    || payload.minTrips !== challenge.minTrips
    || String(payload.vehicleTypeIds) !== String(idList(challenge.vehicleTypeIds))
    || String(payload.serviceLocationIds) !== String(idList(challenge.serviceLocationIds));
  Object.assign(challenge, payload);
  if (rulesChanged) challenge.evaluatedThrough = '';
  await challenge.save();
  if (payload.requiredDays) {
    // A lower target can complete drivers already past it.
    await DriverChallengeProgress.updateMany(
      { challengeId: challenge._id, status: 'in_progress', qualifiedCount: { $gte: payload.requiredDays } },
      { $set: { status: 'completed', completedAt: new Date() } },
    );
  }
  return serializeChallenge(challenge);
};

export const deleteChallenge = async (challengeId) => {
  const challenge = await loadChallenge(challengeId);
  const paid = await DriverChallengeProgress.countDocuments({ challengeId: challenge._id, status: { $in: ['claimed', 'paid'] } });
  if (paid) {
    // Rewards have been claimed or paid: keep the record, just stop it.
    challenge.active = false;
    await challenge.save();
    return { id: String(challenge._id), deactivated: true };
  }
  await DriverChallengeProgress.deleteMany({ challengeId: challenge._id });
  await challenge.deleteOne();
  return { id: String(challenge._id), deleted: true };
};

/// Leaderboard: every driver with at least one counted day (or a claim), most
/// days first, with today's active time.
export const listChallengeProgress = async (challengeId, { status, page = 1, limit = 50, search } = {}) => {
  const challenge = await loadChallenge(challengeId);
  const filter = { challengeId: challenge._id };
  if (CHALLENGE_PROGRESS_STATUS.includes(status)) filter.status = status;

  const term = String(search || '').trim();
  if (term) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const drivers = await Driver.find({ $or: [{ name: pattern }, { phone: pattern }, { vehicleNumber: pattern }] })
      .select('_id').limit(200).lean();
    filter.driverId = { $in: drivers.map((driver) => driver._id) };
  }

  const pageNo = Math.max(1, Math.floor(Number(page) || 1));
  const perPage = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const [rows, total, counts] = await Promise.all([
    DriverChallengeProgress.find(filter)
      .sort({ qualifiedCount: -1, updatedAt: -1 })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .lean(),
    DriverChallengeProgress.countDocuments(filter),
    DriverChallengeProgress.aggregate([
      { $match: { challengeId: challenge._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const driverIds = rows.map((row) => row.driverId);
  const today = istDateKey();
  const [drivers, todayRows] = await Promise.all([
    Driver.find({ _id: { $in: driverIds } }).select('name phone vehicleNumber vehicleType').lean(),
    DriverActivityDay.find({ driverId: { $in: driverIds }, dateKey: today }).select('driverId activeSeconds').lean(),
  ]);
  const driverById = new Map(drivers.map((driver) => [String(driver._id), driver]));
  const todayById = new Map(todayRows.map((row) => [String(row.driverId), row.activeSeconds]));

  return {
    challenge: serializeChallenge(challenge),
    items: rows.map((row) => {
      const driver = driverById.get(String(row.driverId));
      return {
        id: String(row._id),
        driver: driver
          ? { id: String(driver._id), name: driver.name || '', phone: driver.phone || '', vehicleNumber: driver.vehicleNumber || '', vehicleType: driver.vehicleType || '' }
          : { id: String(row.driverId), name: '', phone: '', vehicleNumber: '', vehicleType: '' },
        qualifiedDays: row.qualifiedDays.length,
        lastQualifiedDay: [...row.qualifiedDays].sort().pop() || '',
        todayActiveMinutes: minutesOf(todayById.get(String(row.driverId))),
        status: row.status,
        completedAt: row.completedAt,
        claimedAt: row.claimedAt,
        paidAt: row.paidAt,
        paidAmount: roundMoney(row.paidAmount),
        adminNote: row.adminNote || '',
      };
    }),
    total,
    page: pageNo,
    limit: perPage,
    counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
  };
};

/// Admin decision on a reward: 'pay' (wallet credit, optional amount
/// override) or 'reject' with a note.
export const decideChallengeReward = async (challengeId, progressId, body = {}) => {
  const challenge = await loadChallenge(challengeId);
  if (!mongoose.isValidObjectId(progressId)) throw new ApiError(400, 'Invalid entry');
  const note = body.adminNote !== undefined ? String(body.adminNote || '').trim().slice(0, 500) : undefined;
  const action = String(body.action || '');

  if (action === 'pay') {
    const amount = body.amount !== undefined && body.amount !== '' ? Number(body.amount) : challenge.rewardAmount;
    if (!(amount >= 0)) throw new ApiError(400, 'Amount cannot be negative');
    return payProgress({ challenge, progressId, fromStatuses: ['completed', 'claimed'], amount, note });
  }
  if (action === 'reject') {
    const row = await DriverChallengeProgress.findOneAndUpdate(
      { _id: progressId, challengeId: challenge._id, status: { $in: ['in_progress', 'completed', 'claimed'] } },
      { $set: { status: 'rejected', ...(note !== undefined ? { adminNote: note } : {}) } },
      { new: true },
    ).lean();
    if (!row) throw new ApiError(409, 'This entry cannot be rejected');
    notify([String(row.driverId)], 'Challenge reward not approved', note || `Your reward for "${challenge.title}" was not approved.`, {
      challengeId: String(challenge._id),
    });
    return row;
  }
  throw new ApiError(400, 'action must be pay or reject');
};

/// Active time per driver per day, for the admin activity report.
export const listDriverActivity = async ({ from, to, driverId, page = 1, limit = 100 } = {}) => {
  const today = istDateKey();
  const toKey = to ? readDateKey(to, 'To') : today;
  const fromKey = from ? readDateKey(from, 'From') : toKey;
  if (dateKeysBetween(fromKey, toKey).length > 62) throw new ApiError(400, 'Pick at most 62 days');
  const filter = { dateKey: { $gte: fromKey, $lte: toKey } };
  if (driverId && mongoose.isValidObjectId(driverId)) filter.driverId = driverId;
  const pageNo = Math.max(1, Math.floor(Number(page) || 1));
  const perPage = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const [rows, total] = await Promise.all([
    DriverActivityDay.find(filter).sort({ dateKey: -1, activeSeconds: -1 }).skip((pageNo - 1) * perPage).limit(perPage).lean(),
    DriverActivityDay.countDocuments(filter),
  ]);
  const drivers = await Driver.find({ _id: { $in: rows.map((row) => row.driverId) } }).select('name phone vehicleNumber').lean();
  const driverById = new Map(drivers.map((driver) => [String(driver._id), driver]));
  return {
    items: rows.map((row) => {
      const driver = driverById.get(String(row.driverId)) || {};
      return {
        driverId: String(row.driverId),
        name: driver.name || '',
        phone: driver.phone || '',
        vehicleNumber: driver.vehicleNumber || '',
        dateKey: row.dateKey,
        activeMinutes: minutesOf(row.activeSeconds),
        firstActiveAt: row.firstActiveAt,
        lastActiveAt: row.lastActiveAt,
        mockedPings: row.mockedPings || 0,
      };
    }),
    total,
    page: pageNo,
    limit: perPage,
    from: fromKey,
    to: toKey,
  };
};
