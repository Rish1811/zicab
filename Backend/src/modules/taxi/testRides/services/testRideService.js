import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { getMapSettings } from '../../admin/services/adminService.js';
import { SetPrice } from '../../admin/models/SetPrice.js';
import { Driver } from '../../driver/models/Driver.js';
import { Zone } from '../../driver/models/Zone.js';
import { lastLocationTimes, MAX_GAP_MS } from '../../driver/services/driverActivityService.js';
import { computeRideFare, quoteRideFares, resolveTripDistance } from '../../services/rideFareService.js';
import { resolveTransportDispatchConfig } from '../../services/transportSettingsService.js';
import { TestRide } from '../models/TestRide.js';

/// Test rides: an offer sent from the admin panel that looks exactly like a
/// real one on the driver's phone - same socket event, same push, same
/// lock-screen card and sound, a real-looking pickup near them, a real fare -
/// but books nothing. When the driver accepts, the server answers exactly as
/// it does when another driver won the race ("Another driver accepted this
/// ride") and closes the card. It shows whether a driver's phone really gets
/// offers and how fast they answer.
///
/// Nothing is written to rides, so no trip, report, earning, rider app, surge,
/// challenge or acceptance figure ever sees a test ride.

export const ANOTHER_DRIVER_ACCEPTED = 'Another driver accepted this ride';
const MAX_DRIVERS_PER_SEND = 200;
const PER_DRIVER_COOLDOWN_MS = 10 * 60 * 1000;
const RIDER_NAMES = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Anjali', 'Arjun', 'Kavya', 'Rohit', 'Neha', 'Karthik', 'Divya', 'Suresh', 'Pooja', 'Manoj', 'Ananya'];

const validId = (value) => mongoose.isValidObjectId(String(value || ''));
const oid = (value) => new mongoose.Types.ObjectId(String(value));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/// A point [distanceMeters] from [lng, lat] in a random direction.
const offsetPoint = ([lng, lat], distanceMeters) => {
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (distanceMeters * Math.cos(bearing)) / 111320;
  const dLng = (distanceMeters * Math.sin(bearing)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
};
const between = (min, max) => min + Math.random() * (max - min);

const pointInZone = async (zone, coords) => {
  if (!zone?.geometry) return true;
  const hit = await Zone.exists({ _id: zone._id, geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: coords } } } });
  return Boolean(hit);
};

let geocodeKey = null;
const mapsKey = async () => {
  if (geocodeKey !== null) return geocodeKey;
  try {
    const settings = (await getMapSettings())?.settings || {};
    geocodeKey = settings.google_map_key_for_distance_matrix || settings.google_map_key_for_web_apps || process.env.GOOGLE_MAPS_API_KEY || '';
  } catch {
    geocodeKey = process.env.GOOGLE_MAPS_API_KEY || '';
  }
  return geocodeKey;
};

/// A real street address for a point, like a rider's pickup would show.
const addressFor = async ([lng, lat], fallback) => {
  const key = await mapsKey();
  if (!key) return fallback;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    const body = await response.json();
    const address = body?.results?.[0]?.formatted_address || '';
    // "Plot 12, 5th Cross, Indiranagar, Bengaluru, Karnataka 560038, India" -> drop country.
    return address.replace(/,\s*India$/, '') || fallback;
  } catch {
    return fallback;
  }
};

/// Drivers a test can go to: online, not on a trip, matching the target.
const candidateFilter = async ({ driverIds, zoneId, serviceLocationId, vehicleTypeId }) => {
  const filter = { deletedAt: null, isOnline: true, isOnRide: { $ne: true } };
  let zone = null;
  if (Array.isArray(driverIds) && driverIds.length) {
    filter._id = { $in: driverIds.filter(validId).map(oid) };
  } else if (validId(zoneId)) {
    zone = await Zone.findById(zoneId).select('name geometry service_location_id').lean();
    if (!zone) throw new ApiError(404, 'Zone not found');
    // Drivers whose current zone is this one, or whose position is inside it.
    filter.$or = [
      { zoneId: zone._id },
      ...(zone.geometry ? [{ location: { $geoWithin: { $geometry: zone.geometry } } }] : []),
    ];
  } else if (validId(serviceLocationId)) {
    filter.service_location_id = oid(serviceLocationId);
  }
  if (validId(vehicleTypeId)) {
    filter.$and = [{ $or: [{ vehicleTypeId: oid(vehicleTypeId) }, { vehicleTypeIds: oid(vehicleTypeId) }] }];
  }
  return { filter, zone };
};

/// Online drivers a test could go to, for the admin's picker.
export const listTestCandidates = async (query = {}) => {
  const { filter } = await candidateFilter({ zoneId: query.zoneId, serviceLocationId: query.serviceLocationId, vehicleTypeId: query.vehicleTypeId });
  const term = String(query.search || '').trim();
  if (term) {
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [...(filter.$and || []), { $or: [{ name: pattern }, { phone: pattern }, { vehicleNumber: pattern }] }];
  }
  const drivers = await Driver.find(filter).select('name phone vehicleNumber vehicleType vehicleTypeId zoneId locationUpdatedAt').limit(500).lean();
  const seen = await lastLocationTimes(drivers);
  const recent = await recentlyTested(drivers.map((d) => d._id));
  const now = Date.now();
  return drivers.map((d) => {
    const at = seen.get(String(d._id));
    return {
      id: String(d._id),
      name: d.name || '',
      phone: d.phone || '',
      vehicleNumber: d.vehicleNumber || '',
      vehicleType: d.vehicleType || '',
      gpsLive: Boolean(at && now - at <= MAX_GAP_MS),
      lastLocationSecondsAgo: at ? Math.round((now - at) / 1000) : null,
      testedRecently: recent.has(String(d._id)),
    };
  }).sort((a, b) => Number(b.gpsLive) - Number(a.gpsLive) || a.name.localeCompare(b.name));
};

const recentlyTested = async (driverIds) => {
  const since = new Date(Date.now() - PER_DRIVER_COOLDOWN_MS);
  const rows = await TestRide.find({ createdAt: { $gte: since }, 'offers.driverId': { $in: driverIds } })
    .select('offers.driverId offers.status offers.sentAt').lean();
  const result = new Set();
  rows.forEach((row) => row.offers.forEach((offer) => {
    if (offer.status !== 'skipped' && offer.sentAt && offer.sentAt >= since) result.add(String(offer.driverId));
  }));
  return result;
};

/// Builds one driver's offer: pickup near them (inside the zone when a zone was
/// chosen), a drop 3-8 km on, priced by the real fare engine.
const buildOffer = async ({ driver, zone, pickupPoint, dispatchConfig }) => {
  const driverCoords = driver.location?.coordinates;
  if (!Array.isArray(driverCoords) || driverCoords.length !== 2) return { skip: 'No location on record' };

  let pickup = pickupPoint;
  if (!pickup) {
    pickup = offsetPoint(driverCoords, between(700, 2200));
    for (let attempt = 0; zone && attempt < 6 && !(await pointInZone(zone, pickup)); attempt += 1) {
      pickup = offsetPoint(driverCoords, between(300, 2000));
    }
    if (zone && !(await pointInZone(zone, pickup))) pickup = offsetPoint(driverCoords, 250);
  }
  const vehicleTypeId = driver.vehicleTypeId || driver.vehicleTypeIds?.[0];
  if (!vehicleTypeId) return { skip: 'No vehicle type' };

  let quote = null;
  let result = null;
  let drop = null;
  for (let attempt = 0; attempt < 3 && !quote; attempt += 1) {
    drop = offsetPoint(pickup, between(3000, 8000));
    result = await quoteRideFares({ pickupCoords: pickup, dropCoords: drop, vehicleTypeIds: [String(vehicleTypeId)] }).catch(() => null);
    quote = result?.quotes?.find((q) => q.vehicleTypeId === String(vehicleTypeId)) || null;
  }
  if (!quote) {
    // No live price for this vehicle here (e.g. its rows in this zone are
    // switched off). A test ride still has to look real, so it is priced on the
    // vehicle's own rate card - this zone's row even if switched off, else any
    // row with rates - over the road distance.
    const cards = await SetPrice.find({ vehicle_type: vehicleTypeId, pricing_scope: 'ride', price_per_distance: { $gt: 0 } })
      .select('zone_id base_price base_distance price_per_distance time_price service_tax admin_commision admin_commision_type admin_commission_type_from_driver admin_commission_from_driver')
      .lean();
    const card = cards.find((c) => driver.zoneId && String(c.zone_id) === String(driver.zoneId)) || cards[0];
    if (!card) return { skip: 'This vehicle has no rate card at all' };
    const trip = await resolveTripDistance({ pickupCoords: pickup, dropCoords: drop });
    const breakdown = computeRideFare({
      row: {
        base_price: card.base_price,
        base_distance: card.base_distance,
        price_per_distance: card.price_per_distance,
        time_price: card.time_price,
        service_tax: card.service_tax,
        rider_platform_fee: card.admin_commision,
        rider_platform_fee_type: Number(card.admin_commision_type ?? 1) === 1 ? 'percentage' : 'fixed',
      },
      distanceMeters: trip.distanceMeters,
      durationMinutes: trip.durationMinutes,
    });
    if (!(breakdown.total > 0)) return { skip: 'No price for this vehicle here' };
    quote = { fare: breakdown.total, breakdown, surgeMultiplier: 1, setPriceId: String(card._id) };
    result = { distanceMeters: Math.round(trip.distanceMeters), durationMinutes: Math.round(trip.durationMinutes * 10) / 10 };
  }

  const row = quote.setPriceId ? await SetPrice.findById(quote.setPriceId).select('admin_commission_type_from_driver admin_commission_from_driver').lean() : null;
  const [pickupAddress, dropAddress] = await Promise.all([
    addressFor(pickup, zone?.name || 'Pickup point'),
    addressFor(drop, 'Drop point'),
  ]);

  const offerId = String(new mongoose.Types.ObjectId());
  const now = new Date();
  const ride = {
    _id: offerId,
    serviceType: 'ride',
    userId: { _id: String(new mongoose.Types.ObjectId()), name: pick(RIDER_NAMES), phone: '', countryCode: '' },
    pickupLocation: { type: 'Point', coordinates: pickup },
    pickupAddress,
    dropLocation: { type: 'Point', coordinates: drop },
    dropAddress,
    stops: [],
    estimatedDistanceMeters: result.distanceMeters,
    estimatedDurationMinutes: result.durationMinutes,
    vehicleTypeId: String(vehicleTypeId),
    dispatchVehicleTypeIds: [String(vehicleTypeId)],
    vehicleIconType: driver.vehicleIconType || '',
    vehicleIconUrl: '',
    fare: quote.fare,
    baseFare: quote.fare,
    surge: { multiplier: quote.surgeMultiplier || 1 },
    tollCharges: null,
    bookingMode: 'normal',
    pricingNegotiationMode: 'none',
    biddingStatus: 'none',
    paymentMethod: 'cash',
    pricingSnapshot: {
      rider_platform_fee: quote.breakdown?.platformFee || 0,
      admin_commission_type_from_driver: Number(row?.admin_commission_type_from_driver ?? 1),
      admin_commission_from_driver: Number(row?.admin_commission_from_driver ?? 0),
    },
    dispatchTracking: { lastDispatchAttemptAt: now },
  };
  return { offerId, ride, sentAt: now, windowSeconds: dispatchConfig.retryWindowSeconds };
};

/// Sends a test ride. Target: driverIds, or a zone, or a city, optionally
/// narrowed to a vehicle type. Pickup is near each driver (inside the zone
/// when one was chosen), or the admin's point.
export const sendTestRide = async ({ admin, body = {} }) => {
  const { filter, zone } = await candidateFilter(body);
  const pickupPoint = Number.isFinite(Number(body.pickup?.lat)) && Number.isFinite(Number(body.pickup?.lng))
    ? [Number(body.pickup.lng), Number(body.pickup.lat)]
    : null;
  const target = Array.isArray(body.driverIds) && body.driverIds.length ? 'drivers'
    : zone ? 'zone' : validId(body.serviceLocationId) ? 'city' : 'all';

  const drivers = await Driver.find(filter)
    .select('name phone location vehicleTypeId vehicleTypeIds vehicleIconType zoneId')
    .limit(MAX_DRIVERS_PER_SEND + 1)
    .lean();
  if (!drivers.length) throw new ApiError(400, 'No online drivers match this choice');
  if (drivers.length > MAX_DRIVERS_PER_SEND) {
    throw new ApiError(400, `That is more than ${MAX_DRIVERS_PER_SEND} drivers. Pick a zone, city or vehicle type to narrow it down.`);
  }

  const dispatchConfig = await resolveTransportDispatchConfig();
  const recent = await recentlyTested(drivers.map((d) => d._id));
  const { emitRideRequestToDrivers } = await import('../../services/dispatchService.js');

  const offers = [];
  // Built a few at a time: each needs a route, a price and two addresses.
  for (let index = 0; index < drivers.length; index += 8) {
    const batch = drivers.slice(index, index + 8);
    const built = await Promise.all(batch.map(async (driver) => {
      if (recent.has(String(driver._id))) return { driver, skip: 'Already sent a test in the last 10 minutes' };
      try {
        return { driver, ...(await buildOffer({ driver, zone, pickupPoint, dispatchConfig })) };
      } catch (error) {
        return { driver, skip: error?.message || 'Could not build the offer' };
      }
    }));
    offers.push(...built);
  }

  const windowSeconds = dispatchConfig.retryWindowSeconds;
  const test = await TestRide.create({
    createdBy: { adminId: validId(admin?.id) ? oid(admin.id) : null, name: admin?.name || '' },
    target,
    zoneId: zone?._id || null,
    zoneName: zone?.name || '',
    serviceLocationId: validId(body.serviceLocationId) ? oid(body.serviceLocationId) : null,
    vehicleTypeId: validId(body.vehicleTypeId) ? oid(body.vehicleTypeId) : null,
    windowSeconds,
    expiresAt: new Date(Date.now() + windowSeconds * 1000),
    offers: offers.map((o) => ({
      offerId: o.offerId || String(new mongoose.Types.ObjectId()),
      driverId: o.driver._id,
      status: o.skip ? 'skipped' : 'sent',
      skipReason: o.skip || '',
      sentAt: o.skip ? null : o.sentAt,
      ride: o.skip ? null : o.ride,
    })),
  });

  // Exactly the real offer path: socket event, data-only push for the
  // lock-screen card, same payload.
  for (const offer of offers) {
    if (offer.skip) continue;
    emitRideRequestToDrivers({
      ride: offer.ride,
      targetDrivers: [offer.driver],
      zone: zone || (offer.driver.zoneId ? { _id: offer.driver.zoneId } : null),
      effectiveRadius: dispatchConfig.baseDistanceMeters || 5000,
      dispatchVehicleTypeIds: offer.ride.dispatchVehicleTypeIds,
      dispatchConfig,
      attemptIndex: 0,
    }).catch((error) => console.error('[test-ride] offer not sent', error?.message));
  }

  // After the window, close the cards nobody answered, as a real offer closes.
  setTimeout(() => {
    closeExpiredTestOffers(test._id).catch(() => {});
  }, (windowSeconds + 2) * 1000).unref?.();

  return getTestRide(test._id);
};

const closeExpiredTestOffers = async (testId) => {
  const test = await TestRide.findById(testId);
  if (!test) return;
  const { emitToDriver, sendRideOfferClosedPush } = await import('../../services/dispatchService.js');
  const unanswered = test.offers.filter((offer) => offer.status === 'sent');
  for (const offer of unanswered) {
    offer.status = 'expired';
    emitToDriver(String(offer.driverId), 'rideRequestClosed', { rideId: offer.offerId, reason: 'search-window-expired' });
  }
  if (unanswered.length) {
    unanswered.forEach((offer) => sendRideOfferClosedPush([String(offer.driverId)], offer.offerId));
    await test.save();
  }
};

/**
 * The driver answered an offer. Returns null when [offerId] is not a test ride
 * (the caller carries on with the real ride), otherwise records the answer and
 * returns { accepted } - an accept is then refused exactly like a race lost to
 * another driver.
 */
export const answerTestOffer = async ({ offerId, driverId, action, via = 'app' }) => {
  if (!offerId) return null;
  const test = await TestRide.findOne({ 'offers.offerId': String(offerId) }).select('offers windowSeconds createdAt');
  if (!test) return null;
  const offer = test.offers.find((o) => o.offerId === String(offerId));
  if (!offer || String(offer.driverId) !== String(driverId)) return { accepted: action === 'accept' };

  if (offer.status === 'sent') {
    const now = new Date();
    const late = offer.sentAt && now - offer.sentAt > (test.windowSeconds + 5) * 1000;
    await TestRide.updateOne(
      { _id: test._id, 'offers.offerId': offer.offerId, 'offers.status': 'sent' },
      {
        $set: {
          'offers.$.status': late ? 'expired' : (action === 'accept' ? 'accepted' : 'rejected'),
          'offers.$.answeredAt': now,
          'offers.$.responseMs': offer.sentAt ? now - offer.sentAt : null,
          'offers.$.answeredVia': via,
        },
      },
    );
  }

  if (action === 'accept') {
    const { emitToDriver, sendRideOfferClosedPush } = await import('../../services/dispatchService.js');
    emitToDriver(String(driverId), 'rideRequestClosed', {
      rideId: offer.offerId,
      reason: 'accepted-by-another-driver',
      message: ANOTHER_DRIVER_ACCEPTED,
    });
    sendRideOfferClosedPush([String(driverId)], offer.offerId);
  }
  return { accepted: action === 'accept' };
};

/// Unanswered test offers for this driver, as ride-shaped objects for the
/// driver app's offer list (GET /drivers/ride-offers).
export const pendingTestOffersFor = async (driverId) => {
  const since = new Date(Date.now() - 2 * 60 * 1000);
  const tests = await TestRide.find({ createdAt: { $gte: since }, 'offers.driverId': oid(driverId), expiresAt: { $gt: new Date() } })
    .select('offers').lean();
  const rides = [];
  tests.forEach((test) => test.offers.forEach((offer) => {
    if (String(offer.driverId) === String(driverId) && offer.status === 'sent' && offer.ride) {
      rides.push({
        ...offer.ride,
        dispatchTracking: { lastDispatchAttemptAt: offer.sentAt },
      });
    }
  }));
  return rides;
};

const serializeTest = async (test) => {
  const drivers = await Driver.find({ _id: { $in: test.offers.map((o) => o.driverId) } }).select('name phone vehicleNumber').lean();
  const byId = new Map(drivers.map((d) => [String(d._id), d]));
  const expired = Date.now() > new Date(test.expiresAt).getTime() + 3000;
  const offers = test.offers.map((offer) => {
    const driver = byId.get(String(offer.driverId)) || {};
    const status = offer.status === 'sent' && expired ? 'expired' : offer.status;
    return {
      driverId: String(offer.driverId),
      name: driver.name || '',
      phone: driver.phone || '',
      vehicleNumber: driver.vehicleNumber || '',
      status,
      skipReason: offer.skipReason || '',
      sentAt: offer.sentAt,
      answeredAt: offer.answeredAt,
      responseSeconds: offer.responseMs !== null && offer.responseMs !== undefined ? Math.round(offer.responseMs / 100) / 10 : null,
      answeredVia: offer.answeredVia || '',
      pickupAddress: offer.ride?.pickupAddress || '',
      dropAddress: offer.ride?.dropAddress || '',
      fare: offer.ride?.fare ?? null,
    };
  });
  const counts = offers.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {});
  const answered = offers.filter((o) => o.responseSeconds !== null);
  return {
    id: String(test._id),
    createdAt: test.createdAt,
    createdBy: test.createdBy?.name || '',
    target: test.target,
    zoneName: test.zoneName || '',
    windowSeconds: test.windowSeconds,
    expiresAt: test.expiresAt,
    live: !expired,
    counts,
    avgResponseSeconds: answered.length ? Math.round((answered.reduce((s, o) => s + o.responseSeconds, 0) / answered.length) * 10) / 10 : null,
    offers,
  };
};

export const getTestRide = async (testId) => {
  if (!validId(testId)) throw new ApiError(400, 'Invalid test');
  const test = await TestRide.findById(testId).lean();
  if (!test) throw new ApiError(404, 'Test not found');
  return serializeTest(test);
};

export const listTestRides = async () => {
  const tests = await TestRide.find({}).sort({ createdAt: -1 }).limit(50).lean();
  return Promise.all(tests.map(async (test) => {
    const full = await serializeTest(test);
    delete full.offers;
    return { ...full, drivers: test.offers.length };
  }));
};
