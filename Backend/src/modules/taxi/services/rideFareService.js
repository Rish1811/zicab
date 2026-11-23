import crypto from 'node:crypto';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { resolveRouteCached } from './routeService.js';
import { getSurgeAt, getSurgeProfiles, surgeForVehicle } from './surgeService.js';
import { estimateTolls } from './tollService.js';
import { classifyTrip } from './tripCategoryService.js';

/// Server-side ride pricing - the one place a taxi or outstation fare is
/// worked out.
///
/// The rider app used to price every trip itself from the /users/set-prices
/// rows, over a straight-line distance, and the server stored whatever number
/// it sent. A missing tariff, a stale row or a modified app therefore booked,
/// dispatched and settled rides at 0 (or at any figure the phone chose). Ola
/// and Uber price on the server and the app only shows that price; this does
/// the same. The formula is the one the app has always used
/// (fare_calculator.dart), so a rider sees the same kind of number - only now
/// on the road route and never at 0.

/// Matches the app's assumption for a trip no map provider could route.
const FALLBACK_SPEED_KMPH = 25;
/// Roads are longer than the crow flies; used only when no route resolves.
const FALLBACK_ROAD_FACTOR = 1.3;
/// How long a quoted price is held for the booking that follows it.
export const QUOTE_TTL_MS = 10 * 60 * 1000;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/// The rider's catalog is one row per vehicle, chosen the way the fare is.
///
/// A tariff for this exact zone wins, then one for the zone's service
/// location, then a global one. A row carrying its own zone can only match
/// that zone, so a Mysuru tariff never prices a Bangalore trip. Shared by the
/// /users/set-prices catalog and the fare engine, so the row a rider is shown
/// is always the row they are charged on.
const hasAnyRate = (row) => [
  row.base_price,
  row.price_per_distance,
  row.time_price,
  row.outstation_base_price,
  row.outstation_price_per_distance,
].some((value) => num(value) > 0)
  // Rental/package rows carry their prices per vehicle.
  || (Array.isArray(row.package_vehicle_prices) && row.package_vehicle_prices.length > 0);

export const pickTariffPerVehicle = (rows, zoneId, serviceLocationId, transportType) => {
  const zoneRank = (row) => {
    if (zoneId && row.zone_id === zoneId) return 0;
    if (serviceLocationId && !row.zone_id && row.service_location_id === serviceLocationId) return 1;
    if (!row.zone_id) return 2;
    return null;
  };

  const best = new Map();

  for (const row of rows) {
    if (!row.type_id) continue;
    // Both switches have to be on. The booking lookup has always required
    // `active: 1` and `status: 'active'`; quoting from a row that booking then
    // cannot find priced the ride on one row and took commission from none.
    if (String(row.status || 'active') !== 'active') continue;
    if (!Number(row.active)) continue;
    // A row with no rates at all is not a tariff. A global all-zero row was
    // switched on in Nov 2026; Indore's own rows were off, so the cascade fell
    // through to it and rides were quoted, booked and completed at 0. Skipping
    // it lets the cascade reach a real row, or show no price.
    if (!hasAnyRate(row)) continue;

    let transportRank = 0;
    if (transportType) {
      if (row.transport_type === transportType) transportRank = 0;
      else if (row.transport_type === 'both') transportRank = 1;
      else continue;
    }

    const zoneScore = zoneRank(row);
    if (zoneScore === null) continue;

    const key = transportType ? row.type_id : `${row.type_id}:${row.transport_type}`;
    const score = zoneScore * 2 + transportRank;
    const incumbent = best.get(key);
    if (!incumbent || score < incumbent.score) best.set(key, { score, row });
  }

  return [...best.values()].map((entry) => entry.row);
};

const supportsOutstation = (row) =>
  (row.enable_outstation_ride === true || Number(row.support_outstation) === 1)
  && (num(row.outstation_price_per_distance) > 0 || num(row.outstation_base_price) > 0);

/// The fare formula, mirroring the app's FareCalculator.estimate.
export const computeRideFare = ({
  row,
  distanceMeters,
  durationMinutes,
  isOutstation = false,
  isRoundTrip = false,
  airportFee = 0,
  tollAmount = 0,
}) => {
  const useOutstation = isOutstation && supportsOutstation(row);
  const basePrice = num(useOutstation ? row.outstation_base_price : row.base_price);
  const baseDistanceKm = num(useOutstation ? row.outstation_base_distance : row.base_distance);
  const perKm = useOutstation
    ? (isRoundTrip && num(row.outstation_round_trip_price_per_distance) > 0
      ? num(row.outstation_round_trip_price_per_distance)
      : num(row.outstation_price_per_distance))
    : num(row.price_per_distance);
  const perMinute = num(useOutstation ? row.outstation_time_price : row.time_price);

  // The return leg retraces the route, so it costs the same again; the base
  // fare is a one-off charge for the booking.
  const legs = isRoundTrip ? 2 : 1;
  const distanceKm = (Math.max(0, num(distanceMeters)) / 1000) * legs;
  const minutes = Math.max(0, num(durationMinutes)) * legs;

  const chargeableKm = Math.max(0, distanceKm - baseDistanceKm);
  const distanceFare = chargeableKm * perKm;
  const timeFare = minutes * perMinute;
  const subtotal = basePrice + distanceFare + timeFare;
  const serviceTax = subtotal * (num(row.service_tax) / 100);
  const tripFare = Math.round(Math.max(subtotal + serviceTax, basePrice));

  // Charged once per booking on top of the trip, never rounded away.
  const platformFee = round2(row.rider_platform_fee_type === 'percentage'
    ? (subtotal * num(row.rider_platform_fee)) / 100
    : num(row.rider_platform_fee));

  const safeAirportFee = round2(Math.max(0, num(airportFee)));
  const safeTolls = round2(Math.max(0, num(tollAmount)));

  return {
    baseFare: round2(basePrice),
    distanceFare: round2(distanceFare),
    timeFare: round2(timeFare),
    serviceTax: round2(serviceTax),
    tripFare,
    platformFee,
    airportFee: safeAirportFee,
    tollAmount: safeTolls,
    total: round2(tripFare + platformFee + safeAirportFee + safeTolls),
    usedOutstationTariff: useOutstation,
  };
};

const haversineMeters = ([lng1, lat1], [lng2, lat2]) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

/// Road distance and time through any stops, or an honest estimate when no
/// map provider answers. Coordinates are GeoJSON [lng, lat].
export const resolveTripDistance = async ({ pickupCoords, dropCoords, stops = [] }) => {
  const route = await resolveRouteCached({ origin: pickupCoords, destination: dropCoords, stops }).catch(() => null);
  if (route?.distanceMeters > 0) {
    return {
      source: 'road',
      distanceMeters: Number(route.distanceMeters),
      durationMinutes: Number(route.durationMinutes) > 0
        ? Number(route.durationMinutes)
        : (Number(route.distanceMeters) / 1000 / FALLBACK_SPEED_KMPH) * 60,
      route,
    };
  }

  const points = [pickupCoords, ...stops, dropCoords];
  let straight = 0;
  for (let i = 1; i < points.length; i += 1) straight += haversineMeters(points[i - 1], points[i]);
  const distanceMeters = straight * FALLBACK_ROAD_FACTOR;
  return {
    source: 'estimate',
    distanceMeters,
    durationMinutes: (distanceMeters / 1000 / FALLBACK_SPEED_KMPH) * 60,
    route: null,
  };
};

/// The rider tariffs at a pickup, surged per vehicle, exactly as the
/// /users/set-prices catalog builds them. Records no surge demand.
export const getRiderTariffsAt = async (pickupCoords) => {
  const [{ findZoneByPickup }, { listSetPrices }] = await Promise.all([
    import('./matchingService.js'),
    import('../admin/services/adminService.js'),
  ]);
  const [longitude, latitude] = pickupCoords;
  const zone = await findZoneByPickup(pickupCoords).catch(() => null);
  if (!zone) return { zone: null, rows: [], surge: null, surgeProfiles: null };

  const zoneId = String(zone._id);
  const surge = await getSurgeAt(latitude, longitude).catch(() => null);
  const surgeProfiles = await getSurgeProfiles().catch(() => null);
  const multiplierForVehicle = (vehicleTypeId) => (surge && surgeProfiles
    ? surgeForVehicle(surge, surgeProfiles, vehicleTypeId).multiplier
    : 1);

  const [zoneRows, fallback] = await Promise.all([
    listSetPrices({ scope: 'ride', zone_id: zoneId, limit: 100 }, null, { multiplierForVehicle }),
    listSetPrices({ scope: 'ride', zone_id: 'none', limit: 100 }, null, { multiplierForVehicle }),
  ]);
  const serviceLocationId = zone.service_location_id
    ? String(zone.service_location_id._id || zone.service_location_id)
    : null;
  const rows = pickTariffPerVehicle(
    [...(zoneRows.results || []), ...(fallback.results || [])],
    zoneId,
    serviceLocationId,
    'taxi',
  );
  return { zone, rows, surge, surgeProfiles };
};

const tollsForQuote = async ({ pickupCoords, dropCoords, stops, vehicleTypeIds, roundTrip }) => {
  try {
    const { byVehicle } = await estimateTolls({
      origin: pickupCoords,
      destination: dropCoords,
      stops,
      vehicleTypeIds,
      roundTrip,
    });
    return byVehicle || {};
  } catch (error) {
    console.error('[fare] tolls not resolved', error?.message);
    return {};
  }
};

const serializeTolls = (tolls, roundTrip) => (tolls && tolls.total > 0
  ? {
      total: round2(tolls.total),
      roundTrip,
      items: (tolls.items || [])
        .filter((item) => item.amount > 0)
        .map((item) => ({
          plazaId: item.plaza_id,
          name: item.name,
          highway: item.highway,
          oneWay: item.one_way,
          returnTrip: item.return_trip,
          amount: item.amount,
        })),
    }
  : null);

/**
 * Prices a trip for every vehicle asked for (or every vehicle with a tariff at
 * the pickup). Coordinates are GeoJSON [lng, lat].
 *
 * `serviceType` 'intercity' switches to each vehicle's outstation tariff where
 * it has one; `roundTrip` charges the return leg. A vehicle with no tariff at
 * the pickup is simply absent from `quotes`.
 */
export const quoteRideFares = async ({
  pickupCoords,
  dropCoords,
  stops = [],
  vehicleTypeIds = [],
  serviceType = 'ride',
  roundTrip = false,
}) => {
  const isOutstation = String(serviceType || '').toLowerCase() === 'intercity';
  const isRoundTrip = isOutstation && Boolean(roundTrip);
  const wanted = new Set((vehicleTypeIds || []).map(String).filter(Boolean));

  const [{ zone, rows, surge, surgeProfiles }, distance, tripClass] = await Promise.all([
    getRiderTariffsAt(pickupCoords),
    resolveTripDistance({ pickupCoords, dropCoords, stops }),
    classifyTrip({ pickup: pickupCoords, drop: dropCoords }).catch(() => null),
  ]);

  const priced = rows.filter((row) => !wanted.size || wanted.has(String(row.type_id)));
  const airportFee = tripClass?.category === 'airport' ? num(tripClass?.airport?.total_fee) : 0;
  const tollsByVehicle = isOutstation && priced.length
    ? await tollsForQuote({
        pickupCoords,
        dropCoords,
        stops,
        vehicleTypeIds: priced.map((row) => String(row.type_id)),
        roundTrip: isRoundTrip,
      })
    : {};

  const quotes = priced
    // An outstation trip can only be booked on a vehicle with intercity rates.
    .filter((row) => !isOutstation || supportsOutstation(row))
    .map((row) => {
      const vehicleTypeId = String(row.type_id);
      const tollCharges = serializeTolls(tollsByVehicle[vehicleTypeId], isRoundTrip);
      const breakdown = computeRideFare({
        row,
        distanceMeters: distance.distanceMeters,
        durationMinutes: distance.durationMinutes,
        isOutstation,
        isRoundTrip,
        airportFee,
        tollAmount: tollCharges?.total || 0,
      });
      const surgeMultiplier = surge && surgeProfiles
        ? surgeForVehicle(surge, surgeProfiles, vehicleTypeId).multiplier
        : 1;
      return {
        vehicleTypeId,
        vehicleName: row.name || row.vehicle_type_name || '',
        setPriceId: row.id || null,
        fare: breakdown.total,
        breakdown,
        tollCharges,
        surgeMultiplier: round2(surgeMultiplier || 1),
      };
    })
    .filter((quote) => quote.fare > 0);

  return {
    zone: zone ? { id: String(zone._id), name: zone.name || '' } : null,
    tripCategory: tripClass?.category || null,
    airportFee,
    distanceMeters: Math.round(distance.distanceMeters),
    durationMinutes: Math.round(distance.durationMinutes * 10) / 10,
    distanceSource: distance.source,
    route: distance.route,
    serviceType: isOutstation ? 'intercity' : 'ride',
    roundTrip: isRoundTrip,
    quotes,
  };
};

// --- Price lock -----------------------------------------------------------
//
// The quote a rider sees is the price they book at: a signed token carries
// the fare from /rides/quote to POST /rides, so a surge that moves in between
// or a re-route that differs by a few metres cannot change it. Stateless, so
// it works across all API processes without shared storage.

const quoteSecret = () => `${env.jwtSecret}:ride-fare-quote`;
const roundCoord = (coords) => coords.map((v) => Number(v).toFixed(3)).join(',');
const tripFingerprint = ({ pickupCoords, dropCoords, stops = [], serviceType, roundTrip }) => [
  roundCoord(pickupCoords),
  roundCoord(dropCoords),
  stops.map(roundCoord).join('|'),
  String(serviceType || 'ride'),
  roundTrip ? 'rt' : 'ow',
].join(';');

const sign = (body) => crypto.createHmac('sha256', quoteSecret()).update(body).digest('base64url');

export const signFareQuote = ({ userId, trip, quote, distanceMeters = 0, durationMinutes = 0 }) => {
  const payload = {
    u: String(userId || ''),
    t: tripFingerprint(trip),
    v: quote.vehicleTypeId,
    s: quote.setPriceId,
    f: quote.fare,
    pf: quote.breakdown.platformFee,
    tl: quote.tollCharges,
    sm: quote.surgeMultiplier,
    d: Math.round(Number(distanceMeters) || 0),
    m: Math.round((Number(durationMinutes) || 0) * 10) / 10,
    x: Date.now() + QUOTE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
};

/// The locked quote for this exact trip and vehicle, or null when the token is
/// missing, forged, expired, someone else's or for a different trip.
export const readFareQuote = ({ token, userId, trip, vehicleTypeId }) => {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = sign(body);
  if (!signature || signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || !(payload.x > Date.now())) return null;
  if (payload.u !== String(userId || '')) return null;
  if (payload.v !== String(vehicleTypeId || '')) return null;
  if (payload.t !== tripFingerprint(trip)) return null;
  if (!(Number(payload.f) > 0)) return null;
  return {
    vehicleTypeId: payload.v,
    setPriceId: payload.s || null,
    fare: Number(payload.f),
    platformFee: Number(payload.pf) || 0,
    tollCharges: payload.tl || null,
    surgeMultiplier: Number(payload.sm) || 1,
    distanceMeters: Number(payload.d) || 0,
    durationMinutes: Number(payload.m) || 0,
  };
};

/**
 * The fare a booking is made at: the locked quote when the app sent a valid
 * one, otherwise a fresh server price. Throws when the vehicle has no tariff
 * here - booking it at a number the phone made up is how rides went out at 0.
 */
export const resolveBookingFare = async ({
  userId,
  quoteToken,
  pickupCoords,
  dropCoords,
  stops = [],
  vehicleTypeId,
  serviceType,
  roundTrip,
  clientFare,
}) => {
  const trip = { pickupCoords, dropCoords, stops, serviceType, roundTrip };
  const locked = readFareQuote({ token: quoteToken, userId, trip, vehicleTypeId });
  if (locked) return { ...locked, source: 'quote' };

  const result = await quoteRideFares({
    pickupCoords,
    dropCoords,
    stops,
    vehicleTypeIds: [vehicleTypeId],
    serviceType,
    roundTrip,
  });
  const quote = result.quotes.find((q) => q.vehicleTypeId === String(vehicleTypeId));
  if (!quote) {
    throw new ApiError(400, String(serviceType).toLowerCase() === 'intercity'
      ? 'This vehicle is not available for outstation trips from this pickup.'
      : 'This vehicle is not available in this area yet.');
  }
  // An app build without /rides/quote (no token) priced the trip itself over a
  // straight line, which runs 20-40% under the road price. Its figure is what
  // the rider was shown, so it is kept when it is plausibly the same trip -
  // within LEGACY_CLIENT_FARE_BAND of the server's, never above it. Anything
  // else (0, a tampered 1, a stale tariff) books at the server's price.
  const legacy = Number(clientFare);
  const useLegacy = !quoteToken
    && Number.isFinite(legacy)
    && legacy >= quote.fare * LEGACY_CLIENT_FARE_BAND
    && legacy <= quote.fare;

  return {
    vehicleTypeId: quote.vehicleTypeId,
    setPriceId: quote.setPriceId,
    fare: useLegacy ? Math.round(legacy * 100) / 100 : quote.fare,
    serverFare: quote.fare,
    platformFee: quote.breakdown.platformFee,
    tollCharges: quote.tollCharges,
    surgeMultiplier: quote.surgeMultiplier,
    distanceMeters: result.distanceMeters,
    durationMinutes: result.durationMinutes,
    route: result.route,
    source: useLegacy ? 'legacy_app' : 'server',
  };
};

/// How far under the server's price an old app's own figure may be and still
/// be booked as shown. Straight-line vs road is usually 0.65-0.85.
export const LEGACY_CLIENT_FARE_BAND = 0.6;

/// [lng, lat] pairs from the stops the apps send as {lat, lng} (or [lng, lat]).
export const normalizeStops = (stops) => (Array.isArray(stops) ? stops : [])
  .map((stop) => {
    if (Array.isArray(stop) && stop.length === 2) return stop.map(Number);
    const lat = Number(stop?.lat ?? stop?.latitude);
    const lng = Number(stop?.lng ?? stop?.longitude);
    return [lng, lat];
  })
  .filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0))
  .slice(0, 8);
