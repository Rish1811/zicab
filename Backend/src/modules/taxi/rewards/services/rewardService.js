import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { Ride } from '../../user/models/Ride.js';
import { User } from '../../user/models/User.js';
import { Driver } from '../../driver/models/Driver.js';
import { UserWallet } from '../../user/models/UserWallet.js';
import { RewardClaim, REWARD_CLAIM_STATUS } from '../models/RewardClaim.js';
import { RewardLevel } from '../models/RewardLevel.js';
import { RewardSetting } from '../models/RewardSetting.js';

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Cashback sits inside `balance` but is ring-fenced: it can pay for rides,
// never be transferred out. Older code paths can debit `balance` without
// touching `cashbackBalance`, so always clamp when reading.
export const getLockedCashback = (wallet) =>
  roundMoney(Math.max(0, Math.min(toNumber(wallet?.cashbackBalance), toNumber(wallet?.balance))));

export const getWithdrawableBalance = (wallet) =>
  roundMoney(Math.max(0, toNumber(wallet?.balance) - getLockedCashback(wallet)));

// Rides spend cashback first.
export const consumeCashbackForRide = (wallet, amount) => {
  const locked = getLockedCashback(wallet);
  wallet.cashbackBalance = roundMoney(Math.max(0, locked - roundMoney(amount)));
};

const ensureWallet = (userId, session = null) =>
  UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, cashbackBalance: 0, transactions: [] } },
    { upsert: true, session },
  );

// Idempotent on referenceKey: a retried completion never pays twice.
export const creditCashback = async ({ userId, amount, title, referenceKey, provider = 'ride_cashback', session = null }) => {
  const normalizedAmount = roundMoney(amount);
  if (!userId || normalizedAmount <= 0 || !referenceKey) {
    return 'skipped';
  }

  await ensureWallet(userId, session);
  const result = await UserWallet.updateOne(
    { userId, 'transactions.referenceKey': { $ne: referenceKey } },
    {
      $inc: { balance: normalizedAmount, cashbackBalance: normalizedAmount },
      $push: {
        transactions: {
          $each: [{ kind: 'credit', amount: normalizedAmount, title, provider, referenceKey }],
          $slice: -50,
        },
      },
    },
    { session },
  );

  return result?.modifiedCount ? 'credited' : 'existing';
};

/* ---------------- settings ---------------- */

const serializeSettings = (doc) => ({
  cashbackEnabled: Boolean(doc?.cashbackEnabled),
  cashbackPercent: toNumber(doc?.cashbackPercent),
  maxCashbackPerRide: toNumber(doc?.maxCashbackPerRide),
  minFareForCashback: toNumber(doc?.minFareForCashback),
  rewardsEnabled: doc?.rewardsEnabled !== false,
});

export const getRewardSettings = async () =>
  serializeSettings(await RewardSetting.findOne({ scope: 'default' }).lean());

export const updateRewardSettings = async (body = {}) => {
  const percent = toNumber(body.cashbackPercent);
  if (percent < 0 || percent > 100) {
    throw new ApiError(400, 'Cashback percent must be between 0 and 100');
  }

  const doc = await RewardSetting.findOneAndUpdate(
    { scope: 'default' },
    {
      $set: {
        cashbackEnabled: Boolean(body.cashbackEnabled),
        cashbackPercent: percent,
        maxCashbackPerRide: Math.max(0, toNumber(body.maxCashbackPerRide)),
        minFareForCashback: Math.max(0, toNumber(body.minFareForCashback)),
        rewardsEnabled: body.rewardsEnabled !== false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return serializeSettings(doc);
};

/* ---------------- per-ride cashback ---------------- */

export const computeRideCashback = (fare, settings) => {
  if (!settings.cashbackEnabled || settings.cashbackPercent <= 0) return 0;
  const normalizedFare = roundMoney(fare);
  if (normalizedFare <= 0 || normalizedFare < settings.minFareForCashback) return 0;
  let amount = roundMoney((normalizedFare * settings.cashbackPercent) / 100);
  if (settings.maxCashbackPerRide > 0) amount = Math.min(amount, settings.maxCashbackPerRide);
  return roundMoney(amount);
};

export const processRideCashback = async (ride) => {
  if (!ride?.userId || !ride?._id) return 'skipped';
  const settings = await getRewardSettings();
  const amount = computeRideCashback(ride.fare, settings);
  if (amount <= 0) return 'skipped';

  return creditCashback({
    userId: ride.userId,
    amount,
    title: `Cashback ${settings.cashbackPercent}% on ride ${String(ride._id).slice(-6)}`,
    referenceKey: `ride-cashback:${String(ride._id)}`,
  });
};

/* ---------------- rider view ---------------- */

const normalizeAudience = (audience) => (audience === 'driver' ? 'driver' : 'user');

// Old rows carry no audience and belong to riders.
const audienceFilter = (audience) =>
  normalizeAudience(audience) === 'driver' ? { audience: 'driver' } : { audience: { $ne: 'driver' } };

// Riders: parcels share the Ride collection but are not rides (same rule as the
// referral program). Drivers: every completed trip they drove counts as work.
const countCompletedRides = (ownerId, audience = 'user') =>
  normalizeAudience(audience) === 'driver'
    ? Ride.countDocuments({ driverId: ownerId, status: RIDE_STATUS.COMPLETED, serviceType: { $in: ['ride', 'intercity', 'parcel'] } })
    : Ride.countDocuments({ userId: ownerId, status: RIDE_STATUS.COMPLETED, serviceType: { $in: ['ride', 'intercity'] } });

// Rewards whose expiry has not passed (or that never expire).
const notExpiredFilter = (now = new Date()) => ({
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

const isExpired = (level, now = new Date()) =>
  Boolean(level?.expiresAt) && new Date(level.expiresAt).getTime() <= now.getTime();

const serializeLevel = (level) => ({
  id: String(level._id),
  expiresAt: level.expiresAt ? new Date(level.expiresAt).toISOString() : null,
  expired: isExpired(level),
  title: level.title,
  description: level.description || '',
  rideCount: level.rideCount,
  image: level.image || '',
  rewardType: level.rewardType || 'gift',
  walletAmount: toNumber(level.walletAmount),
  audience: normalizeAudience(level.audience),
  active: level.active !== false,
  sortOrder: toNumber(level.sortOrder),
});

const sortLevels = (levels) =>
  levels.sort((a, b) => a.rideCount - b.rideCount || toNumber(a.sortOrder) - toNumber(b.sortOrder));

export const getUserRewards = async (userId, audience = 'user') => {
  const isDriver = normalizeAudience(audience) === 'driver';
  const [settings, levels, claims, completedRides, wallet] = await Promise.all([
    getRewardSettings(),
    RewardLevel.find({ active: true, ...audienceFilter(audience), ...notExpiredFilter() }).lean(),
    RewardClaim.find({ userId, ...audienceFilter(audience) }).lean(),
    countCompletedRides(userId, audience),
    isDriver ? null : UserWallet.findOne({ userId }).select('balance cashbackBalance').lean(),
  ]);

  const claimByReward = new Map(claims.map((claim) => [String(claim.rewardId), claim]));
  const ordered = sortLevels(levels);
  let currentAssigned = false;

  const items = ordered.map((level, index) => {
    const claim = claimByReward.get(String(level._id));
    const unlocked = completedRides >= level.rideCount;
    let status;
    if (claim) status = claim.status === 'pending' ? 'claim_pending' : claim.status;
    else if (unlocked) status = 'unlocked';
    else if (!currentAssigned) status = 'in_progress';
    else status = 'locked';
    if (!unlocked && !currentAssigned) currentAssigned = true;

    return {
      ...serializeLevel(level),
      level: index + 1,
      unlocked,
      progressRides: Math.min(completedRides, level.rideCount),
      status,
      claim: claim
        ? { id: String(claim._id), status: claim.status, adminNote: claim.adminNote || '', createdAt: claim.createdAt }
        : null,
    };
  });

  const nextLevel = items.find((item) => !item.unlocked) || null;
  const reachedLevels = items.filter((item) => item.unlocked).length;
  // Partial credit toward the next level, measured from the previous threshold.
  const prevThreshold = reachedLevels > 0 ? items[reachedLevels - 1].rideCount : 0;
  const partial = nextLevel
    ? Math.max(0, Math.min(1, (completedRides - prevThreshold) / Math.max(1, nextLevel.rideCount - prevThreshold)))
    : 0;

  return {
    enabled: settings.rewardsEnabled,
    completedRides,
    totalLevels: items.length,
    currentLevel: Math.min(items.length, reachedLevels + (nextLevel ? 1 : 0)),
    progressPercent: items.length ? Math.round(((reachedLevels + partial) / items.length) * 100) : 0,
    nextReward: nextLevel
      ? {
          id: nextLevel.id,
          title: nextLevel.title,
          image: nextLevel.image,
          rewardType: nextLevel.rewardType,
          walletAmount: nextLevel.walletAmount,
          expiresAt: nextLevel.expiresAt,
          ridesRemaining: Math.max(0, nextLevel.rideCount - completedRides),
        }
      : null,
    // Cashback is a rider-only programme.
    cashback: isDriver
      ? { enabled: false, percent: 0, maxPerRide: 0, balance: 0 }
      : {
          enabled: settings.cashbackEnabled && settings.cashbackPercent > 0,
          percent: settings.cashbackPercent,
          maxPerRide: settings.maxCashbackPerRide,
          balance: getLockedCashback(wallet),
        },
    levels: items,
  };
};

export const claimReward = async (userId, rewardId, body = {}, audience = 'user') => {
  if (!mongoose.isValidObjectId(rewardId)) throw new ApiError(400, 'Invalid reward');

  const [level, completedRides] = await Promise.all([
    RewardLevel.findOne({ _id: rewardId, active: true, ...audienceFilter(audience) }).lean(),
    countCompletedRides(userId, audience),
  ]);
  if (!level) throw new ApiError(404, 'Reward not found');
  if (isExpired(level)) throw new ApiError(400, 'This reward has expired');
  if (completedRides < level.rideCount) {
    throw new ApiError(400, `Complete ${level.rideCount - completedRides} more ride(s) to unlock this reward`);
  }

  try {
    const claim = await RewardClaim.create({
      userId,
      audience: normalizeAudience(audience),
      rewardId: level._id,
      rewardTitle: level.title,
      rewardImage: level.image || '',
      rewardType: level.rewardType || 'gift',
      walletAmount: toNumber(level.walletAmount),
      rideCount: level.rideCount,
      completedRidesAtClaim: completedRides,
      address: String(body.address || '').trim().slice(0, 500),
      size: String(body.size || '').trim().slice(0, 20),
    });
    return { id: String(claim._id), status: claim.status };
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'You have already claimed this reward');
    throw error;
  }
};

/* ---------------- admin: levels ---------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/// Reads the expiry the admin chose. `expiresInDays` (e.g. 2 -> two days from
/// now) wins; otherwise `expiresAt` as a date, or null/'' for "never expires".
/// Returns undefined when the request says nothing about expiry, so editing
/// other fields keeps the current expiry.
const readExpiry = (body = {}) => {
  if (body.expiresInDays !== undefined && body.expiresInDays !== null && body.expiresInDays !== '') {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      throw new ApiError(400, 'Expiry must be between 1 and 3650 days');
    }
    return new Date(Date.now() + days * DAY_MS);
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'expiresAt')) return undefined;
  if (body.expiresAt === null || body.expiresAt === '') return null;
  const date = new Date(body.expiresAt);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Invalid expiry date');
  return date;
};

const buildLevelPayload = (body = {}) => {
  const title = String(body.title || '').trim();
  const rideCount = Math.floor(toNumber(body.rideCount));
  if (!title) throw new ApiError(400, 'Title is required');
  if (rideCount < 1) throw new ApiError(400, 'Ride count must be at least 1');
  const audience = normalizeAudience(body.audience);
  // Driver rewards are gifts only - no wallet cashback for drivers.
  const rewardType = audience === 'user' && body.rewardType === 'coupon' ? 'coupon' : 'gift';

  return {
    title,
    description: String(body.description || '').trim(),
    rideCount,
    image: String(body.image || '').trim(),
    rewardType,
    walletAmount: rewardType === 'coupon' ? Math.max(0, roundMoney(body.walletAmount)) : 0,
    audience,
    active: body.active !== false,
    sortOrder: toNumber(body.sortOrder),
  };
};

const withExpiry = (payload, body, { isCreate }) => {
  const expiresAt = readExpiry(body);
  if (expiresAt !== undefined) payload.expiresAt = expiresAt;
  else if (isCreate) payload.expiresAt = null;
  return payload;
};

export const listRewardLevels = async ({ audience } = {}) =>
  sortLevels(await RewardLevel.find(audienceFilter(audience)).lean()).map(serializeLevel);

export const createRewardLevel = async (body) =>
  serializeLevel((await RewardLevel.create(withExpiry(buildLevelPayload(body), body, { isCreate: true }))).toObject());

export const updateRewardLevel = async (id, body) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid reward');
  const doc = await RewardLevel.findByIdAndUpdate(
    id,
    { $set: withExpiry(buildLevelPayload(body), body, { isCreate: false }) },
    { new: true },
  ).lean();
  if (!doc) throw new ApiError(404, 'Reward not found');
  return serializeLevel(doc);
};

export const deleteRewardLevel = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid reward');
  const doc = await RewardLevel.findByIdAndDelete(id).lean();
  if (!doc) throw new ApiError(404, 'Reward not found');
  return { id };
};

/* ---------------- admin: claims ---------------- */

export const listRewardClaims = async ({ status, audience, page = 1, limit = 20 } = {}) => {
  const filter = REWARD_CLAIM_STATUS.includes(status) ? { status } : {};
  if (audience === 'user' || audience === 'driver') Object.assign(filter, audienceFilter(audience));
  const pageNo = Math.max(1, Math.floor(toNumber(page, 1)));
  const perPage = Math.min(100, Math.max(1, Math.floor(toNumber(limit, 20))));

  const [items, total, counts] = await Promise.all([
    RewardClaim.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .lean(),
    RewardClaim.countDocuments(filter),
    RewardClaim.aggregate([
      { $match: audience === 'user' || audience === 'driver' ? audienceFilter(audience) : {} },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // userId points at a rider or a driver depending on the claim's audience.
  const driverIds = items.filter((c) => c.audience === 'driver').map((c) => c.userId);
  const userIds = items.filter((c) => c.audience !== 'driver').map((c) => c.userId);
  const [owners, driverOwners] = await Promise.all([
    userIds.length ? User.find({ _id: { $in: userIds } }).select('name phone email').lean() : [],
    driverIds.length ? Driver.find({ _id: { $in: driverIds } }).select('name phone email').lean() : [],
  ]);
  const ownerById = new Map([...owners, ...driverOwners].map((o) => [String(o._id), o]));
  items.forEach((claim) => { claim.owner = ownerById.get(String(claim.userId)) || null; });

  return {
    items: items.map((claim) => ({
      id: String(claim._id),
      audience: normalizeAudience(claim.audience),
      user: claim.owner
        ? { id: String(claim.owner._id), name: claim.owner.name || '', phone: claim.owner.phone || '', email: claim.owner.email || '' }
        : null,
      rewardTitle: claim.rewardTitle,
      rewardImage: claim.rewardImage,
      rewardType: claim.rewardType,
      walletAmount: claim.walletAmount,
      rideCount: claim.rideCount,
      completedRidesAtClaim: claim.completedRidesAtClaim,
      address: claim.address,
      size: claim.size,
      status: claim.status,
      adminNote: claim.adminNote,
      createdAt: claim.createdAt,
      processedAt: claim.processedAt,
    })),
    total,
    page: pageNo,
    limit: perPage,
    counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
  };
};

export const updateRewardClaim = async (id, body = {}) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid claim');
  const status = String(body.status || '');
  if (!REWARD_CLAIM_STATUS.includes(status) || status === 'pending') {
    throw new ApiError(400, 'Status must be approved, delivered or rejected');
  }

  const claim = await RewardClaim.findById(id);
  if (!claim) throw new ApiError(404, 'Claim not found');
  if (claim.status === 'rejected') throw new ApiError(400, 'A rejected claim cannot be changed');
  if (claim.status === 'delivered' && status !== 'delivered') {
    throw new ApiError(400, 'A delivered claim cannot be changed');
  }

  // Coupon rewards pay out once, on the first move out of 'pending' that isn't a rejection.
  if (status !== 'rejected' && claim.audience !== 'driver' && claim.rewardType === 'coupon' && claim.walletAmount > 0) {
    await creditCashback({
      userId: claim.userId,
      amount: claim.walletAmount,
      title: `Reward: ${claim.rewardTitle}`,
      referenceKey: `reward-claim:${String(claim._id)}`,
      provider: 'reward_claim',
    });
  }

  claim.status = status;
  if (body.adminNote !== undefined) claim.adminNote = String(body.adminNote || '').trim().slice(0, 500);
  claim.processedAt = new Date();
  await claim.save();

  return { id: String(claim._id), status: claim.status };
};
