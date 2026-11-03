import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bus, CheckCircle2, ClipboardList, LayoutGrid, Search, Settings2, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import HorizontalSeatMap from '../../admin/pages/bus-service/HorizontalSeatMap';
import {
  clearDriverAuthState,
  cancelOwnerBusBookingSeats,
  createOwnerBusReservation,
  getOwnerBusBookings,
  getOwnerBusSeatLayout,
  getOwnerBusServices,
} from '../services/registrationService';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY_PASSENGER = { name: '', phone: '', age: '', gender: 'Male', email: '', notes: '' };
const INPUT_CLASS = 'h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-200';

const STATUS_TONE = {
  confirmed: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-rose-50 text-rose-700',
};

const SOURCE_LABEL = {
  owner: 'Booked by you',
  bus_driver: 'Conductor',
  admin: 'Admin',
  channel: 'Partner',
  user: 'App',
};

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const formatDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatMoney = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(amount || 0));
const formatDate = (value) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const scheduleLabel = (schedule) =>
  [schedule.label, schedule.departureTime && `${schedule.departureTime}${schedule.arrivalTime ? ` - ${schedule.arrivalTime}` : ''}`].filter(Boolean).join(' · ') || 'Schedule';

/// The next day this schedule runs, starting today.
const getNextRunDate = (schedule) => {
  const activeDays = Array.isArray(schedule?.activeDays) ? schedule.activeDays : [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    if (!activeDays.length || activeDays.includes(DAY_LABELS[date.getDay()])) return formatDateKey(date);
  }
  return formatDateKey(new Date());
};

const Stat = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
  </div>
);

const Field = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
    {children}
  </label>
);

/// `portal`: 'owner' for a fleet owner, 'bus' for a bus account (one bus, its own
/// login). The bookings and seats are the same; only the way around differs.
const OwnerBusDashboard = ({ portal = 'owner' }) => {
  const navigate = useNavigate();
  const isBusPortal = portal === 'bus';
  const manageLabel = isBusPortal ? 'Trip console' : 'Manage buses';
  const managePath = isBusPortal ? '/taxi/driver/bus-home' : '/taxi/owner/bus-service';
  const handleBusLogout = () => {
    clearDriverAuthState();
    navigate('/bus-login', { replace: true });
  };
  const sourceLabel = (source) =>
    isBusPortal && source === 'bus_driver' ? 'Booked by you' : SOURCE_LABEL[source] || source;
  const [tab, setTab] = useState('book');
  const [buses, setBuses] = useState([]);
  const [loadingBuses, setLoadingBuses] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busId, setBusId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [travelDate, setTravelDate] = useState(formatDateKey(new Date()));

  const [layout, setLayout] = useState(null);
  const [layoutError, setLayoutError] = useState('');
  const [loadingLayout, setLoadingLayout] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [passenger, setPassenger] = useState(EMPTY_PASSENGER);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [summary, setSummary] = useState({});
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [search, setSearch] = useState('');
  const [cancellingKey, setCancellingKey] = useState('');

  const bus = useMemo(() => buses.find((item) => item.id === busId) || null, [buses, busId]);
  const schedules = useMemo(() => (Array.isArray(bus?.schedules) ? bus.schedules : []), [bus]);

  const selectSchedule = useCallback((schedule) => {
    setScheduleId(schedule?.id || '');
    if (schedule) setTravelDate(getNextRunDate(schedule));
    setSelectedSeatIds([]);
    setConfirmation(null);
  }, []);

  useEffect(() => {
    let active = true;
    getOwnerBusServices()
      .then((response) => {
        if (!active) return;
        const payload = unwrap(response);
        const list = (Array.isArray(payload) ? payload : payload?.results || payload?.buses || [])
          .map((item) => ({ ...item, id: String(item.id || item._id || '') }))
          .filter((item) => item.id);
        setBuses(list);
        const first = list.find((item) => item.status === 'active') || list[0];
        if (first) {
          setBusId(first.id);
          selectSchedule(first.schedules?.[0]);
        }
      })
      .catch((error) => active && setLoadError(error?.message || 'Could not load your buses'))
      .finally(() => active && setLoadingBuses(false));
    return () => {
      active = false;
    };
  }, [selectSchedule]);

  const loadLayout = useCallback(async () => {
    if (!busId || !scheduleId || !travelDate) {
      setLayout(null);
      return;
    }
    setLoadingLayout(true);
    setLayoutError('');
    try {
      setLayout(unwrap(await getOwnerBusSeatLayout(busId, { scheduleId, date: travelDate })));
    } catch (error) {
      setLayout(null);
      setLayoutError(error?.message || 'Could not load the seats');
    } finally {
      setLoadingLayout(false);
    }
  }, [busId, scheduleId, travelDate]);

  const loadBookings = useCallback(async () => {
    if (!busId) return;
    setLoadingBookings(true);
    try {
      const data = unwrap(await getOwnerBusBookings({ busServiceId: busId, travelDate, scheduleId, status: 'all' }));
      setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
      setSummary(data?.summary || {});
    } catch (error) {
      toast.error(error?.message || 'Could not load bookings');
    } finally {
      setLoadingBookings(false);
    }
  }, [busId, scheduleId, travelDate]);

  useEffect(() => {
    loadLayout();
    loadBookings();
  }, [loadLayout, loadBookings]);

  const allSeats = useMemo(() => {
    const decks = [...(layout?.blueprint?.lowerDeck || []), ...(layout?.blueprint?.upperDeck || [])];
    return decks.flat().filter((cell) => cell?.kind === 'seat');
  }, [layout]);
  const selectedSeats = useMemo(() => allSeats.filter((seat) => selectedSeatIds.includes(seat.id)), [allSeats, selectedSeatIds]);
  const taxPercent = Number(layout?.serviceTaxPercentage || 0);
  const currency = layout?.fareCurrency || bus?.fareCurrency || 'INR';
  const seatFare = useCallback((seat) => Number(layout?.seatFares?.[seat.id] || 0), [layout]);
  const seatPriceWithTax = useCallback((seat) => roundMoney(seatFare(seat) * (1 + taxPercent / 100)), [seatFare, taxPercent]);
  const totals = useMemo(() => {
    const base = roundMoney(selectedSeats.reduce((sum, seat) => sum + seatFare(seat), 0));
    const tax = roundMoney((base * taxPercent) / 100);
    return { base, tax, total: roundMoney(base + tax) };
  }, [seatFare, selectedSeats, taxPercent]);

  const toggleSeat = (cell) => {
    if (cell.status === 'booked') return;
    setConfirmation(null);
    setSelectedSeatIds((current) => (current.includes(cell.id) ? current.filter((id) => id !== cell.id) : [...current, cell.id]));
  };

  const handleBook = async (event) => {
    event.preventDefault();
    if (!selectedSeatIds.length) return setFormError('Pick at least one seat on the map.');
    if (passenger.name.trim().length < 2) return setFormError('Enter the passenger name.');
    if (passenger.phone.length !== 10) return setFormError('Enter a 10-digit mobile number.');
    if (!Number(passenger.age)) return setFormError('Enter the passenger age.');

    setSubmitting(true);
    setFormError('');
    try {
      const booking = unwrap(await createOwnerBusReservation(busId, {
        scheduleId,
        travelDate,
        seatIds: selectedSeatIds,
        passenger: {
          name: passenger.name.trim(),
          phone: passenger.phone,
          age: Number(passenger.age),
          gender: passenger.gender,
          email: passenger.email.trim(),
        },
        notes: passenger.notes.trim(),
      }));
      setConfirmation(booking);
      setSelectedSeatIds([]);
      setPassenger(EMPTY_PASSENGER);
      toast.success('Seats booked');
    } catch (error) {
      setFormError(error?.message || 'Could not book these seats');
    } finally {
      setSubmitting(false);
      // A seat may just have been sold to someone else: show the map as it is now.
      loadLayout();
      loadBookings();
    }
  };

  const handleCancel = async (booking, seat) => {
    const what = seat ? `seat ${seat.seatLabel}` : 'the whole booking';
    if (!window.confirm(`Cancel ${what} for ${booking.passenger?.name || 'this passenger'}?`)) return;
    const seatIds = seat ? [seat.seatId] : [];
    setCancellingKey(`${booking.id}-${seat?.seatId || 'all'}`);
    try {
      await cancelOwnerBusBookingSeats(booking.id, {
        seatIds,
        ownerNote: seat ? 'Seat cancelled from owner bus dashboard' : 'Booking cancelled from owner bus dashboard',
      });
      toast.success('Cancelled');
      await Promise.all([loadLayout(), loadBookings()]);
    } catch (error) {
      toast.error(error?.message || 'Could not cancel');
    } finally {
      setCancellingKey('');
    }
  };

  const visibleBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return bookings;
    return bookings.filter((booking) =>
      [booking.passenger?.name, booking.passenger?.phone, booking.bookingCode, booking.pnr, ...(booking.activeSeats || []).map((seat) => seat.seatLabel)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query));
  }, [bookings, search]);

  const navItems = [
    { key: 'book', label: 'Book seats', icon: Ticket },
    { key: 'bookings', label: 'Bookings', icon: ClipboardList },
  ];

  const picker = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Bus">
        <select
          value={busId}
          onChange={(event) => {
            const nextBus = buses.find((item) => item.id === event.target.value);
            setBusId(event.target.value);
            selectSchedule(nextBus?.schedules?.[0]);
          }}
          className={INPUT_CLASS}
        >
          {buses.map((item) => (
            <option key={item.id} value={item.id}>
              {[item.busName || item.operatorName || 'Bus', item.serviceNumber].filter(Boolean).join(' · ')}
              {item.status === 'active' ? '' : ' (not active)'}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Schedule">
        <select
          value={scheduleId}
          onChange={(event) => selectSchedule(schedules.find((item) => item.id === event.target.value))}
          className={INPUT_CLASS}
          disabled={!schedules.length}
        >
          {schedules.length ? null : <option value="">No schedules</option>}
          {schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>{scheduleLabel(schedule)}</option>
          ))}
        </select>
      </Field>
      <Field label="Travel date">
        <input
          type="date"
          value={travelDate}
          min={formatDateKey(new Date())}
          onChange={(event) => {
            setTravelDate(event.target.value);
            setSelectedSeatIds([]);
            setConfirmation(null);
          }}
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  );

  const bookTab = (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            {layout?.bus?.fromCity && layout?.bus?.toCity ? `${layout.bus.fromCity} to ${layout.bus.toCity}` : 'Seats'}
          </h2>
          <p className="text-sm text-slate-500">{formatDate(travelDate)}</p>
        </div>
        {layoutError ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{layoutError}. Try another date or schedule.</p>
        ) : loadingLayout && !layout ? (
          <div className="flex h-48 items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
          </div>
        ) : layout ? (
          <div className="overflow-x-auto">
            <HorizontalSeatMap
              blueprint={layout.blueprint}
              showPrices
              getSeat={(cell) => ({
                status: cell.status === 'booked' ? 'booked' : selectedSeatIds.includes(cell.id) ? 'selected' : 'available',
                price: seatPriceWithTax(cell),
              })}
              onSeatClick={toggleSeat}
            />
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Add a schedule to this bus to start booking.</p>
        )}
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 xl:sticky xl:top-5">
        {confirmation ? (
          <div className="mb-5 rounded-xl bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 size={18} />
              Booked for {confirmation.passenger?.name}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-emerald-900">
              <div><dt className="text-xs text-emerald-700">PNR</dt><dd className="font-bold">{confirmation.pnr || confirmation.bookingCode}</dd></div>
              <div><dt className="text-xs text-emerald-700">Collect</dt><dd className="font-bold">{formatMoney(confirmation.amount, confirmation.currency)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-emerald-700">Seats</dt><dd className="font-bold">{(confirmation.activeSeats || []).map((seat) => seat.seatLabel).join(', ')}</dd></div>
            </dl>
          </div>
        ) : null}

        <h2 className="text-lg font-bold text-slate-900">Passenger details</h2>
        <form onSubmit={handleBook} className="mt-4 space-y-3">
          <Field label="Full name">
            <input value={passenger.name} onChange={(event) => setPassenger((current) => ({ ...current, name: event.target.value }))} autoComplete="off" className={INPUT_CLASS} />
          </Field>
          <Field label="Mobile number">
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={passenger.phone}
              onChange={(event) => setPassenger((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(-10) }))}
              className={INPUT_CLASS}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input
                inputMode="numeric"
                autoComplete="off"
                value={passenger.age}
                onChange={(event) => setPassenger((current) => ({ ...current, age: event.target.value.replace(/\D/g, '').slice(0, 3) }))}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Gender">
              <select value={passenger.gender} onChange={(event) => setPassenger((current) => ({ ...current, gender: event.target.value }))} className={INPUT_CLASS}>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Email (optional)">
            <input type="email" autoComplete="off" value={passenger.email} onChange={(event) => setPassenger((current) => ({ ...current, email: event.target.value }))} className={INPUT_CLASS} />
          </Field>
          <Field label="Notes (optional)">
            <input value={passenger.notes} onChange={(event) => setPassenger((current) => ({ ...current, notes: event.target.value }))} autoComplete="off" className={INPUT_CLASS} />
          </Field>

          <div className="rounded-xl bg-slate-50 p-3.5 text-sm">
            <div className="flex justify-between gap-3 text-slate-600">
              <span>Seats</span>
              <span className="text-right font-semibold text-slate-900">{selectedSeats.map((seat) => seat.label).join(', ') || 'None yet'}</span>
            </div>
            {taxPercent > 0 ? (
              <div className="mt-1.5 flex justify-between text-slate-600">
                <span>Tax ({taxPercent}%)</span>
                <span className="tabular-nums">{formatMoney(totals.tax, currency)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Collect from passenger</span>
              <span className="tabular-nums">{formatMoney(totals.total, currency)}</span>
            </div>
          </div>

          {formError ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</p> : null}

          <button
            type="submit"
            disabled={submitting || !layout || bus?.status !== 'active'}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-amber-400 text-base font-bold text-slate-950 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {submitting ? 'Booking...' : `Confirm booking${selectedSeats.length ? ` (${selectedSeats.length})` : ''}`}
          </button>
          {bus && bus.status !== 'active' ? <p className="text-center text-xs text-slate-500">This bus isn't active, so its seats can't be booked yet.</p> : null}
        </form>
      </aside>
    </div>
  );

  const bookingsTab = (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">{formatDate(travelDate)}</h2>
        <div className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-300 px-3 sm:w-72">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, phone, PNR or seat"
            className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0"
          />
        </div>
      </div>

      {loadingBookings && !bookings.length ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading bookings...</p>
      ) : !visibleBookings.length ? (
        <p className="py-10 text-center text-sm text-slate-500">{search ? 'No booking matches that search.' : 'No bookings for this schedule and date yet.'}</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {visibleBookings.map((booking) => {
            const activeSeats = booking.activeSeats || [];
            const canCancel = booking.status === 'confirmed' && activeSeats.length > 0;
            return (
              <li key={booking.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{booking.passenger?.name || booking.user?.name || 'Passenger'}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {[booking.passenger?.phone || booking.user?.phone, booking.pnr || booking.bookingCode, sourceLabel(booking.bookingSource)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums text-slate-900">{formatMoney(booking.amount, booking.currency)}</p>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_TONE[booking.status] || 'bg-slate-100 text-slate-600'}`}>{booking.status}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {activeSeats.map((seat) => (
                    canCancel ? (
                      <button
                        key={seat.seatId}
                        type="button"
                        disabled={Boolean(cancellingKey)}
                        onClick={() => handleCancel(booking, seat)}
                        title={`Cancel seat ${seat.seatLabel}`}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      >
                        {seat.seatLabel} ×
                      </button>
                    ) : (
                      <span key={seat.seatId} className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-600">{seat.seatLabel}</span>
                    )
                  ))}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={Boolean(cancellingKey)}
                      onClick={() => handleCancel(booking)}
                      className="ml-auto text-sm font-semibold text-rose-700 hover:underline disabled:opacity-50"
                    >
                      {cancellingKey === `${booking.id}-all` ? 'Cancelling...' : 'Cancel booking'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden flex-col bg-slate-900 p-5 text-white lg:sticky lg:top-0 lg:flex lg:h-[100dvh]">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-slate-950"><Bus size={20} /></span>
          <div>
            <p className="font-bold leading-tight">Bus dashboard</p>
            <p className="text-xs text-slate-400">{isBusPortal ? 'Bus partner' : 'Owner'}</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${tab === key ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              {React.createElement(icon, { size: 18 })}
              {label}
            </button>
          ))}
          <button type="button" onClick={() => navigate(managePath)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">
            <Settings2 size={18} />
            {manageLabel}
          </button>
        </nav>
        <button type="button" onClick={isBusPortal ? handleBusLogout : () => navigate('/taxi/owner/dashboard')} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white">
          <LayoutGrid size={18} />
          {isBusPortal ? 'Log out' : 'Owner home'}
        </button>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-8">
        <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white lg:hidden">
          {isBusPortal ? null : (
            <button type="button" aria-label="Owner home" onClick={() => navigate('/taxi/owner/dashboard')} className="-ml-1 rounded-lg p-1.5 hover:bg-white/10">
              <ArrowLeft size={20} />
            </button>
          )}
          <p className="font-bold">Bus dashboard</p>
          <button type="button" onClick={() => navigate(managePath)} className="ml-auto rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
            {manageLabel}
          </button>
          {isBusPortal ? (
            <button type="button" onClick={handleBusLogout} className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-200 hover:bg-white/10">
              Log out
            </button>
          ) : null}
        </header>

        <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
          {loadingBuses ? (
            <div className="flex h-64 items-center justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
            </div>
          ) : loadError ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{loadError}</p>
          ) : !buses.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <Bus size={32} className="mx-auto text-slate-400" />
              <h1 className="mt-3 text-xl font-bold">{isBusPortal ? 'No bus linked yet' : 'No buses yet'}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {isBusPortal
                  ? 'Your account is not linked to a bus yet. Contact support to get it assigned.'
                  : 'Add a bus and its schedule, then you can book seats here.'}
              </p>
              {isBusPortal ? null : (
                <button type="button" onClick={() => navigate('/taxi/owner/bus-service/create')} className="mt-5 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-500">
                  Add a bus
                </button>
              )}
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">{picker}</section>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Seats available" value={layout?.availableSeats ?? '-'} />
                <Stat label="Seats sold" value={summary.totalSeats ?? 0} />
                <Stat label="Confirmed bookings" value={summary.confirmedBookings ?? 0} />
                <Stat label="Booking value" value={formatMoney(summary.totalAmount, currency)} />
              </div>
              {tab === 'book' ? bookTab : bookingsTab}
            </>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-slate-200 bg-white lg:hidden">
        {navItems.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${tab === key ? 'text-amber-700' : 'text-slate-500'}`}
          >
            {React.createElement(icon, { size: 20 })}
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default OwnerBusDashboard;
