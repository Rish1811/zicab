import React, { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useAdminTheme } from './useAdminTheme';

const OPTIONS = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
];

/// Sun/moon button in the admin top bar with Light / Dark / System.
// The menu sits inside .notification-dropdown so the header's forced 18px
// button text (adminTheme.css) doesn't apply to it.
const AdminThemeToggle = () => {
  const { preference, resolved, setPreference } = useAdminTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const CurrentIcon = resolved === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative notification-dropdown">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="admin-theme-toggle flex h-9 w-9 items-center justify-center rounded text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
        aria-label={`Theme: ${preference}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Light or dark theme"
      >
        <CurrentIcon size={18} />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {OPTIONS.map((option) => {
            const OptionIcon = option.Icon;
            const active = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setPreference(option.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold ${active ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <OptionIcon size={15} />
                <span className="flex-1 text-left">{option.label}</span>
                {active ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default AdminThemeToggle;
