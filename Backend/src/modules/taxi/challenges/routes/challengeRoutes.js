import { Router } from 'express';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { uploadDataUrl } from '../../../../utils/fileUpload.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { enforceAdminReadOnly } from '../../middlewares/adminReadOnlyMiddleware.js';
import * as challengeService from '../services/challengeService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });

export const challengeRouter = Router();

// Uploads are stored as '/uploads/...' when no public backend URL is set; the
// driver app needs a full URL.
const absoluteUrl = (req, url) => {
  if (!url || /^https?:\/\//i.test(url)) return url;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}${url.startsWith('/') ? '' : '/'}${url}`;
};
const withAbsoluteBanner = (req, view) => ({ ...view, bannerImage: absoluteUrl(req, view.bannerImage) });

// Driver
const driver = authenticate(['driver']);
challengeRouter.get('/drivers/challenges', driver, asyncHandler(async (req, res) =>
  ok(res, (await challengeService.listDriverChallenges(req.auth.sub)).map((view) => withAbsoluteBanner(req, view)))));
challengeRouter.get('/drivers/challenges/:id', driver, asyncHandler(async (req, res) =>
  ok(res, withAbsoluteBanner(req, await challengeService.getDriverChallenge(req.auth.sub, req.params.id)))));
challengeRouter.post('/drivers/challenges/:id/claim', driver, asyncHandler(async (req, res) =>
  ok(res, withAbsoluteBanner(req, await challengeService.claimDriverChallenge(req.auth.sub, req.params.id)), 'Reward claimed')));

// Admin
const admin = [authenticate(['admin']), enforceAdminReadOnly()];
challengeRouter.get('/admin/driver-challenges', admin, asyncHandler(async (_req, res) =>
  ok(res, await challengeService.listChallenges())));
challengeRouter.post('/admin/driver-challenges', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.createChallenge(req.body), 'Challenge created')));
challengeRouter.patch('/admin/driver-challenges/:id', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.updateChallenge(req.params.id, req.body), 'Challenge updated')));
challengeRouter.delete('/admin/driver-challenges/:id', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.deleteChallenge(req.params.id), 'Challenge removed')));
challengeRouter.post('/admin/driver-challenges/upload-banner', admin, asyncHandler(async (req, res) => {
  if (!req.body?.image) throw new ApiError(400, 'Image data is required');
  const result = await uploadDataUrl({ dataUrl: req.body.image, publicIdPrefix: 'driver-challenge' });
  ok(res, { url: absoluteUrl(req, result.secureUrl) }, 'Banner uploaded');
}));
challengeRouter.get('/admin/driver-challenges/:id/progress', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.listChallengeProgress(req.params.id, req.query))));
challengeRouter.patch('/admin/driver-challenges/:id/progress/:progressId', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.decideChallengeReward(req.params.id, req.params.progressId, req.body), 'Updated')));
challengeRouter.get('/admin/driver-activity', admin, asyncHandler(async (req, res) =>
  ok(res, await challengeService.listDriverActivity(req.query))));
