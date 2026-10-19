import React, { useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plug, Plus, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminBuses } from '../../services/busService';
import { zibusAdminService } from '../../services/zibusAdminService';
import { BACKEND_ORIGIN } from '../../../../shared/api/runtimeConfig';

const KINDS = [
  { value: 'ota', label: 'Booking platform (OTA)' },
  { value: 'operator_system', label: "Operator's reservation software" },
  { value: 'counter', label: 'Counter / agent' },
  { value: 'other', label: 'Other' },
];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

const EMPTY_REST_OPTIONS = {
  bookingsPath: '',
  listPath: '',
  refField: '',
  seatsField: '',
  seatLabelField: '',
  statusField: '',
  cancelledValues: 'CANCELLED',
  passengerNameField: '',
  passengerPhoneField: '',
};

const seatMapToText = (seatMap = {}) =>
  Object.entries(seatMap || {}).map(([theirs, ours]) => `${theirs}=${ours}`).join(', ');

const textToSeatMap = (text = '') =>
  Object.fromEntries(
    String(text)
      .split(',')
      .map((pair) => pair.split('=').map((part) => part.trim()))
      .filter(([theirs, ours]) => theirs && ours),
  );
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');

const copy = (text) => {
  navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => {});
};

const SecretBox = ({ secrets, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
    <div className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="text-amber-500" />
        <h2 className="text-lg font-black text-slate-900">Copy these now</h2>
      </div>
      <p className="text-sm font-semibold text-slate-600">
        They are shown once. Share them with {secrets.name} over a secure channel. Rotating issues new ones and stops the old key.
      </p>
      {[
        ['API key (X-Api-Key header)', secrets.apiKey],
        ['Webhook signing secret', secrets.webhookSecret],
      ].map(([label, value]) => (
        <div key={label} className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all text-xs text-emerald-300">{value}</code>
            <button type="button" onClick={() => copy(value)} className="shrink-0 text-slate-300" aria-label={`Copy ${label}`}><Copy size={14} /></button>
          </div>
        </div>
      ))}
      <button type="button" onClick={onClose} className="w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white">I have saved them</button>
    </div>
  </div>
);

const ChannelForm = ({ initial, buses, connectorTypes, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: initial?.name || '',
    code: initial?.code || '',
    kind: initial?.kind || 'ota',
    webhookUrl: initial?.webhookUrl || '',
    notes: initial?.notes || '',
    active: initial?.active !== false,
    busServiceIds: initial?.busServiceIds || [],
  });
  const [connector, setConnector] = useState(() => ({
    type: initial?.connector?.type || 'push_api',
    baseUrl: initial?.connector?.baseUrl || '',
    authHeader: initial?.connector?.authHeader || 'Authorization',
    authValue: '',
    pollSeconds: initial?.connector?.pollSeconds ?? 120,
    daysAhead: initial?.connector?.daysAhead ?? 7,
    options: (() => {
      const saved = { ...EMPTY_REST_OPTIONS, ...(initial?.connector?.options || {}) };
      return { ...saved, cancelledValues: Array.isArray(saved.cancelledValues) ? saved.cancelledValues.join(', ') : saved.cancelledValues };
    })(),
  }));
  const [mappings, setMappings] = useState(() =>
    (initial?.tripMappings || []).map((mapping) => ({ ...mapping, seatMapText: seatMapToText(mapping.seatMap) })),
  );
  const [saving, setSaving] = useState(false);
  const isNew = !initial?.id;
  const isPull = connector.type !== 'push_api';
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const setConn = (key) => (event) => setConnector((current) => ({ ...current, [key]: event.target.value }));
  const setOpt = (key) => (event) =>
    setConnector((current) => ({ ...current, options: { ...current.options, [key]: event.target.value } }));
  const setMapping = (index, patch) =>
    setMappings((current) => current.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping)));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        connector: {
          ...connector,
          authValue: connector.authValue || undefined,
          options: isPull
            ? {
                ...connector.options,
                cancelledValues: String(connector.options.cancelledValues || '')
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {},
        },
        tripMappings: isPull
          ? mappings.map((mapping) => ({
              busServiceId: mapping.busServiceId,
              scheduleId: mapping.scheduleId,
              externalTripId: mapping.externalTripId,
              seatMap: textToSeatMap(mapping.seatMapText),
            }))
          : [],
      };
      const saved = isNew
        ? await zibusAdminService.createChannel(payload)
        : await zibusAdminService.updateChannel(initial.id, payload);
      onSaved(saved);
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <form onSubmit={submit} className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{isNew ? 'Connect a channel' : `Edit ${initial.name}`}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 sm:grid-cols-2">
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name</span><input className={inputClass} value={form.name} onChange={set('name')} required /></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Code</span><input className={inputClass} value={form.code} onChange={set('code')} required pattern="[a-zA-Z0-9_-]{2,30}" placeholder="redbus" /></label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</span>
            <select className={inputClass} value={form.kind} onChange={set('kind')}>
              {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Webhook URL (https, optional)</span>
            <input className={inputClass} value={form.webhookUrl} onChange={set('webhookUrl')} placeholder="https://partner.example.com/zibus/webhook" />
            <span className="block text-[11px] font-semibold text-slate-500">We POST every seat change on their buses here, signed with the webhook secret.</span>
          </label>
          <label className="space-y-1 sm:col-span-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notes</span><input className={inputClass} value={form.notes} onChange={set('notes')} /></label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active</label>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
          <div>
            <p className="text-sm font-black text-slate-900">How bookings reach ZI Bus</p>
            <p className="text-xs font-semibold text-slate-500">
              Use a connector when their system can&apos;t call our API: ZI Bus then reads their bookings on a timer and locks the same seats here.
            </p>
          </div>
          <select className={inputClass} value={connector.type} onChange={setConn('type')}>
            {connectorTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </select>

          {isPull ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2"><span className={labelClass}>Their API base URL</span><input className={inputClass} value={connector.baseUrl} onChange={setConn('baseUrl')} placeholder="https://api.operator-erp.example/" required /></label>
                <label className="space-y-1"><span className={labelClass}>Auth header</span><input className={inputClass} value={connector.authHeader} onChange={setConn('authHeader')} /></label>
                <label className="space-y-1">
                  <span className={labelClass}>Auth value {initial?.connector?.hasAuthValue ? '(saved — blank keeps it)' : ''}</span>
                  <input className={inputClass} type="password" value={connector.authValue} onChange={setConn('authValue')} autoComplete="off" placeholder="Bearer …" />
                </label>
                <label className="space-y-1 sm:col-span-2"><span className={labelClass}>Bookings path ({'{tripId}'}, {'{date}'})</span><input className={inputClass} value={connector.options.bookingsPath} onChange={setOpt('bookingsPath')} placeholder="v1/trips/{tripId}/bookings?date={date}" required /></label>
                <label className="space-y-1"><span className={labelClass}>Booking list field</span><input className={inputClass} value={connector.options.listPath} onChange={setOpt('listPath')} placeholder="data.bookings" /></label>
                <label className="space-y-1"><span className={labelClass}>Booking id field</span><input className={inputClass} value={connector.options.refField} onChange={setOpt('refField')} placeholder="pnr" required /></label>
                <label className="space-y-1"><span className={labelClass}>Seats field</span><input className={inputClass} value={connector.options.seatsField} onChange={setOpt('seatsField')} placeholder="seats" required /></label>
                <label className="space-y-1"><span className={labelClass}>Seat label inside each seat (if objects)</span><input className={inputClass} value={connector.options.seatLabelField} onChange={setOpt('seatLabelField')} placeholder="seatNo" /></label>
                <label className="space-y-1"><span className={labelClass}>Status field</span><input className={inputClass} value={connector.options.statusField} onChange={setOpt('statusField')} placeholder="status" /></label>
                <label className="space-y-1"><span className={labelClass}>Cancelled values (comma separated)</span><input className={inputClass} value={connector.options.cancelledValues} onChange={setOpt('cancelledValues')} placeholder="CANCELLED, REFUNDED" /></label>
                <label className="space-y-1"><span className={labelClass}>Passenger name field</span><input className={inputClass} value={connector.options.passengerNameField} onChange={setOpt('passengerNameField')} placeholder="passenger.name" /></label>
                <label className="space-y-1"><span className={labelClass}>Passenger phone field</span><input className={inputClass} value={connector.options.passengerPhoneField} onChange={setOpt('passengerPhoneField')} placeholder="passenger.mobile" /></label>
                <label className="space-y-1"><span className={labelClass}>Check every (seconds)</span><input className={inputClass} type="number" min="30" max="3600" value={connector.pollSeconds} onChange={setConn('pollSeconds')} /></label>
                <label className="space-y-1"><span className={labelClass}>Days ahead to sync</span><input className={inputClass} type="number" min="0" max="30" value={connector.daysAhead} onChange={setConn('daysAhead')} /></label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-900">Their trips ↔ ZI Bus runs</p>
                  <button
                    type="button"
                    onClick={() => setMappings((current) => [...current, { busServiceId: '', scheduleId: '', externalTripId: '', seatMapText: '' }])}
                    className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white"
                  >
                    <Plus size={12} /> Map trip
                  </button>
                </div>
                {mappings.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">Nothing syncs until at least one trip is mapped.</p> : null}
                {mappings.map((mapping, index) => {
                  const bus = buses.find((item) => String(item.id) === String(mapping.busServiceId));
                  return (
                    <div key={mapping.id || index} className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                        <select className={inputClass} value={mapping.busServiceId} onChange={(e) => setMapping(index, { busServiceId: e.target.value, scheduleId: '' })} required>
                          <option value="">ZI Bus bus</option>
                          {buses.map((item) => <option key={item.id} value={item.id}>{item.busName} · {item.route?.originCity} → {item.route?.destinationCity}</option>)}
                        </select>
                        <select className={inputClass} value={mapping.scheduleId} onChange={(e) => setMapping(index, { scheduleId: e.target.value })} required>
                          <option value="">Schedule</option>
                          {(bus?.schedules || []).map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.label || 'Departs'} {schedule.departureTime}</option>)}
                        </select>
                        <input className={inputClass} value={mapping.externalTripId} onChange={(e) => setMapping(index, { externalTripId: e.target.value })} placeholder="Their trip id" required />
                        <button type="button" onClick={() => setMappings((current) => current.filter((_, i) => i !== index))} className="rounded-xl p-2 text-rose-500 hover:bg-rose-50" aria-label="Remove mapping">
                          <X size={14} />
                        </button>
                      </div>
                      <input
                        className={inputClass}
                        value={mapping.seatMapText}
                        onChange={(e) => setMapping(index, { seatMapText: e.target.value })}
                        placeholder="Seat names that differ, e.g. L1=1A, L2=1B (same names need nothing)"
                      />
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-5">
          <p className="text-sm font-black text-slate-900">Buses this channel may sell</p>
          <p className="text-xs font-semibold text-slate-500">Leave all unticked to allow every active bus.</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {buses.map((bus) => (
              <label key={bus.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={form.busServiceIds.includes(String(bus.id))}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      busServiceIds: event.target.checked
                        ? [...current.busServiceIds, String(bus.id)]
                        : current.busServiceIds.filter((id) => id !== String(bus.id)),
                    }))
                  }
                />
                {bus.busName} · {bus.route?.originCity} → {bus.route?.destinationCity}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-600">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
          </button>
        </div>
      </form>
    </div>
  );
};

const EventsDrawer = ({ channel, onClose }) => {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    zibusAdminService.listChannelEvents(channel.id).then(setEvents).catch(() => setEvents([]));
  }, [channel.id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{channel.name} · sync log</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>
        {!events ? <Loader2 className="mx-auto animate-spin text-slate-400" /> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Dir</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Trip</th><th className="px-3 py-2">Seats</th><th className="px-3 py-2">Result</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No sync activity yet.</td></tr> : events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2 font-semibold text-slate-600">{when(event.createdAt)}</td>
                    <td className="px-3 py-2 font-black">{event.direction === 'inbound' ? '← in' : '→ out'}</td>
                    <td className="px-3 py-2 font-semibold">{event.event}</td>
                    <td className="px-3 py-2 text-slate-500">{event.travelDate} {event.externalRef ? `· ${event.externalRef}` : ''}</td>
                    <td className="px-3 py-2">{(event.seatIds || []).join(', ')}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${['delivered', 'accepted'].includes(event.status) ? 'bg-emerald-100 text-emerald-700' : event.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {event.status}{event.attempts > 1 ? ` ×${event.attempts}` : ''}
                      </span>
                      {event.lastError ? <span className="ml-1 text-rose-500">{event.lastError}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const BookingChannels = () => {
  const [channels, setChannels] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [logFor, setLogFor] = useState(null);
  const [secrets, setSecrets] = useState(null);
  const [connectorTypes, setConnectorTypes] = useState([{ type: 'push_api', label: 'They call the ZI Bus channel API' }]);
  const [syncingId, setSyncingId] = useState('');

  useEffect(() => {
    zibusAdminService.connectorTypes().then((list) => Array.isArray(list) && setConnectorTypes(list)).catch(() => {});
  }, []);

  const syncNow = async (channel) => {
    setSyncingId(channel.id);
    try {
      const summary = await zibusAdminService.syncChannelNow(channel.id);
      const text = `Synced ${summary.trips} run(s): +${summary.added} locked, -${summary.released} released${summary.conflicts ? `, ${summary.conflicts} double-sale conflict(s)` : ''}`;
      if (summary.errors?.length) toast.error(`${text}. ${summary.errors[0]}`);
      else toast.success(text);
      const list = await zibusAdminService.listChannels();
      if (Array.isArray(list)) setChannels(list);
    } catch (error) {
      toast.error(error?.message || 'Sync failed');
    } finally {
      setSyncingId('');
    }
  };

  useEffect(() => {
    Promise.all([zibusAdminService.listChannels(), getAdminBuses().catch(() => [])])
      .then(([list, busList]) => {
        setChannels(Array.isArray(list) ? list : []);
        setBuses(Array.isArray(busList) ? busList : []);
      })
      .catch((error) => toast.error(error?.message || 'Could not load channels'))
      .finally(() => setLoading(false));
  }, []);

  const upsert = (saved) =>
    setChannels((current) =>
      current.some((item) => item.id === saved.id) ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current],
    );

  const rotate = async (channel) => {
    if (!window.confirm(`Issue a new API key for ${channel.name}? The current key stops working immediately.`)) return;
    try {
      const result = await zibusAdminService.rotateChannelKey(channel.id);
      upsert(result);
      setSecrets(result);
    } catch (error) {
      toast.error(error?.message || 'Could not rotate key');
    }
  };

  const apiBase = `${BACKEND_ORIGIN}/api/v1/bus-channel/v1`;

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">ZI Bus · Inventory sync</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Booking Channels</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
              Other platforms and operator systems that sell the same seats. ZI Bus holds the master seat map: channels push their sales
              in through the API (a seat can only be sold once, whoever sells it), and receive every change on their webhook.
            </p>
          </div>
          <button type="button" onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">
            <Plus size={14} /> Connect channel
          </button>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold text-blue-900">
          <p className="font-black">Channel API base URL</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all">{apiBase}</code>
            <button type="button" onClick={() => copy(apiBase)} aria-label="Copy API base URL"><Copy size={12} /></button>
          </div>
          <p className="mt-2">
            GET /buses · GET /inventory?busServiceId&amp;scheduleId&amp;travelDate · POST /bookings (hold or sell) · POST /bookings/:externalRef/confirm · POST /bookings/:externalRef/cancel
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : channels.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Plug className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-900">No channels connected</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((channel) => (
              <div key={channel.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-slate-900">{channel.name}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {channel.code} · {KINDS.find((kind) => kind.value === channel.kind)?.label} · key {channel.apiKeyPrefix}…
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${channel.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {channel.active ? 'Active' : 'Off'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-black text-slate-400">Last inbound</p>
                    <p className="mt-1 font-bold text-slate-800">{when(channel.lastInboundAt)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="font-black text-slate-400">Last webhook</p>
                    <p className={`mt-1 font-bold ${channel.lastWebhookStatus && channel.lastWebhookStatus !== 'ok' ? 'text-rose-600' : 'text-slate-800'}`}>
                      {channel.webhookUrl ? `${when(channel.lastWebhookAt)} ${channel.lastWebhookStatus && channel.lastWebhookStatus !== 'ok' ? `· ${channel.lastWebhookStatus}` : ''}` : 'No webhook'}
                    </p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  Sells: {channel.busServiceIds.length ? `${channel.busServiceIds.length} bus(es)` : 'all active buses'}
                </p>
                {channel.connector?.type && channel.connector.type !== 'push_api' ? (
                  <div className="rounded-xl bg-blue-50 p-3 text-xs">
                    <p className="font-black text-blue-900">
                      Connector · {channel.tripMappings.length} trip(s) · every {channel.connector.pollSeconds}s
                    </p>
                    <p className={`mt-1 font-semibold ${String(channel.connector.lastPollStatus).startsWith('error') ? 'text-rose-600' : 'text-blue-800'}`}>
                      Last sync {when(channel.connector.lastPolledAt)} {channel.connector.lastPollStatus ? `· ${channel.connector.lastPollStatus}` : ''}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing(channel)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Edit</button>
                  <button type="button" onClick={() => setLogFor(channel)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Sync log</button>
                  {channel.connector?.type && channel.connector.type !== 'push_api' ? (
                    <button type="button" disabled={syncingId === channel.id} onClick={() => syncNow(channel)} className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                      {syncingId === channel.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync now
                    </button>
                  ) : null}
                  <button type="button" onClick={() => rotate(channel)} className="flex items-center gap-1 rounded-xl border border-amber-200 px-3 py-2 text-xs font-black text-amber-700">
                    <RefreshCw size={12} /> New key
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <ChannelForm
          initial={editing}
          buses={buses}
          connectorTypes={connectorTypes}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
            if (saved.apiKey) setSecrets(saved);
            else toast.success('Channel saved');
          }}
        />
      ) : null}
      {logFor ? <EventsDrawer channel={logFor} onClose={() => setLogFor(null)} /> : null}
      {secrets ? <SecretBox secrets={secrets} onClose={() => setSecrets(null)} /> : null}
    </div>
  );
};

export default BookingChannels;
