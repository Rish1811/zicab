import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { enforceAdminReadOnly } from '../../middlewares/adminReadOnlyMiddleware.js';
import * as hours from '../services/driverHoursService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });

/// Admin > Drivers > Driver Hours.
export const driverHoursRouter = Router();

const admin = [authenticate(['admin']), enforceAdminReadOnly()];
driverHoursRouter.get('/admin/driver-hours/live', admin, asyncHandler(async (req, res) => ok(res, await hours.getLiveBoard(req.query))));
driverHoursRouter.get('/admin/driver-hours/report', admin, asyncHandler(async (req, res) => ok(res, await hours.getHoursReport(req.query))));
driverHoursRouter.get('/admin/driver-hours/attendance', admin, asyncHandler(async (req, res) => ok(res, await hours.getAttendance(req.query))));
driverHoursRouter.get('/admin/driver-hours/alerts', admin, asyncHandler(async (req, res) => ok(res, await hours.getAlerts(req.query))));
driverHoursRouter.get('/admin/driver-hours/heatmap', admin, asyncHandler(async (req, res) => ok(res, await hours.getHeatmap(req.query))));
driverHoursRouter.get('/admin/driver-hours/drivers/:id', admin, asyncHandler(async (req, res) => ok(res, await hours.getDriverDetail(req.params.id, req.query))));
driverHoursRouter.get('/admin/driver-hours/drivers/:id/route', admin, asyncHandler(async (req, res) => ok(res, await hours.getDriverRoute(req.params.id, req.query))));
driverHoursRouter.post('/admin/driver-hours/drivers/:id/force-offline', admin, asyncHandler(async (req, res) => ok(res, await hours.forceOffline(req.params.id), 'Driver set offline')));
