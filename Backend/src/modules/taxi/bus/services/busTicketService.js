import QRCode from 'qrcode';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusOperator } from '../models/BusOperator.js';
import { BusDriver } from '../../driver/models/BusDriver.js';
import { DhabaOrder } from '../models/DhabaOrder.js';
import { findSchedule, parseIstDateTime, resolveTripWindow } from '../utils/busTime.js';
import { serializeDhabaOrder } from './dhabaService.js';
import { getBusSocketServer } from './busSeatSyncService.js';

/// Passengers can watch the bus from this long before their boarding time.
export const LIVE_TRACKING_LEAD_MINUTES = 60;
/// ...and until this long after the scheduled arrival, to cover delays.
const LIVE_TRACKING_TAIL_MINUTES = 120;

/// Confirmed bookings made before PNRs existed get one the first time their
/// ticket is opened.
export const ensureBookingPnr = async (booking) => {
  if (booking.status === 'confirmed' && !booking.pnr) {
    await booking.save();
  }
  return booking;
};

/// The boarding instant for this passenger: their chosen boarding point's
/// time if it has one, else the bus's departure. A stop clock earlier than
/// the departure clock is on the next day.
export const resolveBoardingAt = (booking, schedule) => {
  const { departureAt } = resolveTripWindow(schedule, booking.travelDate);
  const boardingClock = booking.boardingPoint?.time;
  if (!boardingClock || !departureAt) {
    return departureAt;
  }

  let boardingAt = parseIstDateTime(booking.travelDate, boardingClock);
  if (boardingAt && boardingAt < departureAt) {
    boardingAt = new Date(boardingAt.getTime() + 24 * 60 * 60_000);
  }
  return boardingAt || departureAt;
};

const activeSeatLabels = (booking) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  return (booking.seatIds || [])
    .map((seatId, index) => ({ seatId, label: booking.seatLabels?.[index] || seatId }))
    .filter((item) => !cancelled.has(String(item.seatId)))
    .map((item) => item.label);
};

export const buildBusTicket = async (booking) => {
  if (booking.status !== 'confirmed') {
    throw new ApiError(409, 'A ticket is only issued for confirmed bookings');
  }
  await ensureBookingPnr(booking);

  const busService = await BusService.findById(booking.busServiceId)
    .select('schedules registrationNumber driverName driverPhone')
    .lean();
  const schedule = findSchedule(busService, booking.scheduleId);
  const boardingAt = schedule ? resolveBoardingAt(booking, schedule) : null;
  const seats = activeSeatLabels(booking);

  // Compact, offline-checkable payload for the conductor's scanner.
  const qrText = ['ZIBUS', booking.pnr, booking.travelDate, booking.scheduleId, seats.join('.')].join('|');
  const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 320, errorCorrectionLevel: 'M' });

  const foodOrders = await DhabaOrder.find({
    busBookingId: booking._id,
    status: { $nin: ['awaiting_payment', 'expired'] },
  })
    .populate('dhabaId', 'name address')
    .lean();

  return {
    pnr: booking.pnr,
    bookingId: String(booking._id),
    bookingCode: booking.bookingCode,
    status: booking.status,
    travelDate: booking.travelDate,
    boardingAt,
    seats,
    passenger: {
      name: booking.passenger?.name || '',
      age: booking.passenger?.age || null,
      gender: booking.passenger?.gender || '',
      phone: booking.passenger?.phone || '',
    },
    boardingPoint: booking.boardingPoint || {},
    droppingPoint: booking.droppingPoint || {},
    bus: {
      ...booking.routeSnapshot,
      registrationNumber: busService?.registrationNumber || booking.routeSnapshot?.registrationNumber || '',
      driverName: busService?.driverName || booking.routeSnapshot?.driverName || '',
      driverPhone: busService?.driverPhone || booking.routeSnapshot?.driverPhone || '',
    },
    fare: {
      seats: Number(booking.amount || 0),
      food: Number(booking.foodAmount || 0),
      total: Math.round((Number(booking.amount || 0) + Number(booking.foodAmount || 0)) * 100) / 100,
    },
    foodOrders: foodOrders.map((order) => serializeDhabaOrder(order)),
    qrText,
    qrDataUrl,
    issuedAt: booking.payment?.paidAt || booking.updatedAt || null,
  };
};

/// Live bus position for a passenger, only inside the tracking window.
export const getPassengerLiveTracking = async (booking) => {
  if (booking.status !== 'confirmed') {
    throw new ApiError(409, 'Live tracking is only available for confirmed bookings');
  }

  const busService = await BusService.findById(booking.busServiceId)
    .select('schedules liveTracking registrationNumber driverName driverPhone busName')
    .lean();
  const schedule = findSchedule(busService, booking.scheduleId);
  if (!schedule) {
    throw new ApiError(404, 'Schedule for this booking no longer exists');
  }

  const boardingAt = resolveBoardingAt(booking, schedule);
  const { arrivalAt } = resolveTripWindow(schedule, booking.travelDate);
  const opensAt = boardingAt ? new Date(boardingAt.getTime() - LIVE_TRACKING_LEAD_MINUTES * 60_000) : null;
  const closesAt = arrivalAt ? new Date(arrivalAt.getTime() + LIVE_TRACKING_TAIL_MINUTES * 60_000) : null;
  const now = new Date();

  const base = {
    boardingAt,
    opensAt,
    closesAt,
    bus: {
      busName: busService?.busName || '',
      registrationNumber: busService?.registrationNumber || '',
      driverName: busService?.driverName || '',
      driverPhone: busService?.driverPhone || '',
    },
  };

  if (!opensAt || now < opensAt) {
    return { ...base, state: 'not_yet_open', available: false };
  }
  if (closesAt && now > closesAt) {
    return { ...base, state: 'closed', available: false };
  }

  const live = busService?.liveTracking || {};
  const sameRun = String(live.scheduleId || '') === String(booking.scheduleId) &&
    String(live.travelDate || '') === String(booking.travelDate);

  if (!sameRun || !['in_progress', 'paused'].includes(String(live.status || ''))) {
    return { ...base, state: 'waiting_for_bus', available: true, location: null };
  }

  return {
    ...base,
    state: live.status === 'paused' ? 'paused' : 'live',
    available: true,
    location: live.currentLocation
      ? {
          lat: Number(live.currentLocation.lat),
          lng: Number(live.currentLocation.lng),
          heading: live.currentLocation.heading ?? null,
          speedKmph: live.currentLocation.speedKmph ?? null,
          recordedAt: live.currentLocation.recordedAt || live.lastUpdatedAt || null,
        }
      : null,
    recentPath: (Array.isArray(live.recentPath) ? live.recentPath : [])
      .slice(-60)
      .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) })),
    lastUpdatedAt: live.lastUpdatedAt || null,
  };
};

/// Conductor / owner / admin checks a ticket by PNR.
export const verifyTicketByPnr = async ({ pnr, role, actorId }) => {
  const normalized = String(pnr || '').trim().toUpperCase();
  if (!normalized) {
    throw new ApiError(400, 'PNR is required');
  }

  const booking = await BusBooking.findOne({ pnr: normalized });
  if (!booking) {
    throw new ApiError(404, 'No ticket with this PNR');
  }

  const busService = await BusService.findById(booking.busServiceId).select('busDriverId ownerId operatorId busName').lean();
  await assertCrewAccess(busService, role, actorId);
  return serializeCheckedTicket(booking, busService);
};

/// Who may check tickets on a bus: its assigned bus driver, its owner (or any
/// owner account of its company), or an admin.
const assertCrewAccess = async (busService, role, actorId) => {
  if (role === 'admin') return;
  if (role === 'bus_driver') {
    if (String(busService?.busDriverId || '') === String(actorId)) return;
    // The driver app links a driver to a bus from the driver side too.
    if (busService?._id && await BusDriver.exists({ _id: actorId, assignedBusServiceId: busService._id })) return;
  }
  if (role === 'owner') {
    if (String(busService?.ownerId || '') === String(actorId)) return;
    if (busService?.operatorId && await BusOperator.exists({ _id: busService.operatorId, ownerIds: actorId })) return;
  }
  throw new ApiError(403, 'This ticket is for a bus you do not operate');
};

const serializeCheckedTicket = (booking, busService) => ({
  valid: booking.status === 'confirmed',
  boardedAt: booking.boarding?.boardedAt || null,
  pnr: booking.pnr,
  status: booking.status,
  travelDate: booking.travelDate,
  scheduleId: booking.scheduleId,
  busName: busService?.busName || booking.routeSnapshot?.busName || '',
  seats: activeSeatLabels(booking),
  passengerName: booking.passenger?.name || '',
  passengerPhone: booking.passenger?.phone || '',
  boardingPoint: booking.boardingPoint?.pointName || booking.boardingPoint?.city || '',
  droppingPoint: booking.droppingPoint?.pointName || booking.droppingPoint?.city || '',
  source: booking.bookingSource,
  channel: booking.channel?.name || '',
});

/// Conductor checks a passenger in. Refuses tickets for another run or day,
/// so a ticket can't be reused on a later trip; checking in twice is harmless.
export const boardTicketByPnr = async ({ pnr, role, actorId, scheduleId, travelDate }) => {
  const normalized = String(pnr || '').trim().toUpperCase();
  const booking = await BusBooking.findOne({ pnr: normalized });
  if (!booking) {
    throw new ApiError(404, 'No ticket with this PNR');
  }

  const busService = await BusService.findById(booking.busServiceId).select('busDriverId ownerId operatorId busName').lean();
  await assertCrewAccess(busService, role, actorId);

  if (booking.status !== 'confirmed') {
    throw new ApiError(409, `This ticket is ${booking.status}`);
  }
  if ((scheduleId && booking.scheduleId !== scheduleId) || (travelDate && booking.travelDate !== travelDate)) {
    throw new ApiError(409, `This ticket is for ${booking.travelDate}, not this trip`);
  }

  if (!booking.boarding?.boardedAt) {
    booking.boarding = { boardedAt: new Date(), boardedBy: `${role}:${actorId}` };
    await booking.save();
  }
  return serializeCheckedTicket(booking, busService);
};

/// Passenger list for the crew's own bus on one run, with check-in state.
export const getCrewManifest = async ({ role, actorId, busServiceId, scheduleId, travelDate }) => {
  let filter = { _id: busServiceId };
  if (role === 'bus_driver') {
    const driver = await BusDriver.findById(actorId).select('assignedBusServiceId').lean();
    filter = driver?.assignedBusServiceId ? { _id: driver.assignedBusServiceId } : { busDriverId: actorId };
  }
  const busService = await BusService.findOne(filter).select('busDriverId ownerId operatorId busName schedules').lean();
  if (!busService) {
    throw new ApiError(404, 'No bus assigned');
  }
  await assertCrewAccess(busService, role, actorId);

  const schedule = scheduleId ? findSchedule(busService, scheduleId) : (busService.schedules || [])[0];
  if (!schedule || !/^\d{4}-\d{2}-\d{2}$/.test(String(travelDate || ''))) {
    throw new ApiError(400, 'scheduleId and travelDate are required');
  }

  const bookings = await BusBooking.find({
    busServiceId: busService._id,
    scheduleId: schedule.id,
    travelDate,
    status: 'confirmed',
  }).sort({ 'boardingPoint.time': 1, createdAt: 1 });

  const passengers = bookings.map((booking) => serializeCheckedTicket(booking, busService));
  return {
    busServiceId: String(busService._id),
    busName: busService.busName,
    scheduleId: schedule.id,
    departureTime: schedule.departureTime,
    travelDate,
    schedules: (busService.schedules || []).map((item) => ({ id: item.id, label: item.label || '', departureTime: item.departureTime })),
    totals: {
      tickets: passengers.length,
      seats: passengers.reduce((sum, item) => sum + item.seats.length, 0),
      boardedSeats: passengers.filter((item) => item.boardedAt).reduce((sum, item) => sum + item.seats.length, 0),
    },
    passengers,
  };
};

export const BUS_LIVE_EVENTS = Object.freeze({
  TRACK: 'bus:track',
  UNTRACK: 'bus:untrack',
  LOCATION: 'bus:live:location',
});

export const getBusLiveRoom = (busServiceId, scheduleId, travelDate) =>
  `bus-live:${String(busServiceId)}:${String(scheduleId)}:${String(travelDate)}`;

/// Called after the bus driver's app reports a position or changes the trip
/// state: every passenger watching that run gets it at once. Passengers only
/// get into the room through the tracking-window check in the socket handler.
export const publishBusLiveLocation = (busService) => {
  const live = busService?.liveTracking || {};
  const io = getBusSocketServer();
  if (!io || !live.scheduleId || !live.travelDate) {
    return;
  }

  io.to(getBusLiveRoom(busService._id, live.scheduleId, live.travelDate)).emit(BUS_LIVE_EVENTS.LOCATION, {
    busServiceId: String(busService._id),
    scheduleId: live.scheduleId,
    travelDate: live.travelDate,
    state: live.status === 'paused' ? 'paused' : live.status === 'in_progress' ? 'live' : 'waiting_for_bus',
    location: live.currentLocation?.lat != null
      ? {
          lat: Number(live.currentLocation.lat),
          lng: Number(live.currentLocation.lng),
          heading: live.currentLocation.heading ?? null,
          speedKmph: live.currentLocation.speedKmph ?? null,
        }
      : null,
    lastUpdatedAt: live.lastUpdatedAt || new Date(),
  });
};
