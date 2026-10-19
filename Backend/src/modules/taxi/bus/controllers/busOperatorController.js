import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { BusService } from '../../admin/models/BusService.js';
import { Owner } from '../../admin/models/Owner.js';
import { BusBooking } from '../../user/models/BusBooking.js';
import { BusOperator } from '../models/BusOperator.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const round = (value) => Math.round(Number(value || 0) * 100) / 100;

const toIds = (values, label) =>
  (Array.isArray(values) ? values : []).map((id) => {
    if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}`);
    return String(id);
  });

const serializeOperator = (operator, extras = {}) => ({
  id: String(operator._id),
  name: operator.name,
  legalName: operator.legalName || '',
  gstin: operator.gstin || '',
  contactName: operator.contactName || '',
  phone: operator.phone || '',
  email: operator.email || '',
  address: operator.address || '',
  city: operator.city || '',
  commissionPercent: Number(operator.commissionPercent ?? 10),
  ownerIds: (operator.ownerIds || []).map(String),
  status: operator.status,
  notes: operator.notes || '',
  createdAt: operator.createdAt || null,
  ...extras,
});

const applyOperatorFields = (operator, body = {}) => {
  ['name', 'legalName', 'gstin', 'contactName', 'phone', 'email', 'address', 'city', 'notes'].forEach((key) => {
    if (body[key] !== undefined) operator[key] = String(body[key] || '').trim().slice(0, 300);
  });
  if (body.commissionPercent !== undefined) {
    const value = Number(body.commissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new ApiError(400, 'Commission must be 0-100%');
    operator.commissionPercent = value;
  }
  if (body.status !== undefined) operator.status = body.status === 'suspended' ? 'suspended' : 'active';
  if (body.ownerIds !== undefined) operator.ownerIds = toIds(body.ownerIds, 'owner');
  if (!operator.name) throw new ApiError(400, 'Company name is required');
};

/// Points the given buses at this company (and frees buses it no longer has).
const assignBuses = async (operator, busServiceIds) => {
  if (busServiceIds === undefined) return;
  const ids = toIds(busServiceIds, 'bus');
  await BusService.updateMany(
    { operatorId: operator._id, _id: { $nin: ids } },
    { $set: { operatorId: null } },
  );
  if (ids.length) {
    await BusService.updateMany(
      { _id: { $in: ids } },
      { $set: { operatorId: operator._id, operatorName: operator.name } },
    );
  }
};

export const adminListOperators = async (_req, res) => {
  const operators = await BusOperator.find().sort({ name: 1 }).lean();
  const buses = await BusService.find({ operatorId: { $ne: null } }).select('operatorId busName registrationNumber status').lean();
  const ownerIds = [...new Set(operators.flatMap((operator) => (operator.ownerIds || []).map(String)))];
  const owners = await Owner.find({ _id: { $in: ownerIds } }).select('name owner_name company_name mobile phone email').lean();
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));

  ok(res, operators.map((operator) => serializeOperator(operator, {
    buses: buses
      .filter((bus) => String(bus.operatorId) === String(operator._id))
      .map((bus) => ({ id: String(bus._id), busName: bus.busName, registrationNumber: bus.registrationNumber || '', status: bus.status })),
    owners: (operator.ownerIds || []).map((id) => {
      const owner = ownerById.get(String(id));
      return {
        id: String(id),
        name: owner?.owner_name || owner?.name || owner?.company_name || 'Owner',
        phone: owner?.mobile || owner?.phone || '',
        email: owner?.email || '',
      };
    }),
  })));
};

export const adminCreateOperator = async (req, res) => {
  const operator = new BusOperator({ name: '' });
  applyOperatorFields(operator, req.body);
  await operator.save();
  await assignBuses(operator, req.body?.busServiceIds);
  ok(res, serializeOperator(operator), 201);
};

export const adminUpdateOperator = async (req, res) => {
  const operator = await BusOperator.findById(req.params.id);
  if (!operator) throw new ApiError(404, 'Operator not found');
  applyOperatorFields(operator, req.body);
  await operator.save();
  await assignBuses(operator, req.body?.busServiceIds);
  if (req.body?.name !== undefined) {
    await BusService.updateMany({ operatorId: operator._id }, { $set: { operatorName: operator.name } });
  }
  ok(res, serializeOperator(operator));
};

/// Sales and settlement for one company over a date range (travel dates),
/// split by where each ticket was sold. Commission applies to ZI Bus sales.
export const adminOperatorReport = async (req, res) => {
  const operator = await BusOperator.findById(req.params.id).lean();
  if (!operator) throw new ApiError(404, 'Operator not found');

  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.from || '')) ? String(req.query.from) : '0000-00-00';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.to || '')) ? String(req.query.to) : '9999-12-31';

  const buses = await BusService.find({ operatorId: operator._id }).select('busName registrationNumber adminCommissionPercentage').lean();
  const busIds = buses.map((bus) => bus._id);

  const rows = await BusBooking.aggregate([
    { $match: { busServiceId: { $in: busIds }, status: 'confirmed', travelDate: { $gte: from, $lte: to } } },
    {
      $project: {
        busServiceId: 1,
        bookingSource: 1,
        amount: 1,
        activeSeats: { $subtract: [{ $size: '$seatIds' }, { $size: { $ifNull: ['$cancelledSeats', []] } }] },
      },
    },
    {
      $group: {
        _id: { bus: '$busServiceId', source: '$bookingSource' },
        bookings: { $sum: 1 },
        seats: { $sum: '$activeSeats' },
        gross: { $sum: '$amount' },
      },
    },
  ]);

  const companyRate = Number(operator.commissionPercent ?? 10);
  const perBus = buses.map((bus) => {
    // A rate set on the bus itself (Bus Commission page) wins over the
    // company default.
    const busRate = Number(bus.adminCommissionPercentage);
    const commissionRate = (Number.isFinite(busRate) && busRate > 0 ? busRate : companyRate) / 100;
    const mine = rows.filter((row) => String(row._id.bus) === String(bus._id));
    const zibus = mine.filter((row) => row._id.source === 'user');
    const zibusGross = round(zibus.reduce((sum, row) => sum + row.gross, 0));
    return {
      busServiceId: String(bus._id),
      busName: bus.busName,
      registrationNumber: bus.registrationNumber || '',
      seatsBySource: mine.map((row) => ({ source: row._id.source, seats: row.seats, bookings: row.bookings })),
      zibusGross,
      commissionPercent: round(commissionRate * 100),
      commission: round(zibusGross * commissionRate),
      payout: round(zibusGross * (1 - commissionRate)),
    };
  });

  ok(res, {
    operator: serializeOperator(operator),
    from: from === '0000-00-00' ? '' : from,
    to: to === '9999-12-31' ? '' : to,
    buses: perBus,
    totals: {
      zibusGross: round(perBus.reduce((sum, bus) => sum + bus.zibusGross, 0)),
      commission: round(perBus.reduce((sum, bus) => sum + bus.commission, 0)),
      payout: round(perBus.reduce((sum, bus) => sum + bus.payout, 0)),
      seats: perBus.reduce((sum, bus) => sum + bus.seatsBySource.reduce((inner, row) => inner + row.seats, 0), 0),
    },
  });
};

/// Owner accounts an admin can attach to a company.
export const adminListOwnersForOperators = async (req, res) => {
  const search = String(req.query?.search || '').trim();
  const filter = {};
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: pattern }, { owner_name: pattern }, { company_name: pattern }, { mobile: pattern }, { email: pattern }];
  }
  const owners = await Owner.find(filter).select('name owner_name company_name mobile phone email').limit(50).lean();
  ok(res, owners.map((owner) => ({
    id: String(owner._id),
    name: owner.owner_name || owner.name || owner.company_name || 'Owner',
    company: owner.company_name || '',
    phone: owner.mobile || owner.phone || '',
    email: owner.email || '',
  })));
};
