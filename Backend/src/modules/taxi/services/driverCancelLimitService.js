import { ApiError } from '../../../utils/ApiError.js';
import { DriverCancelCounter } from '../driver/models/DriverCancelCounter.js';
import { getTransportRideSettings } from './transportSettingsService.js';

/**
 * The most rides a driver may cancel in a day, week or month, set by the admin
 * under Transport Ride Settings. Periods run on India time.
 */

const IST_OFFSET_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;
const PERIODS = ['day', 'week', 'month'];
const PERIOD_WORDS = { day: 'today', week: 'this week', month: 'this month' };
const DEFAULT_MAX_CANCELLATIONS = 3;

const dateKey = (date) => date.toISOString().slice(0, 10);

/// Which period `now` falls in, and when the next one starts.
export const resolveCancelPeriod = (period = 'day', now = new Date()) => {
  // Shifted so the UTC getters below read India's wall clock.
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const toInstant = (shifted) => new Date(shifted - IST_OFFSET_MS);

  if (period === 'month') {
    return {
      periodKey: `month:${dateKey(ist).slice(0, 7)}`,
      resetsAt: toInstant(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1)),
    };
  }

  if (period === 'week') {
    const monday = midnight - ((ist.getUTCDay() + 6) % 7) * DAY_MS;
    return {
      periodKey: `week:${dateKey(new Date(monday))}`,
      resetsAt: toInstant(monday + 7 * DAY_MS),
    };
  }

  return {
    periodKey: `day:${dateKey(new Date(midnight))}`,
    resetsAt: toInstant(midnight + DAY_MS),
  };
};

export const getDriverCancelLimitSettings = async () => {
  const settings = await getTransportRideSettings();
  const max = Math.floor(Number(settings?.driver_max_cancellations));
  const period = String(settings?.driver_cancellation_limit_period || '').trim().toLowerCase();

  return {
    enabled: String(settings?.enable_driver_cancellation_limit ?? '0') === '1',
    limit: Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX_CANCELLATIONS,
    period: PERIODS.includes(period) ? period : 'day',
  };
};

/// What the driver app and the admin panel show: "2 of 3 used today".
export const getDriverCancelStatus = async (driverId, now = new Date()) => {
  const { enabled, limit, period } = await getDriverCancelLimitSettings();
  const { periodKey, resetsAt } = resolveCancelPeriod(period, now);
  const counter = await DriverCancelCounter.findOne({ driverId, periodKey }).select('count').lean();
  const used = Number(counter?.count || 0);

  return {
    enabled,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period,
    resetsAt,
  };
};

const limitReachedError = ({ limit, period, resetsAt }) => {
  const error = new ApiError(
    409,
    limit > 0
      ? `You've used all ${limit} cancellation${limit === 1 ? '' : 's'} for ${PERIOD_WORDS[period]}. Contact support to cancel this ride.`
      : 'Drivers cannot cancel rides right now. Contact support to cancel this ride.',
  );
  error.details = { code: 'DRIVER_CANCEL_LIMIT_REACHED', limit, period, resetsAt };
  return error;
};

/// Takes one of the driver's cancellations, or refuses with a 409 when none are
/// left. Returns what `releaseDriverCancellation` needs if the cancel then
/// doesn't happen, or null when the limit is switched off.
export const reserveDriverCancellation = async (driverId, now = new Date()) => {
  const { enabled, limit, period } = await getDriverCancelLimitSettings();
  if (!enabled) return null;

  const { periodKey, resetsAt } = resolveCancelPeriod(period, now);
  if (limit <= 0) throw limitReachedError({ limit, period, resetsAt });

  // A counter already at the limit doesn't match the filter, so the upsert tries
  // to insert a second one and the unique index refuses it. The same error also
  // comes from two first cancels racing, so look once more before refusing.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await DriverCancelCounter.findOneAndUpdate(
        { driverId, periodKey, count: { $lt: limit } },
        { $inc: { count: 1 } },
        { upsert: true },
      );
      return { driverId, periodKey };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw limitReachedError({ limit, period, resetsAt });
};

export const releaseDriverCancellation = async (reservation) => {
  if (!reservation) return;
  await DriverCancelCounter.updateOne(
    { driverId: reservation.driverId, periodKey: reservation.periodKey, count: { $gt: 0 } },
    { $inc: { count: -1 } },
  );
};

/// The admin's Reset button: gives the driver this period's cancellations back.
export const resetDriverCancelCount = async (driverId, now = new Date()) => {
  const { period } = await getDriverCancelLimitSettings();
  const { periodKey } = resolveCancelPeriod(period, now);
  await DriverCancelCounter.deleteOne({ driverId, periodKey });
  return getDriverCancelStatus(driverId, now);
};
