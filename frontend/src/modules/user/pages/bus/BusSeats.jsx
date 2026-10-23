import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, Radio, X } from 'lucide-react';
import userBusService, { BUS_SEAT_EVENTS } from '../../services/busService';
import { socketService } from '../../../../shared/api/socket';
import { BusScreen, BusTopBar, EmptyState, FooterBar, Skeleton } from '../../components/bus/ZiBusUi';
import { formatDay, formatRupees, routePrefixFor, toDateKey } from '../../components/bus/zibusFormat';
import { buildBusRouteState, toPlainData } from './busNavigationState';

const MAX_SEATS = 6;

// A zero or blank per-type price means "not set", so the bus fare applies.
const positivePrice = (value) => (Number(value) > 0 ? Number(value) : undefined);

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolved = positivePrice(variantPricing?.[variantKey]) ?? positivePrice(variantPricing?.seat) ?? defaultPrice;
  return Number.isFinite(Number(resolved)) ? Number(resolved) : defaultPrice;
};

const normalizeIsoDate = (value) => {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : toDateKey(new Date(value));
};

const SteeringWheel = () => (
  <svg viewBox="0 0 24 24" className="zb-muted h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="Driver">
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 14.2V21.5M9.9 11.3L3 9.5M14.1 11.3L21 9.5" />
  </svg>
);

/**
 * One deck drawn like a bus, the way this bus is set up to be shown
 * (blueprint.seatLayoutOrientation): 'horizontal' = on its side, front at the
 * left, berths flat; 'vertical' = upright, front at the top, berths tall. The
 * blueprint lists rows from the front, each across the bus; drawn sideways it
 * is transposed. An all-aisle position is a thin gap.
 */
const Deck = ({ title, rows, selectedIds, onToggle, priceOf, showWheel, vertical }) => {
  const lengthCount = rows?.length || 0;
  const widthCount = Math.max(0, ...(rows || []).map((row) => (Array.isArray(row) ? row.length : 0)));
  if (!lengthCount || !widthCount) return null;
  const isSeat = (cell) => cell?.kind === 'seat';
  const aisle = Array.from({ length: widthCount }, (_, across) => rows.every((row) => !isSeat(row?.[across])));
  const gridRows = vertical ? lengthCount : widthCount;
  const gridCols = vertical ? widthCount : lengthCount;
  const cellAt = (r, c) => (vertical ? rows[r]?.[c] : rows[c]?.[r]);

  const grid = (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: Array.from({ length: gridCols }, (_, c) => (vertical && aisle[c] ? '12px' : 'auto')).join(' '),
        gridTemplateRows: Array.from({ length: gridRows }, (_, r) => (!vertical && aisle[r] ? '12px' : 'auto')).join(' '),
      }}
    >
      {Array.from({ length: gridRows }, (_, r) =>
        Array.from({ length: gridCols }, (_, c) => {
          const seat = cellAt(r, c);
          const key = `${title}-${r}-${c}`;
          if (!isSeat(seat)) return <div key={key} />;
          const booked = seat.status === 'booked';
          const selected = selectedIds.includes(seat.id);
          const sleeper = seat.variant === 'sleeper';
          const size = sleeper
            ? vertical ? { width: 46, minHeight: 76 } : { width: 76, minHeight: 34 }
            : { width: 42, minHeight: 42 };
          return (
            <button
              key={key}
              type="button"
              disabled={booked}
              onClick={() => onToggle(seat)}
              className={`zb-seat ${sleeper ? 'is-sleeper' : ''} ${vertical ? '' : 'is-sideways'} ${booked ? 'is-booked' : ''} ${selected ? 'is-selected' : ''}`}
              style={{ ...size, justifySelf: 'center', alignSelf: 'center' }}
              aria-label={booked ? `Seat ${seat.label || seat.id}, booked` : `Seat ${seat.label || seat.id}, ${formatRupees(priceOf(seat))}`}
              title={booked ? `${seat.label || seat.id} · Booked` : `${seat.label || seat.id} · ${formatRupees(priceOf(seat))}`}
            >
              <span className="zb-seat-price" style={vertical ? undefined : { paddingRight: 6 }}>
                {selected ? seat.label || seat.id : formatRupees(priceOf(seat))}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );

  if (vertical) {
    return (
      <div className="zb-deck">
        <div className="mb-4 flex items-center justify-between">
          <span className="zb-label">{title}</span>
          {showWheel ? <SteeringWheel /> : <span className="h-7" />}
        </div>
        <div className="overflow-x-auto">{grid}</div>
      </div>
    );
  }

  return (
    <div className="zb-deck flex items-stretch gap-3">
      <div className="flex w-8 shrink-0 flex-col items-center justify-between py-1">
        {showWheel ? <SteeringWheel /> : <span />}
        <span className="zb-label rotate-180 [writing-mode:vertical-rl]">{title}</span>
      </div>
      <div className="overflow-x-auto">{grid}</div>
    </div>
  );
};

const BusSeats = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seatLayout, setSeatLayout] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatNotice, setSeatNotice] = useState('');
  const selectedSeatsRef = useRef(selectedSeats);
  useEffect(() => {
    selectedSeatsRef.current = selectedSeats;
  }, [selectedSeats]);

  const pricingBus = seatLayout?.bus || bus;
  const priceOf = (seat) => resolveSeatPrice(pricingBus, seat);

  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return undefined;
    }
    let active = true;
    userBusService
      .getSeatLayout({ busServiceId: bus.busServiceId, scheduleId: bus.scheduleId, date })
      .then((response) => active && setSeatLayout(toPlainData(response?.data) || null))
      .catch((err) => active && setError(err?.message || 'Could not load the seat map'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date, navigate, routePrefix]);

  // Live seat map: seats sold or released anywhere (this app, the operator's
  // counter, or another booking platform) flip here without a refresh.
  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) return undefined;

    const watch = { busServiceId: bus.busServiceId, scheduleId: bus.scheduleId, travelDate: normalizeIsoDate(date) };
    const socket = socketService.connect({ role: 'user' });
    const sendWatch = () => socketService.emit(BUS_SEAT_EVENTS.WATCH, watch);

    const handleUpdate = (payload) => {
      if (
        String(payload?.busServiceId) !== String(watch.busServiceId) ||
        String(payload?.scheduleId) !== String(watch.scheduleId) ||
        String(payload?.travelDate) !== String(watch.travelDate)
      ) {
        return;
      }
      const unavailable = new Set((payload.unavailableSeatIds || []).map(String));
      setSeatLayout((current) => {
        if (!current?.blueprint) return current;
        const remap = (rows = []) => rows.map((row) => (Array.isArray(row) ? row : []).map((cell) => (
          cell?.kind === 'seat' ? { ...cell, status: unavailable.has(String(cell.id)) ? 'booked' : 'available' } : cell
        )));
        return {
          ...current,
          availableSeats: payload.availableSeats,
          blueprint: { ...current.blueprint, lowerDeck: remap(current.blueprint.lowerDeck), upperDeck: remap(current.blueprint.upperDeck) },
        };
      });

      const lost = selectedSeatsRef.current.filter((seat) => unavailable.has(String(seat.id)));
      if (lost.length) {
        setSeatNotice(`Seat ${lost.map((seat) => seat.label || seat.id).join(', ')} was just booked by someone else.`);
        setSelectedSeats((current) => current.filter((seat) => !unavailable.has(String(seat.id))));
      }
    };

    socketService.on(BUS_SEAT_EVENTS.SEATS_UPDATED, handleUpdate);
    socketService.on('connect', sendWatch);
    if (socket?.connected) sendWatch();

    return () => {
      socketService.emit(BUS_SEAT_EVENTS.UNWATCH, {});
      socketService.off(BUS_SEAT_EVENTS.SEATS_UPDATED, handleUpdate);
      socketService.off('connect', sendWatch);
    };
  }, [bus?.busServiceId, bus?.scheduleId, date]);

  const toggleSeat = (seat) => {
    if (!seat || seat.status === 'booked') return;
    if (selectedSeats.some((item) => item.id === seat.id)) {
      setSelectedSeats((current) => current.filter((item) => item.id !== seat.id));
      return;
    }
    if (selectedSeats.length >= MAX_SEATS) {
      setSeatNotice(`You can book up to ${MAX_SEATS} seats at a time.`);
      return;
    }
    setSelectedSeats((current) => [...current, { id: seat.id, label: seat.label || seat.id, variant: seat.variant || 'seat', price: priceOf(seat) }]);
  };

  const lowerDeck = seatLayout?.blueprint?.lowerDeck || [];
  const upperDeck = seatLayout?.blueprint?.upperDeck || [];
  const hasUpper = upperDeck.some((row) => (row || []).some((cell) => cell?.kind === 'seat'));
  // Each bus is shown the way the operator set it up.
  const vertical = seatLayout?.blueprint?.seatLayoutOrientation === 'vertical';
  const totalFare = selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const variantPrices = new Map();
  [...lowerDeck, ...upperDeck].flat().filter((cell) => cell?.kind === 'seat').forEach((cell) => {
    variantPrices.set(cell.variant === 'sleeper' ? 'Sleeper' : 'Seater', resolveSeatPrice(pricingBus, cell));
  });
  const variants = [...variantPrices.entries()];

  return (
    <BusScreen>
      <BusTopBar
        onBack={() => navigate(-1)}
        title="Choose your seats"
        subtitle={`${bus?.operator || ''} · ${fromCity || bus?.fromCity || ''} → ${toCity || bus?.toCity || ''} · ${formatDay(date)}`}
        step={1}
      />

      <div className="zb-body">
        {seatNotice ? (
          <div className="zb-card flex items-start gap-3 p-3" style={{ borderColor: 'color-mix(in srgb, var(--zb-food) 55%, transparent)' }}>
            <AlertTriangle size={18} className="zb-food-text mt-0.5 shrink-0" />
            <p className="zb-text flex-1 text-sm font-semibold">{seatNotice}</p>
            <button type="button" onClick={() => setSeatNotice('')} className="zb-muted" aria-label="Dismiss"><X size={16} /></button>
          </div>
        ) : null}

        {loading ? (
          <>
            <Skeleton height={56} />
            <Skeleton height={420} />
          </>
        ) : error ? (
          <EmptyState title="Seat map unavailable" text={error} />
        ) : (
          <>
            <div className="zb-card flex items-center justify-between p-3">
              <span className="zb-badge is-green"><Radio size={11} className="zb-pulse" /> Live seat status</span>
              <span className="zb-text text-sm font-extrabold">{Number(seatLayout?.availableSeats ?? 0)} seats left</span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
              <span className="zb-muted flex items-center gap-2 text-[11px] font-bold">
                <span className="zb-seat !min-h-0 h-4 w-4" /> Available
              </span>
              <span className="zb-muted flex items-center gap-2 text-[11px] font-bold">
                <span className="zb-seat is-selected !min-h-0 h-4 w-4" /> Yours
              </span>
              <span className="zb-muted flex items-center gap-2 text-[11px] font-bold">
                <span className="zb-seat is-booked !min-h-0 h-4 w-4" /> Booked
              </span>
              {variants.map(([name, price]) => (
                <span key={name} className="zb-muted text-[11px] font-bold">{name} {formatRupees(price)}</span>
              ))}
            </div>

            {vertical ? (
              // Upright: lower and upper next to each other.
              <div className="flex flex-wrap items-start gap-3">
                <Deck title="Lower deck" rows={lowerDeck} selectedIds={selectedSeats.map((seat) => seat.id)} onToggle={toggleSeat} priceOf={priceOf} showWheel vertical />
                {hasUpper ? (
                  <Deck title="Upper deck" rows={upperDeck} selectedIds={selectedSeats.map((seat) => seat.id)} onToggle={toggleSeat} priceOf={priceOf} vertical />
                ) : null}
              </div>
            ) : (
              // On its side: upper above lower, scrolling sideways on a phone.
              <div className="space-y-3">
                {hasUpper ? (
                  <Deck title="Upper" rows={upperDeck} selectedIds={selectedSeats.map((seat) => seat.id)} onToggle={toggleSeat} priceOf={priceOf} />
                ) : null}
                <Deck title="Lower" rows={lowerDeck} selectedIds={selectedSeats.map((seat) => seat.id)} onToggle={toggleSeat} priceOf={priceOf} showWheel />
              </div>
            )}
          </>
        )}
      </div>

      <FooterBar
        label={selectedSeats.length ? `${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} · ${selectedSeats.map((seat) => seat.label).join(', ')}` : 'No seat selected'}
        value={formatRupees(totalFare)}
        note="Fare before tax"
        actionLabel="Continue"
        disabled={!selectedSeats.length || loading || Boolean(error)}
        onAction={() => navigate(`${routePrefix}/bus/checkout`, {
          state: buildBusRouteState(state, { bus: seatLayout?.bus || bus, selectedSeats, totalFare }),
        })}
      />
    </BusScreen>
  );
};

export default BusSeats;
