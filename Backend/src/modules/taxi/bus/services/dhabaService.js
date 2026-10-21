import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';
import { sendTemplatedSms } from '../../services/smsService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { refundRazorpayPayment } from './busRefundService.js';
import { Dhaba } from '../models/Dhaba.js';
import { DHABA_STATUS_TRANSITIONS, DhabaOrder } from '../models/DhabaOrder.js';
import { haversineKm, resolveTripWindow } from '../utils/busTime.js';
import { getBusSocketServer, onBusBookingsExpired } from './busSeatSyncService.js';

export const DHABA_SOCKET_EVENTS = Object.freeze({
  ORDER_NEW: 'dhaba:order:new',
  ORDER_ALERT: 'dhaba:order:alert',
  ORDER_UPDATED: 'dhaba:order:updated',
});

/// The dhaba is told about an order this long before the bus is expected.
export const DHABA_ALERT_LEAD_MINUTES = Math.max(
  5,
  Number(process.env.DHABA_ALERT_LEAD_MINUTES ?? 30) || 30,
);
/// A dhaba stop closer than this to booking time can't be ordered from: the
/// kitchen would not get its full alert window.
const MIN_ORDER_LEAD_MINUTES = DHABA_ALERT_LEAD_MINUTES + 15;
/// Used to turn the remaining distance into an ETA from live GPS.
const ASSUMED_HIGHWAY_SPEED_KMPH = 45;
const MAX_ITEM_QUANTITY = 20;

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const getDhabaRoom = (dhabaId) => `dhaba:${String(dhabaId)}`;

const createOrderCode = () => `ZF${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const stopLinkMatches = (link, busServiceId, scheduleId) =>
  String(link.busServiceId) === String(busServiceId) &&
  (!link.scheduleId || String(link.scheduleId) === String(scheduleId));

const expectedArrivalFor = (link, departureAt) =>
  departureAt ? new Date(departureAt.getTime() + Number(link.minutesAfterDeparture || 0) * 60_000) : null;

export const serializeMenuItem = (item) => ({
  id: String(item._id),
  name: item.name,
  description: item.description || '',
  category: item.category || 'Meals',
  price: Number(item.price || 0),
  isVeg: item.isVeg !== false,
  image: item.image || '',
  available: item.available !== false,
});

export const serializeDhaba = (dhaba, { includeMenu = true, includeStops = false } = {}) => ({
  id: String(dhaba._id),
  name: dhaba.name,
  ownerName: dhaba.ownerName || '',
  phone: dhaba.phone || '',
  email: dhaba.email || '',
  address: dhaba.address || '',
  city: dhaba.city || '',
  highway: dhaba.highway || '',
  location: dhaba.location?.lat != null ? { lat: dhaba.location.lat, lng: dhaba.location.lng } : null,
  image: dhaba.image || '',
  commissionPercent: Number(dhaba.commissionPercent ?? 10),
  acceptingOrders: dhaba.acceptingOrders !== false,
  active: dhaba.active !== false,
  ...(includeMenu ? { menu: (dhaba.menu || []).map(serializeMenuItem) } : {}),
  ...(includeStops
    ? {
        busStops: (dhaba.busStops || []).map((link) => ({
          id: String(link._id),
          busServiceId: String(link.busServiceId),
          scheduleId: link.scheduleId || '',
          minutesAfterDeparture: Number(link.minutesAfterDeparture || 0),
          haltMinutes: Number(link.haltMinutes || 0),
        })),
      }
    : {}),
  createdAt: dhaba.createdAt || null,
});

export const serializeDhabaOrder = (order, { forDhaba = false } = {}) => ({
  id: String(order._id),
  orderCode: order.orderCode,
  dhabaId: String(order.dhabaId?._id || order.dhabaId),
  dhabaName: order.dhabaId?.name || '',
  busBookingId: String(order.busBookingId?._id || order.busBookingId),
  pnr: order.pnr || '',
  travelDate: order.travelDate,
  scheduleId: order.scheduleId,
  items: (order.items || []).map((item) => ({
    itemId: item.itemId,
    name: item.name,
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 0),
    isVeg: item.isVeg !== false,
  })),
  amount: Number(order.amount || 0),
  ...(forDhaba
    ? {
        commissionAmount: Number(order.commissionAmount || 0),
        payoutAmount: roundMoney(Number(order.amount || 0) - Number(order.commissionAmount || 0)),
      }
    : {}),
  passengerName: order.passengerName || '',
  passengerPhone: order.passengerPhone || '',
  passengerCount: Number(order.passengerCount || 1),
  seatLabels: order.seatLabels || [],
  bus: order.bus || {},
  expectedArrivalAt: order.expectedArrivalAt || null,
  notifyAt: order.notifyAt || null,
  notifiedAt: order.notifiedAt || null,
  status: order.status,
  statusHistory: order.statusHistory || [],
  refund: order.refund || {},
  cancelReason: order.cancelReason || '',
  createdAt: order.createdAt || null,
});

const emitToDhaba = (dhabaId, event, payload) => {
  getBusSocketServer()?.to(getDhabaRoom(dhabaId)).emit(event, payload);
};

/// How many live partner dhabas each bus run stops at, for badges on search
/// results. Returns (busServiceId, scheduleId) => count.
export const getFoodStopCounter = async (busServiceIds = []) => {
  const dhabas = await Dhaba.find({
    active: true,
    acceptingOrders: true,
    'busStops.busServiceId': { $in: busServiceIds },
    'menu.0': { $exists: true },
  })
    .select('busStops')
    .lean();

  return (busServiceId, scheduleId) =>
    dhabas.filter((dhaba) =>
      (dhaba.busStops || []).some((link) => stopLinkMatches(link, busServiceId, scheduleId)),
    ).length;
};

/// Dhabas this run stops at that can still take a pre-order, with their
/// available menu and the expected arrival time.
export const listDhabasForTrip = async ({ busServiceId, schedule, travelDate, now = new Date() }) => {
  const { departureAt } = resolveTripWindow(schedule, travelDate);
  if (!departureAt) {
    return [];
  }

  const dhabas = await Dhaba.find({
    active: true,
    acceptingOrders: true,
    'busStops.busServiceId': busServiceId,
  }).lean();

  const earliest = now.getTime() + MIN_ORDER_LEAD_MINUTES * 60_000;

  return dhabas
    .map((dhaba) => {
      const link = (dhaba.busStops || []).find((item) => stopLinkMatches(item, busServiceId, schedule.id));
      if (!link) {
        return null;
      }

      const expectedArrivalAt = expectedArrivalFor(link, departureAt);
      if (!expectedArrivalAt || expectedArrivalAt.getTime() < earliest) {
        return null;
      }

      const menu = (dhaba.menu || []).filter((item) => item.available !== false).map(serializeMenuItem);
      if (!menu.length) {
        return null;
      }

      return {
        ...serializeDhaba(dhaba, { includeMenu: false }),
        menu,
        expectedArrivalAt,
        haltMinutes: Number(link.haltMinutes || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.expectedArrivalAt - b.expectedArrivalAt);
};

/// Validates a rider's food selection against live menus and prices it.
/// Input: [{ dhabaId, items: [{ itemId, quantity }] }]. Prices always come
/// from the database, never from the client.
export const priceFoodSelection = async ({ busServiceId, schedule, travelDate, foodOrders = [] }) => {
  const requested = (Array.isArray(foodOrders) ? foodOrders : [])
    .map((entry) => ({
      dhabaId: String(entry?.dhabaId || '').trim(),
      items: (Array.isArray(entry?.items) ? entry.items : [])
        .map((item) => ({
          itemId: String(item?.itemId || '').trim(),
          quantity: Math.floor(Number(item?.quantity || 0)),
        }))
        .filter((item) => item.itemId && item.quantity > 0),
    }))
    .filter((entry) => entry.dhabaId && entry.items.length > 0);

  if (!requested.length) {
    return { lines: [], total: 0 };
  }

  const available = await listDhabasForTrip({ busServiceId, schedule, travelDate });
  const availableById = new Map(available.map((dhaba) => [dhaba.id, dhaba]));
  const dhabaDocs = await Dhaba.find({ _id: { $in: requested.map((entry) => entry.dhabaId).filter(mongoose.isValidObjectId) } })
    .select('commissionPercent')
    .lean();
  const commissionById = new Map(dhabaDocs.map((doc) => [String(doc._id), Number(doc.commissionPercent ?? 10)]));

  const lines = requested.map((entry) => {
    const dhaba = availableById.get(entry.dhabaId);
    if (!dhaba) {
      throw new ApiError(409, 'A selected dhaba is no longer taking orders for this bus');
    }

    const menuById = new Map(dhaba.menu.map((item) => [item.id, item]));
    const items = entry.items.map((requestedItem) => {
      const menuItem = menuById.get(requestedItem.itemId);
      if (!menuItem) {
        throw new ApiError(409, `An item from ${dhaba.name} is no longer available`);
      }
      if (requestedItem.quantity > MAX_ITEM_QUANTITY) {
        throw new ApiError(400, `At most ${MAX_ITEM_QUANTITY} of one item can be ordered`);
      }
      return {
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: requestedItem.quantity,
        isVeg: menuItem.isVeg,
      };
    });

    const amount = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const commissionPercent = commissionById.get(entry.dhabaId) ?? 10;
    return {
      dhabaId: entry.dhabaId,
      dhabaName: dhaba.name,
      items,
      amount,
      commissionPercent,
      commissionAmount: roundMoney((amount * commissionPercent) / 100),
      expectedArrivalAt: dhaba.expectedArrivalAt,
    };
  });

  return { lines, total: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)) };
};

export const createPendingDhabaOrders = async ({ booking, busService, lines }) => {
  if (!lines?.length) {
    return [];
  }

  return DhabaOrder.insertMany(
    lines.map((line) => ({
      orderCode: createOrderCode(),
      dhabaId: line.dhabaId,
      busBookingId: booking._id,
      userId: booking.userId || null,
      busServiceId: booking.busServiceId,
      scheduleId: booking.scheduleId,
      travelDate: booking.travelDate,
      items: line.items,
      amount: line.amount,
      commissionPercent: line.commissionPercent,
      commissionAmount: line.commissionAmount,
      passengerName: booking.passenger?.name || '',
      passengerPhone: booking.passenger?.phone || '',
      passengerCount: Array.isArray(booking.seatIds) ? booking.seatIds.length : 1,
      seatLabels: booking.seatLabels || [],
      bus: {
        busName: busService?.busName || '',
        operatorName: busService?.operatorName || '',
        registrationNumber: busService?.registrationNumber || '',
        driverName: busService?.driverName || '',
        driverPhone: busService?.driverPhone || '',
        originCity: booking.routeSnapshot?.originCity || busService?.route?.originCity || '',
        destinationCity: booking.routeSnapshot?.destinationCity || busService?.route?.destinationCity || '',
        departureTime: booking.routeSnapshot?.departureTime || '',
      },
      expectedArrivalAt: line.expectedArrivalAt,
      notifyAt: new Date(new Date(line.expectedArrivalAt).getTime() - DHABA_ALERT_LEAD_MINUTES * 60_000),
      status: 'awaiting_payment',
      statusHistory: [{ status: 'awaiting_payment', by: 'system' }],
    })),
  );
};

/// Seat payment succeeded: the food orders become real, and each dhaba sees
/// it in its upcoming list straight away (the cooking alert comes later).
export const confirmDhabaOrdersForBooking = async (booking) => {
  await DhabaOrder.updateMany(
    { busBookingId: booking._id, status: 'awaiting_payment' },
    {
      $set: { status: 'placed', pnr: booking.pnr || '' },
      $push: { statusHistory: { status: 'placed', by: 'system', at: new Date() } },
    },
  );

  const orders = await DhabaOrder.find({ busBookingId: booking._id, status: 'placed' }).lean();
  orders.forEach((order) => {
    emitToDhaba(order.dhabaId, DHABA_SOCKET_EVENTS.ORDER_NEW, serializeDhabaOrder(order, { forDhaba: true }));
  });
  return orders;
};

/// Rider (or admin) cancelled the whole booking. Orders the kitchen has not
/// started are cancelled and their amount is returned so the caller can
/// refund it; anything already being cooked is kept and not refunded.
export const cancelDhabaOrdersForBooking = async (bookingId, { reason = 'Bus booking cancelled', by = 'system' } = {}) => {
  const orders = await DhabaOrder.find({
    busBookingId: bookingId,
    status: { $in: ['awaiting_payment', 'placed', 'notified', 'accepted'] },
  }).lean();

  if (!orders.length) {
    return { refundableAmount: 0, orders: [] };
  }

  await DhabaOrder.updateMany(
    { _id: { $in: orders.map((order) => order._id) } },
    {
      $set: { status: 'cancelled', cancelReason: reason },
      $push: { statusHistory: { status: 'cancelled', by, at: new Date() } },
    },
  );

  const refundableAmount = roundMoney(
    orders.filter((order) => order.status !== 'awaiting_payment').reduce((sum, order) => sum + Number(order.amount || 0), 0),
  );

  orders.forEach((order) => {
    emitToDhaba(order.dhabaId, DHABA_SOCKET_EVENTS.ORDER_UPDATED, {
      ...serializeDhabaOrder({ ...order, status: 'cancelled', cancelReason: reason }, { forDhaba: true }),
    });
  });

  return { refundableAmount, orders };
};

/// Whole trip cancelled (by rider, admin or operator): cancel the food that
/// isn't being cooked yet and refund it in full, separately from the seat
/// refund rules.
export const cancelAndRefundFoodForBooking = async (booking, { reason, by = 'system' } = {}) => {
  const food = await cancelDhabaOrdersForBooking(booking._id, { reason, by });
  if (food.refundableAmount <= 0 || !booking.payment?.paymentId) {
    return food;
  }

  const orderIds = food.orders.map((order) => order._id);
  try {
    const refund = await refundRazorpayPayment({
      paymentId: booking.payment.paymentId,
      amount: food.refundableAmount,
      notes: { bookingCode: booking.bookingCode, reason: 'food_cancelled' },
    });
    await recordDhabaRefund(orderIds, { refundId: refund?.id || '', status: refund?.status || 'processed' });
  } catch (error) {
    // Left visible as failed so admin can settle it by hand.
    await recordDhabaRefund(orderIds, { status: 'failed' });
    console.error('[dhaba] food refund failed', booking.bookingCode, error.message);
  }
  return food;
};

export const recordDhabaRefund = async (orderIds = [], refund = {}) => {
  if (!orderIds.length) {
    return;
  }
  await DhabaOrder.updateMany(
    { _id: { $in: orderIds } },
    { $set: { 'refund.refundId': refund.refundId || '', 'refund.status': refund.status || '' } },
  );
};

onBusBookingsExpired(async (bookingIds) => {
  await DhabaOrder.updateMany(
    { busBookingId: { $in: bookingIds }, status: 'awaiting_payment' },
    {
      $set: { status: 'expired' },
      $push: { statusHistory: { status: 'expired', by: 'system', at: new Date() } },
    },
  );
});

/// Dhaba moves an order along its kitchen flow.
export const updateDhabaOrderStatus = async ({ dhabaId, orderId, status, note = '' }) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new ApiError(400, 'Valid order id is required');
  }

  const current = await DhabaOrder.findOne({ _id: orderId, dhabaId }).select('status').lean();
  if (!current) {
    throw new ApiError(404, 'Order not found');
  }

  const allowed = DHABA_STATUS_TRANSITIONS[current.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(409, `An order that is ${current.status} cannot be moved to ${status}`);
  }

  // Conditional on the status just read, so two taps (or two devices) can't
  // both apply a transition from the same starting point.
  const order = await DhabaOrder.findOneAndUpdate(
    { _id: orderId, dhabaId, status: current.status },
    {
      $set: {
        status,
        ...(status === 'cancelled' ? { cancelReason: note || 'Cancelled by dhaba' } : {}),
      },
      $push: { statusHistory: { status, by: 'dhaba', at: new Date() } },
    },
    { returnDocument: 'after' },
  );
  if (!order) {
    throw new ApiError(409, 'This order was just updated. Refresh and try again.');
  }

  if (status === 'cancelled') {
    await refundCancelledDhabaOrder(order);
  }

  return order;
};

/// The rider paid for food the dhaba then refused: give that money back.
const refundCancelledDhabaOrder = async (order) => {
  const booking = await BusBooking.findById(order.busBookingId).select('payment pnr').lean();
  const paymentId = booking?.payment?.paymentId;

  if (paymentId && Number(order.amount || 0) > 0) {
    try {
      const refund = await refundRazorpayPayment({
        paymentId,
        amount: order.amount,
        notes: { dhabaOrder: order.orderCode, pnr: booking.pnr || '' },
      });
      await recordDhabaRefund([order._id], {
        refundId: refund?.id || '',
        status: refund?.status || 'processed',
      });
      await DhabaOrder.updateOne({ _id: order._id }, { $set: { 'refund.amount': Number(order.amount) } });
    } catch (error) {
      // Left visible as failed so admin can settle it by hand.
      await recordDhabaRefund([order._id], { status: 'failed' });
      console.error('[dhaba] refund failed', order.orderCode, error.message);
    }
  }

  if (order.userId) {
    sendPushNotificationToEntities({
      userIds: [order.userId],
      title: 'Food order cancelled',
      body: `${order.orderCode} could not be prepared by the dhaba. Your food amount is being refunded.`,
      data: { type: 'dhaba_order_cancelled', orderId: String(order._id) },
    }).catch(() => {});
  }
};

const sendOrderAlert = async (order) => {
  const payload = serializeDhabaOrder(order, { forDhaba: true });
  emitToDhaba(order.dhabaId, DHABA_SOCKET_EVENTS.ORDER_ALERT, payload);

  const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const eta = order.expectedArrivalAt
    ? new Date(order.expectedArrivalAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : 'soon';

  await sendPushNotificationToEntities({
    dhabaIds: [order.dhabaId],
    title: `Bus arriving ~${eta}: prepare ${order.orderCode}`,
    body: `${order.bus?.busName || 'Bus'} ${order.bus?.registrationNumber || ''} • ${order.passengerCount} passenger(s) • ${itemCount} item(s)`,
    data: { type: 'dhaba_order_alert', orderId: String(order._id) },
  }).catch((error) => {
    console.error('[dhaba] push failed', error.message);
  });

  await sendDhabaAlertSms(order, { eta, itemCount }).catch((error) => {
    console.error('[dhaba] sms failed', order.orderCode, error.message);
  });
};

/// SMS backup for dhabas whose phone isn't watching the panel. Needs a DLT
/// template registered with the operator and set in the environment:
///   DHABA_ALERT_SMS_TEMPLATE_ID=<DLT template id>
///   DHABA_ALERT_SMS_TEMPLATE=<the exact registered text with {#var#} slots>
/// The slots are filled in order with: order code, bus, arrival time,
/// passenger count, item count. Without both settings, no SMS is sent.
const sendDhabaAlertSms = async (order, { eta, itemCount }) => {
  const templateId = process.env.DHABA_ALERT_SMS_TEMPLATE_ID;
  const template = process.env.DHABA_ALERT_SMS_TEMPLATE;
  if (!templateId || !template) {
    return;
  }

  const dhaba = await Dhaba.findById(order.dhabaId).select('phone').lean();
  if (!dhaba?.phone) {
    return;
  }

  // DLT variables are capped at 30 characters each.
  const values = [
    order.orderCode,
    `${order.bus?.busName || 'Bus'} ${order.bus?.registrationNumber || ''}`.trim(),
    eta,
    String(order.passengerCount || 1),
    String(itemCount),
  ].map((value) => String(value).slice(0, 30));
  let index = 0;
  const message = template.replace(/\{#var#\}/g, () => values[index++] ?? '');

  await sendTemplatedSms({ phone: dhaba.phone, templateId, message });
};

/// Uses the bus's live GPS, when the trip is running, to pull an alert
/// earlier than the timetable says (the bus is ahead of schedule) and keep
/// the expected arrival honest.
const refineAlertsFromLiveGps = async (now) => {
  const upcoming = await DhabaOrder.find({
    status: 'placed',
    notifyAt: { $gt: now },
    expectedArrivalAt: { $lte: new Date(now.getTime() + 12 * 60 * 60_000) },
  })
    .select('_id dhabaId busServiceId scheduleId travelDate')
    .lean();

  if (!upcoming.length) {
    return;
  }

  const busIds = [...new Set(upcoming.map((order) => String(order.busServiceId)))];
  const dhabaIds = [...new Set(upcoming.map((order) => String(order.dhabaId)))];
  const [buses, dhabas] = await Promise.all([
    BusService.find({ _id: { $in: busIds } }).select('liveTracking').lean(),
    Dhaba.find({ _id: { $in: dhabaIds } }).select('location').lean(),
  ]);
  const busById = new Map(buses.map((bus) => [String(bus._id), bus]));
  const dhabaById = new Map(dhabas.map((dhaba) => [String(dhaba._id), dhaba]));

  for (const order of upcoming) {
    const live = busById.get(String(order.busServiceId))?.liveTracking;
    const dhaba = dhabaById.get(String(order.dhabaId));
    if (
      !live ||
      live.status !== 'in_progress' ||
      String(live.scheduleId) !== String(order.scheduleId) ||
      String(live.travelDate) !== String(order.travelDate) ||
      !live.currentLocation ||
      dhaba?.location?.lat == null
    ) {
      continue;
    }

    const distanceKm = haversineKm(live.currentLocation, dhaba.location);
    if (distanceKm == null) {
      continue;
    }

    const etaMinutes = (distanceKm / ASSUMED_HIGHWAY_SPEED_KMPH) * 60;
    const expectedArrivalAt = new Date(now.getTime() + etaMinutes * 60_000);
    const update = { expectedArrivalAt };
    if (etaMinutes <= DHABA_ALERT_LEAD_MINUTES) {
      update.notifyAt = now;
    }
    await DhabaOrder.updateOne({ _id: order._id, status: 'placed' }, { $set: update });
  }
};

export const runDhabaAlertCycle = async () => {
  const now = new Date();
  await refineAlertsFromLiveGps(now);

  // Claim one order at a time: the atomic status flip is what guarantees a
  // single alert even when every backend instance runs this loop.
  for (let index = 0; index < 100; index += 1) {
    const order = await DhabaOrder.findOneAndUpdate(
      { status: 'placed', notifyAt: { $lte: now } },
      {
        $set: { status: 'notified', notifiedAt: now },
        $push: { statusHistory: { status: 'notified', by: 'system', at: now } },
      },
      { returnDocument: 'after' },
    ).lean();

    if (!order) {
      break;
    }

    await sendOrderAlert(order);
  }
};

let alertTimer = null;

export const startDhabaAlertLoop = (intervalMs = 30_000) => {
  if (alertTimer) {
    return;
  }

  alertTimer = setInterval(() => {
    runDhabaAlertCycle().catch((error) => {
      console.error('[dhaba] alert cycle failed', error.message);
    });
  }, intervalMs);
  alertTimer.unref?.();
};
