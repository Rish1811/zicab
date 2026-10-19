// Admin panel light/dark theme.
//
// The resolved theme lives on <html data-admin-theme="light|dark">; every
// dark style in styles/adminDarkTheme.css is scoped under it. index.html
// applies the saved choice before first paint, this module keeps it in step
// afterwards. The choice is per browser.

const STORAGE_KEY = 'adminThemePreference';
export const ADMIN_THEME_PREFERENCES = ['light', 'dark', 'system'];

const systemQuery = () =>
  (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export const readAdminThemePreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return ADMIN_THEME_PREFERENCES.includes(saved) ? saved : 'light';
  } catch {
    return 'light';
  }
};

export const resolveAdminTheme = (preference) =>
  preference === 'dark' || (preference === 'system' && systemQuery()?.matches) ? 'dark' : 'light';

const listeners = new Set();

const apply = (preference) => {
  const resolved = resolveAdminTheme(preference);
  document.documentElement.setAttribute('data-admin-theme', resolved);
  listeners.forEach((listener) => listener({ preference, resolved }));
};

export const setAdminThemePreference = (preference) => {
  const next = ADMIN_THEME_PREFERENCES.includes(preference) ? preference : 'light';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  apply(next);
};

export const subscribeAdminTheme = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Follow the OS when the admin picked "system", and other tabs' changes.
if (typeof window !== 'undefined') {
  systemQuery()?.addEventListener?.('change', () => {
    if (readAdminThemePreference() === 'system') apply('system');
  });
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) apply(readAdminThemePreference());
  });
}
