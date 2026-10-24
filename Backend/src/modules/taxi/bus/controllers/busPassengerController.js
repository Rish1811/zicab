import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import {
  confirmDhabaOrdersForFoodPayment,
  createPendingDhabaOrders,
  listDhabasForTrip,
  priceFoodSelection,
} from '../services/dhabaService.js';
import { razorpayApi } from '../services/busRefundService.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import {
  boardTicketByPnr,
  buildBusTicket,
  getCrewManifest,
  getPassengerLiveTracking,
  verifyTicketByPnr,
} from '../services/busTicketService.js';
import { findSchedule } from '../utils/busTime.js';

const ok = (res, data) => res.status(200).json({ success: true, data });

const loadMyBooking = async (req) => {
  const bookingId = String(req.params?.id || '');
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, 'Valid bus booking id is required');
  }
  const booking = await BusBooking.findOne({ _id: bookingId, userId: req.auth.sub });
  if (!booking) {
    throw new ApiError(404, 'Bus booking not found');
  }
  return booking;
};

/// Dhabas on this run the rider can pre-order from at checkout.
export const listTripDhabas = async (req, res) => {
  const busServiceId = String(req.params?.id || '');
  const scheduleId = String(req.query?.scheduleId || '').trim();
  const travelDate = String(req.query?.date || req.query?.travelDate || '').trim();
  if (!mongoose.isValidObjectId(busServiceId) || !scheduleId || !/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) {
    throw new ApiError(400, 'Bus, scheduleId and date (YYYY-MM-DD) are required');
  }

  const busService = await BusService.findById(busServiceId).select('schedules status').lean();
  const schedule = findSchedule(busService, scheduleId);
  if (!busService || busService.status !== 'active' || !schedule) {
    throw new ApiError(404, 'Bus schedule not found');
  }

  ok(res, await listDhabasForTrip({ busServiceId, schedule, travelDate }));
};

export const getMyBusTicket = async (req, res) => {
  ok(res, await buildBusTicket(await loadMyBooking(req)));
};

/// Dhabas on this booking's route the rider can still order from (for the
/// "Book Your Meal" screen opened from the ticket).
export const listMyBookingDhabas = async (req, res) => {
  const booking = await loadMyBooking(req);
  const busService = await BusService.findById(booking.busServiceId).select('schedules status').lean();
  const schedule = findSchedule(busService, booking.scheduleId);
  if (!busService || busService.status !== 'active' || !schedule) {
    throw new ApiError(404, 'Bus schedule not found');
  }
  ok(res, await listDhabasForTrip({
    busServiceId: booking.busServiceId,
    schedule,
    travelDate: booking.travelDate,
  }));
};

/// "Book Your Meal" from the ticket: price the chosen dishes from the route's
/// dhabas and open a separate Razorpay order for the food only. The seat
/// booking must already be confirmed.
export const createMyFoodOrder = async (req, res) => {
  const booking = await loadMyBooking(req);
  if (booking.status !== 'confirmed') {
    throw new ApiError(409, 'Food can be ordered only after the booking is confirmed');
  }

  const busService = await BusService.findById(booking.busServiceId);
  const schedule = findSchedule(busService, booking.scheduleId);
  if (!busService || busService.status !== 'active' || !schedule) {
    throw new ApiError(404, 'Bus schedule not found');
  }

  const food = await priceFoodSelection({
    busServiceId: booking.busServiceId,
    schedule,
    travelDate: booking.travelDate,
    foodOrders: req.body?.foodOrders,
  });
  if (!food.lines.length || food.total <= 0) {
    throw new ApiError(400, 'Select at least one dish to order');
  }

  const { keyId } = await resolveConfiguredGatewayCredentials('razor_pay');
  const order = await razorpayApi({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(food.total * 100),
      currency: booking.currency || 'INR',
      receipt: `food_${String(booking._id).slice(-20)}`,
      notes: { bookingId: String(booking._id), kind: 'bus_food' },
    },
  });

  await createPendingDhabaOrders({
    booking,
    busService,
    lines: food.lines,
    payment: { provider: 'razorpay', orderId: order.id, status: 'pending' },
  });

  ok(res, {
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || booking.currency || 'INR',
    foodTotal: food.total,
  });
};

/// Verifies the food-only Razorpay payment and places those dhaba orders.
export const verifyMyFoodOrder = async (req, res) => {
  const booking = await loadMyBooking(req);
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment details are required');
  }

  const { keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  await confirmDhabaOrdersForFoodPayment({
    orderId,
    paymentId,
    signature,
    pnr: booking.bookingCode || booking.pnr || '',
  });

  ok(res, await buildBusTicket(booking));
};

export const getMyBusLiveTracking = async (req, res) => {
  ok(res, await getPassengerLiveTracking(await loadMyBooking(req)));
};

export const verifyBusTicket = async (req, res) => {
  ok(res, await verifyTicketByPnr({
    pnr: req.params?.pnr,
    role: req.auth.role,
    actorId: req.auth.sub,
  }));
};

export const boardBusTicket = async (req, res) => {
  ok(res, await boardTicketByPnr({
    pnr: req.params?.pnr,
    role: req.auth.role,
    actorId: req.auth.sub,
    scheduleId: String(req.body?.scheduleId || ''),
    travelDate: String(req.body?.travelDate || ''),
  }));
};

export const getBusCrewManifest = async (req, res) => {
  ok(res, await getCrewManifest({
    role: req.auth.role,
    actorId: req.auth.sub,
    busServiceId: String(req.query?.busServiceId || ''),
    scheduleId: String(req.query?.scheduleId || ''),
    travelDate: String(req.query?.travelDate || req.query?.date || ''),
  }));
};
