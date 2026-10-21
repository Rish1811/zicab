import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusSeatHold } from '../../user/models/BusSeatHold.js';
import { BusChannel } from '../models/BusChannel.js';
import { BusChannelEvent } from '../models/BusChannelEvent.js';
import { findSchedule, flattenBlueprintSeats } from '../utils/busTime.js';
import { getTripSeatSnapshot, onBusSeatChange, publishBusSeatChange } from './busSeatSyncService.js';
import { resolveScheduleRoute } from '../utils/busRoutes.js';

// Multi-platform seat synchronisation.
//
// ZI Bus owns the seat map. Every other place that sells the same bus is a
// "channel" and talks to us in two directions:
//
//   inbound  - the channel calls our channel API (X-Api-Key) to read live
//              availability, hold seats while its customer pays, confirm, and
//              cancel. Its seats go through the same unique seat-hold index as
//              ours, so a seat can only ever be sold once, whoever sells it.
//   outbound - whenever seats change for any reason (our rider, admin,
//              driver counter sale, or another channel), every other channel
//              selling that bus gets a signed webhook with the change and the
//              full current snapshot, and can mirror it.
//
// A platform that can't call us (for example one that only talks to the
// operator's own reservation software) is connected through that software
// instead: it becomes the channel.

const CHANNEL_HOLD_MINUTES_DEFAULT = 10;
const CHANNEL_HOLD_MINUTES_MAX = 20;
const WEBHOOK_TIMEOUT_MS = 8000;
const WEBHOOK_MAX_ATTEMPTS = 6;

const hashApiKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

export const generateChannelCredentials = () => {
  const apiKey = `zbk_${crypto.randomBytes(24).toString('base64url')}`;
  return {
    apiKey,
    apiKeyHash: hashApiKey(apiKey),
    apiKeyPrefix: apiKey.slice(0, 10),
    webhookSecret: `zbw_${crypto.randomBytes(24).toString('base64url')}`,
  };
};

export const serializeChannel = (channel) => ({
  id: String(channel._id),
  name: channel.name,
  code: channel.code,
  kind: channel.kind,
  apiKeyPrefix: channel.apiKeyPrefix || '',
  webhookUrl: channel.webhookUrl || '',
  hasWebhookSecret: Boolean(channel.webhookSecret),
  busServiceIds: (channel.busServiceIds || []).map(String),
  active: channel.active !== false,
  connector: {
    type: channel.connector?.type || 'push_api',
    baseUrl: channel.connector?.baseUrl || '',
    authHeader: channel.connector?.authHeader || 'Authorization',
    hasAuthValue: Boolean(channel.connector?.authValue),
    options: channel.connector?.options || {},
    pollSeconds: Number(channel.connector?.pollSeconds ?? 120),
    daysAhead: Number(channel.connector?.daysAhead ?? 7),
    lastPolledAt: channel.connector?.lastPolledAt || null,
    lastPollStatus: channel.connector?.lastPollStatus || '',
  },
  tripMappings: (channel.tripMappings || []).map((mapping) => ({
    id: String(mapping._id || ''),
    busServiceId: String(mapping.busServiceId),
    scheduleId: mapping.scheduleId,
    externalTripId: mapping.externalTripId,
    seatMap: mapping.seatMap || {},
  })),
  lastInboundAt: channel.lastInboundAt || null,
  lastWebhookAt: channel.lastWebhookAt || null,
  lastWebhookStatus: channel.lastWebhookStatus || '',
  notes: channel.notes || '',
  createdAt: channel.createdAt || null,
});

/// Express middleware for the channel API.
export const authenticateChannel = async (req, _res, next) => {
  try {
    const key = String(req.headers['x-api-key'] || '').trim();
    if (!key) {
      throw new ApiError(401, 'X-Api-Key header is required');
    }

    const channel = await BusChannel.findOne({ apiKeyHash: hashApiKey(key), active: true });
    if (!channel) {
      throw new ApiError(401, 'Invalid or inactive channel key');
    }

    req.channel = channel;
    BusChannel.updateOne({ _id: channel._id }, { $set: { lastInboundAt: new Date() } }).catch(() => {});
    next();
  } catch (error) {
    next(error);
  }
};

const channelMaySell = (channel, busServiceId) =>
  !channel.busServiceIds?.length || channel.busServiceIds.some((id) => String(id) === String(busServiceId));

const normalizeDate = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, 'travelDate must be YYYY-MM-DD');
  }
  return raw;
};

const loadSellableTrip = async (channel, { busServiceId, scheduleId, travelDate }) => {
  if (!mongoose.isValidObjectId(busServiceId)) {
    throw new ApiError(400, 'Valid busServiceId is required');
  }
  if (!channelMaySell(channel, busServiceId)) {
    throw new ApiError(403, 'This channel is not allowed to sell this bus');
  }

  const busService = await BusService.findById(busServiceId).lean();
  if (!busService || busService.status !== 'active') {
    throw new ApiError(404, 'Bus service not found');
  }

  const schedule = findSchedule(busService, scheduleId);
  if (!schedule || String(schedule.status || 'active') !== 'active') {
    throw new ApiError(404, 'Schedule not found');
  }

  return { busService, schedule, travelDate: normalizeDate(travelDate) };
};

const logInbound = (channel, event, data = {}) =>
  BusChannelEvent.create({
    channelId: channel._id,
    direction: 'inbound',
    event,
    status: data.status || 'accepted',
    busServiceId: data.busServiceId || null,
    scheduleId: data.scheduleId || '',
    travelDate: data.travelDate || '',
    seatIds: data.seatIds || [],
    bookingId: data.bookingId || null,
    externalRef: data.externalRef || '',
    payload: data.payload || null,
    lastError: data.error || '',
  }).catch((error) => console.error('[bus-channel] inbound log failed', error.message));

export const serializeChannelBooking = (booking) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  return {
    id: String(booking._id),
    externalRef: booking.channel?.externalRef || '',
    pnr: booking.pnr || '',
    status: booking.status,
    busServiceId: String(booking.busServiceId),
    scheduleId: booking.scheduleId,
    travelDate: booking.travelDate,
    seatIds: booking.seatIds || [],
    activeSeatIds: (booking.seatIds || []).filter((seatId) => !cancelled.has(String(seatId))),
    seatLabels: booking.seatLabels || [],
    expiresAt: booking.expiresAt || null,
    amount: Number(booking.amount || 0),
    createdAt: booking.createdAt || null,
  };
};

// ---------------------------------------------------------------- inbound

export const listChannelBuses = async (channel) => {
  const filter = { status: 'active' };
  if (channel.busServiceIds?.length) {
    filter._id = { $in: channel.busServiceIds };
  }

  const buses = await BusService.find(filter)
    .select('operatorName busName serviceNumber registrationNumber coachType busCategory route.originCity route.destinationCity route.stops schedules capacity seatPrice variantPricing')
    .lean();

  return buses.map((bus) => ({
    busServiceId: String(bus._id),
    operatorName: bus.operatorName,
    busName: bus.busName,
    serviceNumber: bus.serviceNumber || '',
    registrationNumber: bus.registrationNumber || '',
    coachType: bus.coachType || '',
    busCategory: bus.busCategory || '',
    originCity: bus.route?.originCity || '',
    destinationCity: bus.route?.destinationCity || '',
    stops: bus.route?.stops || [],
    schedules: (bus.schedules || [])
      .filter((schedule) => String(schedule.status || 'active') === 'active')
      .map((schedule) => ({
        scheduleId: schedule.id,
        label: schedule.label || '',
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        activeDays: schedule.activeDays || [],
        routeKey: schedule.routeKey || 'main',
        originCity: resolveScheduleRoute(bus, schedule).originCity || '',
        destinationCity: resolveScheduleRoute(bus, schedule).destinationCity || '',
      })),
    capacity: Number(bus.capacity || 0),
  }));
};

export const getChannelInventory = async (channel, query) => {
  const { busService, schedule, travelDate } = await loadSellableTrip(channel, query);
  const snapshot = await getTripSeatSnapshot({
    busServiceId: busService._id,
    scheduleId: schedule.id,
    travelDate,
    busService,
  });
  const unavailable = new Set(snapshot.unavailableSeatIds);

  return {
    ...snapshot,
    seats: flattenBlueprintSeats(busService.blueprint).map((seat) => ({
      seatId: String(seat.id),
      label: seat.label || String(seat.id),
      variant: seat.variant || 'seat',
      status: unavailable.has(String(seat.id)) ? 'unavailable' : 'available',
    })),
  };
};

/// Holds (hold: true) or straight-sells seats for a channel. Idempotent on
/// externalRef: retrying the same request returns the same booking.
export const createChannelBooking = async (channel, body = {}) => {
  const externalRef = String(body.externalRef || '').trim();
  if (!externalRef || externalRef.length > 120) {
    throw new ApiError(400, 'externalRef (your booking id, max 120 chars) is required');
  }

  const seatIds = [...new Set((Array.isArray(body.seatIds) ? body.seatIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!seatIds.length) {
    throw new ApiError(400, 'seatIds are required');
  }

  let existing = await BusBooking.findOne({ 'channel.channelId': channel._id, 'channel.externalRef': externalRef });
  if (existing && ['cancelled', 'expired', 'failed'].includes(existing.status)) {
    // A ref reused after its booking ended is a new sale. Move the old record
    // aside (it stays for history) so the ref is free again.
    existing.channel.externalRef = `${externalRef}~ended~${existing._id}`;
    await existing.save();
    existing = null;
  }
  if (existing) {
    const sameSeats = existing.seatIds.length === seatIds.length && seatIds.every((id) => existing.seatIds.includes(id));
    if (!sameSeats) {
      throw new ApiError(409, 'externalRef already used for different seats');
    }
    return { booking: existing, replayed: true };
  }

  const { busService, schedule, travelDate } = await loadSellableTrip(channel, body);
  const seatMap = new Map(
    flattenBlueprintSeats(busService.blueprint)
      .filter((seat) => String(seat.status || 'available') !== 'blocked')
      .map((seat) => [String(seat.id), seat]),
  );
  const unknown = seatIds.filter((id) => !seatMap.has(id));
  if (unknown.length) {
    throw new ApiError(400, `Unknown or blocked seats: ${unknown.join(', ')}`);
  }

  const hold = body.hold === true;
  const holdMinutes = Math.min(
    CHANNEL_HOLD_MINUTES_MAX,
    Math.max(1, Number(body.holdMinutes || CHANNEL_HOLD_MINUTES_DEFAULT)),
  );
  const expiresAt = hold ? new Date(Date.now() + holdMinutes * 60_000) : null;
  const passenger = body.passenger || {};

  const booking = new BusBooking({
    userId: null,
    busServiceId: busService._id,
    bookingCode: `CH${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    scheduleId: schedule.id,
    travelDate,
    seatIds,
    seatLabels: seatIds.map((id) => seatMap.get(id)?.label || id),
    passenger: {
      name: String(passenger.name || '').slice(0, 120),
      age: Number(passenger.age) || null,
      gender: String(passenger.gender || '').slice(0, 20),
      phone: String(passenger.phone || '').slice(0, 20),
      email: String(passenger.email || '').slice(0, 120),
    },
    amount: Math.max(0, Number(body.amount || 0)),
    bookingSource: 'channel',
    channel: {
      channelId: channel._id,
      code: channel.code,
      name: channel.name,
      externalRef,
    },
    status: hold ? 'pending' : 'confirmed',
    expiresAt,
    routeSnapshot: {
      originCity: resolveScheduleRoute(busService, schedule).originCity || '',
      destinationCity: resolveScheduleRoute(busService, schedule).destinationCity || '',
      departureTime: schedule.departureTime || '',
      arrivalTime: schedule.arrivalTime || '',
      durationHours: resolveScheduleRoute(busService, schedule).durationHours || '',
      busName: busService.busName || '',
      operatorName: busService.operatorName || '',
      coachType: busService.coachType || '',
      busCategory: busService.busCategory || '',
      registrationNumber: busService.registrationNumber || '',
    },
    payment: {
      provider: `channel:${channel.code}`,
      status: hold ? 'pending' : 'paid_on_channel',
      paidAt: hold ? null : new Date(),
    },
  });
  await booking.save();

  try {
    await BusSeatHold.insertMany(
      seatIds.map((seatId) => ({
        busServiceId: busService._id,
        bookingId: booking._id,
        userId: null,
        scheduleId: schedule.id,
        travelDate,
        seatId,
        holdToken: booking.bookingCode,
        source: channel.code,
        status: hold ? 'held' : 'booked',
        expiresAt,
      })),
      { ordered: true },
    );
  } catch (error) {
    // ordered:true stops at the first clash; undo whatever went in before it.
    await BusSeatHold.deleteMany({ bookingId: booking._id });
    await BusBooking.deleteOne({ _id: booking._id });

    if (error?.code === 11000) {
      const taken = await BusSeatHold.find({
        busServiceId: busService._id,
        scheduleId: schedule.id,
        travelDate,
        seatId: { $in: seatIds },
        status: { $in: ['held', 'booked'] },
      }).select('seatId').lean();
      logInbound(channel, hold ? 'seats.hold' : 'seats.book', {
        status: 'rejected',
        busServiceId: busService._id,
        scheduleId: schedule.id,
        travelDate,
        seatIds,
        externalRef,
        error: 'seat_conflict',
      });
      const conflict = new ApiError(409, 'One or more seats are no longer available');
      conflict.details = { unavailableSeatIds: taken.map((item) => String(item.seatId)) };
      throw conflict;
    }
    throw error;
  }

  logInbound(channel, hold ? 'seats.hold' : 'seats.book', {
    busServiceId: busService._id,
    scheduleId: schedule.id,
    travelDate,
    seatIds,
    bookingId: booking._id,
    externalRef,
  });
  publishBusSeatChange({
    busServiceId: busService._id,
    scheduleId: schedule.id,
    travelDate,
    change: hold ? 'held' : 'booked',
    seatIds,
    bookingId: booking._id,
    sourceChannelId: channel._id,
  });

  return { booking, replayed: false };
};

const findChannelBooking = async (channel, externalRef) => {
  const booking = await BusBooking.findOne({
    'channel.channelId': channel._id,
    'channel.externalRef': String(externalRef || '').trim(),
  });
  if (!booking) {
    throw new ApiError(404, 'Booking not found for this externalRef');
  }
  return booking;
};

export const getChannelBooking = (channel, externalRef) => findChannelBooking(channel, externalRef);

export const confirmChannelBooking = async (channel, externalRef, body = {}) => {
  const booking = await findChannelBooking(channel, externalRef);
  if (booking.status === 'confirmed') {
    return booking;
  }
  if (booking.status !== 'pending' || (booking.expiresAt && booking.expiresAt <= new Date())) {
    throw new ApiError(409, 'Hold has expired; book the seats again');
  }

  // Flip the holds first, conditionally on them still being live. If the
  // sweeper got there first, fewer rows match and the confirm is refused.
  const result = await BusSeatHold.updateMany(
    { bookingId: booking._id, status: 'held', expiresAt: { $gt: new Date() } },
    { $set: { status: 'booked', expiresAt: null } },
  );
  if (result.modifiedCount !== booking.seatIds.length) {
    await BusSeatHold.deleteMany({ bookingId: booking._id, status: 'held' });
    booking.status = 'expired';
    await booking.save();
    throw new ApiError(409, 'Hold has expired; book the seats again');
  }

  booking.status = 'confirmed';
  booking.expiresAt = null;
  booking.payment.status = 'paid_on_channel';
  booking.payment.paidAt = new Date();
  if (body.amount != null) {
    booking.amount = Math.max(0, Number(body.amount) || 0);
  }
  await booking.save();

  logInbound(channel, 'seats.confirm', {
    busServiceId: booking.busServiceId,
    scheduleId: booking.scheduleId,
    travelDate: booking.travelDate,
    seatIds: booking.seatIds,
    bookingId: booking._id,
    externalRef,
  });
  publishBusSeatChange({
    busServiceId: booking.busServiceId,
    scheduleId: booking.scheduleId,
    travelDate: booking.travelDate,
    change: 'booked',
    seatIds: booking.seatIds,
    bookingId: booking._id,
    sourceChannelId: channel._id,
  });

  return booking;
};

/// Cancels some (seatIds given) or all seats of a channel booking and frees them.
export const cancelChannelBooking = async (channel, externalRef, body = {}) => {
  const booking = await findChannelBooking(channel, externalRef);
  if (['cancelled', 'expired', 'failed'].includes(booking.status)) {
    return booking;
  }

  const alreadyCancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  const active = booking.seatIds.filter((id) => !alreadyCancelled.has(String(id)));
  const requested = Array.isArray(body.seatIds) && body.seatIds.length
    ? body.seatIds.map(String).filter((id) => active.includes(id))
    : active;

  if (!requested.length) {
    throw new ApiError(400, 'No active seats to cancel');
  }

  const now = new Date();
  booking.cancelledSeats.push(
    ...requested.map((seatId) => ({
      seatId,
      seatLabel: booking.seatLabels[booking.seatIds.indexOf(seatId)] || seatId,
      cancelledAt: now,
      refundStatus: 'handled_by_channel',
      notes: String(body.reason || '').slice(0, 200),
    })),
  );
  const remaining = active.length - requested.length;
  if (remaining <= 0) {
    booking.status = booking.status === 'pending' ? 'expired' : 'cancelled';
    booking.cancelledAt = now;
  }
  await booking.save();

  await BusSeatHold.deleteMany({ bookingId: booking._id, seatId: { $in: requested } });

  logInbound(channel, 'seats.cancel', {
    busServiceId: booking.busServiceId,
    scheduleId: booking.scheduleId,
    travelDate: booking.travelDate,
    seatIds: requested,
    bookingId: booking._id,
    externalRef,
  });
  publishBusSeatChange({
    busServiceId: booking.busServiceId,
    scheduleId: booking.scheduleId,
    travelDate: booking.travelDate,
    change: 'released',
    seatIds: requested,
    bookingId: booking._id,
    sourceChannelId: channel._id,
  });

  return booking;
};

// --------------------------------------------------------------- outbound

const signPayload = (secret, body) => crypto.createHmac('sha256', String(secret || '')).update(body).digest('hex');

const deliverEvent = async (eventDoc, channel) => {
  const body = JSON.stringify(eventDoc.payload);
  let status = 'failed';
  let responseCode = 0;
  let lastError = '';

  try {
    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZiBus-Event': eventDoc.event,
        'X-ZiBus-Event-Id': String(eventDoc._id),
        'X-ZiBus-Signature': signPayload(channel.webhookSecret, body),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    responseCode = response.status;
    status = response.ok ? 'delivered' : 'failed';
    if (!response.ok) {
      lastError = `HTTP ${response.status}`;
    }
  } catch (error) {
    lastError = error.message || 'Request failed';
  }

  const attempts = Number(eventDoc.attempts || 0) + 1;
  const giveUp = status === 'failed' && attempts >= WEBHOOK_MAX_ATTEMPTS;
  // 1, 2, 4, 8, 16 minutes between tries.
  const nextAttemptAt = status === 'failed' && !giveUp
    ? new Date(Date.now() + 2 ** (attempts - 1) * 60_000)
    : null;

  await BusChannelEvent.updateOne(
    { _id: eventDoc._id },
    {
      $set: {
        status: status === 'failed' && !giveUp ? 'pending' : status,
        attempts,
        responseCode,
        lastError,
        nextAttemptAt,
      },
    },
  );
  await BusChannel.updateOne(
    { _id: channel._id },
    { $set: { lastWebhookAt: new Date(), lastWebhookStatus: status === 'delivered' ? 'ok' : lastError } },
  );
};

const fanOutSeatChange = async (change) => {
  const channels = await BusChannel.find({
    active: true,
    webhookUrl: { $gt: '' },
    _id: { $ne: change.sourceChannelId || null },
    $or: [{ busServiceIds: { $size: 0 } }, { busServiceIds: change.busServiceId }],
  }).lean();

  if (!channels.length) {
    return;
  }

  const event = change.change === 'released' ? 'seats.released' : change.change === 'held' ? 'seats.held' : 'seats.booked';
  for (const channel of channels) {
    const payload = {
      event,
      busServiceId: change.busServiceId,
      scheduleId: change.scheduleId,
      travelDate: change.travelDate,
      seatIds: change.seatIds,
      // The whole picture, so a missed webhook heals on the next one.
      snapshot: {
        totalSeats: change.snapshot.totalSeats,
        unavailableSeatIds: change.snapshot.unavailableSeatIds,
        availableSeats: change.snapshot.availableSeats,
      },
      occurredAt: new Date().toISOString(),
    };

    const eventDoc = await BusChannelEvent.create({
      channelId: channel._id,
      direction: 'outbound',
      event,
      busServiceId: change.busServiceId,
      scheduleId: change.scheduleId,
      travelDate: change.travelDate,
      seatIds: change.seatIds,
      bookingId: change.bookingId || null,
      payload,
      status: 'pending',
      nextAttemptAt: new Date(),
    });
    await deliverEvent(eventDoc, channel);
  }
};

onBusSeatChange(fanOutSeatChange);

export const retryPendingWebhooks = async () => {
  const due = await BusChannelEvent.find({
    direction: 'outbound',
    status: 'pending',
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(50)
    .lean();

  for (const eventDoc of due) {
    // Claim it, so two instances don't both resend.
    const claimed = await BusChannelEvent.findOneAndUpdate(
      { _id: eventDoc._id, status: 'pending', nextAttemptAt: eventDoc.nextAttemptAt },
      { $set: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) } },
      { returnDocument: 'after' },
    ).lean();
    if (!claimed) {
      continue;
    }

    const channel = await BusChannel.findById(claimed.channelId).lean();
    if (!channel?.active || !channel.webhookUrl) {
      await BusChannelEvent.updateOne({ _id: claimed._id }, { $set: { status: 'failed', lastError: 'Channel inactive' } });
      continue;
    }
    await deliverEvent(claimed, channel);
  }
};

let retryTimer = null;

export const startChannelWebhookRetryLoop = (intervalMs = 60_000) => {
  if (retryTimer) {
    return;
  }
  retryTimer = setInterval(() => {
    retryPendingWebhooks().catch((error) => console.error('[bus-channel] retry failed', error.message));
  }, intervalMs);
  retryTimer.unref?.();
};
