import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BusFront, Clock3, Luggage, MapPin, Phone, ShieldCheck, Sparkles, Star, Ticket, UtensilsCrossed } from 'lucide-react';
import userBusService from '../../services/busService';
import { BusScreen, BusTopBar, FooterBar, SectionTitle, TripLine } from '../../components/bus/ZiBusUi';
import { formatDay, formatDuration, formatRupees, routePrefixFor } from '../../components/bus/zibusFormat';
import { buildBusRouteState, toPlainData } from './busNavigationState';

const STOP_TONE = { pickup: 'is-green', drop: 'is-red', both: 'is-blue' };
const STOP_LABEL = { pickup: 'Boarding', drop: 'Dropping', both: 'Board / drop' };

const BusPreview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, date } = state;
  const gallery = useMemo(
    () => [bus?.coverImage, bus?.image, ...(bus?.galleryImages || [])].filter(Boolean).filter((src, index, list) => list.indexOf(src) === index),
    [bus],
  );
  const [activeImage, setActiveImage] = useState(0);
  const [dhabas, setDhabas] = useState([]);

  useEffect(() => {
    if (!bus?.busServiceId) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return undefined;
    }
    let active = true;
    userBusService
      .getTripDhabas({ busServiceId: bus.busServiceId, scheduleId: bus.scheduleId, date })
      .then((response) => {
        const list = toPlainData(response?.data);
        if (active) setDhabas(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bus, date, navigate, routePrefix]);

  if (!bus?.busServiceId) return null;

  const stops = Array.isArray(bus.route?.stops) ? bus.route.stops : [];
  const rules = Array.isArray(bus.cancellationRules) ? bus.cancellationRules : [];

  return (
    <BusScreen>
      <BusTopBar onBack={() => navigate(-1)} title={bus.operator || bus.busName} subtitle={`${bus.fromCity} → ${bus.toCity} · ${formatDay(date)}`} />

      <div className="zb-body">
        <div className="zb-card overflow-hidden">
          <div className="relative h-48" style={{ background: bus.busColor || 'var(--zb-hero-b)' }}>
            {gallery.length ? (
              <img src={gallery[activeImage]} alt={bus.busName || 'Bus'} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center"><BusFront size={64} className="zb-on-dark opacity-80" /></div>
            )}
            <div className="absolute inset-x-0 bottom-0 p-4" style={{ background: 'linear-gradient(transparent, rgba(2,6,23,0.85))' }}>
              <p className="zb-on-dark text-lg font-extrabold">{bus.busName || bus.operator}</p>
              <p className="zb-on-dark-2 text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.8)' }}>
                {bus.type}{bus.registrationNumber ? ` · ${String(bus.registrationNumber).toUpperCase()}` : ''}
              </p>
            </div>
          </div>
          {gallery.length > 1 ? (
            <div className="zb-scroll-x p-3">
              {gallery.map((src, index) => (
                <button key={src} type="button" onClick={() => setActiveImage(index)} className="shrink-0 overflow-hidden rounded-xl" style={{ outline: index === activeImage ? '2px solid var(--zb-accent)' : 'none' }}>
                  <img src={src} alt="" className="h-14 w-20 object-cover" />
                </button>
              ))}
            </div>
          ) : null}
          <div className="p-4">
            <TripLine departure={bus.departure} arrival={bus.arrival} fromLabel={bus.fromCity} toLabel={bus.toCity} duration={bus.duration} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="zb-soft p-3 text-center">
                <p className="zb-text text-base font-extrabold">{bus.availableSeats ?? '-'}</p>
                <p className="zb-muted text-[10px] font-bold">seats left</p>
              </div>
              <div className="zb-soft p-3 text-center">
                <p className="zb-text text-base font-extrabold">{formatDuration(bus.duration) || 'Direct'}</p>
                <p className="zb-muted text-[10px] font-bold">journey</p>
              </div>
              <div className="zb-soft p-3 text-center">
                {Number(bus.ratingCount || 0) > 0 ? (
                  <p className="text-base font-extrabold zb-accent-text"><Star size={13} className="mb-0.5 inline" fill="currentColor" /> {Number(bus.rating).toFixed(1)}</p>
                ) : (
                  <p className="zb-text text-base font-extrabold">New</p>
                )}
                <p className="zb-muted text-[10px] font-bold">{Number(bus.ratingCount || 0) > 0 ? `${bus.ratingCount} ratings` : 'on ZI Bus'}</p>
              </div>
            </div>
          </div>
        </div>

        {dhabas.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={UtensilsCrossed} title="Food on this bus" hint="Pre-order at checkout. Ready when the bus halts." />
            <div className="mt-3 space-y-2">
              {dhabas.map((dhaba) => (
                <div key={dhaba.id} className="zb-soft flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="zb-text truncate text-sm font-extrabold">{dhaba.name}</p>
                    <p className="zb-muted truncate text-[11px] font-semibold">
                      {[dhaba.highway, dhaba.city].filter(Boolean).join(' · ')} · {dhaba.menu.length} dishes
                    </p>
                  </div>
                  <span className="zb-badge is-food shrink-0">
                    ~{new Date(dhaba.expectedArrivalAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {stops.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={MapPin} title="Stops" hint="You’ll choose your boarding and dropping point next." />
            <ol className="mt-3">
              {stops.map((stop, index) => (
                <li key={stop.id || index} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`zb-dot ${stop.stopType === 'drop' ? 'is-end' : 'is-start'} mt-1.5`} />
                    {index < stops.length - 1 ? <span className="my-1 w-px flex-1" style={{ background: 'var(--zb-line)' }} /> : null}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pb-4">
                    <div className="min-w-0">
                      <p className="zb-text truncate text-sm font-extrabold">{stop.pointName || stop.city}</p>
                      <p className="zb-muted truncate text-[11px] font-semibold">{stop.city}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="zb-text text-sm font-extrabold">{stop.departureTime || stop.arrivalTime || '--:--'}</p>
                      <span className={`zb-badge ${STOP_TONE[stop.stopType] || 'is-blue'} mt-1`}>{STOP_LABEL[stop.stopType] || 'Stop'}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {bus.amenities?.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={Sparkles} title="On board" />
            <div className="mt-3 flex flex-wrap gap-2">
              {bus.amenities.map((amenity) => <span key={amenity} className="zb-badge">{amenity}</span>)}
            </div>
          </div>
        ) : null}

        <div className="zb-card p-4">
          <SectionTitle icon={ShieldCheck} title="Cancellation" />
          {rules.length ? (
            <div className="mt-3 overflow-hidden rounded-2xl" style={{ border: '1px solid var(--zb-line)' }}>
              {rules.map((rule, index) => (
                <div key={rule.id || index} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: index ? '1px solid var(--zb-line)' : 'none' }}>
                  <span className="zb-text-2 text-xs font-semibold">{rule.label || `${rule.hoursBeforeDeparture}h+ before departure`}</span>
                  <span className="text-xs font-extrabold zb-green-text">
                    {rule.refundType === 'percentage' ? `${rule.refundValue}% back` : rule.refundType === 'fixed' ? `${formatRupees(rule.refundValue)} back` : 'No refund'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="zb-text-2 mt-2 text-sm font-medium">{bus.cancellationPolicy || 'See the ticket for cancellation terms.'}</p>
          )}
        </div>

        {(bus.boardingPolicy || bus.luggagePolicy || bus.driverPhone) ? (
          <div className="zb-card space-y-3 p-4">
            {bus.boardingPolicy ? (
              <p className="zb-text-2 flex gap-2 text-sm font-medium"><Clock3 size={16} className="zb-muted mt-0.5 shrink-0" /> {bus.boardingPolicy}</p>
            ) : null}
            {bus.luggagePolicy ? (
              <p className="zb-text-2 flex gap-2 text-sm font-medium"><Luggage size={16} className="zb-muted mt-0.5 shrink-0" /> {bus.luggagePolicy}</p>
            ) : null}
            {bus.driverPhone ? (
              <p className="zb-text-2 flex gap-2 text-sm font-medium"><Phone size={16} className="zb-muted mt-0.5 shrink-0" /> Bus crew: {bus.driverName || ''} {bus.driverPhone}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <FooterBar
        label="Fare from"
        value={formatRupees(bus.price)}
        note={`${bus.availableSeats ?? 0} seats left`}
        actionLabel={<><Ticket size={17} /> Select seats</>}
        disabled={!Number(bus.availableSeats || 0)}
        onAction={() => navigate(`${routePrefix}/bus/seats`, { state: buildBusRouteState(state) })}
      />
    </BusScreen>
  );
};

export default BusPreview;
