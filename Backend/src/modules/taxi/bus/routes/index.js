import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { createRateLimitMiddleware, loginRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import {
  adminCreateChannel,
  adminCreateDhaba,
  adminDeleteDhaba,
  adminListChannelEvents,
  adminListChannels,
  adminListDhabaOrders,
  adminListDhabas,
  adminRotateChannelKey,
  adminTripInventory,
  adminUpdateChannel,
  adminUpdateDhaba,
} from '../controllers/busAdminController.js';
import {
  channelCancelBooking,
  channelConfirmBooking,
  channelCreateBooking,
  channelGetBooking,
  channelInventory,
  channelListBuses,
} from '../controllers/busChannelController.js';
import {
  addMenuItem,
  changeMyOrderStatus,
  deleteMenuItem,
  getMyDhaba,
  getMyOrderSummary,
  listMyMenu,
  listMyOrders,
  loginDhaba,
  saveMyDhabaPushToken,
  updateMenuItem,
  updateMyDhaba,
} from '../controllers/dhabaController.js';
import {
  getMyBusLiveTracking,
  getMyBusTicket,
  listTripDhabas,
  verifyBusTicket,
} from '../controllers/busPassengerController.js';
import { authenticateChannel } from '../services/busChannelService.js';

export const busModuleRouter = Router();

// Passenger (ZI Bus app)
const asUser = authenticate(['user']);
busModuleRouter.get('/users/buses/:id/dhabas', asUser, asyncHandler(listTripDhabas));
busModuleRouter.get('/users/bus-bookings/:id/ticket', asUser, asyncHandler(getMyBusTicket));
busModuleRouter.get('/users/bus-bookings/:id/live', asUser, asyncHandler(getMyBusLiveTracking));

// Conductor / operator / admin ticket check
busModuleRouter.get(
  '/bus-tickets/verify/:pnr',
  authenticate(['bus_driver', 'owner', 'admin']),
  asyncHandler(verifyBusTicket),
);

// Dhaba partner panel
const asDhaba = authenticate(['dhaba']);
busModuleRouter.post('/dhaba/login', loginRateLimit, asyncHandler(loginDhaba));
busModuleRouter.get('/dhaba/me', asDhaba, asyncHandler(getMyDhaba));
busModuleRouter.patch('/dhaba/me', asDhaba, asyncHandler(updateMyDhaba));
busModuleRouter.post('/dhaba/me/push-token', asDhaba, asyncHandler(saveMyDhabaPushToken));
busModuleRouter.get('/dhaba/menu', asDhaba, asyncHandler(listMyMenu));
busModuleRouter.post('/dhaba/menu', asDhaba, asyncHandler(addMenuItem));
busModuleRouter.patch('/dhaba/menu/:itemId', asDhaba, asyncHandler(updateMenuItem));
busModuleRouter.delete('/dhaba/menu/:itemId', asDhaba, asyncHandler(deleteMenuItem));
busModuleRouter.get('/dhaba/orders', asDhaba, asyncHandler(listMyOrders));
busModuleRouter.get('/dhaba/orders/summary', asDhaba, asyncHandler(getMyOrderSummary));
busModuleRouter.patch('/dhaba/orders/:id/status', asDhaba, asyncHandler(changeMyOrderStatus));

// Admin
const asAdmin = authenticate(['admin']);
busModuleRouter.get('/admin/zibus/dhabas', asAdmin, asyncHandler(adminListDhabas));
busModuleRouter.post('/admin/zibus/dhabas', asAdmin, asyncHandler(adminCreateDhaba));
busModuleRouter.patch('/admin/zibus/dhabas/:id', asAdmin, asyncHandler(adminUpdateDhaba));
busModuleRouter.delete('/admin/zibus/dhabas/:id', asAdmin, asyncHandler(adminDeleteDhaba));
busModuleRouter.get('/admin/zibus/dhaba-orders', asAdmin, asyncHandler(adminListDhabaOrders));
busModuleRouter.get('/admin/zibus/channels', asAdmin, asyncHandler(adminListChannels));
busModuleRouter.post('/admin/zibus/channels', asAdmin, asyncHandler(adminCreateChannel));
busModuleRouter.patch('/admin/zibus/channels/:id', asAdmin, asyncHandler(adminUpdateChannel));
busModuleRouter.post('/admin/zibus/channels/:id/rotate-key', asAdmin, asyncHandler(adminRotateChannelKey));
busModuleRouter.get('/admin/zibus/channels/:id/events', asAdmin, asyncHandler(adminListChannelEvents));
busModuleRouter.get('/admin/zibus/inventory', asAdmin, asyncHandler(adminTripInventory));

// Channel API for connected booking platforms / operator systems
const channelApi = Router();
const channelRateLimit = createRateLimitMiddleware({
  scope: 'bus_channel_api',
  max: 600,
  windowMs: 60 * 1000,
  modes: ['ip'],
  message: 'Too many channel API requests. Slow down and retry.',
});
channelApi.use(channelRateLimit, authenticateChannel);
channelApi.get('/buses', asyncHandler(channelListBuses));
channelApi.get('/inventory', asyncHandler(channelInventory));
channelApi.post('/bookings', asyncHandler(channelCreateBooking));
channelApi.get('/bookings/:externalRef', asyncHandler(channelGetBooking));
channelApi.post('/bookings/:externalRef/confirm', asyncHandler(channelConfirmBooking));
channelApi.post('/bookings/:externalRef/cancel', asyncHandler(channelCancelBooking));
busModuleRouter.use('/bus-channel/v1', channelApi);
