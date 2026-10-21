import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { uploadDataUrl } from '../../../../utils/fileUpload.js';
import { hashPassword } from '../../services/passwordService.js';
import { Dhaba } from '../models/Dhaba.js';
import { DhabaPayout } from '../models/DhabaPayout.js';
import { serializeDhaba, serializeMenuItem } from '../services/dhabaService.js';
import { computeDhabaLedgers, getDhabaLedger, serializeDhabaPayout } from '../services/dhabaLedgerService.js';
import { normalizeDhabaPhone, readMenuItemInput } from './dhabaController.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const MAX_PHOTOS = 5;
const FSSAI_PATTERN = /^\d{14}$/;

const requireObjectId = (value, label = 'id') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Valid ${label} is required`);
  }
  return String(value);
};

const loadDhaba = async (id) => {
  const dhaba = await Dhaba.findById(requireObjectId(id));
  if (!dhaba) {
    throw new ApiError(404, 'Dhaba not found');
  }
  return dhaba;
};

const adminName = (req) => String(req.auth?.admin?.email || req.auth?.admin?.name || req.auth?.sub || 'admin');

// ------------------------------------------------------------ registration

const readRegistration = (body = {}) => {
  const text = (key, max, label, required = true) => {
    const value = String(body[key] || '').trim().slice(0, max);
    if (required && !value) throw new ApiError(400, `${label} is required`);
    return value;
  };

  const phone = normalizeDhabaPhone(body.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new ApiError(400, 'Enter a valid 10-digit mobile number');
  }
  const email = text('email', 120, 'Email', false).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'Enter a valid email address');
  }
  const password = String(body.password || '');
  if (password.length < 6 || password.length > 72) {
    throw new ApiError(400, 'Password must be 6 to 72 characters');
  }
  const fssaiNumber = String(body.fssaiNumber || '').replace(/\s/g, '');
  if (!FSSAI_PATTERN.test(fssaiNumber)) {
    throw new ApiError(400, 'FSSAI licence number must be 14 digits');
  }
  const lat = Number(body.location?.lat);
  const lng = Number(body.location?.lng);
  // Rough bounding box for India.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 37.5 || lng < 68 || lng > 97.5) {
    throw new ApiError(400, 'Pin your dhaba on the map');
  }
  const photos = Array.isArray(body.photos) ? body.photos.filter(Boolean) : [];
  if (!photos.length) {
    throw new ApiError(400, 'Add at least one photo of your dhaba');
  }
  if (photos.length > MAX_PHOTOS) {
    throw new ApiError(400, `Add up to ${MAX_PHOTOS} photos`);
  }

  return {
    name: text('name', 120, 'Dhaba name'),
    ownerName: text('ownerName', 120, 'Owner name'),
    phone,
    email,
    password,
    address: text('address', 300, 'Address'),
    city: text('city', 80, 'City or town'),
    highway: text('highway', 80, 'Highway', false),
    fssaiNumber,
    location: { lat, lng },
    photos,
  };
};

/// Public "Register your dhaba". The account starts pending and inactive, so
/// it can neither sign in nor appear to passengers until an admin approves
/// it. A rejected applicant can apply again with the same phone.
export const registerDhaba = async (req, res) => {
  const input = readRegistration(req.body);

  const existing = await Dhaba.findOne({ phone: input.phone });
  if (existing && existing.approvalStatus === 'pending') {
    throw new ApiError(409, 'This phone number already has a registration under review.');
  }
  if (existing && existing.approvalStatus !== 'rejected') {
    throw new ApiError(409, 'This phone number is already registered. Please sign in.');
  }

  const photoUrls = [];
  for (const [index, dataUrl] of input.photos.entries()) {
    const uploaded = await uploadDataUrl({
      dataUrl,
      folder: 'dhabas',
      publicIdPrefix: 'dhaba-photo',
      publicIdSuffix: `${input.phone}-${index + 1}`,
    });
    photoUrls.push(uploaded.secureUrl);
  }

  const dhaba = existing || new Dhaba();
  Object.assign(dhaba, {
    name: input.name,
    ownerName: input.ownerName,
    phone: input.phone,
    email: input.email,
    password: await hashPassword(input.password),
    address: input.address,
    city: input.city,
    highway: input.highway,
    fssaiNumber: input.fssaiNumber,
    location: input.location,
    photos: photoUrls,
    image: photoUrls[0],
    approvalStatus: 'pending',
    registeredVia: 'self',
    rejectionReason: '',
    reviewedAt: null,
    reviewedBy: '',
    active: false,
  });
  await dhaba.save();

  ok(res, { id: String(dhaba._id), name: dhaba.name, approvalStatus: dhaba.approvalStatus }, 201);
};

// ---------------------------------------------------------------- approval

/// For the admin sidebar badge.
export const adminCountPendingDhabas = async (_req, res) => {
  ok(res, { count: await Dhaba.countDocuments({ approvalStatus: 'pending' }) });
};

export const adminApproveDhaba = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  if (req.body?.commissionPercent !== undefined) {
    const value = Number(req.body.commissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new ApiError(400, 'Commission must be 0-100%');
    dhaba.commissionPercent = value;
  }
  dhaba.approvalStatus = 'approved';
  dhaba.rejectionReason = '';
  dhaba.active = true;
  dhaba.reviewedAt = new Date();
  dhaba.reviewedBy = adminName(req);
  await dhaba.save();
  ok(res, serializeDhaba(dhaba, { includeStops: true }));
};

export const adminRejectDhaba = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  const reason = String(req.body?.reason || '').trim().slice(0, 300);
  if (!reason) {
    throw new ApiError(400, 'Give the applicant a reason');
  }
  if (dhaba.approvalStatus === 'approved') {
    throw new ApiError(409, 'This dhaba is already approved. Deactivate it instead.');
  }
  dhaba.approvalStatus = 'rejected';
  dhaba.rejectionReason = reason;
  dhaba.active = false;
  dhaba.reviewedAt = new Date();
  dhaba.reviewedBy = adminName(req);
  await dhaba.save();
  ok(res, serializeDhaba(dhaba, { includeStops: true }));
};

// -------------------------------------------------------------- admin menu

export const adminListDhabaMenu = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  ok(res, (dhaba.menu || []).map(serializeMenuItem));
};

export const adminAddDhabaMenuItem = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  if ((dhaba.menu || []).length >= 300) {
    throw new ApiError(400, 'Menu is limited to 300 items');
  }
  dhaba.menu.push(readMenuItemInput(req.body));
  await dhaba.save();
  ok(res, serializeMenuItem(dhaba.menu[dhaba.menu.length - 1]), 201);
};

export const adminUpdateDhabaMenuItem = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  const item = dhaba.menu.id(req.params.itemId);
  if (!item) {
    throw new ApiError(404, 'Menu item not found');
  }
  Object.assign(item, readMenuItemInput(req.body, { partial: true }));
  await dhaba.save();
  ok(res, serializeMenuItem(item));
};

export const adminDeleteDhabaMenuItem = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  const item = dhaba.menu.id(req.params.itemId);
  if (!item) {
    throw new ApiError(404, 'Menu item not found');
  }
  item.deleteOne();
  await dhaba.save();
  ok(res, { deleted: true });
};

// ----------------------------------------------------------------- payouts

/// Every approved dhaba (plus any with money on its books) with earnings,
/// commission, payouts and balance due, highest balance first.
export const adminListDhabaPayouts = async (_req, res) => {
  const dhabas = await Dhaba.find({ approvalStatus: { $ne: 'pending' } })
    .select('name city highway phone commissionPercent active approvalStatus')
    .lean();
  const ledgers = await computeDhabaLedgers(dhabas.map((dhaba) => dhaba._id));
  const rows = dhabas
    .map((dhaba) => ({
      dhabaId: String(dhaba._id),
      name: dhaba.name,
      city: dhaba.city || '',
      highway: dhaba.highway || '',
      phone: dhaba.phone || '',
      commissionPercent: Number(dhaba.commissionPercent ?? 10),
      active: dhaba.active !== false,
      ...ledgers.get(String(dhaba._id)),
    }))
    .sort((a, b) => b.balance - a.balance || b.earned - a.earned);

  const totals = rows.reduce(
    (sum, row) => ({
      gross: sum.gross + row.gross,
      commission: sum.commission + row.commission,
      earned: sum.earned + row.earned,
      paid: sum.paid + row.paid,
      balance: sum.balance + row.balance,
      openAmount: sum.openAmount + row.openAmount,
    }),
    { gross: 0, commission: 0, earned: 0, paid: 0, balance: 0, openAmount: 0 },
  );
  Object.keys(totals).forEach((key) => { totals[key] = Math.round(totals[key] * 100) / 100; });

  ok(res, { totals, results: rows });
};

export const adminGetDhabaLedger = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  ok(res, {
    dhaba: serializeDhaba(dhaba, { includeMenu: false }),
    ...(await getDhabaLedger(dhaba._id)),
  });
};

export const adminRecordDhabaPayout = async (req, res) => {
  const dhaba = await loadDhaba(req.params.id);
  const amount = Math.round(Number(req.body?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Enter the amount paid');
  }
  const { balance } = (await computeDhabaLedgers([dhaba._id])).get(String(dhaba._id));
  if (amount > balance + 0.01 && !req.body?.allowAdvance) {
    throw new ApiError(400, `That is more than the Rs ${balance} balance due. Tick "advance" to pay ahead.`);
  }
  const method = ['bank_transfer', 'upi', 'cash', 'other'].includes(req.body?.method) ? req.body.method : 'bank_transfer';
  const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    throw new ApiError(400, 'Paid date is not valid');
  }

  const payout = await DhabaPayout.create({
    dhabaId: dhaba._id,
    amount,
    method,
    reference: String(req.body?.reference || '').trim().slice(0, 120),
    note: String(req.body?.note || '').trim().slice(0, 300),
    periodTo: /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.periodTo || '')) ? req.body.periodTo : '',
    paidAt,
    recordedBy: adminName(req),
  });
  ok(res, serializeDhabaPayout(payout), 201);
};

/// For correcting a payout recorded by mistake.
export const adminDeleteDhabaPayout = async (req, res) => {
  const result = await DhabaPayout.deleteOne({
    _id: requireObjectId(req.params.payoutId, 'payout id'),
    dhabaId: requireObjectId(req.params.id),
  });
  if (!result.deletedCount) {
    throw new ApiError(404, 'Payout not found');
  }
  ok(res, { deleted: true });
};

/// The dhaba's own view of what it has earned and been paid.
export const getMyDhabaLedger = async (req, res) => {
  ok(res, await getDhabaLedger(req.auth.sub));
};
