import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { enforceAdminReadOnly } from '../../middlewares/adminReadOnlyMiddleware.js';
import * as onMyWay from '../services/onMyWayService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });

/// Ride On My Way: the driver app's destination mode, and its admin settings.
export const onMyWayRouter = Router();

const driver = authenticate(['driver']);
onMyWayRouter.get('/drivers/on-my-way', driver, asyncHandler(async (req, res) => ok(res, await onMyWay.getDriverOnMyWay(req.auth.sub))));
onMyWayRouter.post('/drivers/on-my-way', driver, asyncHandler(async (req, res) => ok(res, await onMyWay.startDriverOnMyWay(req.auth.sub, req.body), 'Ride On My Way is on')));
onMyWayRouter.delete('/drivers/on-my-way', driver, asyncHandler(async (req, res) => {
  await onMyWay.stopDriverOnMyWay(req.auth.sub, 'driver');
  ok(res, await onMyWay.getDriverOnMyWay(req.auth.sub), 'Ride On My Way is off');
}));
onMyWayRouter.put('/drivers/on-my-way/home', driver, asyncHandler(async (req, res) => ok(res, await onMyWay.saveDriverOnMyWayHome(req.auth.sub, req.body), 'Home saved')));
onMyWayRouter.patch('/drivers/on-my-way/home', driver, asyncHandler(async (req, res) => ok(res, await onMyWay.saveDriverOnMyWayHome(req.auth.sub, req.body), 'Home saved')));

const admin = [authenticate(['admin']), enforceAdminReadOnly()];
onMyWayRouter.get('/admin/on-my-way/settings', admin, asyncHandler(async (_req, res) => ok(res, await onMyWay.getOnMyWaySettings({ fresh: true }))));
onMyWayRouter.patch('/admin/on-my-way/settings', admin, asyncHandler(async (req, res) => ok(res, await onMyWay.updateOnMyWaySettings(req.body), 'Settings saved')));
