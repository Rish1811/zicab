import { TollPlaza } from '../admin/models/TollPlaza.js';
import { resolveRouteCached } from './routeService.js';

/**
 * Toll charges for outstation trips.
 *
 * The trip's road route (the same cached Directions / OSRM lookup the map and
 * parcel pricing use) is checked against the admin's toll plazas: every
 * active plaza the route passes within its radius is a toll on the trip. Each
 * vehicle type pays its own price per plaza; a round trip pays the plaza's
 * return price for the way back. Tolls are quoted inside the fare and go in
 * full to the driver.
 */

const round = (value) => Math.round(Number(value || 0) * 100) / 100;
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/// Google's encoded polyline (precision 5) -> [[lat, lng], ...].
export const decodePolyline = (encoded = '') => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const text = String(encoded || '');
  while (index < text.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = text.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
};

/// Metres from point p to segment a-b, all [lat, lng]. An equirectangular
/// projection around the point is exact enough at a few hundred metres.
const distanceToSegmentMeters = (p, a, b) => {
  const cosLat = Math.cos(toRad(p[0]));
  const project = ([lat, lng]) => [toRad(lng) * cosLat * EARTH_RADIUS_M, toRad(lat) * EARTH_RADIUS_M];
  const [px, py] = project(p);
  const [ax, ay] = project(a);
  const [bx, by] = project(b);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const minDistanceToRoute = (point, route) => {
  if (route.length === 1) return distanceToSegmentMeters(point, route[0], route[0]);
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i += 1) {
    const d = distanceToSegmentMeters(point, route[i], route[i + 1]);
    if (d < best) best = d;
  }
  return best;
};

/// The active plazas a decoded route passes, in order along it.
export const plazasOnRoute = async (route) => {
  if (!Array.isArray(route) || route.length < 2) return [];
  const lats = route.map((p) => p[0]);
  const lngs = route.map((p) => p[1]);
  // ~2 km of slack around the route's box, then the exact check.
  const pad = 0.02;
  const candidates = await TollPlaza.find({
    active: true,
    location: {
      $geoWithin: {
        $box: [
          [Math.min(...lngs) - pad, Math.min(...lats) - pad],
          [Math.max(...lngs) + pad, Math.max(...lats) + pad],
        ],
      },
    },
  }).lean();

  return candidates
    .map((plaza) => {
      const [lng, lat] = plaza.location?.coordinates || [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const point = [lat, lng];
      const distance = minDistanceToRoute(point, route);
      if (distance > (plaza.radius_meters || 250)) return null;
      // Position along the route, for listing tolls in driving order.
      let along = 0;
      let nearest = Infinity;
      route.forEach((p, i) => {
        const d = Math.hypot(p[0] - lat, p[1] - lng);
        if (d < nearest) {
          nearest = d;
          along = i;
        }
      });
      return { plaza, along };
    })
    .filter(Boolean)
    .sort((a, b) => a.along - b.along)
    .map(({ plaza }) => plaza);
};

const priceFor = (plaza, vehicleTypeId) =>
  (plaza.prices || []).find((price) => String(price.vehicle_type_id) === String(vehicleTypeId)) || null;

/**
 * What one vehicle type pays for a set of plazas. A plaza with no price for
 * the vehicle costs nothing (the admin has not priced it) and is reported so.
 */
export const tollsForVehicle = (plazas, vehicleTypeId, { roundTrip = false } = {}) => {
  const items = plazas.map((plaza) => {
    const price = priceFor(plaza, vehicleTypeId);
    const oneWay = Number(price?.one_way || 0);
    const back = roundTrip ? Number(price?.return_trip || 0) || oneWay : 0;
    return {
      plaza_id: String(plaza._id),
      name: plaza.name,
      highway: plaza.highway || '',
      one_way: round(oneWay),
      return_trip: round(back),
      amount: round(oneWay + back),
      priced: Boolean(price),
    };
  });
  return {
    total: round(items.reduce((sum, item) => sum + item.amount, 0)),
    round_trip: Boolean(roundTrip),
    items,
  };
};

/**
 * Tolls on the route between two points, for each vehicle type given.
 * Coordinates are GeoJSON [lng, lat]. `routeFound` is false when no map
 * provider answered - the caller then quotes no tolls rather than failing.
 */
export const estimateTolls = async ({ origin, destination, stops = [], vehicleTypeIds = [], roundTrip = false }) => {
  const route = await resolveRouteCached({ origin, destination, stops }).catch(() => null);
  if (!route?.polyline) {
    return { routeFound: false, plazas: [], byVehicle: {} };
  }
  const plazas = await plazasOnRoute(decodePolyline(route.polyline));
  const byVehicle = Object.fromEntries(
    [...new Set(vehicleTypeIds.map(String))].map((id) => [id, tollsForVehicle(plazas, id, { roundTrip })]),
  );
  return {
    routeFound: true,
    polyline: route.polyline,
    plazas: plazas.map((plaza) => ({
      id: String(plaza._id),
      name: plaza.name,
      highway: plaza.highway || '',
      lat: plaza.location.coordinates[1],
      lng: plaza.location.coordinates[0],
    })),
    byVehicle,
  };
};

export const isRoundTripValue = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]/g, '_') === 'round_trip';
