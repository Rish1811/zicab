// Formatting and date helpers shared by the ZI Bus passenger screens.

export const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/// YYYY-MM-DD in the phone's own timezone (toISOString would give the UTC
/// date, which is yesterday for early-morning IST users).
export const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const addDays = (dateKey, days) => {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

export const formatDay = (dateKey, options = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  if (!dateKey) return '';
  const date = new Date(`${String(dateKey).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(dateKey) : date.toLocaleDateString('en-IN', options);
};

export const formatDuration = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?|hrs?/gi, 'h')
    .replace(/minutes?|mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

export const routePrefixFor = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');
