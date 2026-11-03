import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import OwnerBusDashboard from './OwnerBusDashboard';
import {
  clearDriverAuthState,
  getAuthenticatedDriverRole,
  getCurrentDriver,
  getLocalDriverToken,
} from '../services/registrationService';

const isApproved = (account) => {
  const approval = String(account?.approve ?? '').toLowerCase();
  const status = String(account?.status || '').toLowerCase();
  return ['true', '1', 'yes', 'approved'].includes(approval) || ['approved', 'active', 'verified'].includes(status);
};

/// The bus dashboard, for a logged-in bus account only. It has its own login, so
/// it sits outside the driver and owner portals.
const BusPartnerDashboard = () => {
  const hasBusSession =
    Boolean(getLocalDriverToken()) && String(getAuthenticatedDriverRole()).toLowerCase() === 'bus_driver';
  const [access, setAccess] = useState(hasBusSession ? 'checking' : 'login');

  useEffect(() => {
    if (!hasBusSession) return undefined;
    let active = true;
    getCurrentDriver()
      .then((response) => {
        if (!active) return;
        const account = response?.data?.data || response?.data || response;
        setAccess(isApproved(account) ? 'open' : 'pending');
      })
      .catch((error) => {
        if (!active) return;
        if (error?.status === 401 || error?.status === 404) {
          clearDriverAuthState();
          setAccess('login');
          return;
        }
        // Couldn't check (network): the dashboard reports its own errors.
        setAccess('open');
      });
    return () => {
      active = false;
    };
  }, [hasBusSession]);

  if (access === 'login') return <Navigate to="/bus-login" replace />;
  if (access === 'pending') return <Navigate to="/taxi/driver/registration-status" replace />;
  if (access === 'checking') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    );
  }
  return <OwnerBusDashboard portal="bus" />;
};

export default BusPartnerDashboard;
