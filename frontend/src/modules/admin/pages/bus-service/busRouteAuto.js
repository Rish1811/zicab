// Pure helpers behind the "auto distance & timings" feature of the bus
// Route & Schedule step. A bus draft can carry several routes: the main
// `route`, the mirrored `returnRoute` and admin-added `extraRoutes`; each
// schedule picks one through `routeKey`.

// Halt at every pickup point, and how much slower a loaded coach runs than
// Google's car ETA. Admins can switch a route to manual to override.
export const BUS_HALT_MINUTES = 5;
export const BUS_DRIVE_FACTOR = 1.15;

const toPoint = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
};

export const parseClock = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export const formatClock = (minutes) => {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export const formatDistance = (meters) => `${Math.max(1, Math.round(meters / 1000))} km`;

export const formatDuration = (minutes) => {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

// Routes API legs carry durationMillis; the DirectionsService fallback in
// shared/utils/googleRoutes gives duration as "123s".
export const legDurationSeconds = (leg = {}) => {
  const millis = Number(leg.durationMillis ?? leg.staticDurationMillis);
  if (Number.isFinite(millis) && millis > 0) return millis / 1000;
  const match = /^([\d.]+)s?$/i.exec(String(leg.duration ?? '').trim());
  return match ? Number(match[1]) : 0;
};

export const getStopQuery = (stop = {}) =>
  [stop.pointName, stop.city].map((part) => String(part || '').trim()).filter(Boolean).join(', ');

export const createExtraRoute = (index = 0) => ({
  id: `route-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  routeName: '',
  originCity: '',
  destinationCity: '',
  originCoords: null,
  destinationCoords: null,
  distanceKm: '',
  durationHours: '',
  autoTimings: true,
  stops: ['pickup', 'drop'].map((stopType, stopIndex) => ({
    id: `stop-${Date.now().toString(36)}-${index}-${stopIndex}`,
    city: '',
    pointName: '',
    stopType,
    arrivalTime: '',
    departureTime: '',
    coords: null,
  })),
});

export const listDraftRoutes = (draft = {}) => [
  { key: 'main', route: draft.route || {} },
  ...(draft.returnRouteEnabled ? [{ key: 'return', route: draft.returnRoute || {} }] : []),
  ...(Array.isArray(draft.extraRoutes) ? draft.extraRoutes : []).map((route) => ({ key: route.id, route })),
];

export const getRouteLabel = (draft, key) => {
  if (key === 'main') return 'Main route';
  if (key === 'return') return 'Return route';
  const index = (draft?.extraRoutes || []).findIndex((route) => route.id === key);
  return index >= 0 ? `Route ${index + 2}` : 'Route';
};

export const describeRoute = (route = {}) =>
  route.originCity || route.destinationCity
    ? `${route.originCity || 'Origin'} → ${route.destinationCity || 'Destination'}`
    : 'Not set yet';

// Points the bus passes in order: origin, every located stop, destination.
// `stopAt[i]` is the stop index reached at the end of leg i (null = destination).
export const getRouteWaypoints = (route = {}) => {
  const origin = toPoint(route.originCoords);
  const destination = toPoint(route.destinationCoords);
  if (!origin || !destination) return null;

  const points = [origin];
  const stopAt = [];
  (Array.isArray(route.stops) ? route.stops : []).forEach((stop, index) => {
    const coords = toPoint(stop?.coords);
    if (!coords) return;
    points.push(coords);
    stopAt.push(index);
  });
  points.push(destination);
  stopAt.push(null);

  return {
    points,
    stopAt,
    signature: points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|'),
  };
};

const scheduleRouteKey = (schedule) => String(schedule?.routeKey || 'main');

// Distance, duration, stop timings and schedule arrivals for one route, from
// the driving legs between its waypoints. Times hang off the first schedule
// on the route; every schedule on the route gets its own arrival time.
const computeRouteFields = (route, waypoints, legs, departureClock) => {
  let meters = 0;
  let minutes = 0;
  const stops = (route.stops || []).map((stop) => ({ ...stop }));

  legs.forEach((leg, legIndex) => {
    meters += Number(leg.distanceMeters || 0);
    minutes += (Number(leg.durationSeconds || 0) / 60) * BUS_DRIVE_FACTOR;
    const stopIndex = waypoints.stopAt[legIndex];
    if (stopIndex === null || stopIndex === undefined) return;
    const stop = stops[stopIndex];
    const halt = stop.stopType === 'drop' ? 0 : BUS_HALT_MINUTES;
    if (departureClock !== null) {
      stop.arrivalTime = formatClock(departureClock + minutes);
      stop.departureTime = formatClock(departureClock + minutes + halt);
    }
    minutes += halt;
  });

  return { meters, minutes, stops };
};

const sameStops = (a = [], b = []) =>
  a.length === b.length &&
  a.every((stop, index) => stop.arrivalTime === b[index].arrivalTime && stop.departureTime === b[index].departureTime);

const replaceRoute = (draft, key, route) => {
  if (key === 'main') return { ...draft, route };
  if (key === 'return') return { ...draft, returnRoute: route };
  return { ...draft, extraRoutes: draft.extraRoutes.map((item) => (item.id === key ? route : item)) };
};

// Returns `draft` itself when nothing changes, so it is safe to run on every edit.
export const applyAutoRouting = (draft, legsBySignature) => {
  let next = draft;

  listDraftRoutes(draft).forEach(({ key, route }) => {
    if (route.autoTimings === false) return;
    const waypoints = getRouteWaypoints(route);
    const legs = waypoints ? legsBySignature.get(waypoints.signature) : null;
    if (!legs || legs.length !== waypoints.points.length - 1) return;

    const routeSchedules = (next.schedules || []).filter((schedule) => scheduleRouteKey(schedule) === key);
    const departureClock = routeSchedules.map((schedule) => parseClock(schedule.departureTime)).find((value) => value !== null) ?? null;
    const { meters, minutes, stops } = computeRouteFields(route, waypoints, legs, departureClock);

    const distanceKm = formatDistance(meters);
    const durationHours = formatDuration(minutes);
    if (route.distanceKm !== distanceKm || route.durationHours !== durationHours || !sameStops(route.stops || [], stops)) {
      next = replaceRoute(next, key, { ...route, distanceKm, durationHours, stops });
    }

    const schedules = (next.schedules || []).map((schedule) => {
      if (scheduleRouteKey(schedule) !== key) return schedule;
      const departure = parseClock(schedule.departureTime);
      if (departure === null) return schedule;
      const arrivalTime = formatClock(departure + minutes);
      return schedule.arrivalTime === arrivalTime ? schedule : { ...schedule, arrivalTime };
    });
    if (schedules.some((schedule, index) => schedule !== next.schedules[index])) {
      next = { ...next, schedules };
    }
  });

  return next;
};

// Copies geocoded coordinates onto stops that have none, matched by their text.
export const fillStopCoords = (draft, coordsByQuery) => {
  let next = draft;
  listDraftRoutes(draft).forEach(({ key, route }) => {
    let changed = false;
    const stops = (route.stops || []).map((stop) => {
      if (toPoint(stop.coords)) return stop;
      const coords = coordsByQuery.get(getStopQuery(stop));
      if (!coords) return stop;
      changed = true;
      return { ...stop, coords };
    });
    if (changed) next = replaceRoute(next, key, { ...route, stops });
  });
  return next;
};
