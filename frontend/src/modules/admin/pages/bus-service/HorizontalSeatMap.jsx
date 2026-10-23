import React, { useMemo, useState } from 'react';

/**
 * A bus seat map drawn the way booking sites draw it, in either orientation
 * (each bus picks one, blueprint.seatLayoutOrientation):
 *   horizontal - the coach on its side, front at the left, upper deck above
 *                lower, berths wide flat rectangles (AbhiBus);
 *   vertical   - upright, front at the top, decks side by side, berths tall
 *                (redBus).
 * Seats are squares, the aisle a thin gap, the steering wheel at the front of
 * the lower deck.
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

const Deck = ({ label, rows, isLower, vertical, getSeat, onSeatClick, showPrices, priceFilter }) => {
  const lengthCount = rows.length;
  const widthCount = Math.max(0, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (!lengthCount || !widthCount) return null;

  const isSeat = (cell) => cell?.kind === 'seat';
  // A position across the bus that is never a seat is the aisle.
  const aisle = Array.from({ length: widthCount }, (_, across) =>
    rows.every((row) => !isSeat(row?.[across])),
  );

  // Sideways: a grid row per position across the bus, a column per blueprint
  // row. Upright: the blueprint as stored, front row at the top.
  const gridRows = vertical ? lengthCount : widthCount;
  const gridCols = vertical ? widthCount : lengthCount;
  const cellAt = (r, c) => (vertical ? rows[r]?.[c] : rows[c]?.[r]);
  const berthSize = vertical ? { width: 42, height: 74 } : { width: 74, height: 32 };

  const grid = (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: Array.from({ length: gridCols }, (_, c) => (vertical && aisle[c] ? '14px' : 'auto')).join(' '),
        gridTemplateRows: Array.from({ length: gridRows }, (_, r) => (!vertical && aisle[r] ? '14px' : 'auto')).join(' '),
      }}
    >
      {Array.from({ length: gridRows }, (_, r) =>
        Array.from({ length: gridCols }, (_, c) => {
          const cell = cellAt(r, c);
          const key = `${label}-${r}-${c}`;
          if (!isSeat(cell)) return <div key={key} />;
          const berth = cell.variant === 'sleeper';
          const seat = getSeat(cell) || {};
          const status = seat.status || 'available';
          const price = Number(seat.price || 0);
          const dimmed = priceFilter != null && status === 'available' && price !== priceFilter;
          const clickable = Boolean(onSeatClick);
          const size = berth ? berthSize : { width: 38, height: 38 };
          // Head of the berth / back of the seat: at the rear, which is the
          // right side drawn sideways and the bottom drawn upright.
          const pillow = vertical
            ? { left: 5, right: 5, bottom: 3, height: berth ? 4 : 3 }
            : { right: 3, top: berth ? 5 : 6, bottom: berth ? 5 : 6, width: berth ? 4 : 3 };
          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => onSeatClick?.(cell)}
              title={seat.title || `${cell.label || cell.id}${price ? ` · ${money(price)}` : ''} · ${status}`}
              className={`relative flex items-center justify-center border ${vertical ? 'text-[9px]' : 'text-[10px]'} font-semibold leading-none transition ${
                STATUS_STYLE[status] || STATUS_STYLE.available
              } ${dimmed ? 'opacity-30' : ''} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ ...size, borderRadius: berth ? 6 : 7, justifySelf: 'center', alignSelf: 'center' }}
            >
              <span
                className={`absolute rounded-sm ${status === 'selected' ? 'bg-blue-300' : status === 'booked' ? 'bg-slate-300' : 'bg-slate-200'}`}
                style={pillow}
              />
              <span className={vertical ? 'pb-1 [writing-mode:horizontal-tb]' : 'pr-1.5'}>
                {showPrices && price && status !== 'booked' ? money(price) : cell.label}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );

  if (vertical) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <span className="text-xs font-bold text-slate-500">{label}</span>
          {isLower ? <SteeringWheel /> : <span className="h-7" />}
        </div>
        <div className="overflow-x-auto">{grid}</div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex w-8 shrink-0 flex-col items-center justify-between py-1">
        {isLower ? <SteeringWheel /> : <span />}
        <span className="rotate-180 text-xs font-bold text-slate-500 [writing-mode:vertical-rl]">{label}</span>
      </div>
      <div className="overflow-x-auto">{grid}</div>
    </div>
  );
};

/// `orientation` defaults to the bus's own blueprint.seatLayoutOrientation.
const HorizontalSeatMap = ({ blueprint, getSeat = () => ({}), onSeatClick, showPrices = false, legend = 'booking', orientation }) => {
  const vertical = (orientation || blueprint?.seatLayoutOrientation) === 'vertical';
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

      {vertical ? (
        // Upright: lower and upper side by side, as redBus shows them.
        <div className="flex flex-wrap items-start gap-4">
          <Deck label="Lower" rows={lower} isLower vertical getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />
          {hasUpper ? (
            <Deck label="Upper" rows={upper} isLower={false} vertical getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />
          ) : null}
        </div>
      ) : (
        <>
          {hasUpper ? (
            <Deck label="Upper" rows={upper} isLower={false} getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />
          ) : null}
          <Deck label="Lower" rows={lower} isLower getSeat={getSeat} onSeatClick={onSeatClick} showPrices={showPrices} priceFilter={priceFilter} />
        </>
      )}

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
