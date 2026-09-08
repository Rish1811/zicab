import { ApiError } from '../../../../utils/ApiError.js';
import { normalizePoint } from '../../../../utils/geo.js';
import { GoodsType } from '../../admin/models/GoodsType.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { startDispatchFlow } from '../../services/dispatchService.js';
import { findZoneByPickup } from '../../services/matchingService.js';
import { Delivery } from '../models/Delivery.js';
import {
  createRideRecord,
  ensureRideParticipantAccess,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  listRideHistoryForIdentity,
  serializeRideRealtime,
} from '../../services/rideService.js';

const ensureParcelRide = (ride) => {
  if (!ride || String(ride.serviceType || ride.type || 'ride').toLowerCase() !== 'parcel') {
    throw new ApiError(404, 'Delivery not found');
  }

  return ride;
};

const normalizeVehicleLabel = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getVehicleTokens = (vehicle = {}) =>
  [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.icon_types,
    String(vehicle?.name || '').replace(/\s+/g, '_'),
  ]
    .map(normalizeVehicleLabel)
    .filter(Boolean);

const goodsTypeAllowsVehicle = (goodsType, vehicle) => {
  const allowedLabels = String(goodsType?.goods_types_for || goodsType?.goods_type_for || 'both')
    .split(',')
    .map(normalizeVehicleLabel)
    .filter(Boolean);

  if (!allowedLabels.length || allowedLabels.includes('both') || allowedLabels.includes('all')) {
    return true;
  }

  const tokens = getVehicleTokens(vehicle);
  return allowedLabels.some((label) => tokens.some((token) => token.includes(label) || label.includes(token)));
};

const ensureDeliveryVehicleAllowed = async ({ vehicleTypeId, parcel }) => {
  const category = String(parcel?.category || '').trim();

  if (!vehicleTypeId || !category) {
    return;
  }

  const [goodsType, vehicle] = await Promise.all([
    GoodsType.findOne({
      goods_type_name: { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      active: 1,
    })
      .select('goods_type_name goods_types_for goods_type_for')
      .lean(),
    Vehicle.findById(vehicleTypeId).select('name vehicle_type icon_types').lean(),
  ]);

  if (!goodsType || !vehicle) {
    return;
  }

  if (!goodsTypeAllowsVehicle(goodsType, vehicle)) {
    throw new ApiError(400, `${goodsType.goods_type_name || category} is not allowed for the selected vehicle type`);
  }
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords = [], toCoords = []) => {
  if (!Array.isArray(fromCoords) || !Array.isArray(toCoords) || fromCoords.length < 2 || toCoords.length < 2) {
    return 0;
  }

  const [fromLng, fromLat] = fromCoords.map(Number);
  const [toLng, toLat] = toCoords.map(Number);
  if (![fromLng, fromLat, toLng, toLat].every(Number.isFinite)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/// Parcels are an intracity service, so a booking that crosses between cities is
/// refused.
///
/// The unambiguous case is both ends resolving to *different* operating zones —
/// that is intercity by definition. A drop with no zone at all is not: zone
/// polygons are drawn tight, and Kempegowda airport sits 23.5km from the centre
/// of a 23.3km Bangalore circle, so a strict same-zone rule would refuse airport
/// deliveries, which are a normal intracity job. Those fall back to a distance
/// limit instead, taken from the pickup zone's own configured maximum where one
/// is set.
const DEFAULT_INTRACITY_MAX_KM = 60;

const assertIntracityDelivery = async (pickupCoords, dropCoords) => {
  const [pickupZone, dropZone] = await Promise.all([
    findZoneByPickup(pickupCoords),
    findZoneByPickup(dropCoords),
  ]);

  if (!pickupZone) {
    throw new ApiError(400, 'We do not deliver from this pickup location yet.');
  }

  // Both ends inside known, different cities: unambiguously intercity.
  if (dropZone && String(pickupZone._id) !== String(dropZone._id)) {
    throw new ApiError(
      400,
      `Parcels are available within one city only. This pickup is in ${pickupZone.name} and the drop is in ${dropZone.name}.`,
    );
  }

  if (dropZone) {
    return pickupZone;
  }

  // Drop is outside every polygon — allow it only if it is still close enough to
  // be a city job, so somewhere like the airport works but a long-distance hop
  // does not slip through at intracity rates.
  const limitKm = Number(pickupZone.maximum_distance_for_regular_rides) > 0
    ? Number(pickupZone.maximum_distance_for_regular_rides)
    : DEFAULT_INTRACITY_MAX_KM;
  const distanceKm = calculateDistanceKm(pickupCoords, dropCoords);

  if (distanceKm > limitKm) {
    throw new ApiError(
      400,
      `This drop is too far for a parcel delivery. Parcels are available within ${pickupZone.name} and up to ${limitKm}km.`,
    );
  }

  return pickupZone;
};

const computeDeliveryFareBreakdown = ({ vehicle = {}, pickupCoords = [], dropCoords = [] }) => {
  const pricing = vehicle?.delivery_distance_pricing || {};
  const enabled = Boolean(
    pricing?.enabled ||
    Number(pricing?.base_price || 0) > 0 ||
    Number(pricing?.distance_price || 0) > 0
  );
  // Computed ahead of the enabled check so both branches — priced and
  // unpriced — can report the actual pickup/drop distance to the caller;
  // the quote screen shows this even when the vehicle has no fare configured.
  const distanceKm = Math.max(0, calculateDistanceKm(pickupCoords, dropCoords));
  const baseDistance = Math.max(0, Number(pricing?.base_distance ?? pricing?.free_distance ?? 0));

  if (!enabled) {
    return {
      total: 0,
      subtotal: 0,
      serviceTaxPercentage: Math.max(0, Number(vehicle?.service_tax || 0)),
      serviceTaxAmount: 0,
      distanceKm: roundCurrency(distanceKm),
      baseDistanceKm: roundCurrency(baseDistance),
    };
  }

  const basePrice = Math.max(0, Number(pricing?.base_price || 0));
  const distancePrice = Math.max(0, Number(pricing?.distance_price || 0));
  const extraDistanceKm = Math.max(distanceKm - baseDistance, 0);
  const distanceCharge = extraDistanceKm * distancePrice;
  const subtotal = basePrice + distanceCharge;
  const serviceTaxPercentage = Math.max(0, Number(vehicle?.service_tax || 0));
  const serviceTaxAmount = (subtotal * serviceTaxPercentage) / 100;

  return {
    total: roundCurrency(subtotal + serviceTaxAmount),
    subtotal: roundCurrency(subtotal),
    serviceTaxPercentage: roundCurrency(serviceTaxPercentage),
    serviceTaxAmount: roundCurrency(serviceTaxAmount),
    distanceKm: roundCurrency(distanceKm),
    baseDistanceKm: roundCurrency(baseDistance),
  };
};

export const serializeDeliveryRealtime = (ride) => {
  const serializedRide = serializeRideRealtime(ride);

  return {
    ...serializedRide,
    deliveryId: ride.deliveryId?._id ? String(ride.deliveryId._id) : ride.deliveryId ? String(ride.deliveryId) : null,
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    type: 'parcel',
    serviceType: 'parcel',
  };
};

export const createDeliveryRecord = async ({
  userId,
  pickup,
  drop,
  pickupAddress,
  dropAddress,
  fare,
  vehicleTypeId,
  vehicleTypeIds,
  vehicleIconType,
  vehicleIconUrl,
  paymentMethod,
  parcel,
}) => {
  await ensureDeliveryVehicleAllowed({ vehicleTypeId, parcel });
  const pickupCoords = normalizePoint(pickup, 'pickup');
  const dropCoords = normalizePoint(drop, 'drop');
  await assertIntracityDelivery(pickupCoords, dropCoords);
  const vehicle = vehicleTypeId
    ? await Vehicle.findById(vehicleTypeId).select('delivery_distance_pricing service_tax').lean()
    : null;
  const fareBreakdown = computeDeliveryFareBreakdown({ vehicle, pickupCoords, dropCoords });
  const resolvedFare = fareBreakdown.total > 0 ? fareBreakdown.total : Number(fare || 0);

  const ride = await createRideRecord({
    userId,
    pickupCoords,
    dropCoords,
    pickupAddress,
    dropAddress,
    fare: resolvedFare,
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    transport_type: 'delivery',
    serviceType: 'parcel',
    parcel,
  });

  await startDispatchFlow(ride);

  const detailedRide = await getRideDetails(ride._id);
  return serializeDeliveryRealtime(ensureParcelRide(detailedRide));
};

/// The fare the app shows on the address/details screen before booking.
///
/// Runs the exact same `computeDeliveryFareBreakdown` that `createDeliveryRecord`
/// uses to set the charged fare, so what the rider is quoted here is always
/// what the booking actually charges — nothing here is recomputed differently
/// between the two call sites.
export const getDeliveryQuote = async ({ vehicleTypeId, pickup, drop, parcel }) => {
  if (!vehicleTypeId) {
    throw new ApiError(400, 'vehicleTypeId is required');
  }

  await ensureDeliveryVehicleAllowed({ vehicleTypeId, parcel });

  const pickupCoords = normalizePoint(pickup, 'pickup');
  const dropCoords = normalizePoint(drop, 'drop');
  // Checked here as well as at booking: a quote that a booking then refuses is
  // worse than refusing up front.
  await assertIntracityDelivery(pickupCoords, dropCoords);
  const vehicle = await Vehicle.findById(vehicleTypeId)
    .select('name delivery_distance_pricing service_tax')
    .lean();

  if (!vehicle) {
    throw new ApiError(404, 'Vehicle type not found');
  }

  const fareBreakdown = computeDeliveryFareBreakdown({ vehicle, pickupCoords, dropCoords });

  return {
    vehicleTypeId: String(vehicleTypeId),
    vehicleName: vehicle.name || '',
    ...fareBreakdown,
  };
};

export const getActiveDeliveryForIdentity = async ({ role, entityId }) => {
  const ride = await getActiveRideForIdentity({ role, entityId });

  if (!ride) {
    return null;
  }

  if (String(ride.serviceType || ride.type || 'ride').toLowerCase() !== 'parcel') {
    return null;
  }

  return serializeDeliveryRealtime(ride);
};

export const getDeliveryById = async ({ deliveryId, role, entityId }) => {
  const delivery = await Delivery.findById(deliveryId).select('rideId');

  if (!delivery?.rideId) {
    throw new ApiError(404, 'Delivery not found');
  }

  await ensureRideParticipantAccess({ rideId: delivery.rideId, role, entityId });
  const ride = await getRideDetails(delivery.rideId);
  return serializeDeliveryRealtime(ensureParcelRide(ride));
};

export const listDeliveriesForIdentity = async ({ role, entityId, limit }) => {
  const rides = await listRideHistoryForIdentity({ role, entityId, limit });
  return rides
    .filter((ride) => String(ride.serviceType || ride.type || 'ride').toLowerCase() === 'parcel')
    .map((ride) => ({
      ...ride,
      type: 'parcel',
      serviceType: 'parcel',
    }));
};
