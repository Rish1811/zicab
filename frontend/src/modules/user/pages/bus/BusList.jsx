import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownUp, BusFront, ChevronLeft, ChevronRight, Radio, Snowflake, Star, UtensilsCrossed } from 'lucide-react';
import userBusService from '../../services/busService';
import { BusScreen, BusTopBar, EmptyState, Skeleton, TripLine } from '../../components/bus/ZiBusUi';
import { addDays, formatDay, formatRupees, routePrefixFor, toDateKey } from '../../components/bus/zibusFormat';
import { buildBusRouteState, toPlainData } from './busNavigationState';

const SORTS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price', label: 'Cheapest' },
  { id: 'departure', label: 'Earliest' },
  { id: 'rating', label: 'Top rated' },
  { id: 'seats', label: 'Most seats' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Morning', from: 5 * 60, to: 12 * 60 },
  { id: 'afternoon', label: 'Afternoon', from: 12 * 60, to: 17 * 60 },
  { id: 'evening', label: 'Evening', from: 17 * 60, to: 21 * 60 },
  { id: 'night', label: 'Night', from: 21 * 60, to: 29 * 60 },
];

const minutesOf = (time = '') => {
  const match = String(time).match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const meridiem = (match[3] || '').toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + Number(match[2]);
};

const busText = (bus) => `${bus.type || ''} ${bus.coachType || ''} ${bus.busCategory || ''}`.toLowerCase();
const isAc = (bus) => /\bac\b|a\/c|air/.test(busText(bus)) && !/non[\s-]?a\/?c/.test(busText(bus));
const isSleeper = (bus) => busText(bus).includes('sleeper');

const BusCard = ({ bus, onSelect }) => {
  const seatsLeft = Number(bus.availableSeats ?? bus.seats ?? 0);
  const soldOut = seatsLeft <= 0;
  return (
    <button type="button" onClick={() => !soldOut && onSelect(bus)} disabled={soldOut} className={`zb-card w-full p-4 text-left ${soldOut ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="zb-text truncate text-base font-extrabold">{bus.operator || bus.busName}</p>
          <p className="zb-muted mt-0.5 truncate text-xs font-semibold">{bus.type}{bus.busName && bus.operator ? ` · ${bus.busName}` : ''}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="zb-muted text-[10px] font-bold">from</p>
          <p className="text-lg font-extrabold zb-accent-text leading-none">{formatRupees(bus.price)}</p>
        </div>
      </div>

      <div className="mt-4">
        <TripLine departure={bus.departure} arrival={bus.arrival} fromLabel={bus.fromCity} toLabel={bus.toCity} duration={bus.duration} compact />
      </div>

      <div className="zb-divider mt-4" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {soldOut ? (
          <span className="zb-badge is-red">Sold out</span>
        ) : (
          <span className={`zb-badge ${seatsLeft <= 5 ? 'is-red' : 'is-green'}`}>
            {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left
          </span>
        )}
        {Number(bus.ratingCount || 0) > 0 ? (
          <span className="zb-badge is-accent"><Star size={11} fill="currentColor" /> {Number(bus.rating).toFixed(1)}</span>
        ) : null}
        {isAc(bus) ? <span className="zb-badge is-blue"><Snowflake size={11} /> AC</span> : null}
        {Number(bus.foodStops || 0) > 0 ? (
          <span className="zb-badge is-food"><UtensilsCrossed size={11} /> {bus.foodStops} food stop{bus.foodStops > 1 ? 's' : ''}</span>
        ) : null}
        <span className="zb-badge"><Radio size={11} /> Live tracking</span>
      </div>
    </button>
  );
};

const BusList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { fromCity, toCity, date } = state;

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('recommended');
  const [filters, setFilters] = useState({ ac: false, nonAc: false, sleeper: false, seater: false, food: false });
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    if (!fromCity || !toCity || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return undefined;
    }
    let active = true;
    userBusService
      .searchBuses({ fromCity, toCity, date })
      .then((response) => {
        if (!active) return;
        const results = Array.isArray(response?.data?.results) ? response.data.results : [];
        setBuses(toPlainData(results) || []);
        setError('');
      })
      .catch((err) => active && setError(err?.message || 'Could not load buses'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date, fromCity, navigate, routePrefix, toCity]);

  const changeDate = (nextDate) => {
    setLoading(true);
    navigate(`${routePrefix}/bus/list`, { replace: true, state: { ...state, date: nextDate } });
  };

  const visible = useMemo(() => {
    const list = buses.filter((bus) => {
      if (filters.ac && !isAc(bus)) return false;
      if (filters.nonAc && isAc(bus)) return false;
      if (filters.sleeper && !isSleeper(bus)) return false;
      if (filters.seater && isSleeper(bus)) return false;
      if (filters.food && !Number(bus.foodStops || 0)) return false;
      if (slots.length) {
        const minutes = minutesOf(bus.departure);
        if (minutes === null) return false;
        const shifted = minutes < 5 * 60 ? minutes + 24 * 60 : minutes;
        if (!slots.some((id) => {
          const slot = TIME_SLOTS.find((item) => item.id === id);
          return shifted >= slot.from && shifted < slot.to;
        })) return false;
      }
      return true;
    });

    const byNumber = (pick, desc = false) => (a, b) => (desc ? pick(b) - pick(a) : pick(a) - pick(b));
    if (sortBy === 'price') list.sort(byNumber((bus) => Number(bus.price || 0)));
    if (sortBy === 'departure') list.sort(byNumber((bus) => minutesOf(bus.departure) ?? 9999));
    if (sortBy === 'rating') list.sort(byNumber((bus) => Number(bus.rating || 0), true));
    if (sortBy === 'seats') list.sort(byNumber((bus) => Number(bus.availableSeats || 0), true));
    if (sortBy === 'recommended') {
      // Buses with seats first, then earlier departures.
      list.sort((a, b) => (Number(b.availableSeats > 0) - Number(a.availableSeats > 0)) || ((minutesOf(a.departure) ?? 9999) - (minutesOf(b.departure) ?? 9999)));
    }
    return list;
  }, [buses, filters, slots, sortBy]);

  const toggle = (key) => setFilters((current) => ({ ...current, [key]: !current[key] }));
  const anyFilter = Object.values(filters).some(Boolean) || slots.length > 0;
  const minDate = toDateKey();

  return (
    <BusScreen>
      <BusTopBar
        onBack={() => navigate(-1)}
        title={`${fromCity || ''} → ${toCity || ''}`}
        subtitle={loading ? 'Finding buses…' : `${visible.length} bus${visible.length === 1 ? '' : 'es'} · ${formatDay(date)}`}
      />

      <div className="zb-body">
        <div className="zb-card flex items-center justify-between p-2">
          <button type="button" className="zb-icon-btn" disabled={date <= minDate} onClick={() => changeDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="zb-text text-sm font-extrabold">{formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <p className="zb-muted text-[11px] font-semibold">{date === minDate ? 'Today' : date === addDays(minDate, 1) ? 'Tomorrow' : 'Journey date'}</p>
          </div>
          <button type="button" className="zb-icon-btn" onClick={() => changeDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="zb-scroll-x -mx-5 px-5">
          <button type="button" className={`zb-chip ${filters.ac ? 'is-active' : ''}`} onClick={() => toggle('ac')}><Snowflake size={13} /> AC</button>
          <button type="button" className={`zb-chip ${filters.nonAc ? 'is-active' : ''}`} onClick={() => toggle('nonAc')}>Non-AC</button>
          <button type="button" className={`zb-chip ${filters.sleeper ? 'is-active' : ''}`} onClick={() => toggle('sleeper')}>Sleeper</button>
          <button type="button" className={`zb-chip ${filters.seater ? 'is-active' : ''}`} onClick={() => toggle('seater')}>Seater</button>
          <button type="button" className={`zb-chip ${filters.food ? 'is-active' : ''}`} onClick={() => toggle('food')}><UtensilsCrossed size={13} /> Food stops</button>
        </div>
        <div className="zb-scroll-x -mx-5 px-5">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={`zb-chip ${slots.includes(slot.id) ? 'is-active' : ''}`}
              onClick={() => setSlots((current) => (current.includes(slot.id) ? current.filter((id) => id !== slot.id) : [...current, slot.id]))}
            >
              {slot.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <label className="zb-muted flex items-center gap-2 text-xs font-bold">
            <ArrowDownUp size={14} />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="zb-text rounded-lg bg-transparent px-1 py-1 text-xs font-bold outline-none">
              {SORTS.map((sort) => <option key={sort.id} value={sort.id}>{sort.label}</option>)}
            </select>
          </label>
          {anyFilter ? (
            <button type="button" className="text-xs font-bold zb-accent-text" onClick={() => { setFilters({ ac: false, nonAc: false, sleeper: false, seater: false, food: false }); setSlots([]); }}>
              Clear filters
            </button>
          ) : null}
        </div>

        {loading ? (
          <>
            <Skeleton height={168} />
            <Skeleton height={168} />
            <Skeleton height={168} />
          </>
        ) : error ? (
          <EmptyState icon={BusFront} title="Couldn’t load buses" text={error} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={BusFront}
            title={buses.length ? 'No bus matches these filters' : 'No buses on this date'}
            text={buses.length ? 'Clear a filter to see more.' : 'Try the next day, or another route.'}
            action={!buses.length ? (
              <button type="button" className="zb-btn zb-btn-ghost" onClick={() => changeDate(addDays(date, 1))}>
                Try {formatDay(addDays(date, 1))}
              </button>
            ) : null}
          />
        ) : (
          visible.map((bus) => (
            <BusCard
              key={bus.id}
              bus={bus}
              onSelect={(selected) => navigate(`${routePrefix}/bus/details`, { state: buildBusRouteState(state, { bus: selected }) })}
            />
          ))
        )}
      </div>
    </BusScreen>
  );
};

export default BusList;
