import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { listDhabasForTrip } from '../services/dhabaService.js';
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
