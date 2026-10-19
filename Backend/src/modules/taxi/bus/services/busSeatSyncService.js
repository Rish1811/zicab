import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusSeatHold } from '../../user/models/BusSeatHold.js';
import { flattenBlueprintSeats } from '../utils/busTime.js';

// One place that knows the live state of every seat on a scheduled run, and
// tells everyone who cares when it changes: riders looking at the seat map
// (socket room per run) and connected channels (via registered listeners -
// see busChannelService).
//
// Double booking is prevented one level down, by the unique
// (bus, schedule, date, seat) index on BusSeatHold: every sale, from any
// source, has to insert a hold row first, and the database lets only one win.

export const BUS_SEAT_EVENTS = Object.freeze({
  WATCH: 'bus:watch',
  UNWATCH: 'bus:unwatch',
  SEATS_UPDATED: 'bus:seats:updated',
});

let ioInstance = null;
const seatChangeListeners = new Set();

export const setBusSeatSocketServer = (io) => {
  ioInstance = io;
};

export const getBusSocketServer = () => ioInstance;

export const onBusSeatChange = (listener) => {
  seatChangeListeners.add(listener);
  return () => seatChangeListeners.delete(listener);
};

export const getBusTripRoom = (busServiceId, scheduleId, travelDate) =>
  `bus-trip:${String(busServiceId)}:${String(scheduleId)}:${String(travelDate)}`;

export const getTripSeatSnapshot = async ({ busServiceId, scheduleId, travelDate, busService = null }) => {
  const service = busService || await BusService.findById(busServiceId).select('blueprint').lean();
  const seats = flattenBlueprintSeats(service?.blueprint || {});
  const blockedSeatIds = seats
    .filter((seat) => String(seat.status || 'available') === 'blocked')
    .map((seat) => String(seat.id));

  const holds = await BusSeatHold.find({
    busServiceId,
    scheduleId,
    travelDate,
    status: { $in: ['held', 'booked'] },
  })
    .select('seatId status source expiresAt')
    .lean();

  const now = Date.now();
  const bookedSeatIds = [];
  const heldSeatIds = [];
  holds.forEach((hold) => {
    if (hold.status === 'booked') {
      bookedSeatIds.push(String(hold.seatId));
    } else if (!hold.expiresAt || new Date(hold.expiresAt).getTime() > now) {
      heldSeatIds.push(String(hold.seatId));
    }
  });

  const unavailable = new Set([...blockedSeatIds, ...bookedSeatIds, ...heldSeatIds]);
  return {
    busServiceId: String(busServiceId),
    scheduleId: String(scheduleId),
    travelDate: String(travelDate),
    totalSeats: seats.length,
    bookedSeatIds,
    heldSeatIds,
    blockedSeatIds,
    // What a rider's seat map should grey out.
    unavailableSeatIds: [...unavailable],
    bookedCount: bookedSeatIds.length,
    heldCount: heldSeatIds.length,
    availableSeats: Math.max(0, seats.length - unavailable.size),
    updatedAt: new Date().toISOString(),
  };
};

/// Call after any change to a run's seat holds. Never throws: a failed
/// broadcast must not undo a sale that already succeeded.
export const publishBusSeatChange = ({
  busServiceId,
  scheduleId,
  travelDate,
  change = 'updated',
  seatIds = [],
  bookingId = null,
  sourceChannelId = null,
}) => {
  if (!busServiceId || !scheduleId || !travelDate) {
    return;
  }

  (async () => {
    const snapshot = await getTripSeatSnapshot({ busServiceId, scheduleId, travelDate });

    if (ioInstance) {
      ioInstance.to(getBusTripRoom(busServiceId, scheduleId, travelDate)).emit(BUS_SEAT_EVENTS.SEATS_UPDATED, {
        ...snapshot,
        change,
        seatIds: seatIds.map(String),
      });
    }

    for (const listener of seatChangeListeners) {
      try {
        await listener({
          busServiceId: String(busServiceId),
          scheduleId: String(scheduleId),
          travelDate: String(travelDate),
          change,
          seatIds: seatIds.map(String),
          bookingId: bookingId ? String(bookingId) : '',
          sourceChannelId: sourceChannelId ? String(sourceChannelId) : '',
          snapshot,
        });
      } catch (error) {
        console.error('[bus-seat-sync] listener failed', error.message);
      }
    }
  })().catch((error) => {
    console.error('[bus-seat-sync] publish failed', error.message);
  });
};

/// Publishes one change per distinct run found in a list of hold rows.
export const publishForHolds = (holds = [], change, extra = {}) => {
  const byTrip = new Map();
  holds.forEach((hold) => {
    const key = getBusTripRoom(hold.busServiceId, hold.scheduleId, hold.travelDate);
    const entry = byTrip.get(key) || {
      busServiceId: hold.busServiceId,
      scheduleId: hold.scheduleId,
      travelDate: hold.travelDate,
      seatIds: [],
    };
    entry.seatIds.push(String(hold.seatId));
    byTrip.set(key, entry);
  });

  byTrip.forEach((trip) => publishBusSeatChange({ ...trip, change, ...extra }));
};

const expiryHooks = new Set();

/// Lets other parts of the bus module react to unpaid bookings expiring
/// (dhaba orders tied to them are dropped).
export const onBusBookingsExpired = (hook) => {
  expiryHooks.add(hook);
};

/// Frees seats whose payment window ran out, marks their bookings expired and
/// tells everyone. Safe to run from several instances at once - every step is
/// an idempotent update.
export const releaseExpiredBusHolds = async () => {
  const now = new Date();

  const expiredBookings = await BusBooking.find({ status: 'pending', expiresAt: { $lte: now } })
    .select('_id')
    .lean();
  const bookingIds = expiredBookings.map((item) => item._id);

  if (bookingIds.length > 0) {
    await BusBooking.updateMany(
      { _id: { $in: bookingIds }, status: 'pending' },
      { $set: { status: 'expired', 'payment.status': 'expired' } },
    );
    for (const hook of expiryHooks) {
      try {
        await hook(bookingIds);
      } catch (error) {
        console.error('[bus-seat-sync] expiry hook failed', error.message);
      }
    }
  }

  const expiredHolds = await BusSeatHold.find({ status: 'held', expiresAt: { $lte: now } })
    .select('_id busServiceId scheduleId travelDate seatId')
    .lean();

  if (expiredHolds.length > 0) {
    await BusSeatHold.deleteMany({
      _id: { $in: expiredHolds.map((hold) => hold._id) },
      status: 'held',
    });
    publishForHolds(expiredHolds, 'released');
  }

  return { expiredBookings: bookingIds.length, releasedSeats: expiredHolds.length };
};

let sweeperTimer = null;

/// Without this, an abandoned checkout only frees its seats when the next
/// rider happens to open a seat map. The sweeper makes the release (and the
/// broadcast to every open seat map and channel) happen on time.
export const startBusHoldSweeper = (intervalMs = 30_000) => {
  if (sweeperTimer) {
    return;
  }

  sweeperTimer = setInterval(() => {
    releaseExpiredBusHolds().catch((error) => {
      console.error('[bus-seat-sync] sweeper failed', error.message);
    });
  }, intervalMs);
  sweeperTimer.unref?.();
};
