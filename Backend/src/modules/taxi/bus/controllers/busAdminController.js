import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { hashPassword } from '../../services/passwordService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusSeatHold } from '../../user/models/BusSeatHold.js';
import { BusChannel } from '../models/BusChannel.js';
import { BusChannelEvent } from '../models/BusChannelEvent.js';
import { Dhaba } from '../models/Dhaba.js';
import { DhabaOrder } from '../models/DhabaOrder.js';
import { generateChannelCredentials, serializeChannel } from '../services/busChannelService.js';
import { getTripSeatSnapshot } from '../services/busSeatSyncService.js';
import { reconcileChannel } from '../services/busChannelSyncService.js';
import { getConnector, listConnectorTypes } from '../connectors/index.js';
import { serializeDhaba, serializeDhabaOrder } from '../services/dhabaService.js';
import { normalizeDhabaPhone } from './dhabaController.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const requireObjectId = (value, label = 'id') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Valid ${label} is required`);
  }
  return String(value);
};

// ------------------------------------------------------------------ dhabas

const readBusStops = async (input) => {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const stops = input.map((stop) => ({
    busServiceId: requireObjectId(stop?.busServiceId, 'busServiceId'),
    scheduleId: String(stop?.scheduleId || '').trim(),
    minutesAfterDeparture: Math.max(0, Math.round(Number(stop?.minutesAfterDeparture) || 0)),
    haltMinutes: Math.max(0, Math.round(Number(stop?.haltMinutes ?? 20) || 0)),
  }));

  const ids = [...new Set(stops.map((stop) => stop.busServiceId))];
  const found = await BusService.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) {
    throw new ApiError(400, 'One of the linked buses does not exist');
  }
  return stops;
};

const applyDhabaFields = async (dhaba, body = {}) => {
  const text = (key, max = 200) => {
    if (body[key] !== undefined) dhaba[key] = String(body[key] || '').trim().slice(0, max);
  };
  text('name', 120);
  text('ownerName', 120);
  text('email', 120);
  text('address', 300);
  text('city', 80);
  text('highway', 80);
  text('image', 500);

  if (body.phone !== undefined) {
    const phone = normalizeDhabaPhone(body.phone);
    if (phone.length !== 10) throw new ApiError(400, 'Phone must be a 10-digit mobile number');
    dhaba.phone = phone;
  }
  if (body.location !== undefined) {
    const lat = Number(body.location?.lat);
    const lng = Number(body.location?.lng);
    dhaba.location = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: null, lng: null };
  }
  if (body.commissionPercent !== undefined) {
    const value = Number(body.commissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new ApiError(400, 'Commission must be 0-100%');
    dhaba.commissionPercent = value;
  }
  if (body.active !== undefined) dhaba.active = Boolean(body.active);
  if (body.acceptingOrders !== undefined) dhaba.acceptingOrders = Boolean(body.acceptingOrders);

  const stops = await readBusStops(body.busStops);
  if (stops) dhaba.busStops = stops;

  if (body.password) {
    if (String(body.password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters');
    dhaba.password = await hashPassword(String(body.password));
  }
};

export const adminListDhabas = async (req, res) => {
  const filter = {};
  const search = String(req.query?.search || '').trim();
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: pattern }, { phone: pattern }, { city: pattern }, { highway: pattern }];
  }

  const dhabas = await Dhaba.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  ok(res, dhabas.map((dhaba) => serializeDhaba(dhaba, { includeStops: true })));
};

export const adminCreateDhaba = async (req, res) => {
  if (!req.body?.name || !req.body?.phone || !req.body?.password) {
    throw new ApiError(400, 'Name, phone and password are required');
  }

  const dhaba = new Dhaba({ name: 'pending', phone: '0000000000', password: 'pending' });
  await applyDhabaFields(dhaba, req.body);

  if (await Dhaba.exists({ phone: dhaba.phone })) {
    throw new ApiError(409, 'A dhaba with this phone already exists');
  }
  await dhaba.save();
  ok(res, serializeDhaba(dhaba, { includeStops: true }), 201);
};

export const adminUpdateDhaba = async (req, res) => {
  const dhaba = await Dhaba.findById(requireObjectId(req.params.id));
  if (!dhaba) {
    throw new ApiError(404, 'Dhaba not found');
  }
  await applyDhabaFields(dhaba, req.body);
  await dhaba.save();
  ok(res, serializeDhaba(dhaba, { includeStops: true }));
};

export const adminDeleteDhaba = async (req, res) => {
  const id = requireObjectId(req.params.id);
  const openOrders = await DhabaOrder.countDocuments({
    dhabaId: id,
    status: { $in: ['placed', 'notified', 'accepted', 'preparing', 'ready'] },
  });
  if (openOrders > 0) {
    throw new ApiError(409, `This dhaba has ${openOrders} open order(s). Deactivate it instead.`);
  }
  await Dhaba.deleteOne({ _id: id });
  ok(res, { deleted: true });
};

export const adminListDhabaOrders = async (req, res) => {
  const filter = {};
  if (req.query?.dhabaId) filter.dhabaId = requireObjectId(req.query.dhabaId, 'dhabaId');
  if (req.query?.status) filter.status = String(req.query.status);
  if (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) filter.travelDate = String(req.query.date);

  const orders = await DhabaOrder.find(filter)
    .populate('dhabaId', 'name')
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
  ok(res, orders.map((order) => serializeDhabaOrder(order, { forDhaba: true })));
};

// ---------------------------------------------------------------- channels

const applyChannelFields = async (channel, body = {}) => {
  if (body.name !== undefined) channel.name = String(body.name || '').trim().slice(0, 80);
  if (body.code !== undefined) {
    const code = String(body.code || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,30}$/.test(code)) throw new ApiError(400, 'Code must be 2-30 letters, digits, - or _');
    channel.code = code;
  }
  if (body.kind !== undefined) channel.kind = String(body.kind);
  if (body.webhookUrl !== undefined) {
    const url = String(body.webhookUrl || '').trim();
    if (url && !/^https:\/\//i.test(url)) throw new ApiError(400, 'Webhook URL must use https');
    channel.webhookUrl = url;
  }
  if (body.notes !== undefined) channel.notes = String(body.notes || '').slice(0, 500);
  if (body.active !== undefined) channel.active = Boolean(body.active);
  if (Array.isArray(body.busServiceIds)) {
    channel.busServiceIds = body.busServiceIds.map((id) => requireObjectId(id, 'busServiceId'));
  }

  if (body.connector && typeof body.connector === 'object') {
    const input = body.connector;
    const type = String(input.type || 'push_api');
    if (type !== 'push_api' && !getConnector(type)) {
      throw new ApiError(400, 'Unknown connector type');
    }
    channel.connector.type = type;
    if (input.baseUrl !== undefined) channel.connector.baseUrl = String(input.baseUrl || '').trim();
    if (input.authHeader !== undefined) channel.connector.authHeader = String(input.authHeader || '').trim().slice(0, 60);
    // Blank means "keep the stored secret"; send null to clear it.
    if (input.authValue === null) channel.connector.authValue = '';
    else if (input.authValue) channel.connector.authValue = String(input.authValue);
    if (input.options && typeof input.options === 'object') channel.connector.options = input.options;
    if (input.pollSeconds !== undefined) channel.connector.pollSeconds = Math.min(3600, Math.max(30, Number(input.pollSeconds) || 120));
    if (input.daysAhead !== undefined) channel.connector.daysAhead = Math.min(30, Math.max(0, Number(input.daysAhead) || 0));
    channel.connector.nextPollAt = null;
    channel.markModified('connector.options');
    if (type !== 'push_api') getConnector(type).validate(channel);
  }

  if (Array.isArray(body.tripMappings)) {
    const mappings = body.tripMappings.map((mapping) => ({
      busServiceId: requireObjectId(mapping?.busServiceId, 'busServiceId'),
      scheduleId: String(mapping?.scheduleId || '').trim(),
      externalTripId: String(mapping?.externalTripId || '').trim(),
      seatMap: mapping?.seatMap && typeof mapping.seatMap === 'object' ? mapping.seatMap : {},
    }));
    if (mappings.some((mapping) => !mapping.scheduleId || !mapping.externalTripId)) {
      throw new ApiError(400, 'Each trip mapping needs a schedule and the channel trip id');
    }
    channel.tripMappings = mappings;
  }
};

export const adminListConnectorTypes = async (_req, res) => {
  ok(res, listConnectorTypes());
};

/// Runs the channel's pull connector right now and reports what changed.
export const adminSyncChannelNow = async (req, res) => {
  ok(res, await reconcileChannel(requireObjectId(req.params.id)));
};

export const adminListChannels = async (_req, res) => {
  const channels = await BusChannel.find().sort({ createdAt: -1 }).lean();
  ok(res, channels.map(serializeChannel));
};

/// The API key and webhook secret are returned in plain text only here and
/// on rotation; afterwards only a prefix is kept.
export const adminCreateChannel = async (req, res) => {
  if (!req.body?.name || !req.body?.code) {
    throw new ApiError(400, 'Name and code are required');
  }

  const channel = new BusChannel({ name: 'pending', code: 'pending' });
  await applyChannelFields(channel, req.body);
  if (await BusChannel.exists({ code: channel.code })) {
    throw new ApiError(409, 'A channel with this code already exists');
  }

  const credentials = generateChannelCredentials();
  channel.apiKeyHash = credentials.apiKeyHash;
  channel.apiKeyPrefix = credentials.apiKeyPrefix;
  channel.webhookSecret = credentials.webhookSecret;
  await channel.save();

  ok(res, { ...serializeChannel(channel), apiKey: credentials.apiKey, webhookSecret: credentials.webhookSecret }, 201);
};

export const adminUpdateChannel = async (req, res) => {
  const channel = await BusChannel.findById(requireObjectId(req.params.id));
  if (!channel) throw new ApiError(404, 'Channel not found');
  await applyChannelFields(channel, req.body);
  await channel.save();
  ok(res, serializeChannel(channel));
};

export const adminRotateChannelKey = async (req, res) => {
  const channel = await BusChannel.findById(requireObjectId(req.params.id));
  if (!channel) throw new ApiError(404, 'Channel not found');

  const credentials = generateChannelCredentials();
  channel.apiKeyHash = credentials.apiKeyHash;
  channel.apiKeyPrefix = credentials.apiKeyPrefix;
  channel.webhookSecret = credentials.webhookSecret;
  await channel.save();

  ok(res, { ...serializeChannel(channel), apiKey: credentials.apiKey, webhookSecret: credentials.webhookSecret });
};

export const adminListChannelEvents = async (req, res) => {
  const events = await BusChannelEvent.find({ channelId: requireObjectId(req.params.id) })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  ok(res, events.map((event) => ({
    id: String(event._id),
    direction: event.direction,
    event: event.event,
    status: event.status,
    busServiceId: event.busServiceId ? String(event.busServiceId) : '',
    scheduleId: event.scheduleId,
    travelDate: event.travelDate,
    seatIds: event.seatIds,
    externalRef: event.externalRef,
    attempts: event.attempts,
    responseCode: event.responseCode,
    lastError: event.lastError,
    createdAt: event.createdAt,
  })));
};

// --------------------------------------------------------------- inventory

/// Seat count for one run, split by who sold each seat: the "accurate
/// records of total, booked and available seats" view.
export const adminTripInventory = async (req, res) => {
  const busServiceId = requireObjectId(req.query?.busServiceId, 'busServiceId');
  const scheduleId = String(req.query?.scheduleId || '').trim();
  const travelDate = String(req.query?.travelDate || req.query?.date || '').trim();
  if (!scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
    throw new ApiError(400, 'scheduleId and travelDate (YYYY-MM-DD) are required');
  }

  const snapshot = await getTripSeatSnapshot({ busServiceId, scheduleId, travelDate });
  const bySource = await BusSeatHold.aggregate([
    {
      $match: {
        busServiceId: new mongoose.Types.ObjectId(busServiceId),
        scheduleId,
        travelDate,
        status: 'booked',
      },
    },
    { $group: { _id: '$source', seats: { $sum: 1 } } },
  ]);
  const bookings = await BusBooking.find({ busServiceId, scheduleId, travelDate, status: 'confirmed' })
    .select('pnr bookingSource channel.name seatLabels passenger.name passenger.phone boardingPoint droppingPoint cancelledSeats seatIds')
    .lean();

  ok(res, {
    ...snapshot,
    bookedBySource: bySource.map((row) => ({ source: row._id || 'zibus', seats: row.seats })),
    passengers: bookings.map((booking) => {
      const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
      return {
        pnr: booking.pnr || '',
        source: booking.bookingSource === 'channel' ? booking.channel?.name || 'channel' : booking.bookingSource,
        seats: (booking.seatIds || [])
          .map((seatId, index) => ({ seatId, label: booking.seatLabels?.[index] || seatId }))
          .filter((item) => !cancelled.has(String(item.seatId)))
          .map((item) => item.label),
        name: booking.passenger?.name || '',
        phone: booking.passenger?.phone || '',
        boarding: booking.boardingPoint?.pointName || booking.boardingPoint?.city || '',
        dropping: booking.droppingPoint?.pointName || booking.droppingPoint?.city || '',
      };
    }),
  });
};
