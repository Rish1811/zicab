import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, UtensilsCrossed } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildDriverOnboardingSessionSnapshot,
  clearDriverRegistrationSession,
  getDriverOnboardingResumeStep,
  getDriverOnboardingSession,
  getStoredDriverRegistrationSession,
  saveDriverRegistrationSession,
  sendDriverOtp,
} from '../../services/registrationService';
import DriverAuthShell from '../../components/DriverAuthShell';

const getErrorMessage = (err) => String(
  err?.message ||
  err?.error ||
  err?.response?.data?.message ||
  '',
).trim();

const PhoneRegistration = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const storedSession = getStoredDriverRegistrationSession();
  const isOwnerPortal = location.pathname.startsWith('/taxi/owner');
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sharedReferralCode = String(
    searchParams.get('ref') ||
    searchParams.get('referral') ||
    searchParams.get('code') ||
    storedSession.referralCode ||
    '',
  ).trim().toUpperCase();
  const sharedEmployeeCode = String(
    searchParams.get('emp') ||
    searchParams.get('employee') ||
    storedSession.employeeCode ||
    '',
  ).trim().toUpperCase();
  const storedOnboardingPhone = String(storedSession.phone || '').replace(/\D/g, '').slice(-10);
  const storedRegistrationId = String(storedSession.registrationId || '').trim();
  const storedSessionResumeKey = JSON.stringify({
    phone: storedOnboardingPhone,
    registrationId: storedRegistrationId,
    otpVerified: Boolean(storedSession.otpVerified),
    status: storedSession.status || '',
    role: storedSession.role || '',
    roleConfirmed: storedSession.roleConfirmed !== false,
    fullName: storedSession.fullName || '',
    email: storedSession.email || '',
    gender: storedSession.gender || '',
    locationId: storedSession.locationId || '',
    vehicleTypeId: storedSession.vehicleTypeId || '',
  });

  const [phone, setPhone] = useState(() => String(location.state?.phone || storedSession.phone || '').replace(/\D/g, '').slice(-10));
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const routePrefix = isOwnerPortal ? '/taxi/owner' : '/taxi/driver';
  const isLoginPage = location.pathname === `${routePrefix}/login` || location.pathname === `${routePrefix}/login/`;
  const entryPath = `${routePrefix}/login`;

  useEffect(() => {
    let active = true;

    const resumeOnboardingIfPossible = async () => {
      if (isLoginPage) {
        return;
      }

      if (!storedOnboardingPhone || !storedRegistrationId) {
        return;
      }

      if (storedSession.otpVerified) {
        const nextStep = getDriverOnboardingResumeStep(storedSession);
        navigate(`${routePrefix}/${nextStep}`, {
          replace: true,
          state: storedSession,
        });
        return;
      }

      try {
        const response = await getDriverOnboardingSession({
          registrationId: storedRegistrationId,
          phone: storedOnboardingPhone,
        });

        if (!active) {
          return;
        }

        const payload = response?.data?.data || response?.data || response;
        const nextSession = saveDriverRegistrationSession(
          buildDriverOnboardingSessionSnapshot(payload, storedSession),
        );

        if (nextSession.otpVerified) {
          const nextStep = getDriverOnboardingResumeStep(nextSession);
          navigate(`${routePrefix}/${nextStep}`, {
            replace: true,
            state: nextSession,
          });
          return;
        }

        navigate(`${routePrefix}/otp-verify`, {
          replace: true,
          state: nextSession,
        });
      } catch {
        if (!active) {
          return;
        }

        navigate(`${routePrefix}/otp-verify`, {
          replace: true,
          state: storedSession,
        });
      }
    };

    resumeOnboardingIfPossible();

    return () => {
      active = false;
    };
  }, [isLoginPage, navigate, routePrefix, storedOnboardingPhone, storedRegistrationId, storedSession, storedSessionResumeKey]);

  const handleSendOTP = async () => {
    if (phone.length !== 10) {
      setError('Please enter 10 digits');
      return;
    }

    if (!agreed) {
      setError('Accept terms to continue');
      return;
    }

    setLoading(true);
    setError('');

    try {
      clearDriverRegistrationSession();

      const response = await sendDriverOtp(
        isOwnerPortal
          ? { phone, role: 'owner' }
          : { phone },
      );

      const payload = response?.data?.data || response?.data || response;
      const sessionData = payload?.session || {};
      const loginMode = Boolean(payload?.loginMode || sessionData?.loginMode);
      const existingAccount = Boolean(payload?.existingAccount || sessionData?.existingAccount);
      const detectedRole = String(payload?.detectedRole || sessionData?.role || '').trim().toLowerCase();
      const availableRoles = payload?.availableRoles || sessionData?.availableRoles || [];
      const nextState = saveDriverRegistrationSession({
        phone,
        role: sessionData.role || (isOwnerPortal ? 'owner' : ''),
        roleConfirmed: sessionData.roleConfirmed ?? isOwnerPortal,
        needsRoleSelection: !isOwnerPortal && sessionData.roleConfirmed === false,
        registrationId: sessionData.registrationId || '',
        debugOtp: sessionData.debugOtp || '',
        loginMode,
        existingAccount,
        detectedRole,
        poolingOnboarding: false,
        entryPath,
        referralCode: sharedReferralCode,
        employeeCode: sharedEmployeeCode,
        status: sessionData.status || '',
        availableRoles,
      });

      navigate(`${routePrefix}/otp-verify`, { state: nextState });
    } catch (requestError) {
      setError(getErrorMessage(requestError) || 'Try again in a moment');
    } finally {
      setLoading(false);
    }
  };

  const canContinue = agreed && phone.length === 10 && !loading;

  return (
    <DriverAuthShell isOwnerPortal={isOwnerPortal}>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {isOwnerPortal ? 'Owner login' : 'Log in or sign up'}
      </h1>
      <p className="mt-2 text-base text-slate-500">
        {isOwnerPortal
          ? "Enter your mobile number and we'll send you a 4-digit code."
          : "Enter your mobile number and we'll send you a 4-digit code. New numbers can register next."}
      </p>

      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (canContinue) handleSendOTP();
        }}
      >
        <label htmlFor="driver-login-phone" className="text-sm font-semibold text-slate-700">
          Mobile number
        </label>
        <div className={`mt-2 flex h-14 items-center gap-3 rounded-xl border bg-white px-4 transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-200 ${error ? 'border-rose-300' : 'border-slate-300'}`}>
          <span className="border-r border-slate-200 pr-3 text-base font-semibold text-slate-500">+91</span>
          <input
            id="driver-login-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, '').slice(-10));
              if (error) setError('');
            }}
            placeholder="10-digit number"
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-lg font-semibold tracking-wide text-slate-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:ring-0"
          />
          {phone.length === 10 ? <CheckCircle2 size={20} className="shrink-0 text-emerald-500" /> : null}
        </div>

        <div className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            id="terms"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-amber-500"
          />
          <label htmlFor="terms" className="cursor-pointer text-sm leading-6 text-slate-600">
            I accept the{' '}
            <button type="button" onClick={() => navigate(`${routePrefix}/terms`)} className="font-semibold text-amber-700 hover:underline">Terms</button>
            {' '}and{' '}
            <button type="button" onClick={() => navigate(`${routePrefix}/privacy`)} className="font-semibold text-amber-700 hover:underline">Privacy Policy</button>
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canContinue}
          className={`mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors ${
            canContinue ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : 'cursor-not-allowed bg-slate-100 text-slate-400'
          }`}
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-950/20 border-t-slate-950" />
          ) : (
            <>
              Continue
              <ChevronRight size={20} strokeWidth={2.5} />
            </>
          )}
        </button>
      </form>

      <button
        type="button"
        onClick={() => navigate(`${routePrefix}/support`)}
        className="mt-5 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        Need help? <span className="font-semibold text-amber-700">Contact support</span>
      </button>

      {!isOwnerPortal ? (
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-slate-200 pt-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <UtensilsCrossed size={18} />
          </span>
          <div className="min-w-[10rem] flex-1">
            <p className="text-sm font-semibold text-slate-900">Run a dhaba?</p>
            <p className="text-xs text-slate-500">Take food pre-orders from bus passengers.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/dhaba/login${phone.length === 10 ? `?phone=${phone}` : ''}`)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => navigate(`/dhaba/register${phone.length === 10 ? `?phone=${phone}` : ''}`)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Register
            </button>
          </div>
        </div>
      ) : null}
    </DriverAuthShell>
  );
};

export default PhoneRegistration;
