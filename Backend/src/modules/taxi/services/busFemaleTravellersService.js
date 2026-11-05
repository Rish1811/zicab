import { BusBooking } from '../user/models/BusBooking.js';
import { getTransportRideSettings } from './transportSettingsService.js';

// Never lower: a small count could point to a particular passenger.
const LOWEST_MINIMUM = 3;

const isFemale = (gender) => String(gender || '').trim().toLowerCase() === 'female';

/// Women on a booking's seats that are still active. Bookings with only a lead
/// passenger (older ones, and those made by an operator) count just that person.
export const countFemaleSeats = (booking = {}) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  const activeSeats = (booking.seatIds || []).map(String).filter((seatId) => !cancelled.has(seatId));
  if (activeSeats.length === 0) {
    return 0;
  }

  const passengers = booking.passengers || [];
  if (passengers.length > 0) {
    return passengers.filter((item) => activeSeats.includes(String(item.seatId)) && isFemale(item.gender)).length;
  }
  return isFemale(booking.passenger?.gender) ? 1 : 0;
};

const femaleSeatIds = (booking = {}) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  const passengers = booking.passengers || [];
  // Bookings with one recorded passenger: that passenger stands for every seat.
  const genderOf = (seatId) =>
    passengers.find((item) => String(item.seatId) === seatId)?.gender ?? booking.passenger?.gender;

  return (booking.seatIds || [])
    .map(String)
    .filter((seatId) => !cancelled.has(seatId) && isFemale(genderOf(seatId)));
};

/// The seats directly beside a seat already taken by a woman on this trip: only a
/// woman can book those. An all-aisle gap between two seats breaks the link, and
/// neither a cancelled booking nor a lapsed unpaid one counts. A rider's own
/// bookings are skipped so people travelling together can sit side by side.
export const getLadiesNeighbourSeatIds = async ({ busService, scheduleId, travelDate, bookedByUserId = null }) => {
  const neighbours = new Set();

  try {
    const settings = await getTransportRideSettings();
    if (String(settings?.enable_bus_ladies_neighbour_rule ?? '1') !== '1') {
      return neighbours;
    }

    const bookings = await BusBooking.find({
      busServiceId: busService._id,
      scheduleId,
      travelDate,
      $or: [{ status: 'confirmed' }, { status: 'pending', expiresAt: { $gt: new Date() } }],
    })
      .select('userId seatIds cancelledSeats passenger passengers')
      .lean();

    const womenSeats = new Set(
      bookings
        .filter((booking) => !bookedByUserId || String(booking.userId || '') !== String(bookedByUserId))
        .flatMap(femaleSeatIds),
    );
    if (womenSeats.size === 0) {
      return neighbours;
    }

    [busService.blueprint?.lowerDeck, busService.blueprint?.upperDeck].forEach((deck) => {
      (deck || []).forEach((row) => {
        (row || []).forEach((cell, index) => {
          if (cell?.kind !== 'seat' || !womenSeats.has(String(cell.id))) return;
          [row[index - 1], row[index + 1]].forEach((beside) => {
            if (beside?.kind === 'seat') neighbours.add(String(beside.id));
          });
        });
      });
    });
  } catch (error) {
    console.error('Could not work out the seats beside women travelling:', error.message);
  }

  return neighbours;
};

export const getFemaleTravellerSettings = async () => {
  const settings = await getTransportRideSettings();
  const minimum = Math.floor(Number(settings?.bus_female_travellers_min));

  return {
    enabled: String(settings?.show_bus_female_travellers ?? '1') === '1',
    minimum: Math.max(LOWEST_MINIMUM, Number.isFinite(minimum) ? minimum : LOWEST_MINIMUM),
  };
};

/// The count riders may see for each bus and schedule on a date. Trips under the
/// minimum are left out altogether, so a low number never reaches the app. This
/// is only a badge: if it fails, the search or seat map still works without it.
export const getVisibleFemaleTravellers = async ({ busServiceIds = [], travelDate }) => {
  const visible = new Map();

  try {
    const { enabled, minimum } = await getFemaleTravellerSettings();
    if (!enabled || busServiceIds.length === 0) {
      return visible;
    }

    const bookings = await BusBooking.find({
      busServiceId: { $in: busServiceIds },
      travelDate,
      status: 'confirmed',
    })
      .select('busServiceId scheduleId seatIds cancelledSeats passenger passengers')
      .lean();

    const counts = new Map();
    bookings.forEach((booking) => {
      const key = `${String(booking.busServiceId)}:${String(booking.scheduleId)}`;
      counts.set(key, (counts.get(key) || 0) + countFemaleSeats(booking));
    });
    counts.forEach((count, key) => {
      if (count >= minimum) {
        visible.set(key, count);
      }
    });
  } catch (error) {
    console.error('Could not count women travelling:', error.message);
  }

  return visible;
};
