import React, { useMemo, useState } from 'react';

/**
 * A bus seat map drawn the way booking sites (AbhiBus, redBus) draw it: the
 * coach on its side with the front at the left, upper deck above lower deck,
 * the steering wheel at the front of the lower deck. Berths are wide flat
 * rectangles, seats are squares, the aisle is a thin gap.
 *
 * The blueprint is stored row by row from the front, each row listing the
 * positions across the bus; drawn sideways that grid is transposed, so a
 * blueprint row becomes a column here and an all-aisle position a gap.
 *
 *   getSeat(cell) -> { status: 'available' | 'selected' | 'booked' | 'blocked',
 *                      price?: number, title?: string }
 */

const STATUS_STYLE = {
  available: 'border-slate-300 bg-white text-slate-700 hover:border-slate-500',
  selected: 'border-blue-600 bg-blue-600 text-white',
  booked: 'border-slate-200 bg-slate-200 text-slate-400',
  held: 'border-amber-300 bg-amber-50 text-amber-700',
  blocked: 'border-rose-200 bg-rose-50 text-rose-400',
};

const SteeringWheel = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.2" aria-label="Driver">
    <circle cx="12" cy="12" r="9.5" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 14.2V21.5M9.9 11.3L3 9.5M14.1 11.3L21 9.5" />
  </svg>
);

const money = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

const Deck = ({ label, rows, isLower, getSeat, onSeatClick, showPrices, priceFilter }) => {
  const lengthCount = rows.length;
  const widthCount = Math.max(0, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (!lengthCount || !widthCount) return null;

  const cellAt = (along, across) => rows[along]?.[across];
  const isSeat = (cell) => cell?.kind === 'seat';
  // A position across the bus that is never a seat is the aisle.
  const aisle = Array.from({ length: widthCount }, (_, across) =>
    rows.every((row) => !isSeat(row?.[across])),
  );
  // A column holding any berth is drawn berth-wide.
  const berthColumn = Array.from({ length: lengthCount }, (_, along) =>
    (rows[along] || []).some((cell) => isSeat(cell) && cell.variant === 'sleeper'),
  );

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex w-8 shrink-0 flex-col items-center justify-between py-1">
        {isLower ? <SteeringWheel /> : <span />}
        <span className="rotate-180 text-xs font-bold text-slate-500 [writing-mode:vertical-rl]">{label}</span>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: berthColumn.map((berth) => (berth ? '74px' : '38px')).join(' '),
            gridTemplateRows: aisle.map((gap) => (gap ? '14px' : 'auto')).join(' '),
          }}
        >
          {Array.from({ length: widthCount }, (_, across) =>
            Array.from({ length: lengthCount }, (_, along) => {
              const cell = cellAt(along, across);
              const key = `${label}-${along}-${across}`;
              if (!isSeat(cell)) return <div key={key} />;
              const berth = cell.variant === 'sleeper';
              const seat = getSeat(cell) || {};
              const status = seat.status || 'available';
              const price = Number(seat.price || 0);
              const dimmed = priceFilter != null && status === 'available' && price !== priceFilter;
              const clickable = Boolean(onSeatClick);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onSeatClick?.(cell)}
                  title={seat.title || `${cell.label || cell.id}${price ? ` · ${money(price)}` : ''} · ${status}`}
                  className={`relative flex items-center justify-center border text-[10px] font-semibold leading-none transition ${
                    STATUS_STYLE[status] || STATUS_STYLE.available
                  } ${dimmed ? 'opacity-30' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
                  style={{
                    width: berth ? 74 : 38,
                    height: berth ? 32 : 38,
                    borderRadius: berth ? 6 : 7,
                    justifySelf: 'center',
                  }}
                >
                  {/* Head of the berth / back of the seat, at the rear side. */}
                  <span
                    className={`absolute rounded-sm ${status === 'selected' ? 'bg-blue-300' : status === 'booked' ? 'bg-slate-300' : 'bg-slate-200'}`}
                    style={berth ? { right: 3, top: 5, bottom: 5, width: 4 } : { right: 3, top: 6, bottom: 6, width: 3 }}
                  />
                  <span className="pr-1.5">
                    {status === 'booked' && !showPrices ? cell.label : showPrices && price && status !== 'booked' ? money(price) : cell.label}
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
};

const HorizontalSeatMap = ({ blueprint, getSeat = () => ({}), onSeatClick, showPrices = false, legend = 'booking' }) => {
  const [priceFilter, setPriceFilter] = useState(null);
  const lower = Array.isArray(blueprint?.lowerDeck) ? blueprint.lowerDeck : [];
  const upper = Array.isArray(blueprint?.upperDeck) ? blueprint.upperDeck : [];

  const prices = useMemo(() => {
    if (!showPrices) return [];
    const set = new Set();
    [...lower, ...upper].forEach((row) =>
      (row || []).forEach((cell) => {
        if (cell?.kind !== 'seat') return;
        const price = Number(getSeat(cell)?.price || 0);
        if (price > 0) set.add(price);
      }),
    );
    return [...set].sort((a, b) => a - b);
  }, [getSeat, lower, showPrices, upper]);

  const hasUpper = upper.some((row) => (row || []).some((cell) => cell?.kind === 'seat'));

  return (
    <div className="space-y-3">
      {prices.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {[null, ...prices].map((price) => (
            <button
              key={price ?? 'all'}
              type="button"
              onClick={() => setPriceFilter(price)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                priceFilter === price ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              {price == null ? 'All' : money(price)}
            </button>
          ))}
        </div>
      ) : null}

      {hasUpper ? (
        <Deck label="Upper" rows={upper} isLower={false} getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />
      ) : null}
      <Deck label="Lower" rows={lower} isLower getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-[11px] font-medium text-slate-500">
        {(legend === 'booking'
          ? [['available', 'Available'], ['selected', 'Selected'], ['booked', 'Booked'], ['blocked', 'Blocked']]
          : legend === 'inventory'
            ? [['available', 'Available'], ['held', 'On hold (paying)'], ['booked', 'Booked'], ['blocked', 'Blocked']]
            : [['available', 'Available'], ['blocked', 'Blocked (not for sale)']]
        ).map(([status, text]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`h-3.5 w-5 rounded border ${STATUS_STYLE[status]}`} />
            {text}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-6 rounded border border-slate-300 bg-white" /> Sleeper
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border border-slate-300 bg-white" /> Seater
        </span>
      </div>
    </div>
  );
};

export default HorizontalSeatMap;
