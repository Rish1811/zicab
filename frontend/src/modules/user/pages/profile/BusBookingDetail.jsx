import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapPin, Phone, ReceiptText, Share2, ShieldCheck, Star, Ticket, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';
import userBusService from '../../services/busService';
import BusLiveTrackingCard from '../../components/bus/BusLiveTrackingCard';
import { BusScreen, BusTopBar, EmptyState, SectionTitle, Skeleton, TripLine } from '../../components/bus/ZiBusUi';
import { formatDay, formatRupees, routePrefixFor } from '../../components/bus/zibusFormat';

const unwrapPayload = (response) => response?.data?.data || response?.data || response || null;

const STATUS_BADGE = {
  confirmed: ['is-green', 'Confirmed'],
  pending: ['is-accent', 'Payment pending'],
  cancelled: ['is-red', 'Cancelled'],
  expired: ['', 'Expired'],
  failed: ['is-red', 'Failed'],
};

const FOOD_STATUS = {
  placed: 'Ordered',
  notified: 'Dhaba alerted',
  accepted: 'Accepted',
  preparing: 'Cooking',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/// Estimated refund for the seats ticked for cancellation, using the rule
/// that applies right now. The server recomputes it on submit.
const quoteFor = (booking, seatIds) => {
  const count = seatIds.length;
  const subtotal = Math.round(Number(booking?.perSeatAmount || 0) * count * 100) / 100;
  const rule = booking?.cancellation || {};
  if (!count || !rule.allowed) return { subtotal: 0, refund: 0, fee: 0 };
  let refund = 0;
  if (rule.refundType === 'percentage') refund = Math.round(((subtotal * Math.min(100, Number(rule.refundValue || 0))) / 100) * 100) / 100;
  if (rule.refundType === 'fixed') refund = Math.min(subtotal, Number(rule.refundValue || 0));
  return { subtotal, refund, fee: Math.max(0, Math.round((subtotal - refund) * 100) / 100) };
};

const BusBookingDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const routePrefix = useMemo(() => routePrefixFor(location.pathname), [location.pathname]);
  const [booking, setBooking] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelIds, setCancelIds] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    let active = true;
    userBusService
      .getBookingById(id)
      .then((response) => {
        if (!active) return;
        const next = unwrapPayload(response);
        setBooking(next);
        setRating(Number(next?.review?.userRating || 0));
        setComment(next?.review?.userComment || '');
      })
      .catch((err) => active && setError(err?.message || 'Could not load this ticket'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  const isConfirmed = booking?.status === 'confirmed';
  useEffect(() => {
    if (!id || !isConfirmed) return undefined;
    let active = true;
    userBusService
      .getTicket(id)
      .then((response) => active && setTicket(unwrapPayload(response)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, isConfirmed]);

  if (loading) {
    return (
      <BusScreen>
        <BusTopBar onBack={() => navigate(-1)} title="Ticket" />
        <div className="zb-body"><Skeleton height={320} /><Skeleton height={160} /></div>
      </BusScreen>
    );
  }
  if (error || !booking) {
    return (
      <BusScreen>
        <BusTopBar onBack={() => navigate(-1)} title="Ticket" />
        <div className="zb-body"><EmptyState icon={Ticket} title="Ticket not found" text={error} /></div>
      </BusScreen>
    );
  }

  const bus = booking.bus || {};
  const pnr = booking.pnr || booking.bookingCode;
  const [tone, statusLabel] = STATUS_BADGE[booking.status] || ['', booking.status];
  const activeIds = booking.activeSeatIds || [];
  const activeLabels = booking.activeSeatLabels || [];
  const canCancel = Boolean(booking.cancellation?.allowed) && isConfirmed && activeIds.length > 0;
  const quote = quoteFor(booking, cancelIds);
  const canRate = Boolean(booking.review?.canRate);
  const rules = booking.cancellationPolicy?.rules || [];

  const share = async () => {
    const text = `ZI Bus ticket ${pnr}: ${bus.fromCity} to ${bus.toCity}, ${formatDay(booking.travelDate)} ${bus.departure || ''}. Seat ${activeLabels.join(', ')}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'ZI Bus ticket', text });
      else {
        await navigator.clipboard?.writeText(text);
        toast.success('Ticket details copied');
      }
    } catch {
      // Share sheet closed.
    }
  };

  const cancelSeats = async () => {
    if (!cancelIds.length || cancelling) return;
    if (!window.confirm(`Cancel ${cancelIds.length} seat(s)? Estimated refund ${formatRupees(quote.refund)}.`)) return;
    setCancelling(true);
    try {
      const response = await userBusService.cancelBooking(booking.id, { seatIds: cancelIds, travelDate: booking.travelDate });
      const updated = unwrapPayload(response);
      setBooking(updated);
      setCancelIds([]);
      toast.success(response?.message || 'Seats cancelled. Refund started.');
    } catch (err) {
      toast.error(err?.message || 'Could not cancel the seats');
    } finally {
      setCancelling(false);
    }
  };

  const saveReview = async () => {
    if (!rating) {
      toast.error('Pick a star rating first');
      return;
    }
    setSavingReview(true);
    try {
      const updated = unwrapPayload(await userBusService.submitBookingReview(booking.id, { rating, comment }));
      setBooking(updated);
      toast.success('Thanks for rating your trip');
    } catch (err) {
      toast.error(err?.message || 'Could not save your rating');
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <BusScreen>
      <BusTopBar
        onBack={() => navigate(`${routePrefix}/profile/bus-bookings`)}
        title={`${bus.fromCity || ''} → ${bus.toCity || ''}`}
        subtitle={`PNR ${pnr}`}
        right={<button type="button" onClick={share} className="zb-icon-btn" aria-label="Share ticket"><Share2 size={17} /></button>}
      />

      <div className="zb-body">
        {isConfirmed ? <BusLiveTrackingCard bookingId={booking.id} /> : null}

        <div className="zb-card overflow-hidden">
          <div className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="zb-text truncate text-base font-extrabold">{bus.operator}</p>
              <p className="zb-muted truncate text-xs font-semibold">
                {bus.type}{bus.registrationNumber ? ` · ${String(bus.registrationNumber).toUpperCase()}` : ''}
              </p>
            </div>
            <span className={`zb-badge ${tone}`}>{statusLabel}</span>
          </div>
          <div className="px-4 pb-4">
            <TripLine departure={bus.departure} arrival={bus.arrival} fromLabel={bus.fromCity} toLabel={bus.toCity} duration={bus.duration} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="zb-soft p-3">
                <p className="zb-label">Date</p>
                <p className="zb-text mt-1 text-sm font-extrabold">{formatDay(booking.travelDate)}</p>
              </div>
              <div className="zb-soft p-3">
                <p className="zb-label">Seats</p>
                <p className="zb-text mt-1 text-sm font-extrabold">{activeLabels.join(', ') || '—'}</p>
              </div>
            </div>
            <div className="zb-soft mt-2 space-y-2 p-3">
              <p className="flex items-start gap-2 text-sm">
                <MapPin size={15} className="zb-green-text mt-0.5 shrink-0" />
                <span className="zb-text font-bold">{bus.pickupLocation || bus.fromCity}</span>
                {booking.boardingPoint?.time ? <span className="zb-muted ml-auto shrink-0 font-bold">{booking.boardingPoint.time}</span> : null}
              </p>
              <p className="flex items-start gap-2 text-sm">
                <MapPin size={15} className="zb-red-text mt-0.5 shrink-0" />
                <span className="zb-text font-bold">{bus.dropLocation || bus.toCity}</span>
                {booking.droppingPoint?.time ? <span className="zb-muted ml-auto shrink-0 font-bold">{booking.droppingPoint.time}</span> : null}
              </p>
            </div>
          </div>

          {ticket?.qrDataUrl ? (
            <>
              <div className="zb-divider zb-ticket-notch" />
              <div className="flex items-center gap-4 p-4">
                <img src={ticket.qrDataUrl} alt={`Ticket QR for PNR ${pnr}`} className="h-28 w-28 shrink-0 rounded-xl bg-white p-1" />
                <div className="min-w-0">
                  <p className="zb-label">Show at the door</p>
                  <p className="zb-text mt-1 text-xl font-extrabold tracking-[0.1em]">{pnr}</p>
                  <p className="zb-muted mt-1 text-xs font-semibold">{booking.passenger?.name}</p>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {ticket?.foodOrders?.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={UtensilsCrossed} title="Your food" />
            {ticket.foodOrders.map((order) => (
              <div key={order.id} className="zb-soft mt-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="zb-text truncate text-sm font-extrabold">{order.dhabaName || 'Partner dhaba'}</p>
                  <span className={`zb-badge ${order.status === 'cancelled' ? 'is-red' : ['ready', 'served'].includes(order.status) ? 'is-green' : 'is-food'}`}>
                    {FOOD_STATUS[order.status] || order.status}
                  </span>
                </div>
                <p className="zb-muted mt-1 text-xs font-semibold">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
                {order.expectedArrivalAt && order.status !== 'cancelled' ? (
                  <p className="zb-muted mt-1 text-[11px] font-semibold">Bus expected ~{new Date(order.expectedArrivalAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                ) : null}
                {order.status === 'cancelled' && order.refund?.status ? (
                  <p className="mt-1 text-[11px] font-bold zb-green-text">Refund {order.refund.status}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="zb-card p-4">
          <SectionTitle icon={ReceiptText} title="Payment" />
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="zb-text-2 font-semibold">Seats</span><span className="zb-text font-bold">{formatRupees(booking.amount)}</span></div>
            {Number(booking.foodAmount || 0) > 0 ? (
              <div className="flex justify-between"><span className="zb-text-2 font-semibold">Food</span><span className="zb-text font-bold">{formatRupees(booking.foodAmount)}</span></div>
            ) : null}
            {Number(booking.totalRefundedAmount || 0) > 0 ? (
              <div className="flex justify-between"><span className="zb-text-2 font-semibold">Refunded</span><span className="font-bold zb-green-text">− {formatRupees(booking.totalRefundedAmount)}</span></div>
            ) : null}
            <div className="zb-divider my-2" />
            <div className="flex justify-between"><span className="zb-text font-extrabold">Paid</span><span className="zb-text text-base font-extrabold">{formatRupees(Number(booking.amount || 0) + Number(booking.foodAmount || 0))}</span></div>
          </div>
        </div>

        {canCancel || booking.cancelledSeats?.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={Ticket} title="Cancel seats" hint={canCancel ? `Current rule: ${booking.cancellation?.appliedRuleLabel || 'see policy below'}` : undefined} />
            {canCancel ? (
              <div className="mt-3 space-y-2">
                {activeIds.map((seatId, index) => {
                  const picked = cancelIds.includes(seatId);
                  return (
                    <button
                      key={seatId}
                      type="button"
                      onClick={() => setCancelIds((current) => (picked ? current.filter((item) => item !== seatId) : [...current, seatId]))}
                      className={`zb-option flex items-center gap-3 ${picked ? 'is-active' : ''}`}
                    >
                      <span className="zb-radio" />
                      <span className="zb-text flex-1 text-sm font-extrabold">Seat {activeLabels[index] || seatId}</span>
                      <span className="zb-muted text-xs font-bold">{formatRupees(booking.perSeatAmount)}</span>
                    </button>
                  );
                })}
                {cancelIds.length ? (
                  <div className="zb-soft mt-2 p-3">
                    <div className="grid grid-cols-3 text-center">
                      <div><p className="zb-label">Seats</p><p className="zb-text mt-1 text-sm font-extrabold">{formatRupees(quote.subtotal)}</p></div>
                      <div><p className="zb-label">Refund</p><p className="mt-1 text-sm font-extrabold zb-green-text">{formatRupees(quote.refund)}</p></div>
                      <div><p className="zb-label">Charge</p><p className="mt-1 text-sm font-extrabold zb-red-text">{formatRupees(quote.fee)}</p></div>
                    </div>
                    {activeIds.length === cancelIds.length && Number(booking.foodAmount || 0) > 0 ? (
                      <p className="zb-muted mt-2 text-[11px] font-semibold">Food not yet being cooked is refunded in full as well.</p>
                    ) : null}
                    <button type="button" disabled={cancelling} onClick={cancelSeats} className="zb-btn zb-btn-danger mt-3 w-full">
                      {cancelling ? 'Cancelling…' : `Cancel ${cancelIds.length} seat${cancelIds.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {booking.cancelledSeats?.length ? (
              <div className="mt-3 space-y-2">
                {booking.cancelledSeats.map((seat) => (
                  <div key={seat.seatId} className="zb-soft flex items-center justify-between p-3">
                    <div>
                      <p className="zb-text text-sm font-bold">Seat {seat.seatLabel || seat.seatId} cancelled</p>
                      <p className="zb-muted text-[11px] font-semibold">{formatDateTime(seat.cancelledAt)}</p>
                    </div>
                    <p className="text-sm font-extrabold zb-green-text">{formatRupees(seat.refundAmount)}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {canRate ? (
          <div className="zb-card p-4">
            <SectionTitle icon={Star} title="Rate your trip" />
            <div className="mt-3 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button key={score} type="button" onClick={() => setRating(score)} className="zb-soft flex h-12 w-12 items-center justify-center" aria-label={`${score} star${score > 1 ? 's' : ''}`}>
                  <Star size={24} className={score <= rating ? 'zb-accent-text' : 'zb-muted'} fill={score <= rating ? 'currentColor' : 'transparent'} />
                </button>
              ))}
            </div>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="How was the bus, the crew and the food?" className="zb-input mt-3 min-h-[96px]" />
            <button type="button" disabled={savingReview || !rating} onClick={saveReview} className="zb-btn zb-btn-primary mt-3 w-full">
              {savingReview ? 'Saving…' : booking.review?.userRating ? 'Update rating' : 'Submit rating'}
            </button>
          </div>
        ) : null}

        {rules.length ? (
          <div className="zb-card p-4">
            <SectionTitle icon={ShieldCheck} title="Cancellation policy" />
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
          </div>
        ) : null}

        {bus.driverPhone ? (
          <a href={`tel:${bus.driverPhone}`} className="zb-card flex items-center gap-3 p-4">
            <Phone size={18} className="zb-muted shrink-0" />
            <span className="zb-text text-sm font-bold">Call bus crew · {bus.driverName || ''} {bus.driverPhone}</span>
          </a>
        ) : null}
      </div>
    </BusScreen>
  );
};

export default BusBookingDetail;
