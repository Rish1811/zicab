// Bus schedules store wall-clock times ("21:30" or "9:30 PM") against a
// YYYY-MM-DD travel date, always in India time. These helpers turn that pair
// into a real instant without depending on the server's own timezone.

const IST_OFFSET_MS = ((5 * 60) + 30) * 60 * 1000;

const parseClock = (value) => {
  const raw = String(value || '').trim();

  const time24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (time24) {
    const hours = Number(time24[1]);
    const minutes = Number(time24[2]);
    return hours <= 23 && minutes <= 59 ? { hours, minutes } : null;
  }

  const time12 = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (time12) {
    let hours = Number(time12[1]);
    const minutes = Number(time12[2]);
    if (hours < 1 || hours > 12 || minutes > 59) {
      return null;
    }
    const meridiem = time12[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
  }

  return null;
};

export const parseIstDateTime = (travelDate, timeValue) => {
  const dateMatch = String(travelDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = parseClock(timeValue);
  if (!dateMatch || !clock) {
    return null;
  }

  const utcMillis = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    clock.hours,
    clock.minutes,
  ) - IST_OFFSET_MS;
  const parsed = new Date(utcMillis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/// Departure and arrival instants of one scheduled run. An arrival clock
/// earlier than the departure clock means the bus arrives the next morning.
export const resolveTripWindow = (schedule, travelDate) => {
  const departureAt = parseIstDateTime(travelDate, schedule?.departureTime);
  let arrivalAt = parseIstDateTime(travelDate, schedule?.arrivalTime);

  if (departureAt && arrivalAt && arrivalAt <= departureAt) {
    arrivalAt = new Date(arrivalAt.getTime() + 24 * 60 * 60 * 1000);
  }

  return { departureAt, arrivalAt };
};

export const findSchedule = (busService, scheduleId) =>
  (Array.isArray(busService?.schedules) ? busService.schedules : []).find(
    (item) => String(item?.id || '') === String(scheduleId || ''),
  ) || null;

export const flattenBlueprintSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []))
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id);

export const haversineKm = (from, to) => {
  const lat1 = Number(from?.lat);
  const lng1 = Number(from?.lng);
  const lat2 = Number(to?.lat);
  const lng2 = Number(to?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return null;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/// True for a real calendar day in YYYY-MM-DD (2026-02-30 is not).
export const isRealBusDate = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
};

/**
 * Why a trip can't be sold right now, or null when it can. Seats are sold
 * until shortly before the bus leaves the passenger's boarding stop (or its
 * origin when none is picked) - never for a bus that has already gone, which
 * the rider would pay for and then not be allowed to cancel.
 */
export const busTripBookingProblem = ({
  travelDate,
  departureTime,
  boardingTime = '',
  now = new Date(),
  leadMinutes = 10,
  maxDaysAhead = 120,
}) => {
  if (!isRealBusDate(travelDate)) return 'Select a valid travel date';
  const departure = parseIstDateTime(travelDate, departureTime);
  if (!departure) return 'Departure time is not set for this bus';
  let cutoff = departure;
  const boarding = boardingTime ? parseIstDateTime(travelDate, boardingTime) : null;
  if (boarding) {
    // A stop timed before the origin departure is on the next day.
    cutoff = boarding < departure ? new Date(boarding.getTime() + 24 * 3600_000) : boarding;
  }
  if (cutoff.getTime() - now.getTime() < leadMinutes * 60_000) {
    return 'This bus has already left or is about to leave. Please choose another bus or date.';
  }
  if (departure.getTime() - now.getTime() > maxDaysAhead * 24 * 3600_000) {
    return `Bookings open up to ${maxDaysAhead} days ahead`;
  }
  return null;
};

/// Most seats one booking may hold.
export const MAX_SEATS_PER_BUS_BOOKING = 6;

const positiveFare = (value) => (Number(value) > 0 ? Number(value) : undefined);

/// One seat's fare before tax: the bus's price for that seat type (sleeper,
/// window ...), else its seat price, else the bus fare. A 0 means "not set".
export const resolveBusSeatFare = (busService = {}, seat = {}) => {
  const variantPricing = busService?.variantPricing || {};
  const defaultPrice = Number(busService?.seatPrice || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolved = positiveFare(variantPricing?.[variantKey]) ?? positiveFare(variantPricing?.seat) ?? defaultPrice;
  return Number.isFinite(Number(resolved)) ? Number(resolved) : defaultPrice;
};

/// The whole booking's fare for these seats: base, tax at the bus's rate, total,
/// and each seat's share (tax included; the last seat takes the rounding).
export const priceBusSeats = (busService = {}, seats = []) => {
  const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const taxPercent = Math.max(0, Number(busService?.serviceTaxPercentage || 0));
  const fares = seats.map((seat) => resolveBusSeatFare(busService, seat));
  const baseAmount = round(fares.reduce((sum, fare) => sum + fare, 0));
  const serviceTaxAmount = round((baseAmount * taxPercent) / 100);
  const amount = round(baseAmount + serviceTaxAmount);
  const seatPrices = seats.map((seat, index) => ({ seatId: String(seat?.id || ''), amount: round(fares[index] * (1 + taxPercent / 100)) }));
  if (seatPrices.length) {
    const others = seatPrices.slice(0, -1).reduce((sum, item) => sum + item.amount, 0);
    seatPrices[seatPrices.length - 1].amount = round(amount - others);
  }
  return { baseAmount, serviceTaxPercentage: taxPercent, serviceTaxAmount, amount, seatPrices };
};
