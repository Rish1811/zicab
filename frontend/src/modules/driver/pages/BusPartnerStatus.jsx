import React, { useCallback, useEffect, useState } from 'react';
import { Clock3, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverAuthShell from '../components/DriverAuthShell';
import {
  clearDriverAuthState,
  getDriverApprovalStatus,
  getLocalDriverToken,
} from '../services/registrationService';

const CHECK_EVERY_MS = 20000;

/// Waiting for the admin to approve a bus account. Opens the dashboard by itself
/// as soon as that happens.
const BusPartnerStatus = () => {
  const navigate = useNavigate();
  const [rejected, setRejected] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!getLocalDriverToken()) {
      navigate('/bus-login', { replace: true });
      return;
    }
    setChecking(true);
    try {
      const response = await getDriverApprovalStatus();
      const account = response?.data?.data || response?.data || response;
      const status = String(account?.status || '').toLowerCase();
      const approval = String(account?.approve ?? '').toLowerCase();
      if (['true', '1', 'yes', 'approved'].includes(approval) || ['approved', 'active', 'verified'].includes(status)) {
        navigate('/bus-dashboard', { replace: true });
        return;
      }
      setRejected(['rejected', 'declined'].includes(status));
    } catch (error) {
      if (error?.status === 401 || error?.status === 404) {
        clearDriverAuthState();
        navigate('/bus-login', { replace: true });
      }
    } finally {
      setChecking(false);
    }
  }, [navigate]);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  const logOut = () => {
    clearDriverAuthState();
    navigate('/bus-login', { replace: true });
  };

  return (
    <DriverAuthShell isBusPortal>
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${rejected ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
        {rejected ? <XCircle size={28} /> : <Clock3 size={28} />}
      </span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
        {rejected ? 'Request not approved' : 'Request sent'}
      </h1>
      <p className="mt-2 text-base text-slate-500">
        {rejected
          ? 'Our team could not approve this request. Contact support to find out why.'
          : "Our team is checking your details. Your bus dashboard opens here as soon as you're approved."}
      </p>

      <div className="mt-7 flex flex-wrap gap-3">
        {rejected ? null : (
          <button
            type="button"
            disabled={checking}
            onClick={check}
            className="h-12 flex-1 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-500 disabled:opacity-60"
          >
            {checking ? 'Checking...' : 'Check now'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/taxi/driver/support')}
          className="h-12 flex-1 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Contact support
        </button>
      </div>
      <button type="button" onClick={logOut} className="mt-5 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800">
        Log out
      </button>
    </DriverAuthShell>
  );
};

export default BusPartnerStatus;
