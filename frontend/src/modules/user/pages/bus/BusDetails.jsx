import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Mail, MapPin, Minus, Phone, Plus, ReceiptText, User, UtensilsCrossed } from 'lucide-react';
import userBusService from '../../services/busService';
import { userAuthService } from '../../services/authService';
import { BusScreen, BusTopBar, FooterBar, SectionTitle, TripLine } from '../../components/bus/ZiBusUi';
import { formatDay, formatRupees, routePrefixFor } from '../../components/bus/zibusFormat';
import { buildBusRouteState, toPlainData } from './busNavigationState';

// A zero or blank per-type price means "not set", so the bus fare applies.
const positivePrice = (value) => (Number(value) > 0 ? Number(value) : undefined);

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolved = positivePrice(variantPricing?.[variantKey]) ?? positivePrice(variantPricing?.seat) ?? defaultPrice;
  return Number.isFinite(Number(resolved)) ? Number(resolved) : defaultPrice;
};

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};
const readStoredProfile = () => {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const StopPicker = ({ label, tone, options, value, onChange, timeKey }) => (
  <div>
    <p className={`zb-label mb-2 ${tone}`}>{label}</p>
    <div className="space-y-2">
      {options.map((stop) => {
        const active = String(value) === String(stop.id);
        return (
          <button key={stop.id} type="button" onClick={() => onChange(String(stop.id))} className={`zb-option flex items-center gap-3 ${active ? 'is-active' : ''}`}>
            <span className="zb-radio" />
            <span className="min-w-0 flex-1">
              <span className="zb-text block truncate text-sm font-extrabold">{stop.pointName || stop.city}</span>
              <span className="zb-muted block truncate text-[11px] font-semibold">{stop.city}</span>
            </span>
            <span className="zb-text shrink-0 text-sm font-extrabold">{stop[timeKey] || stop.departureTime || stop.arrivalTime || ''}</span>
          </button>
        );
      })}
    </div>
  </div>
);

const DhabaMenu = ({ dhaba, cart, onChange, open, onToggle }) => {
  const count = Object.values(cart || {}).reduce((sum, quantity) => sum + quantity, 0);
  return (
    <div className="zb-soft overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--zb-food) 18%, transparent)' }}>
          <UtensilsCrossed size={18} className="zb-food-text" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="zb-text block truncate text-sm font-extrabold">{dhaba.name}</span>
          <span className="zb-muted block truncate text-[11px] font-semibold">
            Bus reaches ~{new Date(dhaba.expectedArrivalAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {dhaba.haltMinutes ? ` · ${dhaba.haltMinutes} min halt` : ''}
          </span>
        </span>
        {count ? <span className="zb-badge is-food">{count} added</span> : null}
        <ChevronDown size={18} className="zb-muted shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open ? (
        <div className="space-y-1 px-3 pb-3">
          {dhaba.menu.map((item) => {
            const quantity = Number(cart?.[item.id] || 0);
            return (
              <div key={item.id} className="zb-card flex items-center gap-3 !rounded-2xl px-3 py-2.5">
                <span className={`zb-veg ${item.isVeg ? '' : 'is-nonveg'}`} />
                <span className="min-w-0 flex-1">
                  <span className="zb-text block truncate text-sm font-bold">{item.name}</span>
                  <span className="zb-muted block text-[11px] font-bold">{formatRupees(item.price)}{item.description ? ` · ${item.description}` : ''}</span>
                </span>
                {quantity ? (
                  <span className="zb-qty">
                    <button type="button" onClick={() => onChange(item.id, -1)} aria-label={`One less ${item.name}`}><Minus size={14} /></button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => onChange(item.id, 1)} aria-label={`One more ${item.name}`}><Plus size={14} /></button>
                  </span>
                ) : (
                  <button type="button" onClick={() => onChange(item.id, 1)} className="zb-chip !py-1.5 zb-accent-text" style={{ borderColor: 'var(--zb-accent)' }}>Add</button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const BusDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const selectedSeats = useMemo(() => (Array.isArray(state.selectedSeats) ? state.selectedSeats : []), [state.selectedSeats]);

  const [liveBus, setLiveBus] = useState(null);
  const [profile, setProfile] = useState(() => {
    const stored = readStoredProfile();
    return { name: stored.name || '', email: stored.email || '', phone: stored.phone || '' };
  });
  const [travellerMode, setTravellerMode] = useState('self');
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState(profile.phone);
  const [email, setEmail] = useState(profile.email);
  const [boardingStopId, setBoardingStopId] = useState('');
  const [droppingStopId, setDroppingStopId] = useState('');
  const [dhabas, setDhabas] = useState([]);
  const [openDhaba, setOpenDhaba] = useState('');
  const [foodCart, setFoodCart] = useState({});
  const [error, setError] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  const pricingBus = liveBus || bus;
  const routeStops = useMemo(() => (Array.isArray(pricingBus?.route?.stops) ? pricingBus.route.stops : []), [pricingBus]);
  const boardingOptions = useMemo(() => routeStops.filter((stop) => ['pickup', 'both'].includes(stop?.stopType || 'both')), [routeStops]);
  const droppingOptions = useMemo(() => routeStops.filter((stop) => ['drop', 'both'].includes(stop?.stopType || 'both')), [routeStops]);
  const effectiveBoarding = boardingStopId || String(boardingOptions[0]?.id || '');
  const effectiveDropping = droppingStopId || String(droppingOptions[droppingOptions.length - 1]?.id || '');

  const seatSubtotal = useMemo(() => round2(selectedSeats.reduce((sum, seat) => sum + resolveSeatPrice(pricingBus, seat), 0)), [pricingBus, selectedSeats]);
  const taxPercent = Math.max(0, Number(pricingBus?.serviceTaxPercentage || 0));
  const taxAmount = round2((seatSubtotal * taxPercent) / 100);
  const foodTotal = useMemo(
    () => round2(dhabas.reduce((sum, dhaba) => sum + dhaba.menu.reduce((inner, item) => inner + Number(item.price || 0) * Number(foodCart[dhaba.id]?.[item.id] || 0), 0), 0)),
    [dhabas, foodCart],
  );
  const payable = round2(seatSubtotal + taxAmount + foodTotal);

  // Profile for "travelling myself", refreshed from the server.
  useEffect(() => {
    let active = true;
    userAuthService
      .getCurrentUser()
      .then((response) => {
        const user = response?.data?.user || {};
        if (!active || !user) return;
        const next = { name: user.name || '', email: user.email || '', phone: user.phone || '' };
        setProfile(next);
        try {
          localStorage.setItem('userInfo', JSON.stringify({ ...readStoredProfile(), ...user }));
        } catch {
          // Storage is optional.
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (travellerMode === 'self') {
      setName(profile.name);
      setPhone(profile.phone);
      setEmail(profile.email);
    }
  }, [profile, travellerMode]);

  // Latest fares and stops, and the dhabas on this run.
  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) return undefined;
    let active = true;
    userBusService
      .getSeatLayout({ busServiceId: bus.busServiceId, scheduleId: bus.scheduleId, date })
      .then((response) => {
        const next = toPlainData(response?.data?.bus || null);
        if (active && next) setLiveBus(next);
      })
      .catch(() => {});
    userBusService
      .getTripDhabas({ busServiceId: bus.busServiceId, scheduleId: bus.scheduleId, date })
      .then((response) => {
        const list = toPlainData(response?.data);
        if (!active || !Array.isArray(list)) return;
        setDhabas(list);
        if (list[0]) setOpenDhaba(list[0].id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date]);

  useEffect(() => {
    if (!bus || !selectedSeats.length) navigate(`${routePrefix}/bus`, { replace: true });
  }, [bus, selectedSeats.length, navigate, routePrefix]);
  if (!bus || !selectedSeats.length) return null;

  const changeFood = (dhabaId, itemId, delta) => {
    setFoodCart((current) => {
      const quantity = Math.max(0, Math.min(20, Number(current[dhabaId]?.[itemId] || 0) + delta));
      const nextDhaba = { ...(current[dhabaId] || {}), [itemId]: quantity };
      if (!quantity) delete nextDhaba[itemId];
      return { ...current, [dhabaId]: nextDhaba };
    });
  };

  const foodOrders = () =>
    Object.entries(foodCart)
      .map(([dhabaId, items]) => ({
        dhabaId,
        items: Object.entries(items || {}).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity })),
      }))
      .filter((entry) => entry.items.length);

  const pay = async () => {
    if (isPaying) return;
    if (!name.trim() || !age || !phone.trim() || !email.trim()) {
      setError('Fill in the traveller’s name, age, mobile number and email.');
      document.getElementById('zb-traveller')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError('');
    setIsPaying(true);

    try {
      if (!(await loadRazorpayScript())) throw new Error('Payment page could not load. Check your connection.');

      const order = unwrapPayload(await userBusService.createBookingOrder({
        busServiceId: bus.busServiceId,
        scheduleId: bus.scheduleId,
        travelDate: date,
        seatIds: selectedSeats.map((seat) => seat.id),
        passenger: { name, age, gender, phone, email },
        boardingStopId: effectiveBoarding || undefined,
        droppingStopId: effectiveDropping || undefined,
        foodOrders: foodOrders(),
      }));
      if (!order.keyId || !order.orderId) throw new Error('Unable to start the payment');

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'ZI Bus',
        description: `${bus.fromCity || fromCity} to ${bus.toCity || toCity}`,
        order_id: order.orderId,
        prefill: { name, email, contact: phone },
        theme: { color: '#FFC400' },
        modal: { ondismiss: () => setIsPaying(false) },
        handler: async (response) => {
          try {
            const booking = toPlainData(unwrapPayload(await userBusService.verifyBookingPayment(response)));
            navigate(`${routePrefix}/bus/confirm`, {
              replace: true,
              state: buildBusRouteState({ booking, fromCity: bus.fromCity || fromCity, toCity: bus.toCity || toCity, date }),
            });
          } catch (verifyError) {
            setError(verifyError?.message || 'Payment could not be confirmed');
            setIsPaying(false);
          }
        },
      });
      checkout.on('payment.failed', (event) => {
        setError(event?.error?.description || event?.error?.reason || 'Payment failed');
        setIsPaying(false);
      });
      checkout.open();
    } catch (err) {
      setError(err?.message || 'Unable to continue to payment');
      setIsPaying(false);
    }
  };

  const fieldLabel = 'zb-label mb-1.5 block';

  return (
    <BusScreen>
      <BusTopBar onBack={() => navigate(-1)} title="Review & pay" subtitle={`${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} · ${formatDay(date)}`} step={2} />

      <div className="zb-body">
        <div className="zb-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="zb-text truncate text-base font-extrabold">{bus.operator || bus.busName}</p>
              <p className="zb-muted truncate text-xs font-semibold">{bus.type}</p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {selectedSeats.map((seat) => <span key={seat.id} className="zb-badge is-accent">{seat.label}</span>)}
            </div>
          </div>
          <div className="mt-4">
            <TripLine departure={bus.departure} arrival={bus.arrival} fromLabel={bus.fromCity || fromCity} toLabel={bus.toCity || toCity} duration={bus.duration} compact />
          </div>
        </div>

        {boardingOptions.length || droppingOptions.length ? (
          <div className="zb-card space-y-4 p-4">
            <SectionTitle icon={MapPin} title="Where do you get on and off?" />
            {boardingOptions.length ? (
              <StopPicker label="Boarding point" tone="zb-green-text" options={boardingOptions} value={effectiveBoarding} onChange={setBoardingStopId} timeKey="departureTime" />
            ) : null}
            {droppingOptions.length ? (
              <StopPicker label="Dropping point" tone="zb-red-text" options={droppingOptions} value={effectiveDropping} onChange={setDroppingStopId} timeKey="arrivalTime" />
            ) : null}
          </div>
        ) : null}

        {dhabas.length ? (
          <div className="zb-card space-y-3 p-4">
            <SectionTitle icon={UtensilsCrossed} title="Food on the way" hint="Optional · paid now · cooked as your bus approaches" />
            {dhabas.map((dhaba) => (
              <DhabaMenu
                key={dhaba.id}
                dhaba={dhaba}
                cart={foodCart[dhaba.id]}
                open={openDhaba === dhaba.id}
                onToggle={() => setOpenDhaba((current) => (current === dhaba.id ? '' : dhaba.id))}
                onChange={(itemId, delta) => changeFood(dhaba.id, itemId, delta)}
              />
            ))}
          </div>
        ) : null}

        <div id="zb-traveller" className="zb-card space-y-4 p-4">
          <SectionTitle icon={User} title="Traveller" hint="Ticket and alerts go to this mobile and email." />
          <div className="zb-soft grid grid-cols-2 gap-1 p-1">
            {[
              { id: 'self', label: 'Myself' },
              { id: 'other', label: 'Someone else' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setTravellerMode(option.id);
                  if (option.id === 'other') { setName(''); setAge(''); setPhone(''); setEmail(''); }
                }}
                className={`zb-chip justify-center !border-0 ${travellerMode === option.id ? 'is-active' : '!bg-transparent'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className={fieldLabel}>Full name</span>
            <input className="zb-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="As on ID proof" autoComplete="name" />
          </label>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <label className="block">
              <span className={fieldLabel}>Age</span>
              <input className="zb-input" type="number" min="1" max="120" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} />
            </label>
            <div>
              <span className={fieldLabel}>Gender</span>
              <div className="zb-soft grid grid-cols-3 gap-1 p-1">
                {['Male', 'Female', 'Other'].map((item) => (
                  <button key={item} type="button" onClick={() => setGender(item)} className={`zb-chip justify-center !border-0 !px-1 ${gender === item ? 'is-active' : '!bg-transparent'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="block">
            <span className={fieldLabel}><Phone size={11} className="mb-0.5 inline" /> Mobile</span>
            <input className="zb-input" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </label>
          <label className="block">
            <span className={fieldLabel}><Mail size={11} className="mb-0.5 inline" /> Email</span>
            <input className="zb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
        </div>

        <div className="zb-card p-4">
          <SectionTitle icon={ReceiptText} title="Fare" />
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="zb-text-2 font-semibold">Seats ({selectedSeats.length})</span><span className="zb-text font-bold">{formatRupees(seatSubtotal)}</span></div>
            <div className="flex justify-between"><span className="zb-text-2 font-semibold">Tax ({taxPercent}%)</span><span className="zb-text font-bold">{formatRupees(taxAmount)}</span></div>
            {foodTotal > 0 ? (
              <div className="flex justify-between"><span className="zb-text-2 font-semibold">Dhaba food</span><span className="zb-text font-bold">{formatRupees(foodTotal)}</span></div>
            ) : null}
            <div className="zb-divider my-2" />
            <div className="flex justify-between"><span className="zb-text font-extrabold">Total</span><span className="text-lg font-extrabold zb-accent-text">{formatRupees(payable)}</span></div>
          </div>
          <p className="zb-muted mt-3 text-[11px] font-semibold">
            Your seats are held for 10 minutes while you pay. If payment succeeds but the seats are lost, the full amount is refunded automatically.
          </p>
        </div>

        {error ? <p className="text-sm font-bold zb-red-text">{error}</p> : null}
      </div>

      <FooterBar label="Total" value={formatRupees(payable)} note={foodTotal ? 'Seats + food' : 'Incl. tax'} actionLabel={`Pay ${formatRupees(payable)}`} loading={isPaying} onAction={pay} />
    </BusScreen>
  );
};

export default BusDetails;
