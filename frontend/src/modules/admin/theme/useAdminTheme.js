import { useEffect, useState } from 'react';
import {
  readAdminThemePreference,
  resolveAdminTheme,
  setAdminThemePreference,
  subscribeAdminTheme,
} from './adminThemeStore';

/// Current admin theme choice ('light' | 'dark' | 'system'), what it resolves
/// to right now, and a setter.
export const useAdminTheme = () => {
  const [state, setState] = useState(() => {
    const preference = readAdminThemePreference();
    return { preference, resolved: resolveAdminTheme(preference) };
  });

  useEffect(() => subscribeAdminTheme(setState), []);

  return { ...state, setPreference: setAdminThemePreference };
};
