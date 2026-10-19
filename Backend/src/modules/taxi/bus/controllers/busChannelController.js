import {
  cancelChannelBooking,
  confirmChannelBooking,
  createChannelBooking,
  getChannelBooking,
  getChannelInventory,
  listChannelBuses,
  serializeChannelBooking,
} from '../services/busChannelService.js';

// Public API for connected booking channels. Authenticated by X-Api-Key
// (see authenticateChannel); every response is JSON { success, data }.

export const channelListBuses = async (req, res) => {
  res.json({ success: true, data: await listChannelBuses(req.channel) });
};

export const channelInventory = async (req, res) => {
  res.json({ success: true, data: await getChannelInventory(req.channel, req.query || {}) });
};

export const channelCreateBooking = async (req, res) => {
  const { booking, replayed } = await createChannelBooking(req.channel, req.body || {});
  res.status(replayed ? 200 : 201).json({ success: true, data: serializeChannelBooking(booking), replayed });
};

export const channelGetBooking = async (req, res) => {
  res.json({ success: true, data: serializeChannelBooking(await getChannelBooking(req.channel, req.params.externalRef)) });
};

export const channelConfirmBooking = async (req, res) => {
  const booking = await confirmChannelBooking(req.channel, req.params.externalRef, req.body || {});
  res.json({ success: true, data: serializeChannelBooking(booking) });
};

export const channelCancelBooking = async (req, res) => {
  const booking = await cancelChannelBooking(req.channel, req.params.externalRef, req.body || {});
  res.json({ success: true, data: serializeChannelBooking(booking) });
};
