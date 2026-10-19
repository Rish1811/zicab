import mongoose from 'mongoose';
import { BUS_SEAT_EVENTS, getBusTripRoom, getTripSeatSnapshot } from '../services/busSeatSyncService.js';
import { getDhabaRoom } from '../services/dhabaService.js';
import { BUS_LIVE_EVENTS, getBusLiveRoom, getPassengerLiveTracking } from '../services/busTicketService.js';
import { BusBooking } from '../../user/models/BusBooking.js';

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

  // Passenger opens live tracking for one of their own tickets. Joining is
  // allowed only inside the tracking window (1h before boarding onwards).
  socket.on(
    BUS_LIVE_EVENTS.TRACK,
    onAsync(socket, async ({ bookingId } = {}) => {
      if (identity.role !== 'user' || !mongoose.isValidObjectId(bookingId)) {
        return;
      }

      const booking = await BusBooking.findOne({ _id: bookingId, userId: identity.sub });
      if (!booking) {
        return;
      }

      const tracking = await getPassengerLiveTracking(booking);
      if (socket.data.busLiveRoom) {
        socket.leave(socket.data.busLiveRoom);
        socket.data.busLiveRoom = null;
      }
      if (tracking.available) {
        socket.data.busLiveRoom = getBusLiveRoom(booking.busServiceId, booking.scheduleId, booking.travelDate);
        socket.join(socket.data.busLiveRoom);
      }
      socket.emit(BUS_LIVE_EVENTS.LOCATION, {
        busServiceId: String(booking.busServiceId),
        scheduleId: booking.scheduleId,
        travelDate: booking.travelDate,
        ...tracking,
      });
    }),
  );

  socket.on(BUS_LIVE_EVENTS.UNTRACK, () => {
    if (socket.data.busLiveRoom) {
      socket.leave(socket.data.busLiveRoom);
      socket.data.busLiveRoom = null;
    }
  });

  socket.on(BUS_SEAT_EVENTS.UNWATCH, () => {
    if (socket.data.busTripRoom) {
      socket.leave(socket.data.busTripRoom);
      socket.data.busTripRoom = null;
    }
  });
};
