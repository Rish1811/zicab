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
