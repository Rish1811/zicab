import { BusBooking } from '../user/models/BusBooking.js';
import { getTransportRideSettings } from './transportSettingsService.js';

// Never lower: a small count could point to a particular passenger.
const LOWEST_MINIMUM = 3;

const isFemale = (gender) => String(gender || '').trim().toLowerCase() === 'female';

/// One traveller per seat, as the rider entered them. Empty when the list doesn't
/// match the seats, so nobody ends up against the wrong seat.
export const buildSeatPassengers = (passengers, seatIds = []) => {
  if (!Array.isArray(passengers) || passengers.length !== seatIds.length) {
    return [];
  }

  return seatIds.map((seatId, index) => ({
    seatId,
    name: String(passengers[index]?.name || '').trim().slice(0, 120),
    age: Number(passengers[index]?.age) || null,
    gender: String(passengers[index]?.gender || '').trim().slice(0, 20),
  }));
};

/// Women on a booking's seats that are still active. Bookings with only a lead
/// passenger (older ones, and those made by an operator) count just that person.
export const countFemaleSeats = (booking = {}) => {
  const cancelled = new Set((booking.cancelledSeats || []).map((item) => String(item.seatId)));
  const activeSeats = (booking.seatIds || []).map(String).filter((seatId) => !cancelled.has(seatId));
  if (activeSeats.length === 0) {
    return 0;
  }

  const seatPassengers = booking.seatPassengers || [];
  if (seatPassengers.length > 0) {
    return seatPassengers.filter((item) => activeSeats.includes(String(item.seatId)) && isFemale(item.gender)).length;
  }
  return isFemale(booking.passenger?.gender) ? 1 : 0;
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
      .select('busServiceId scheduleId seatIds cancelledSeats passenger seatPassengers')
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
