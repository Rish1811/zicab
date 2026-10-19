import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { comparePassword } from '../../services/passwordService.js';
import { signAccessToken } from '../../services/tokenService.js';
import { assignPushTokenToEntity } from '../../services/pushTokenService.js';
import { Dhaba } from '../models/Dhaba.js';
import { DhabaOrder } from '../models/DhabaOrder.js';
import {
  DHABA_SOCKET_EVENTS,
  getDhabaRoom,
  serializeDhaba,
  serializeDhabaOrder,
  serializeMenuItem,
  updateDhabaOrderStatus,
} from '../services/dhabaService.js';
import { getBusSocketServer } from '../services/busSeatSyncService.js';

export const normalizeDhabaPhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const loadMyDhaba = async (req) => {
  const dhaba = await Dhaba.findById(req.auth.sub);
  if (!dhaba) {
    throw new ApiError(404, 'Dhaba not found');
  }
  return dhaba;
};

export const loginDhaba = async (req, res) => {
  const phone = normalizeDhabaPhone(req.body?.phone);
  const password = String(req.body?.password || '');
  if (phone.length !== 10 || !password) {
    throw new ApiError(400, 'Phone and password are required');
  }

  const dhaba = await Dhaba.findOne({ phone }).select('+password');
  if (!dhaba || !(await comparePassword(password, dhaba.password))) {
    throw new ApiError(401, 'Incorrect phone or password');
  }
  if (dhaba.active === false) {
    throw new ApiError(403, 'This dhaba account has been deactivated. Contact ZI Bus support.');
  }

  dhaba.lastLoginAt = new Date();
  await dhaba.save();

  ok(res, {
    token: signAccessToken({ sub: String(dhaba._id), role: 'dhaba' }),
    dhaba: serializeDhaba(dhaba),
  });
};

export const getMyDhaba = async (req, res) => {
  ok(res, serializeDhaba(await loadMyDhaba(req)));
};

/// A dhaba may change its own day-to-day settings; identity, commission and
/// bus links are admin-only.
export const updateMyDhaba = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  const body = req.body || {};

  if (body.acceptingOrders !== undefined) dhaba.acceptingOrders = Boolean(body.acceptingOrders);
  if (body.ownerName !== undefined) dhaba.ownerName = String(body.ownerName).trim().slice(0, 120);
  if (body.address !== undefined) dhaba.address = String(body.address).trim().slice(0, 300);
  if (body.image !== undefined) dhaba.image = String(body.image).trim();

  await dhaba.save();
  ok(res, serializeDhaba(dhaba));
};

export const saveMyDhabaPushToken = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  assignPushTokenToEntity(dhaba, req.body || {});
  await dhaba.save();
  ok(res, { saved: true });
};

const readMenuItemInput = (body = {}, { partial = false } = {}) => {
  const item = {};
  if (!partial || body.name !== undefined) {
    item.name = String(body.name || '').trim().slice(0, 100);
    if (!item.name) throw new ApiError(400, 'Item name is required');
  }
  if (!partial || body.price !== undefined) {
    item.price = Number(body.price);
    if (!Number.isFinite(item.price) || item.price < 0 || item.price > 100000) {
      throw new ApiError(400, 'Price must be a valid amount');
    }
    item.price = Math.round(item.price * 100) / 100;
  }
  if (body.description !== undefined) item.description = String(body.description).trim().slice(0, 300);
  if (body.category !== undefined) item.category = String(body.category).trim().slice(0, 60) || 'Meals';
  if (body.isVeg !== undefined) item.isVeg = Boolean(body.isVeg);
  if (body.image !== undefined) item.image = String(body.image).trim();
  if (body.available !== undefined) item.available = Boolean(body.available);
  return item;
};

export const listMyMenu = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  ok(res, (dhaba.menu || []).map(serializeMenuItem));
};

export const addMenuItem = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  if ((dhaba.menu || []).length >= 300) {
    throw new ApiError(400, 'Menu is limited to 300 items');
  }
  dhaba.menu.push(readMenuItemInput(req.body));
  await dhaba.save();
  ok(res, serializeMenuItem(dhaba.menu[dhaba.menu.length - 1]), 201);
};

export const updateMenuItem = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  const item = dhaba.menu.id(req.params.itemId);
  if (!item) {
    throw new ApiError(404, 'Menu item not found');
  }
  Object.assign(item, readMenuItemInput(req.body, { partial: true }));
  await dhaba.save();
  ok(res, serializeMenuItem(item));
};

export const deleteMenuItem = async (req, res) => {
  const dhaba = await loadMyDhaba(req);
  const item = dhaba.menu.id(req.params.itemId);
  if (!item) {
    throw new ApiError(404, 'Menu item not found');
  }
  item.deleteOne();
  await dhaba.save();
  ok(res, { deleted: true });
};

const ORDER_SCOPES = {
  // Needs action now: alert has gone out, or the kitchen is working on it.
  active: ['notified', 'accepted', 'preparing', 'ready'],
  // Paid, bus not close yet.
  upcoming: ['placed'],
  history: ['served', 'cancelled'],
};

export const listMyOrders = async (req, res) => {
  const scope = ORDER_SCOPES[req.query?.scope] ? req.query.scope : 'active';
  const filter = { dhabaId: req.auth.sub, status: { $in: ORDER_SCOPES[scope] } };
  if (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
    filter.travelDate = String(req.query.date);
  }

  const orders = await DhabaOrder.find(filter)
    .sort(scope === 'history' ? { updatedAt: -1 } : { expectedArrivalAt: 1 })
    .limit(scope === 'history' ? 100 : 200)
    .lean();

  ok(res, orders.map((order) => serializeDhabaOrder(order, { forDhaba: true })));
};

export const changeMyOrderStatus = async (req, res) => {
  const order = await updateDhabaOrderStatus({
    dhabaId: req.auth.sub,
    orderId: req.params.id,
    status: String(req.body?.status || ''),
    note: String(req.body?.note || '').slice(0, 200),
  });

  const payload = serializeDhabaOrder(order.toObject(), { forDhaba: true });
  // Keep every logged-in device of this dhaba in step.
  getBusSocketServer()?.to(getDhabaRoom(req.auth.sub)).emit(DHABA_SOCKET_EVENTS.ORDER_UPDATED, payload);
  ok(res, payload);
};

export const getMyOrderSummary = async (req, res) => {
  const dhabaId = new mongoose.Types.ObjectId(String(req.auth.sub));
  const now = new Date();
  const startOfToday = new Date(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30');
  const startOfMonth = new Date(`${startOfToday.toISOString().slice(0, 7)}-01T00:00:00+05:30`);

  const totals = async (since) => {
    const [row] = await DhabaOrder.aggregate([
      {
        $match: {
          dhabaId,
          status: { $in: ['placed', 'notified', 'accepted', 'preparing', 'ready', 'served'] },
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          gross: { $sum: '$amount' },
          commission: { $sum: '$commissionAmount' },
        },
      },
    ]);
    const gross = Math.round(Number(row?.gross || 0) * 100) / 100;
    const commission = Math.round(Number(row?.commission || 0) * 100) / 100;
    return { orders: row?.orders || 0, gross, commission, payout: Math.round((gross - commission) * 100) / 100 };
  };

  const [today, month, pendingAlerts] = await Promise.all([
    totals(startOfToday),
    totals(startOfMonth),
    DhabaOrder.countDocuments({ dhabaId, status: 'notified' }),
  ]);

  ok(res, { today, month, pendingAlerts });
};
