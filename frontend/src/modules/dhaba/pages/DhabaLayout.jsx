import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardList, Loader2, LogOut, UtensilsCrossed } from 'lucide-react';
import { dhabaApi, getDhabaToken, setDhabaToken } from '../services/dhabaApi';

const DhabaLayout = () => {
  const navigate = useNavigate();
  const [dhaba, setDhaba] = useState(null);
  const [loading, setLoading] = useState(Boolean(getDhabaToken()));
  const [toggling, setToggling] = useState(false);

  const signOut = useCallback(() => {
    setDhabaToken('');
    navigate('/dhaba/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!getDhabaToken()) return;
    dhabaApi
      .me()
      .then(setDhaba)
      .catch((error) => {
        if (error?.status === 401 || error?.status === 403) signOut();
      })
      .finally(() => setLoading(false));
  }, [signOut]);

  if (!getDhabaToken()) {
    return <Navigate to="/dhaba/login" replace />;
  }

  const toggleAccepting = async () => {
    setToggling(true);
    try {
      setDhaba(await dhabaApi.updateMe({ acceptingOrders: !dhaba.acceptingOrders }));
    } finally {
      setToggling(false);
    }
  };

  const tabClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
              <UtensilsCrossed size={16} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{dhaba?.name || 'Dhaba Partner'}</p>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">ZI Bus partner panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dhaba ? (
              <button
                type="button"
                onClick={toggleAccepting}
                disabled={toggling}
                className={`rounded-full px-3 py-1.5 text-[11px] font-black ${
                  dhaba.acceptingOrders ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
                title="Stop or resume taking new pre-orders"
              >
                {dhaba.acceptingOrders ? '● Taking orders' : '○ Paused'}
              </button>
            ) : null}
            <button type="button" onClick={signOut} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-2 px-4 pb-3">
          <NavLink to="/dhaba" end className={tabClass}>
            <ClipboardList size={14} /> Orders
          </NavLink>
          <NavLink to="/dhaba/menu" className={tabClass}>
            <UtensilsCrossed size={14} /> Menu
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : (
          <Outlet context={{ dhaba, setDhaba }} />
        )}
      </main>
    </div>
  );
};

export default DhabaLayout;
