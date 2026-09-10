import { env } from '../../../config/env.js';

/**
 * Road route for a trip, resolved once on the server.
 *
 * Both apps used to fetch their own from the public OSRM demo server, which is
 * rate-limited and unauthenticated. That produced two problems at once: the
 * line vanished whenever the demo host throttled us, and rider and driver could
 * end up drawing *different* routes for the same trip because each fetched
 * independently.
 *
 * Resolving it here fixes both — one authoritative route, stored on the ride,
 * served to everyone. Google is used because the account already has a working
 * Directions key; OSRM stays as a fallback so a billing lapse degrades to the
 * old behaviour instead of an empty map.
 */

const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 6000;

const toCoordinateString = (coordinates = []) => {
  const [lng, lat] = coordinates;
  return `${Number(lat)},${Number(lng)}`;
};

const isUsableCoordinate = (coordinates) =>
  Array.isArray(coordinates) &&
  coordinates.length >= 2 &&
  Number.isFinite(Number(coordinates[0])) &&
  Number.isFinite(Number(coordinates[1]));

/// Never let routing hold up a booking. A slow provider must cost the rider a
/// polyline, not their ride.
const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const fromGoogle = async ({ pickupCoords, dropCoords, stopCoords }) => {
  const key = env.googleMapsApiKey;
  if (!key) return null;

  const params = new URLSearchParams({
    origin: toCoordinateString(pickupCoords),
    destination: toCoordinateString(dropCoords),
    key,
  });

  if (stopCoords.length) {
    params.set('waypoints', stopCoords.map(toCoordinateString).join('|'));
  }

  const body = await fetchWithTimeout(`${DIRECTIONS_URL}?${params.toString()}`);
  const route = body?.status === 'OK' ? body.routes?.[0] : null;
  if (!route?.overview_polyline?.points) return null;

  // A route with waypoints comes back as one leg per hop, so the totals are a
  // sum rather than legs[0].
  const legs = Array.isArray(route.legs) ? route.legs : [];
  const distanceMeters = legs.reduce((total, leg) => total + Number(leg?.distance?.value || 0), 0);
  const durationSeconds = legs.reduce((total, leg) => total + Number(leg?.duration?.value || 0), 0);

  return {
    polyline: route.overview_polyline.points,
    distanceMeters,
    durationMinutes: durationSeconds / 60,
    provider: 'google',
  };
};

const fromOsrm = async ({ pickupCoords, dropCoords, stopCoords }) => {
  const waypoints = [pickupCoords, ...stopCoords, dropCoords]
    .map((coordinates) => `${Number(coordinates[0])},${Number(coordinates[1])}`)
    .join(';');

  const body = await fetchWithTimeout(
    `${OSRM_URL}/${waypoints}?overview=full&geometries=polyline`,
  );
  const route = body?.code === 'Ok' ? body.routes?.[0] : null;
  if (!route?.geometry) return null;

  return {
    polyline: route.geometry,
    distanceMeters: Number(route.distance || 0),
    durationMinutes: Number(route.duration || 0) / 60,
    provider: 'osrm',
  };
};

/**
 * The road route between two points, or null if neither provider answered.
 *
 * Both providers emit Google's encoded-polyline format at precision 5, so the
 * apps decode either one with the same decoder.
 */
export const resolveRideRoute = async ({ pickupCoords, dropCoords, stops = [] }) => {
  if (!isUsableCoordinate(pickupCoords) || !isUsableCoordinate(dropCoords)) {
    return null;
  }

  const stopCoords = (Array.isArray(stops) ? stops : [])
    .map((stop) => {
      if (isUsableCoordinate(stop)) return stop;
      const coordinates = stop?.location?.coordinates;
      return isUsableCoordinate(coordinates) ? coordinates : null;
    })
    .filter(Boolean)
    // Directions bills per waypoint and the map cannot show more than a handful
    // meaningfully, so an absurd stop list is trimmed rather than refused.
    .slice(0, 8);

  const input = { pickupCoords, dropCoords, stopCoords };

  try {
    const route = (await fromGoogle(input)) || (await fromOsrm(input));
    if (!route?.polyline) return null;

    return { ...route, fetchedAt: new Date() };
  } catch (error) {
    console.error('route resolution failed', error?.message || error);
    return null;
  }
};
