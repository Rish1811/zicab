// Creates a VIEW-ONLY sub-admin: can open every admin menu (except managing
// admins) and change nothing - every write is refused by the server
// (Admin.read_only, enforceAdminReadOnly).
//
// The password is read from the ADMIN_PW environment variable so it never
// appears in the command line or shell history; prompt for it with `read -s`:
//
//   cd /root/zicab/Backend
//   read -s -p "Password: " ADMIN_PW && echo && export ADMIN_PW
//   node scripts/create_view_only_admin.js --email viewer@zicab.in --name "Test Viewer"
//   unset ADMIN_PW
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Admin } from '../src/modules/taxi/admin/models/Admin.js';
import { ServiceLocation } from '../src/modules/taxi/admin/models/ServiceLocation.js';
import { ADMIN_PERMISSIONS } from '../src/modules/taxi/admin/services/adminAccessService.js';
import { hashPassword } from '../src/modules/taxi/services/passwordService.js';

dotenv.config();

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? String(process.argv[index + 1] || '').trim() : '';
};

const email = arg('email').toLowerCase();
const name = arg('name') || 'Test Viewer';
const password = String(process.env.ADMIN_PW || '');

const fail = (message) => {
  console.error(`Error: ${message}`);
  process.exit(1);
};

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('pass a valid --email');
if (password.length < 8) fail('set ADMIN_PW (at least 8 characters) - see the usage at the top of this file');

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
try {
  if (await Admin.findOne({ email }).select('_id').lean()) {
    fail(`an admin with ${email} already exists`);
  }
  const serviceLocations = await ServiceLocation.find().select('_id').lean();
  if (!serviceLocations.length) fail('no service locations found');

  const admin = await Admin.create({
    name,
    email,
    password: await hashPassword(password),
    role: 'View only',
    admin_type: 'subadmin',
    read_only: true,
    // Every area except managing admins: a viewer sees the whole panel.
    permissions: ADMIN_PERMISSIONS.filter((key) => key !== 'subadmins.manage'),
    service_location_ids: serviceLocations.map((item) => item._id),
    zone_ids: [],
    active: true,
    status: 'active',
  });
  console.log(`Created view-only admin ${admin.email} (${admin._id}) with access to ${serviceLocations.length} service location(s).`);
} finally {
  await mongoose.disconnect();
}
