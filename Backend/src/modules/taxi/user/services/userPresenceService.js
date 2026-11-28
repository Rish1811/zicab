import { User } from '../models/User.js';

/// When each rider last used the app, for "active in the last 24 h" on the
/// admin dashboard. "Online right now" counts open socket connections, which
/// is often 0: a phone in a pocket drops its connection.
///
/// Written at most every 5 minutes per rider per process, so it costs almost
/// nothing on busy endpoints.
const WRITE_EVERY_MS = 5 * 60 * 1000;
const lastWrite = new Map();

export const markUserSeen = (userId) => {
  if (!userId) return;
  const id = String(userId);
  const now = Date.now();
  if (now - (lastWrite.get(id) || 0) < WRITE_EVERY_MS) return;
  lastWrite.set(id, now);
  if (lastWrite.size > 50000) lastWrite.clear();
  User.updateOne({ _id: id }, { $set: { lastSeenAt: new Date(now) } }).catch(() => {});
};

export const countUsersSeenSince = (since) => User.countDocuments({ lastSeenAt: { $gte: since } });
