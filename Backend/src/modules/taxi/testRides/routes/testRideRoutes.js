import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { enforceAdminReadOnly } from '../../middlewares/adminReadOnlyMiddleware.js';
import * as tests from '../services/testRideService.js';
import { Admin } from '../../admin/models/Admin.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });

/// Admin > Driver Management > Test Rides.
export const testRideRouter = Router();

const admin = [authenticate(['admin']), enforceAdminReadOnly()];
testRideRouter.get('/admin/test-rides/candidates', admin, asyncHandler(async (req, res) => ok(res, await tests.listTestCandidates(req.query))));
testRideRouter.get('/admin/test-rides', admin, asyncHandler(async (_req, res) => ok(res, await tests.listTestRides())));
testRideRouter.get('/admin/test-rides/:id', admin, asyncHandler(async (req, res) => ok(res, await tests.getTestRide(req.params.id))));
// Every send is logged with the admin who sent it.
testRideRouter.post('/admin/test-rides', admin, asyncHandler(async (req, res) => {
  const sender = await Admin.findById(req.auth?.sub).select('name email').lean().catch(() => null);
  ok(res, await tests.sendTestRide({
    admin: { id: req.auth?.sub, name: sender?.name || sender?.email || '' },
    body: req.body,
  }), 'Test ride sent');
}));
