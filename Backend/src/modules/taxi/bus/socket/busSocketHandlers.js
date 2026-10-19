import mongoose from 'mongoose';
import { BUS_SEAT_EVENTS, getBusTripRoom, getTripSeatSnapshot } from '../services/busSeatSyncService.js';
import { getDhabaRoom } from '../services/dhabaService.js';

/// Socket wiring for ZI Bus:
///  - anyone looking at a seat map joins that run's room and gets every
///    seat change live (including seats sold on other platforms);
///  - a logged-in dhaba joins its own room for order alerts.
export const registerBusSocketHandlers = ({ socket, onAsync }) => {
  const identity = socket.auth || {};

  if (identity.role === 'dhaba' && identity.sub) {
    socket.join(getDhabaRoom(identity.sub));
  }

  socket.on(
    BUS_SEAT_EVENTS.WATCH,
    onAsync(socket, async ({ busServiceId, scheduleId, travelDate } = {}) => {
      if (
        !mongoose.isValidObjectId(busServiceId) ||
        !scheduleId ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(travelDate || ''))
      ) {
        return;
      }

      // One seat map at a time per connection.
      if (socket.data.busTripRoom) {
        socket.leave(socket.data.busTripRoom);
      }
      const room = getBusTripRoom(busServiceId, scheduleId, travelDate);
      socket.data.busTripRoom = room;
      socket.join(room);

      // Close the gap between the REST seat-map load and joining the room.
      const snapshot = await getTripSeatSnapshot({ busServiceId, scheduleId, travelDate });
      socket.emit(BUS_SEAT_EVENTS.SEATS_UPDATED, { ...snapshot, change: 'snapshot', seatIds: [] });
    }),
  );

  socket.on(BUS_SEAT_EVENTS.UNWATCH, () => {
    if (socket.data.busTripRoom) {
      socket.leave(socket.data.busTripRoom);
      socket.data.busTripRoom = null;
    }
  });
};
