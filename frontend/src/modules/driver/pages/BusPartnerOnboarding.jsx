import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bus, CheckCircle2, ChevronRight, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverAuthShell from '../components/DriverAuthShell';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverOnboardingSignupOptions,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverOnboardingRoleDetails,
  saveDriverPersonalDetails,
  saveDriverRegistrationSession,
} from '../services/registrationService';

const STEPS = ['Your details', 'Your bus', 'Review'];
const GENDERS = ['Male', 'Female', 'Other'];
const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT_CLASS = 'h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200';

const unwrap = (response) => response?.data?.data || response?.data || response;

const busTitle = (bus = {}) => [bus.operatorName, bus.busName].filter(Boolean).join(' - ') || 'Bus';
const busRoute = (bus = {}) => {
  const from = bus.originCity || bus.route?.originCity || '';
  const to = bus.destinationCity || bus.route?.destinationCity || '';
  return [bus.routeName || (from && to ? `${from} to ${to}` : ''), bus.serviceNumber].filter(Boolean).join(' · ');
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
    {children}
  </label>
);

/// Registering a bus account from the bus login: who you are, which bus, review.
/// Uses the same onboarding session and API as the driver app's bus signup.
const BusPartnerOnboarding = () => {
  const navigate = useNavigate();
  const session = useMemo(() => getStoredDriverRegistrationSession(), []);
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();
  const busDraft = session.roleDetails?.busDraft || null;

  const [step, setStep] = useState(() => (session.fullName && session.email && session.gender ? 1 : 0));
  const [details, setDetails] = useState({
    fullName: session.fullName || '',
    email: session.email || '',
    gender: session.gender || '',
  });
  const [busMode, setBusMode] = useState(busDraft ? 'create' : session.roleDetails?.busServiceId ? 'existing' : '');
  const [busServiceId, setBusServiceId] = useState(session.roleDetails?.busServiceId || '');
  const [requestNote, setRequestNote] = useState(session.roleDetails?.requestNote || '');
  const [buses, setBuses] = useState([]);
  const [loadingBuses, setLoadingBuses] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!phone || !registrationId) navigate('/bus-login', { replace: true });
  }, [navigate, phone, registrationId]);

  useEffect(() => {
    let active = true;
    getDriverOnboardingSignupOptions()
      .then((response) => {
        if (!active) return;
        const options = unwrap(response);
        setBuses(Array.isArray(options?.busServices) ? options.busServices : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError?.message || 'Could not load the bus list');
      })
      .finally(() => {
        if (active) setLoadingBuses(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedBus = useMemo(
    () => buses.find((bus) => String(bus.id) === String(busServiceId)) || null,
    [buses, busServiceId],
  );

  const visibleBuses = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return buses;
    return buses.filter((bus) =>
      [bus.operatorName, bus.busName, bus.serviceNumber, bus.routeName, bus.originCity, bus.destinationCity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)));
  }, [buses, search]);

  const hasBus = busMode === 'create' ? Boolean(busDraft) : busMode === 'existing' && Boolean(busServiceId);

  const saveDetails = async (event) => {
    event.preventDefault();
    const fullName = details.fullName.trim();
    const email = details.email.trim().toLowerCase();
    if (!fullName || !email || !details.gender) return setError('Please fill in all your details.');
    if (!NAME_REGEX.test(fullName)) return setError('Your name should contain letters only.');
    if (!EMAIL_REGEX.test(email)) return setError('Please enter a valid email address.');

    setSaving(true);
    setError('');
    try {
      await saveDriverPersonalDetails({ registrationId, phone, fullName, email, gender: details.gender });
      saveDriverRegistrationSession({ fullName, email, gender: details.gender });
      setStep(1);
    } catch (requestError) {
      setError(requestError?.message || 'Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const openBusBuilder = () => {
    saveDriverRegistrationSession({
      roleDetails: { ...(session.roleDetails || {}), createNewBus: true, busServiceId: '' },
    });
    navigate('/taxi/driver/role-signup/bus-builder/create?step=1');
  };

  const submit = async () => {
    const creating = busMode === 'create';
    const roleDetails = {
      createNewBus: creating,
      busServiceId: creating ? '' : busServiceId,
      requestNote,
      busDraft: creating ? busDraft : null,
      operatorName: creating ? busDraft?.operatorName || '' : '',
      busName: creating ? busDraft?.busName || '' : '',
      serviceNumber: creating ? busDraft?.serviceNumber || '' : '',
      originCity: creating ? busDraft?.route?.originCity || '' : '',
      destinationCity: creating ? busDraft?.route?.destinationCity || '' : '',
    };

    setSaving(true);
    setError('');
    try {
      await saveDriverOnboardingRoleDetails({ registrationId, phone, roleDetails });
      const payload = unwrap(await completeDriverOnboarding({ registrationId, phone }));
      if (payload?.token) persistDriverAuthSession({ token: payload.token, role: 'bus_driver' });
      clearDriverRegistrationSession();
      navigate('/bus-register/status', { replace: true });
    } catch (requestError) {
      setError(requestError?.message || 'Could not send your request');
      setSaving(false);
    }
  };

  const backButton = (onClick) => (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 mb-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
    >
      <ArrowLeft size={18} />
      Back
    </button>
  );

  const errorBox = error ? (
    <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
  ) : null;

  const primaryClass = (enabled) =>
    `mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors ${
      enabled ? 'bg-amber-400 text-slate-950 hover:bg-amber-500' : 'cursor-not-allowed bg-slate-100 text-slate-400'
    }`;

  return (
    <DriverAuthShell isBusPortal>
      <ol className="mb-7 grid grid-cols-3 gap-2" aria-label="Registration steps">
        {STEPS.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined}>
            <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-amber-400' : 'bg-slate-200'}`} />
            <span className={`mt-1.5 block text-xs font-semibold ${index <= step ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <>
          {backButton(() => navigate('/bus-login'))}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your details</h1>
          <p className="mt-2 text-base text-slate-500">
            Registering <span className="font-semibold text-slate-900">+91 {phone}</span> for ZI Bus.
          </p>
          <form onSubmit={saveDetails} className="mt-7 space-y-4">
            <Field label="Full name">
              <input
                value={details.fullName}
                onChange={(event) => setDetails((current) => ({ ...current, fullName: event.target.value }))}
                autoComplete="name"
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={details.email}
                onChange={(event) => setDetails((current) => ({ ...current, email: event.target.value }))}
                autoComplete="email"
                className={INPUT_CLASS}
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-slate-700">Gender</legend>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    aria-pressed={details.gender === gender}
                    onClick={() => setDetails((current) => ({ ...current, gender }))}
                    className={`h-12 rounded-xl border text-sm font-semibold transition-colors ${
                      details.gender === gender ? 'border-amber-500 bg-amber-50 text-slate-900' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {gender}
                  </button>
                ))}
              </div>
            </fieldset>
            {errorBox}
            <button type="submit" disabled={saving} className={primaryClass(!saving)}>
              {saving ? 'Saving...' : 'Continue'}
              {saving ? null : <ChevronRight size={20} strokeWidth={2.5} />}
            </button>
          </form>
        </>
      ) : null}

      {step === 1 ? (
        <>
          {backButton(() => setStep(0))}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Your bus</h1>
          <p className="mt-2 text-base text-slate-500">Join a bus already on ZI Bus, or add yours.</p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={busMode === 'existing'}
              onClick={() => {
                setBusMode('existing');
                setError('');
              }}
              className={`rounded-xl border p-4 text-left transition-colors ${busMode === 'existing' ? 'border-amber-500 bg-amber-50' : 'border-slate-300 hover:bg-slate-50'}`}
            >
              <Bus size={20} className="text-slate-700" />
              <span className="mt-2 block text-sm font-bold text-slate-900">Join a listed bus</span>
              <span className="mt-0.5 block text-xs text-slate-500">Pick it from the list</span>
            </button>
            <button
              type="button"
              aria-pressed={busMode === 'create'}
              onClick={busDraft ? () => setBusMode('create') : openBusBuilder}
              className={`rounded-xl border p-4 text-left transition-colors ${busMode === 'create' ? 'border-amber-500 bg-amber-50' : 'border-slate-300 hover:bg-slate-50'}`}
            >
              <Plus size={20} className="text-slate-700" />
              <span className="mt-2 block text-sm font-bold text-slate-900">Add a new bus</span>
              <span className="mt-0.5 block text-xs text-slate-500">Seats, route and timings</span>
            </button>
          </div>

          {busMode === 'existing' ? (
            <div className="mt-4">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3">
                <Search size={16} className="shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search bus, route or number"
                  aria-label="Search buses"
                  className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
                />
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {loadingBuses ? <p className="py-6 text-center text-sm text-slate-500">Loading buses...</p> : null}
                {!loadingBuses && !visibleBuses.length ? (
                  <p className="py-6 text-center text-sm text-slate-500">No bus matches that. You can add a new one instead.</p>
                ) : null}
                {visibleBuses.map((bus) => {
                  const selected = String(bus.id) === String(busServiceId);
                  return (
                    <button
                      key={bus.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setBusServiceId(bus.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{busTitle(bus)}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{busRoute(bus)}</span>
                      </span>
                      {selected ? <CheckCircle2 size={18} className="shrink-0 text-amber-600" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {busMode === 'create' && busDraft ? (
            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">{busTitle(busDraft)}</p>
              <p className="mt-0.5 text-xs text-slate-500">{busRoute(busDraft)}</p>
              <button type="button" onClick={openBusBuilder} className="mt-2 text-sm font-semibold text-amber-700 hover:underline">
                Edit this bus
              </button>
            </div>
          ) : null}

          {errorBox}
          <button type="button" disabled={!hasBus} onClick={() => setStep(2)} className={primaryClass(hasBus)}>
            Continue
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {backButton(() => setStep(1))}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review and send</h1>
          <p className="mt-2 text-base text-slate-500">Our team checks your request, then your bus dashboard opens.</p>

          <dl className="mt-7 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            <div className="flex justify-between gap-4 p-3.5">
              <dt className="text-slate-500">Name</dt>
              <dd className="text-right font-semibold text-slate-900">{details.fullName.trim()}</dd>
            </div>
            <div className="flex justify-between gap-4 p-3.5">
              <dt className="text-slate-500">Mobile</dt>
              <dd className="font-semibold text-slate-900">+91 {phone}</dd>
            </div>
            <div className="flex justify-between gap-4 p-3.5">
              <dt className="text-slate-500">Bus</dt>
              <dd className="min-w-0 text-right font-semibold text-slate-900">
                {busTitle(busMode === 'create' ? busDraft : selectedBus || {})}
                <span className="mt-0.5 block text-xs font-normal text-slate-500">{busRoute(busMode === 'create' ? busDraft : selectedBus || {})}</span>
              </dd>
            </div>
          </dl>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Note for our team (optional)</span>
            <textarea
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
          </label>

          {errorBox}
          <button type="button" disabled={saving} onClick={submit} className={primaryClass(!saving)}>
            {saving ? 'Sending...' : 'Send for approval'}
          </button>
        </>
      ) : null}
    </DriverAuthShell>
  );
};

export default BusPartnerOnboarding;
