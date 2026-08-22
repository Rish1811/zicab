/**
 * Seed the ZI CAB superadmin.
 *
 * Uses the real Admin model and the app's own hashPassword, rather than the
 * simplified schema in seedAdmin.js — that one omits admin_type, active and
 * status, so an account created with it can miss defaults the admin panel
 * checks at login.
 *
 * Usage: node scripts/seedZicabAdmin.js [email] [password]
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Admin } from '../src/modules/taxi/admin/models/Admin.js';
import { hashPassword, comparePassword } from '../src/modules/taxi/services/passwordService.js';

const email = (process.argv[2] || 'admin@zicab.com').toLowerCase();
const password = process.argv[3] || 'admin123';

const run = async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });

  const hashed = await hashPassword(password);
  const doc = await Admin.findOneAndUpdate(
    { email },
    {
      $set: {
        name: 'ZI CAB Admin',
        email,
        password: hashed,
        role: 'superadmin',
        admin_type: 'superadmin',
        active: true,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select('+password');

  // prove the stored hash actually validates the password the app will be given
  const ok = await comparePassword(password, doc.password);

  console.log(
    JSON.stringify(
      {
        email: doc.email,
        name: doc.name,
        role: doc.role,
        admin_type: doc.admin_type,
        status: doc.status,
        active: doc.active,
        permissions: doc.permissions?.length ?? 0,
        passwordVerifies: ok,
      },
      null,
      1,
    ),
  );

  await mongoose.disconnect();
  if (!ok) process.exit(1);
};

run().catch((e) => {
  console.error('seed failed:', e.message);
  process.exit(1);
});
