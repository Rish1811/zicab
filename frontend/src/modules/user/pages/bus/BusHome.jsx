import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  BusFront,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Navigation,
  QrCode,
  Radio,
  Search,
  ShieldCheck,
  Ticket,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import userBusService from '../../services/busService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { BusScreen, SectionTitle, Skeleton } from '../../components/bus/ZiBusUi';
import { addDays, formatDay, formatRupees, routePrefixFor, toDateKey } from '../../components/bus/zibusFormat';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const normalizeCity = (value = '') => String(value).trim().toLowerCase();
const unwrap = (response) => response?.data?.data || response?.data || response || null;

const HOW_IT_WORKS = [
  { icon: BusFront, title: 'Pick your seat', text: 'Live seat map, updated the moment anyone books.' },
  { icon: UtensilsCrossed, title: 'Add dhaba food', text: 'Pre-order at highway stops. Ready when the bus halts.' },
  { icon: QrCode, title: 'Get PNR & QR', text: 'Instant e-ticket. Show the QR at the door.' },
  { icon: Navigation, title: 'Track your bus', text: 'Live location from 1 hour before boarding.' },
];

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const CalendarSheet = ({ value, onPick, onClose }) => {
  const today = toDateKey();
  const [month, setMonth] = useState(() => monthStart(new Date(`${value || today}T00:00:00`)));
  const days = useMemo(() => {
    const offset = (month.getDay() + 6) % 7; // Monday first
    const start = new Date(month);
    start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  return (
    <div className="zb-sheet-backdrop" onClick={onClose} role="presentation">
      <div className="zb-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Choose travel date">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="zb-label">Date of journey</p>
            <p className="zb-h2 mt-1">{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="zb-icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="zb-icon-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
              <ChevronRight size={18} />
            </button>
            <button type="button" className="zb-icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <span key={`${day}-${index}`} className="zb-muted py-1 text-[11px] font-bold">{day}</span>
          ))}
          {days.map((day) => {
            const key = toDateKey(day);
            const disabled = key < today;
            const selected = key === value;
            const inMonth = day.getMonth() === month.getMonth();
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onPick(key)}
                className={`aspect-square rounded-xl text-sm font-bold ${selected ? 'zb-chip is-active justify-center !p-0' : ''}`}
                style={selected ? undefined : { color: disabled ? 'var(--zb-line)' : inMonth ? 'var(--zb-text)' : 'var(--zb-muted)' }}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const NextTripCard = ({ trip, tracking, onOpen }) => {
  const live = tracking?.available && ['live', 'paused'].includes(tracking?.state);
  return (
    <button type="button" onClick={onOpen} className="zb-card w-full p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="zb-label">Your next trip</p>
          <p className="zb-text mt-1 truncate text-base font-extrabold">
            {trip.bus?.fromCity || 'From'} → {trip.bus?.toCity || 'To'}
          </p>
          <p className="zb-muted mt-0.5 truncate text-xs font-semibold">
            {formatDay(trip.travelDate)} · {trip.bus?.departure || '--:--'} · Seat {(trip.activeSeatLabels || trip.seatLabels || []).join(', ')}
          </p>
        </div>
        {live ? (
          <span className="zb-badge is-green"><Radio size={11} className="zb-pulse" /> Bus is live</span>
        ) : tracking?.opensAt && tracking?.state === 'not_yet_open' ? (
          <span className="zb-badge is-blue">Track from {new Date(tracking.opensAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        ) : (
          <span className="zb-badge is-green">Confirmed</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="zb-badge is-accent"><Ticket size={11} /> PNR {trip.pnr || trip.bookingCode}</span>
        {Number(trip.foodAmount || 0) > 0 ? <span className="zb-badge is-food"><UtensilsCrossed size={11} /> Food pre-booked</span> : null}
        {trip.boardingPoint?.pointName ? <span className="zb-badge"><MapPin size={11} /> {trip.boardingPoint.pointName}</span> : null}
      </div>
    </button>
  );
};

const BusHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const today = toDateKey();

  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [nextTrip, setNextTrip] = useState(null);
  const [tracking, setTracking] = useState(null);

  useEffect(() => {
    if (!busEnabled) return undefined;
    let active = true;
    userBusService
      .getRoutes()
      .then((response) => {
        if (active) setRoutes(Array.isArray(response?.data?.results) ? response.data.results : []);
      })
      .catch(() => {})
      .finally(() => active && setRoutesLoading(false));
    return () => {
      active = false;
    };
  }, [busEnabled]);

  // The rider's next confirmed trip, with its live-tracking state.
  useEffect(() => {
    if (!busEnabled || !localStorage.getItem('userToken')) return undefined;
    let active = true;
    (async () => {
      try {
        const response = await userBusService.getMyBookings({ page: 1, limit: 5, tripState: 'upcoming' });
        const list = unwrap(response)?.results || response?.data?.results || [];
        const trip = (Array.isArray(list) ? list : []).find((item) => item.status === 'confirmed');
        if (!active || !trip) return;
        setNextTrip(trip);
        const live = unwrap(await userBusService.getLiveTracking(trip.id));
        if (active) setTracking(live);
      } catch {
        // The home screen works without it.
      }
    })();
    return () => {
      active = false;
    };
  }, [busEnabled]);

  const cities = useMemo(
    () => [...new Set(routes.flatMap((route) => [route.fromCity, route.toCity]).filter(Boolean))].sort(),
    [routes],
  );
  const matchingRoute = routes.find(
    (route) => normalizeCity(route.fromCity) === normalizeCity(fromCity) && normalizeCity(route.toCity) === normalizeCity(toCity),
  );
  const dateStrip = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, index)), [today]);

  const goSearch = (from = fromCity, to = toCity) => {
    if (!busEnabled) return setError('Bus booking is paused right now.');
    if (!from.trim() || !to.trim()) return setError('Enter where you are leaving from and going to.');
    if (normalizeCity(from) === normalizeCity(to)) return setError('From and To can’t be the same city.');
    setError('');
    navigate(`${routePrefix}/bus/list`, { state: { fromCity: from.trim(), toCity: to.trim(), date } });
    return undefined;
  };

  return (
    <BusScreen>
      <div className="px-5 pt-9">
        <div className="zb-hero px-5 pb-24 pt-5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => navigate(-1)} className="zb-glass flex h-10 w-10 items-center justify-center zb-on-dark" aria-label="Back">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => navigate(`${routePrefix}/profile/bus-bookings`)} className="zb-glass flex items-center gap-2 px-3 py-2 text-xs font-bold zb-on-dark">
              <Ticket size={14} /> My trips
            </button>
          </div>
          <p className="mt-6 text-[11px] font-extrabold uppercase tracking-[0.3em] zb-accent-text">ZI Bus</p>
          <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight zb-on-dark">Bus tickets,<br />hot food on the way.</h1>
          <p className="mt-2 max-w-[18rem] text-sm font-medium zb-on-dark-2">
            Live seats, highway dhaba meals and live bus tracking in one booking.
          </p>
        </div>

        <div className="zb-card relative -mt-16 mx-1 p-4 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.5)]">
          <div className="relative">
            <label className="zb-soft flex items-center gap-3 px-4 py-3">
              <span className="zb-dot is-start" />
              <span className="min-w-0 flex-1">
                <span className="zb-label block">From</span>
                <input
                  list="zb-cities"
                  value={fromCity}
                  onChange={(event) => setFromCity(event.target.value)}
                  placeholder="Leaving from"
                  className="zb-text w-full bg-transparent text-base font-bold outline-none"
                />
              </span>
            </label>
            <label className="zb-soft mt-2 flex items-center gap-3 px-4 py-3">
              <span className="zb-dot is-end" />
              <span className="min-w-0 flex-1">
                <span className="zb-label block">To</span>
                <input
                  list="zb-cities"
                  value={toCity}
                  onChange={(event) => setToCity(event.target.value)}
                  placeholder="Going to"
                  className="zb-text w-full bg-transparent text-base font-bold outline-none"
                />
              </span>
            </label>
            <button
              type="button"
              onClick={() => { setFromCity(toCity); setToCity(fromCity); }}
              className="zb-icon-btn absolute right-4 top-1/2 -translate-y-1/2"
              aria-label="Swap cities"
            >
              <ArrowUpDown size={16} />
            </button>
            <datalist id="zb-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="zb-label">Journey date</p>
            <button type="button" onClick={() => setCalendarOpen(true)} className="flex items-center gap-1 text-xs font-bold zb-accent-text">
              <CalendarDays size={14} /> {formatDay(date, { day: 'numeric', month: 'short', year: 'numeric' })}
            </button>
          </div>
          <div className="zb-scroll-x mt-2 pb-1">
            {dateStrip.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => setDate(key)}
                className={`zb-chip flex-col !gap-0 !px-3 !py-2 ${date === key ? 'is-active' : ''}`}
              >
                <span className="text-[10px] font-bold opacity-80">
                  {index === 0 ? 'Today' : index === 1 ? 'Tmrw' : formatDay(key, { weekday: 'short' })}
                </span>
                <span className="text-base font-extrabold">{formatDay(key, { day: 'numeric' })}</span>
              </button>
            ))}
          </div>

          {matchingRoute ? (
            <p className="mt-3 text-xs font-bold zb-green-text">
              {matchingRoute.busCount || 1} bus{(matchingRoute.busCount || 1) > 1 ? 'es' : ''} on this route · from {formatRupees(matchingRoute.startingPrice)}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-xs font-bold zb-red-text">{error}</p> : null}
          {!busEnabled ? <p className="mt-3 text-xs font-bold zb-red-text">Bus booking is paused right now.</p> : null}

          <button type="button" onClick={() => goSearch()} className="zb-btn zb-btn-primary mt-4 w-full">
            <Search size={18} /> Search buses
          </button>
        </div>
      </div>

      <div className="zb-body mt-2">
        {nextTrip ? (
          <NextTripCard trip={nextTrip} tracking={tracking} onOpen={() => navigate(`${routePrefix}/profile/bus-bookings/${nextTrip.id}`)} />
        ) : null}

        <div className="zb-card overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--zb-food) 18%, transparent)' }}>
              <UtensilsCrossed size={22} className="zb-food-text" />
            </div>
            <div className="min-w-0">
              <p className="zb-text text-sm font-extrabold">Hungry on the highway?</p>
              <p className="zb-muted text-xs font-semibold">
                Pre-order thalis, snacks and chai from partner dhabas while you book. The kitchen starts cooking 30 minutes before your bus arrives.
              </p>
            </div>
          </div>
        </div>

        <SectionTitle title="Popular routes" hint="Tap a route to see today’s buses" />
        {routesLoading ? (
          <div className="zb-scroll-x"><Skeleton height={104} className="min-w-[11rem]" /><Skeleton height={104} className="min-w-[11rem]" /></div>
        ) : routes.length ? (
          <div className="zb-scroll-x -mx-5 px-5 pb-1">
            {routes.slice(0, 10).map((route) => (
              <button
                key={`${route.fromCity}-${route.toCity}`}
                type="button"
                onClick={() => { setFromCity(route.fromCity); setToCity(route.toCity); goSearch(route.fromCity, route.toCity); }}
                className="zb-card min-w-[11.5rem] p-4 text-left"
              >
                <p className="zb-text truncate text-sm font-extrabold">{route.fromCity}</p>
                <p className="zb-muted text-[11px] font-bold">to</p>
                <p className="zb-text truncate text-sm font-extrabold">{route.toCity}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="zb-muted text-[11px] font-bold">{route.busCount || 1} bus{(route.busCount || 1) > 1 ? 'es' : ''}</span>
                  <span className="text-sm font-extrabold zb-accent-text">{formatRupees(route.startingPrice)}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="zb-muted text-sm font-semibold">No routes are live yet.</p>
        )}

        <SectionTitle title="How ZI Bus works" />
        <div className="grid grid-cols-2 gap-3">
          {HOW_IT_WORKS.map((step, index) => {
            const StepIcon = step.icon;
            const { title, text } = step;
            return (
            <div key={title} className="zb-card p-4">
              <div className="flex items-center justify-between">
                <StepIcon size={20} className="zb-accent-text" />
                <span className="zb-muted text-xs font-extrabold">0{index + 1}</span>
              </div>
              <p className="zb-text mt-3 text-sm font-extrabold">{title}</p>
              <p className="zb-muted mt-1 text-xs font-semibold leading-relaxed">{text}</p>
            </div>
            );
          })}
        </div>

        <div className="zb-soft flex items-center gap-3 p-4">
          <ShieldCheck size={20} className="zb-green-text shrink-0" />
          <p className="zb-text-2 text-xs font-semibold">
            Every seat can be sold only once, wherever it’s booked. If a payment goes through but the seat is lost, you get the full amount back automatically.
          </p>
        </div>
      </div>

      {calendarOpen ? (
        <CalendarSheet
          value={date}
          onClose={() => setCalendarOpen(false)}
          onPick={(key) => { setDate(key); setCalendarOpen(false); }}
        />
      ) : null}
    </BusScreen>
  );
};

export default BusHome;
