import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverAuthShell from '../components/DriverAuthShell';
import {
  clearDriverRegistrationSession,
  getAuthenticatedDriverRole,
  getLocalDriverToken,
  saveDriverRegistrationSession,
  sendDriverOtp,
} from '../services/registrationService';

export const BUS_LOGIN_PATH = '/bus-login';

/// The bus partner's own front door. An existing bus account gets a login code
/// and goes to the bus dashboard; a new number goes on to bus registration.
const BusPartnerLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getLocalDriverToken() && String(getAuthenticatedDriverRole()).toLowerCase() === 'bus_driver') {
      navigate('/bus-dashboard', { replace: true });
    }
  }, [navigate]);

  const canContinue = agreed && phone.length === 10 && !loading;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canContinue) return;

    setLoading(true);
    setError('');
    try {
      clearDriverRegistrationSession();
      const response = await sendDriverOtp({ phone, role: 'bus_driver' });
      const payload = response?.data?.data || response?.data || response;
      const session = payload?.session || {};
      const nextState = saveDriverRegistrationSession({
        phone,
        role: session.role || 'bus_driver',
        roleConfirmed: true,
        needsRoleSelection: false,
        registrationId: session.registrationId || '',
        debugOtp: session.debugOtp || '',
        loginMode: Boolean(payload?.loginMode || session.loginMode),
        existingAccount: Boolean(payload?.existingAccount || session.existingAccount),
        detectedRole: String(payload?.detectedRole || session.role || '').trim().toLowerCase(),
        poolingOnboarding: false,
        entryPath: BUS_LOGIN_PATH,
        status: session.status || '',
        availableRoles: payload?.availableRoles || session.availableRoles || [],
      });
      navigate('/taxi/driver/otp-verify', { state: nextState });
    } catch (requestError) {
      setError(requestError?.message || 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DriverAuthShell isBusPortal>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Bus login</h1>
      <p className="mt-2 text-base text-slate-500">
        Enter your mobile number and we'll send you a 4-digit code. New numbers can register their bus next.
      </p>

      <form className="mt-8" onSubmit={handleSubmit}>
        <label htmlFor="bus-login-phone" className="text-sm font-semibold text-slate-700">
          Mobile number
        </label>
        <div className={`mt-2 flex h-14 items-center gap-3 rounded-xl border bg-white px-4 transition-colors focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-200 ${error ? 'border-rose-300' : 'border-slate-300'}`}>
          <span className="border-r border-slate-200 pr-3 text-base font-semibold text-slate-500">+91</span>
          <input
            id="bus-login-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value.replace(/\D/g, '').slice(-10));
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
            id="bus-login-terms"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-amber-500"
          />
          <label htmlFor="bus-login-terms" className="cursor-pointer text-sm leading-6 text-slate-600">
            I accept the{' '}
            <button type="button" onClick={() => navigate('/taxi/driver/terms')} className="font-semibold text-amber-700 hover:underline">Terms</button>
            {' '}and{' '}
            <button type="button" onClick={() => navigate('/taxi/driver/privacy')} className="font-semibold text-amber-700 hover:underline">Privacy Policy</button>
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
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
        onClick={() => navigate('/taxi/driver/support')}
        className="mt-5 w-full text-center text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        Need help? <span className="font-semibold text-amber-700">Contact support</span>
      </button>
    </DriverAuthShell>
  );
};

export default BusPartnerLogin;
