import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BusFront, ChevronRight, Loader2, Plus, UtensilsCrossed } from 'lucide-react';
import userBusService from '../../services/busService';
import { BusScreen, BusTopBar, EmptyState, Skeleton } from '../../components/bus/ZiBusUi';
import { formatDay, formatRupees, routePrefixFor } from '../../components/bus/zibusFormat';

const PAGE_SIZE = 10;

const TABS = [
  { id: 'upcoming', label: 'Upcoming', status: '', tripState: 'upcoming' },
  { id: 'completed', label: 'Completed', status: '', tripState: 'completed' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled', tripState: 'cancelled' },
  { id: 'all', label: 'All', status: '', tripState: '' },
];

const STATUS_BADGE = {
  confirmed: ['is-green', 'Confirmed'],
  pending: ['is-accent', 'Payment pending'],
  cancelled: ['is-red', 'Cancelled'],
  expired: ['', 'Expired'],
  failed: ['is-red', 'Failed'],
};

const TripCard = ({ booking, onOpen }) => {
  const [tone, label] = STATUS_BADGE[booking.status] || ['', booking.status];
  const seats = booking.activeSeatLabels?.length ? booking.activeSeatLabels : booking.seatLabels || [];
  return (
    <button type="button" onClick={onOpen} className="zb-card w-full p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="zb-text truncate text-base font-extrabold">{booking.bus?.fromCity} → {booking.bus?.toCity}</p>
          <p className="zb-muted truncate text-xs font-semibold">{booking.bus?.operator}</p>
        </div>
        <span className={`zb-badge ${tone}`}>{label}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="zb-soft p-2.5">
          <p className="zb-label">Date</p>
          <p className="zb-text mt-0.5 text-xs font-extrabold">{formatDay(booking.travelDate, { day: 'numeric', month: 'short' })}</p>
        </div>
        <div className="zb-soft p-2.5">
          <p className="zb-label">Departs</p>
          <p className="zb-text mt-0.5 text-xs font-extrabold">{booking.bus?.departure || '--:--'}</p>
        </div>
        <div className="zb-soft p-2.5">
          <p className="zb-label">Seats</p>
          <p className="zb-text mt-0.5 truncate text-xs font-extrabold">{seats.join(', ') || '-'}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <span className="zb-badge">PNR {booking.pnr || booking.bookingCode}</span>
          {Number(booking.foodAmount || 0) > 0 ? <span className="zb-badge is-food"><UtensilsCrossed size={11} /> Food</span> : null}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold zb-text">
          {formatRupees(Number(booking.amount || 0) + Number(booking.foodAmount || 0))}
          <ChevronRight size={16} className="zb-muted" />
        </span>
      </div>
    </button>
  );
};

const BusBookings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [bookings, setBookings] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selected = TABS.find((item) => item.id === tab) || TABS[0];

  useEffect(() => {
    let active = true;
    userBusService
      .getMyBookings({ page, limit: PAGE_SIZE, status: selected.status, tripState: selected.tripState })
      .then((response) => {
        if (!active) return;
        const payload = response?.data || {};
        const results = Array.isArray(payload.results) ? payload.results : [];
        setBookings((current) => (page === 1 ? results : [...current, ...results]));
        setHasMore(Boolean(payload.pagination?.hasNextPage));
        setError('');
      })
      .catch((err) => active && setError(err?.message || 'Could not load your trips'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, selected.status, selected.tripState]);

  const switchTab = (id) => {
    if (id === tab) return;
    setLoading(true);
    setBookings([]);
    setPage(1);
    setTab(id);
  };

  return (
    <BusScreen>
      <BusTopBar
        onBack={() => navigate(-1)}
        title="My trips"
        subtitle="ZI Bus tickets"
        right={(
          <button type="button" onClick={() => navigate(`${routePrefix}/bus`)} className="zb-icon-btn" aria-label="Book a bus">
            <Plus size={18} />
          </button>
        )}
      />

      <div className="zb-body">
        <div className="zb-scroll-x">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => switchTab(item.id)} className={`zb-chip ${tab === item.id ? 'is-active' : ''}`}>
              {item.label}
            </button>
          ))}
        </div>

        {loading && !bookings.length ? (
          <>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </>
        ) : error ? (
          <EmptyState icon={BusFront} title="Couldn’t load trips" text={error} />
        ) : !bookings.length ? (
          <EmptyState
            icon={BusFront}
            title={tab === 'upcoming' ? 'No upcoming trips' : 'Nothing here yet'}
            text={tab === 'upcoming' ? 'Book a bus and add hot dhaba food on the way.' : 'Your trips will show up here.'}
            action={<button type="button" className="zb-btn zb-btn-primary" onClick={() => navigate(`${routePrefix}/bus`)}>Book a bus</button>}
          />
        ) : (
          <>
            {bookings.map((booking) => (
              <TripCard key={booking.id} booking={booking} onOpen={() => navigate(`${routePrefix}/profile/bus-bookings/${booking.id}`)} />
            ))}
            {hasMore ? (
              <button type="button" disabled={loading} className="zb-btn zb-btn-ghost w-full" onClick={() => { setLoading(true); setPage((current) => current + 1); }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null} Load more
              </button>
            ) : null}
          </>
        )}
      </div>
    </BusScreen>
  );
};

export default BusBookings;
