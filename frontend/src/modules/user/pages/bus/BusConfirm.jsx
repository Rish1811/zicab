import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Home, MapPin, Navigation, Phone, Share2, Ticket, UtensilsCrossed } from 'lucide-react';
import { scheduleBusBookingReminders } from '../../utils/upcomingRideReminderService';
import userBusService from '../../services/busService';
import { BusScreen, Skeleton, TripLine } from '../../components/bus/ZiBusUi';
import { formatDay, formatRupees, routePrefixFor } from '../../components/bus/zibusFormat';
import { toPlainData } from './busNavigationState';

const BusConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = routePrefixFor(location.pathname);
  const { booking, fromCity, toCity, date } = location.state || {};
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    if (!booking?.bookingCode) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return undefined;
    }
    scheduleBusBookingReminders(booking);
    let active = true;
    userBusService
      .getTicket(booking.id)
      .then((response) => active && setTicket(toPlainData(response?.data) || null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [booking, navigate, routePrefix]);

  if (!booking?.bookingCode) return null;

  const pnr = ticket?.pnr || booking.pnr || booking.bookingCode;
  const seats = ticket?.seats || booking.activeSeatLabels || booking.seatLabels || [];
  const bus = booking.bus || {};
  const total = Number(booking.amount || 0) + Number(booking.foodAmount || 0);

  const share = async () => {
    const text = `ZI Bus ticket ${pnr}: ${bus.fromCity || fromCity} to ${bus.toCity || toCity}, ${formatDay(booking.travelDate || date)} ${bus.departure || ''}. Seat ${seats.join(', ')}.`;
    try {
      if (navigator.share) await navigator.share({ title: 'ZI Bus ticket', text });
      else await navigator.clipboard?.writeText(text);
    } catch {
      // Share sheet closed.
    }
  };

  return (
    <BusScreen>
      <div className="px-5 pt-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--zb-green) 18%, transparent)' }}>
            <CheckCircle2 size={36} className="zb-green-text" />
          </div>
          <p className="zb-label mt-4 zb-green-text">Booking confirmed</p>
          <h1 className="zb-h1 mt-1">You’re all set!</h1>
          <p className="zb-muted mt-1 text-sm font-semibold">Ticket sent to {booking.passenger?.phone || 'your phone'}.</p>
        </div>

        <div className="zb-card mt-6 overflow-hidden">
          <div className="p-5" style={{ background: 'linear-gradient(140deg, var(--zb-hero-a), var(--zb-hero-b))' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em]" style={{ color: 'rgba(226,232,240,0.7)' }}>PNR</p>
                <p className="zb-on-dark mt-1 text-2xl font-extrabold tracking-[0.12em]">{pnr}</p>
              </div>
              <button type="button" onClick={share} className="zb-glass flex h-10 w-10 items-center justify-center zb-on-dark" aria-label="Share ticket">
                <Share2 size={17} />
              </button>
            </div>
            <p className="zb-on-dark mt-3 text-sm font-bold">{bus.operator}</p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(226,232,240,0.7)' }}>
              {bus.type}{bus.registrationNumber ? ` · ${String(bus.registrationNumber).toUpperCase()}` : ''}
            </p>
          </div>

          <div className="space-y-4 p-5">
            <TripLine departure={bus.departure} arrival={bus.arrival} fromLabel={bus.fromCity || fromCity} toLabel={bus.toCity || toCity} duration={bus.duration} />
            <div className="grid grid-cols-2 gap-2">
              <div className="zb-soft p-3">
                <p className="zb-label">Date</p>
                <p className="zb-text mt-1 text-sm font-extrabold">{formatDay(booking.travelDate || date)}</p>
              </div>
              <div className="zb-soft p-3">
                <p className="zb-label">Seat{seats.length > 1 ? 's' : ''}</p>
                <p className="zb-text mt-1 text-sm font-extrabold">{seats.join(', ')}</p>
              </div>
            </div>
            <div className="zb-soft space-y-2 p-3">
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

          <div className="zb-divider zb-ticket-notch mx-0" />

          <div className="flex items-center gap-4 p-5">
            {ticket?.qrDataUrl ? (
              <img src={ticket.qrDataUrl} alt={`Ticket QR for PNR ${pnr}`} className="h-28 w-28 shrink-0 rounded-xl bg-white p-1" />
            ) : (
              <Skeleton height={112} className="w-28 shrink-0 !rounded-xl" />
            )}
            <div className="min-w-0">
              <p className="zb-text text-sm font-extrabold">Show this at the bus door</p>
              <p className="zb-muted mt-1 text-xs font-semibold">The conductor scans it to check you in.</p>
              <p className="zb-text mt-2 text-sm font-extrabold">Paid {formatRupees(total)}</p>
            </div>
          </div>
        </div>

        {ticket?.foodOrders?.length ? (
          <div className="zb-card mt-4 p-4">
            <p className="zb-h2 flex items-center gap-2"><UtensilsCrossed size={17} className="zb-food-text" /> Food on the way</p>
            {ticket.foodOrders.map((order) => (
              <div key={order.id} className="zb-soft mt-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="zb-text truncate text-sm font-extrabold">{order.dhabaName || 'Partner dhaba'}</p>
                  {order.expectedArrivalAt ? (
                    <span className="zb-badge is-food">~{new Date(order.expectedArrivalAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : null}
                </div>
                <p className="zb-muted mt-1 text-xs font-semibold">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
              </div>
            ))}
            <p className="zb-muted mt-3 text-[11px] font-semibold">The dhaba starts cooking about 30 minutes before your bus arrives.</p>
          </div>
        ) : null}

        <div className="zb-card mt-4 flex items-center gap-3 p-4">
          <Navigation size={20} className="zb-accent-text shrink-0" />
          <p className="zb-text-2 text-sm font-semibold">Live bus tracking opens in your ticket 1 hour before boarding.</p>
        </div>
        {bus.driverPhone ? (
          <a href={`tel:${bus.driverPhone}`} className="zb-card mt-3 flex items-center gap-3 p-4">
            <Phone size={18} className="zb-muted shrink-0" />
            <span className="zb-text text-sm font-bold">Bus crew: {bus.driverName || ''} {bus.driverPhone}</span>
          </a>
        ) : null}
      </div>

      <div className="zb-footer">
        <div className="flex gap-3">
          <button type="button" className="zb-btn zb-btn-ghost flex-1" onClick={() => navigate(`${routePrefix}/bus`, { replace: true })}>
            <Home size={17} /> Home
          </button>
          <button type="button" className="zb-btn zb-btn-primary flex-[1.4]" onClick={() => navigate(`${routePrefix}/profile/bus-bookings/${booking.id}`, { replace: true })}>
            <Ticket size={17} /> View ticket
          </button>
        </div>
      </div>
    </BusScreen>
  );
};

export default BusConfirm;
