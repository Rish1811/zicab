import mongoose from 'mongoose';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { TollPlaza } from '../models/TollPlaza.js';
import { Vehicle } from '../models/Vehicle.js';
import { hasAdminPermission } from '../services/adminAccessService.js';
import { estimateTolls, isRoundTripValue } from '../../services/tollService.js';

/**
 * Admin > Price Management > Toll Charges: the toll plazas on outstation
 * routes and what each vehicle pays at them. See services/tollService.js for
 * how a trip's tolls are found.
 */

const requirePriceAccess = (req) => {
  const admin = req.auth?.admin;
  if (admin && !hasAdminPermission(admin, 'set_prices.view')) {
    throw new ApiError(403, 'You do not have permission to manage toll charges');
  }
};

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0;
};

/// "lat,lng" -> [lng, lat], or null.
const parseLatLng = (value) => {
  const [lat, lng] = String(value || '').split(',').map((part) => Number(part.trim()));
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
};

/// The plaza fields an admin may set, checked.
const readPlaza = (body = {}, { partial = false } = {}) => {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError(400, 'Toll plaza name is required');
    out.name = name.slice(0, 120);
  }
  if (body.highway !== undefined) out.highway = String(body.highway || '').trim().slice(0, 80);
  if (body.notes !== undefined) out.notes = String(body.notes || '').trim().slice(0, 500);
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.radius_meters !== undefined) {
    out.radius_meters = Math.min(2000, Math.max(50, Math.round(Number(body.radius_meters) || 250)));
  }
  const lat = Number(body.lat ?? body.latitude);
  const lng = Number(body.lng ?? body.longitude);
  if (!partial || body.lat !== undefined || body.lng !== undefined) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
      throw new ApiError(400, 'A valid location (lat, lng) is required');
    }
    out.location = { type: 'Point', coordinates: [lng, lat] };
  }
  if (body.service_location_ids !== undefined) {
    out.service_location_ids = (Array.isArray(body.service_location_ids) ? body.service_location_ids : [])
      .filter(isId)
      .map((id) => new mongoose.Types.ObjectId(String(id)));
  }
  if (body.prices !== undefined) {
    const seen = new Set();
    out.prices = (Array.isArray(body.prices) ? body.prices : [])
      .filter((price) => isId(price?.vehicle_type_id))
      .filter((price) => {
        const key = String(price.vehicle_type_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((price) => ({
        vehicle_type_id: new mongoose.Types.ObjectId(String(price.vehicle_type_id)),
        one_way: money(price.one_way),
        return_trip: money(price.return_trip),
      }))
      // A row with neither price set is "not priced", not "free".
      .filter((price) => price.one_way > 0 || price.return_trip > 0);
  }
  return out;
};

const serializePlaza = (plaza, vehicleNames = new Map()) => ({
  id: String(plaza._id),
  name: plaza.name,
  highway: plaza.highway || '',
  lat: plaza.location?.coordinates?.[1] ?? null,
  lng: plaza.location?.coordinates?.[0] ?? null,
  radius_meters: plaza.radius_meters || 250,
  service_location_ids: (plaza.service_location_ids || []).map(String),
  prices: (plaza.prices || []).map((price) => ({
    vehicle_type_id: String(price.vehicle_type_id),
    vehicle_name: vehicleNames.get(String(price.vehicle_type_id)) || '',
    one_way: price.one_way,
    return_trip: price.return_trip,
  })),
  active: plaza.active !== false,
  notes: plaza.notes || '',
  updatedAt: plaza.updatedAt,
});

const vehicleNameMap = async () =>
  new Map((await Vehicle.find({}).select('name').lean()).map((v) => [String(v._id), v.name]));

export const listTollPlazas = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  const q = String(req.query?.q || '').trim();
  const query = {};
  if (q) {
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: pattern }, { highway: pattern }];
  }
  if (isId(req.query?.service_location_id)) query.service_location_ids = req.query.service_location_id;
  const [plazas, names] = await Promise.all([TollPlaza.find(query).sort({ name: 1 }).lean(), vehicleNameMap()]);
  res.json({ success: true, data: { results: plazas.map((p) => serializePlaza(p, names)), total: plazas.length } });
});

export const createTollPlaza = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  const plaza = await TollPlaza.create(readPlaza(req.body));
  res.status(201).json({ success: true, data: serializePlaza(plaza.toObject(), await vehicleNameMap()) });
});

export const updateTollPlaza = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  if (!isId(req.params.id)) throw new ApiError(400, 'Invalid toll plaza');
  const plaza = await TollPlaza.findByIdAndUpdate(
    req.params.id,
    { $set: readPlaza(req.body, { partial: true }) },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!plaza) throw new ApiError(404, 'Toll plaza not found');
  res.json({ success: true, data: serializePlaza(plaza, await vehicleNameMap()) });
});

export const deleteTollPlaza = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  if (!isId(req.params.id)) throw new ApiError(400, 'Invalid toll plaza');
  const result = await TollPlaza.deleteOne({ _id: req.params.id });
  if (!result.deletedCount) throw new ApiError(404, 'Toll plaza not found');
  res.json({ success: true, data: { id: req.params.id, deleted: true } });
});

/**
 * Many plazas at once, from the admin's CSV: `{ rows: [{ name, highway, lat,
 * lng, radius_meters, prices: [{ vehicle_type_id, one_way, return_trip }] }] }`.
 * A row whose name and location match an existing plaza updates it. Bad rows
 * are reported, not fatal.
 */
export const importTollPlazas = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 500) : [];
  let created = 0;
  let updated = 0;
  const errors = [];
  for (const [index, row] of rows.entries()) {
    try {
      const fields = readPlaza({ ...row, active: row.active ?? true });
      const existing = await TollPlaza.findOne({
        name: fields.name,
        location: { $nearSphere: { $geometry: fields.location, $maxDistance: 300 } },
      }).select('_id');
      if (existing) {
        await TollPlaza.updateOne({ _id: existing._id }, { $set: fields });
        updated += 1;
      } else {
        await TollPlaza.create(fields);
        created += 1;
      }
    } catch (error) {
      errors.push({ row: index + 1, name: row?.name || '', message: error.message });
    }
  }
  res.json({ success: true, data: { created, updated, errors } });
});

/// Which plazas a route passes and what each vehicle pays - for checking the
/// setup from the admin page before riders see it.
export const previewRouteTolls = asyncHandler(async (req, res) => {
  requirePriceAccess(req);
  const origin = parseLatLng(req.query?.origin);
  const destination = parseLatLng(req.query?.destination);
  if (!origin || !destination) throw new ApiError(400, 'origin and destination are required, each as "lat,lng"');
  const vehicles = await Vehicle.find({}).select('name').lean();
  const result = await estimateTolls({
    origin,
    destination,
    vehicleTypeIds: vehicles.map((v) => String(v._id)),
    roundTrip: isRoundTripValue(req.query?.trip_type),
  });
  const names = new Map(vehicles.map((v) => [String(v._id), v.name]));
  res.json({
    success: true,
    data: {
      ...result,
      byVehicle: Object.entries(result.byVehicle)
        .filter(([, tolls]) => tolls.total > 0)
        .map(([id, tolls]) => ({ vehicle_type_id: id, vehicle_name: names.get(id) || '', ...tolls })),
    },
  });
});

/**
 * GET /users/outstation-tolls - the tolls on a rider's outstation trip, per
 * vehicle, for the vehicle list's prices. Query: origin, destination ("lat,lng"),
 * optional waypoints ("lat,lng|lat,lng"), trip_type (one_way | round_trip),
 * vehicle_type_ids (comma separated). A route that cannot be resolved quotes no
 * tolls rather than failing the booking screen.
 */
export const getOutstationTolls = asyncHandler(async (req, res) => {
  const origin = parseLatLng(req.query?.origin);
  const destination = parseLatLng(req.query?.destination);
  if (!origin || !destination) throw new ApiError(400, 'origin and destination are required, each as "lat,lng"');
  const stops = String(req.query?.waypoints || '').split('|').map(parseLatLng).filter(Boolean).slice(0, 8);
  const vehicleTypeIds = String(req.query?.vehicle_type_ids || '').split(',').map((id) => id.trim()).filter(isId);
  const result = await estimateTolls({
    origin,
    destination,
    stops,
    vehicleTypeIds,
    roundTrip: isRoundTripValue(req.query?.trip_type),
  });
  res.json({
    success: true,
    data: {
      route_found: result.routeFound,
      round_trip: isRoundTripValue(req.query?.trip_type),
      plazas: result.plazas,
      by_vehicle: result.byVehicle,
    },
  });
});
