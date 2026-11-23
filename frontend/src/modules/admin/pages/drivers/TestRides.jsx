import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, FlaskConical, Loader2, MapPin, Search, Send, Timer, Wifi, WifiOff, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

/**
 * Test rides: an offer sent from here looks exactly like a real one on the
 * driver's phone (same sound, lock-screen card, a pickup near them, a real
 * fare) but books nothing. If the driver accepts they are told "Another driver
 * accepted this ride", as when they lose a real race. Shows whether a
 * driver's phone really gets offers and how fast they answer.
 *
 * Test rides never count anywhere: no trip, report, earning, acceptance %.
 */

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? {};
const pickList = (response, ...keys) => {
  const body = unwrap(response);
  if (Array.isArray(body)) return body;
  for (const key of ['results', 'items', ...keys]) {
    if (Array.isArray(body?.[key])) return body[key];
    if (Array.isArray(body?.data?.[key])) return body.data[key];
  }
  return [];
};
const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none';
const timeText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

const STATUS = {
  sent: { label: 'Waiting', chip: 'bg-blue-50 text-blue-700', icon: Clock },
  accepted: { label: 'Accepted', chip: 'bg-green-50 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', chip: 'bg-amber-50 text-amber-700', icon: XCircle },
  expired: { label: 'No answer', chip: 'bg-gray-100 text-gray-600', icon: Timer },
  skipped: { label: 'Not sent', chip: 'bg-red-50 text-red-600', icon: XCircle },
};
const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.sent;
  const Icon = s.icon;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${s.chip}`}><Icon size={11} />{s.label}</span>;
};

const TARGETS = [
  { key: 'drivers', label: 'Chosen drivers' },
  { key: 'zone', label: 'A zone' },
  { key: 'city', label: 'A city' },
];

const ResultView = ({ test }) => {
  if (!test) return null;
  const c = test.counts || {};
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            {test.live && <Loader2 size={15} className="animate-spin text-yellow-500" />}
            Test of {timeText(test.createdAt)} {test.zoneName ? `· ${test.zoneName}` : ''}
          </h3>
          <p className="text-xs text-gray-500">By {test.createdBy || 'admin'} · {test.windowSeconds}s to answer{test.live ? ' · updating live' : ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs font-semibold">
          <span className="px-2 py-1 rounded-lg bg-green-50 text-green-700">{c.accepted || 0} accepted</span>
          <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700">{c.rejected || 0} rejected</span>
          <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">{(c.expired || 0) + (c.sent || 0)} {test.live ? 'waiting / no answer' : 'no answer'}</span>
          {c.skipped ? <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600">{c.skipped} not sent</span> : null}
          {test.avgResponseSeconds !== null && <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700">avg {test.avgResponseSeconds}s</span>}
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3">Driver</th><th className="py-2 pr-3">Result</th><th className="py-2 pr-3">Answered in</th>
              <th className="py-2 pr-3">From</th><th className="py-2 pr-3">Offer shown</th>
            </tr>
          </thead>
          <tbody>
            {(test.offers || []).map((o) => (
              <tr key={o.driverId} className="border-b border-gray-50 align-top">
                <td className="py-2 pr-3">
                  <div className="font-semibold text-gray-900">{o.name || 'Driver'}</div>
                  <div className="text-xs text-gray-500">{o.phone}{o.vehicleNumber ? ` · ${o.vehicleNumber}` : ''}</div>
                </td>
                <td className="py-2 pr-3">
                  <StatusChip status={o.status} />
                  {o.skipReason && <div className="text-[11px] text-red-500 mt-0.5">{o.skipReason}</div>}
                </td>
                <td className="py-2 pr-3 font-semibold text-gray-800">{o.responseSeconds !== null ? `${o.responseSeconds}s` : '—'}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">{o.answeredVia === 'lock_screen' ? 'Lock screen' : o.answeredVia === 'app' ? 'App' : '—'}</td>
                <td className="py-2 pr-3 text-xs text-gray-600 max-w-xs">
                  {o.pickupAddress ? <>{o.pickupAddress}<br />→ {o.dropAddress}{o.fare ? ` · ₹${Math.round(o.fare)}` : ''}</> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TestRides = () => {
  const preselected = useMemo(() => new URLSearchParams(window.location.search).get('driverId') || '', []);
  const [target, setTarget] = useState('drivers');
  const [zones, setZones] = useState([]);
  const [cities, setCities] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [zoneId, setZoneId] = useState('');
  const [cityId, setCityId] = useState('');
  const [vehicleTypeId, setVehicleTypeId] = useState('');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selected, setSelected] = useState(() => new Set(preselected ? [preselected] : []));
  const [sending, setSending] = useState(false);
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    Promise.allSettled([adminService.getZones(), adminService.getServiceLocations(), adminService.getVehicleTypes()]).then(([z, l, v]) => {
      if (z.status === 'fulfilled') setZones(pickList(z.value, 'zones').map((x) => ({ id: String(x._id || x.id), name: x.name || 'Zone' })));
      if (l.status === 'fulfilled') setCities(pickList(l.value, 'service_locations', 'locations').map((x) => ({ id: String(x._id || x.id), name: x.service_location_name || x.name || 'City' })));
      if (v.status === 'fulfilled') setVehicleTypes(pickList(v.value, 'vehicle_types', 'types').map((x) => ({ id: String(x._id || x.id), name: x.name || 'Vehicle' })));
    });
  }, []);

  const loadHistory = useCallback(() => {
    adminService.getTestRides().then((res) => setHistory(pickList(res))).catch(() => {});
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Online drivers matching the choice - the picker, or the count for a zone/city.
  useEffect(() => {
    if (target === 'zone' && !zoneId) { setCandidates([]); return undefined; }
    if (target === 'city' && !cityId) { setCandidates([]); return undefined; }
    let cancelled = false;
    setLoadingCandidates(true);
    const timer = setTimeout(() => {
      adminService.getTestRideCandidates({
        zoneId: (target === 'zone' || target === 'drivers') && zoneId ? zoneId : undefined,
        serviceLocationId: target === 'city' ? cityId : undefined,
        vehicleTypeId: vehicleTypeId || undefined,
        search: target === 'drivers' && search ? search : undefined,
      })
        .then((res) => { if (!cancelled) setCandidates(pickList(res)); })
        .catch((err) => toast.error(errorText(err, 'Could not load drivers')))
        .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [target, zoneId, cityId, vehicleTypeId, search]);

  // Follow the test that is running until its window has passed.
  useEffect(() => {
    if (!current?.id || !current.live) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = unwrap(await adminService.getTestRide(current.id));
        setCurrent(next);
        if (!next.live) loadHistory();
      } catch { /* next tick */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [current?.id, current?.live, loadHistory]);

  const recipients = target === 'drivers'
    ? candidates.filter((c) => selected.has(c.id))
    : candidates;
  const sendable = recipients;

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async () => {
    if (!recipients.length) { toast.error('Pick at least one online driver'); return; }
    const where = target === 'zone' ? `in ${zones.find((z) => z.id === zoneId)?.name || 'the zone'}` : target === 'city' ? `in ${cities.find((c) => c.id === cityId)?.name || 'the city'}` : '';
    if (!window.confirm(`Send a test ride to ${recipients.length} driver(s) ${where}? Their phones will ring like a real offer.`)) return;
    setSending(true);
    try {
      const body = target === 'drivers'
        ? { driverIds: recipients.map((c) => c.id) }
        : { zoneId: target === 'zone' ? zoneId : undefined, serviceLocationId: target === 'city' ? cityId : undefined };
      if (vehicleTypeId) body.vehicleTypeId = vehicleTypeId;
      const result = unwrap(await adminService.sendTestRide(body));
      setCurrent(result);
      toast.success(`Test ride sent to ${(result.offers || []).filter((o) => o.status !== 'skipped').length} driver(s)`);
      loadHistory();
    } catch (err) {
      toast.error(errorText(err, 'Could not send the test ride'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FlaskConical className="text-yellow-500" size={24} /> Test Rides</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sends an offer that looks exactly like a real ride - sound, lock-screen card, a pickup near the driver, a real fare - but books nothing.
          If the driver accepts they see "Another driver accepted this ride". Never counts in trips, earnings or acceptance %.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 self-start">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Send to</label>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {TARGETS.map((t) => (
                <button key={t.key} type="button" onClick={() => setTarget(t.key)} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold ${target === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>{t.label}</button>
              ))}
            </div>
          </div>

          {(target === 'zone' || target === 'drivers') && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">{target === 'zone' ? 'Zone' : 'Zone (optional filter)'}</label>
              <select className={inputClass} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">{target === 'zone' ? 'Choose a zone' : 'All zones'}</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">{target === 'zone' ? 'Every online driver in this zone; each pickup is placed inside the zone.' : 'Only lists drivers who are in this zone right now.'}</p>
            </div>
          )}
          {target === 'city' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">City</label>
              <select className={inputClass} value={cityId} onChange={(e) => setCityId(e.target.value)}>
                <option value="">Choose a city</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Vehicle type</label>
            <select className={inputClass} value={vehicleTypeId} onChange={(e) => setVehicleTypeId(e.target.value)}>
              <option value="">All vehicles</option>
              {vehicleTypes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {target === 'drivers' && (
            <div>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className={`${inputClass} pl-8`} placeholder="Search online drivers" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{candidates.length} online · {selected.size} chosen</span>
                <span className="space-x-2">
                  <button type="button" className="font-semibold text-yellow-600" onClick={() => setSelected(new Set(candidates.map((c) => c.id)))}>All</button>
                  <button type="button" className="font-semibold text-gray-500" onClick={() => setSelected(new Set())}>None</button>
                </span>
              </div>
              <div className="border border-gray-100 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-50">
                {loadingCandidates && <div className="py-6 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={18} /></div>}
                {!loadingCandidates && !candidates.length && <p className="py-6 text-center text-xs text-gray-400">No online drivers match.</p>}
                {!loadingCandidates && candidates.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-yellow-50/40">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold text-gray-900">{c.name || 'Driver'}</span>
                      <span className="block text-[11px] text-gray-500 truncate">{c.phone}{c.vehicleNumber ? ` · ${c.vehicleNumber}` : ''}{c.testedRecently ? ' · tested in the last 10 min' : ''}</span>
                    </span>
                    {c.gpsLive
                      ? <span title="Live location" className="text-green-600"><Wifi size={14} /></span>
                      : <span title="GPS silent - push may still reach the phone" className="text-orange-500"><WifiOff size={14} /></span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {target !== 'drivers' && (
            <div className="text-sm bg-gray-50 rounded-lg p-3 flex items-center gap-2">
              {loadingCandidates ? <Loader2 size={14} className="animate-spin text-yellow-500" /> : <MapPin size={14} className="text-yellow-600" />}
              <span><b>{recipients.length}</b> online driver(s)</span>
            </div>
          )}

          <button
            type="button"
            disabled={sending || !sendable.length}
            onClick={send}
            className="w-full inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold px-4 py-2.5 rounded-lg disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send test ride{sendable.length ? ` to ${sendable.length}` : ''}
          </button>
          <p className="text-[11px] text-gray-400">Each test rings a real phone. At most 200 drivers at a time.</p>
        </div>

        <div className="space-y-5">
          {current ? <ResultView test={current} /> : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">Send a test ride to see, live, who gets it and how fast they answer.</div>
          )}

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100"><h3 className="font-bold text-gray-900">Past tests</h3></div>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-3">When</th><th className="py-2 pr-3">By</th><th className="py-2 pr-3">Sent to</th>
                    <th className="py-2 pr-3">Accepted</th><th className="py-2 pr-3">Rejected</th><th className="py-2 pr-3">No answer</th><th className="py-2 pr-3">Avg answer</th>
                  </tr>
                </thead>
                <tbody>
                  {!history.length && <tr><td colSpan={7} className="py-6 text-center text-xs text-gray-400">No tests yet.</td></tr>}
                  {history.map((t) => (
                    <tr key={t.id} onClick={() => adminService.getTestRide(t.id).then((res) => setCurrent(unwrap(res)))} className="border-b border-gray-50 cursor-pointer hover:bg-yellow-50/40">
                      <td className="py-2 pr-3 text-gray-700">{timeText(t.createdAt)}</td>
                      <td className="py-2 pr-3 text-gray-600">{t.createdBy || '—'}</td>
                      <td className="py-2 pr-3 text-gray-600">{t.target === 'zone' ? `Zone ${t.zoneName}` : t.target === 'city' ? 'A city' : 'Chosen drivers'} ({t.drivers})</td>
                      <td className="py-2 pr-3 text-green-700 font-semibold">{t.counts?.accepted || 0}</td>
                      <td className="py-2 pr-3 text-amber-700">{t.counts?.rejected || 0}</td>
                      <td className="py-2 pr-3 text-gray-500">{(t.counts?.expired || 0) + (t.counts?.sent || 0)}</td>
                      <td className="py-2 pr-3 text-gray-700">{t.avgResponseSeconds !== null ? `${t.avgResponseSeconds}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestRides;
