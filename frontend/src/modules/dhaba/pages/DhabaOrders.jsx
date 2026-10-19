import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, BusFront, Clock, Loader2, Phone, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { DHABA_SOCKET_EVENTS, connectDhabaSocket, dhabaApi, playOrderChime } from '../services/dhabaApi';

const SCOPES = [
  { key: 'active', label: 'Prepare now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'history', label: 'History' },
];

const STATUS_LABEL = {
  placed: 'Upcoming',
  notified: 'Bus ~30 min away',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

const STATUS_TONE = {
  placed: 'bg-slate-100 text-slate-600',
  notified: 'bg-amber-100 text-amber-700',
  accepted: 'bg-blue-100 text-blue-700',
  preparing: 'bg-orange-100 text-orange-700',
  ready: 'bg-emerald-100 text-emerald-700',
  served: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-rose-100 text-rose-700',
};

// Next step(s) offered on each card. Mirrors the server's allowed moves.
const ACTIONS = {
  placed: [{ status: 'accepted', label: 'Accept early' }],
  notified: [{ status: 'accepted', label: 'Accept' }, { status: 'preparing', label: 'Start cooking' }],
  accepted: [{ status: 'preparing', label: 'Start cooking' }, { status: 'ready', label: 'Mark ready' }],
  preparing: [{ status: 'ready', label: 'Mark ready' }],
  ready: [{ status: 'served', label: 'Served to bus' }],
};
const CANCELLABLE = new Set(['placed', 'notified', 'accepted']);

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const clock = (value) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--';
const minutesUntil = (value) => (value ? Math.round((new Date(value).getTime() - Date.now()) / 60_000) : null);

const OrderCard = ({ order, onStatus, busyId }) => {
  const eta = minutesUntil(order.expectedArrivalAt);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article className={`rounded-3xl border bg-white p-5 shadow-sm ${order.status === 'notified' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-100'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{order.orderCode} · PNR {order.pnr || '—'}</p>
          <p className="mt-1 flex items-center gap-2 text-base font-black text-slate-900">
            <BusFront size={16} className="shrink-0 text-slate-400" />
            <span className="truncate">{order.bus?.busName || 'Bus'} {order.bus?.registrationNumber ? `· ${order.bus.registrationNumber}` : ''}</span>
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
            {order.bus?.operatorName} · {order.bus?.originCity} → {order.bus?.destinationCity}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_TONE[order.status] || STATUS_TONE.placed}`}>
          {STATUS_LABEL[order.status] || order.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-50 p-3">
          <Clock size={14} className="mx-auto text-slate-400" />
          <p className="mt-1 text-sm font-black text-slate-900">{clock(order.expectedArrivalAt)}</p>
          <p className="text-[10px] font-bold text-slate-400">
            {eta === null ? 'arrival' : eta > 0 ? `in ${eta} min` : 'due now'}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <Users size={14} className="mx-auto text-slate-400" />
          <p className="mt-1 text-sm font-black text-slate-900">{order.passengerCount}</p>
          <p className="text-[10px] font-bold text-slate-400">passengers</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-sm font-black text-slate-900">{money(order.amount)}</p>
          <p className="text-[10px] font-bold text-slate-400">{itemCount} items · prepaid</p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
        {order.items.map((item) => (
          <li key={item.itemId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className={`h-3 w-3 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-emerald-600' : 'border-rose-600'}`} />
              <span className="truncate text-sm font-bold text-slate-800">{item.name}</span>
            </span>
            <span className="shrink-0 text-sm font-black text-slate-900">× {item.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-xs font-semibold text-slate-500">
          <p className="truncate">{order.passengerName || 'Passenger'} · Seat {order.seatLabels.join(', ') || '—'}</p>
          {order.bus?.driverPhone ? (
            <a href={`tel:${order.bus.driverPhone}`} className="mt-1 inline-flex items-center gap-1 font-black text-slate-700">
              <Phone size={12} /> Bus crew {order.bus.driverPhone}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {CANCELLABLE.has(order.status) ? (
            <button
              type="button"
              disabled={busyId === order.id}
              onClick={() => {
                const note = window.prompt('Why can this order not be made? The passenger is refunded.');
                if (note !== null) onStatus(order, 'cancelled', note);
              }}
              className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 disabled:opacity-50"
            >
              Can&apos;t make
            </button>
          ) : null}
          {(ACTIONS[order.status] || []).map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={busyId === order.id}
              onClick={() => onStatus(order, action.status)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
};

const DhabaOrders = () => {
  const [scope, setScope] = useState('active');
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [connected, setConnected] = useState(false);
  const scopeRef = useRef(scope);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const load = useCallback(async (nextScope) => {
    setLoading(true);
    try {
      const [list, totals] = await Promise.all([dhabaApi.orders(nextScope), dhabaApi.summary()]);
      setOrders(Array.isArray(list) ? list : []);
      setSummary(totals);
    } catch (error) {
      toast.error(error?.message || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  useEffect(() => {
    const socket = connectDhabaSocket();
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on(DHABA_SOCKET_EVENTS.ORDER_ALERT, (order) => {
      playOrderChime();
      toast(`Bus ~30 min away: ${order.items.reduce((s, i) => s + i.quantity, 0)} items for ${order.bus?.busName || 'bus'}`, {
        icon: '🔔',
        duration: 10_000,
      });
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Prepare order ' + order.orderCode, { body: `${order.bus?.busName || 'Bus'} arriving ~${clock(order.expectedArrivalAt)}` });
        } catch {
          // Some browsers only allow notifications from a service worker.
        }
      }
      setScope('active');
      load('active');
    });
    socket.on(DHABA_SOCKET_EVENTS.ORDER_NEW, () => {
      toast.success('New pre-order received');
      load(scopeRef.current);
    });
    socket.on(DHABA_SOCKET_EVENTS.ORDER_UPDATED, (order) => {
      setOrders((current) => current.map((item) => (item.id === order.id ? order : item)));
    });

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    return () => socket.disconnect();
  }, [load]);

  const changeStatus = async (order, status, note) => {
    setBusyId(order.id);
    try {
      const updated = await dhabaApi.setOrderStatus(order.id, status, note);
      setOrders((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => scope !== 'active' || !['served', 'cancelled'].includes(item.status)),
      );
    } catch (error) {
      toast.error(error?.message || 'Could not update the order');
    } finally {
      setBusyId('');
    }
  };

  const cards = useMemo(
    () => [
      { label: 'Orders today', value: summary?.today?.orders ?? 0 },
      { label: 'Sales today', value: money(summary?.today?.gross) },
      { label: 'Your payout this month', value: money(summary?.month?.payout) },
    ],
    [summary],
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {SCOPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope(item.key)}
              className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black ${scope === item.key ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {item.label}
              {item.key === 'active' && summary?.pendingAlerts ? (
                <span className="ml-2 rounded-full bg-white/90 px-1.5 text-orange-600">{summary.pendingAlerts}</span>
              ) : null}
            </button>
          ))}
        </div>
        <span className={`flex items-center gap-1.5 text-[11px] font-black ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
          <BellRing size={13} /> {connected ? 'Live alerts on' : 'Connecting…'}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-slate-400" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-black text-slate-900">
            {scope === 'active' ? 'Nothing to prepare right now' : scope === 'upcoming' ? 'No upcoming pre-orders' : 'No past orders yet'}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            You&apos;ll hear a chime and see the order here about 30 minutes before each bus arrives.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onStatus={changeStatus} busyId={busyId} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DhabaOrders;
