import { Router } from 'express';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { uploadDataUrl } from '../../../../utils/fileUpload.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { enforceAdminReadOnly } from '../../middlewares/adminReadOnlyMiddleware.js';
import * as rewardService from '../services/rewardService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });

export const rewardRouter = Router();

// Uploads are stored as '/uploads/...' when no public backend URL is
// configured. The admin panel is same-origin, but the mobile app needs a full URL.
const absoluteUrl = (req, url) => {
  if (!url || /^https?:\/\//i.test(url)) return url;
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Rider
const user = authenticate(['user']);
const sendRewards = (audience) => asyncHandler(async (req, res) => {
  const data = await rewardService.getUserRewards(req.auth.sub, audience);
  data.levels.forEach((level) => { level.image = absoluteUrl(req, level.image); });
  if (data.nextReward) data.nextReward.image = absoluteUrl(req, data.nextReward.image);
  ok(res, data);
});
rewardRouter.get('/users/rewards', user, sendRewards('user'));
rewardRouter.post('/users/rewards/:id/claim', user, asyncHandler(async (req, res) =>
  ok(res, await rewardService.claimReward(req.auth.sub, req.params.id, req.body, 'user'), 'Claim request sent')));

// Driver - same ladder and claims, no cashback.
const driver = authenticate(['driver']);
rewardRouter.get('/drivers/rewards', driver, sendRewards('driver'));
rewardRouter.post('/drivers/rewards/:id/claim', driver, asyncHandler(async (req, res) =>
  ok(res, await rewardService.claimReward(req.auth.sub, req.params.id, req.body, 'driver'), 'Claim request sent')));

// Admin (Referral Management)
const admin = [authenticate(['admin']), enforceAdminReadOnly()];
rewardRouter.get('/admin/rewards/settings', admin, asyncHandler(async (_req, res) =>
  ok(res, await rewardService.getRewardSettings())));
rewardRouter.patch('/admin/rewards/settings', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.updateRewardSettings(req.body), 'Settings updated')));

rewardRouter.get('/admin/rewards/levels', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.listRewardLevels(req.query))));
rewardRouter.post('/admin/rewards/levels', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.createRewardLevel(req.body), 'Reward created')));
rewardRouter.patch('/admin/rewards/levels/:id', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.updateRewardLevel(req.params.id, req.body), 'Reward updated')));
rewardRouter.delete('/admin/rewards/levels/:id', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.deleteRewardLevel(req.params.id), 'Reward deleted')));
rewardRouter.post('/admin/rewards/upload-image', admin, asyncHandler(async (req, res) => {
  if (!req.body?.image) throw new ApiError(400, 'Image data is required');
  const result = await uploadDataUrl({ dataUrl: req.body.image, publicIdPrefix: 'reward' });
  ok(res, { url: result.secureUrl }, 'Image uploaded');
}));

rewardRouter.get('/admin/rewards/claims', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.listRewardClaims(req.query))));
rewardRouter.patch('/admin/rewards/claims/:id', admin, asyncHandler(async (req, res) =>
  ok(res, await rewardService.updateRewardClaim(req.params.id, req.body), 'Claim updated')));
