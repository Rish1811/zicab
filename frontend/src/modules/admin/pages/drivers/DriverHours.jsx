import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, CalendarDays, Clock, Download, Flame, Loader2, MapPin, Navigation, Power, RefreshCw,
  Search, ShieldAlert, Users, WifiOff, X,
} from 'lucide-react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../utils/googleMaps';

/**
 * Driver Hours: who is working right now, how long everyone worked, one
 * driver's day in detail, and the drivers worth a look.
 *
 * Time comes from the activity clock: live location while online or on a
 * trip ("active", split into on-trip and waiting), and "ghost" time - marked
 * online but the phone sends no location (GPS off, app killed, no signal).
 * Counting started 23 Nov 2026; per-hour detail later that day.
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

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const shiftDays = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const hm = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const ago = (seconds) => {
  if (seconds === null || seconds === undefined) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
};
const timeText = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—');
const dateText = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const downloadCsv = (filename, header, rows) => {
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const inputClass = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none';

const STATUS = {
  active: { label: 'Active', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' },
  on_trip: { label: 'On trip', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700' },
  ghost: { label: 'Online, GPS silent', dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700' },
  offline: { label: 'Offline', dot: 'bg-gray-400', chip: 'bg-gray-100 text-gray-600' },
};
const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === 'active' || status === 'on_trip' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
  );
};

const DriverCell = ({ row, onOpen }) => (
  <button type="button" onClick={() => onOpen(row.id)} className="text-left group">
    <div className="font-semibold text-gray-900 group-hover:text-yellow-600">{row.name || 'Driver'}</div>
    <div className="text-xs text-gray-500">{row.phone}{row.vehicleNumber ? ` · ${row.vehicleNumber}` : ''}</div>
    <div className="text-[11px] text-gray-400">{[row.vehicleType, row.city].filter(Boolean).join(' · ')}</div>
  </button>
);

const Card = ({ icon: Icon, label, value, sub, tone = 'text-gray-900', onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`text-left bg-white rounded-xl border p-4 transition-shadow ${onClick ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} ${active ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-gray-200'}`}
  >
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">{Icon && <Icon size={14} />}{label}</div>
    <div className={`text-2xl font-black mt-1 ${tone}`}>{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
  </button>
);

const Th = ({ children, sortKey, sort, onSort, className = '' }) => (
  <th className={`py-2 pr-3 text-left text-xs text-gray-500 font-semibold whitespace-nowrap ${className}`}>
    {sortKey ? (
      <button type="button" onClick={() => onSort(sortKey)} className={`hover:text-gray-900 ${sort.key === sortKey ? 'text-gray-900' : ''}`}>
        {children}{sort.key === sortKey ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    ) : children}
  </th>
);

const Empty = ({ children }) => <tr><td colSpan={20} className="py-10 text-center text-sm text-gray-400">{children}</td></tr>;
const Spinner = () => <tr><td colSpan={20} className="py-10 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={22} /></td></tr>;

/* ---------------- Live ---------------- */

const LiveTab = ({ filters, onOpen }) => {
  const [data, setData] = useState({ counts: {}, items: [] });
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const body = unwrap(await adminService.getDriverHoursLive({ ...filters, status: status || undefined }));
      setData({ counts: body.counts || {}, items: body.items || [] });
      setUpdatedAt(Date.now());
    } catch (err) {
      toast.error(errorText(err, 'Could not load the live board'));
    } finally {
      setLoading(false);
    }
  }, [filters, status]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = setInterval(load, 15000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => { clearInterval(timer); clearInterval(clock); };
  }, [load]);

  const c = data.counts;
  const online = (c.active || 0) + (c.on_trip || 0) + (c.ghost || 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card icon={Users} label="Marked online" value={online} sub="All drivers with Online on" onClick={() => setStatus('')} active={!status} />
        <Card icon={Activity} label="Active now" value={c.active || 0} tone="text-green-600" sub="Online, live location" onClick={() => setStatus('active')} active={status === 'active'} />
        <Card icon={Navigation} label="On a trip" value={c.on_trip || 0} tone="text-blue-600" onClick={() => setStatus('on_trip')} active={status === 'on_trip'} />
        <Card icon={WifiOff} label="Online, GPS silent" value={c.ghost || 0} tone="text-orange-600" sub="No location 3+ min - gets no rides" onClick={() => setStatus('ghost')} active={status === 'ghost'} />
        <Card icon={Clock} label="Offline, worked today" value={c.offline || 0} tone="text-gray-600" onClick={() => setStatus('offline')} active={status === 'offline'} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>{data.items.length} drivers · refreshes every 15 s</span>
          <span className="flex items-center gap-2">
            {updatedAt ? `Updated ${ago(Math.round((Date.now() - updatedAt) / 1000))}` : ''}
            <button type="button" onClick={load} className="p-1 rounded hover:bg-gray-100"><RefreshCw size={14} /></button>
          </span>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <Th>Driver</Th><Th>Status</Th><Th>Last location</Th><Th>Zone</Th><Th>Online since</Th>
                <Th>Active today</Th><Th>On trip / waiting</Th><Th>GPS silent</Th><Th>Trips</Th><Th>Earned</Th>
              </tr>
            </thead>
            <tbody>
              {loading && !data.items.length && <Spinner />}
              {!loading && !data.items.length && <Empty>No drivers here right now.</Empty>}
              {data.items.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 hover:bg-yellow-50/30">
                  <td className="py-2.5 pr-3"><DriverCell row={row} onOpen={onOpen} /></td>
                  <td className="py-2.5 pr-3"><StatusChip status={row.status} /></td>
                  <td className={`py-2.5 pr-3 text-xs whitespace-nowrap ${row.status === 'ghost' ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>{ago(row.lastLocationSecondsAgo)}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600">{row.zone || '—'}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600">{timeText(row.onlineSince)}</td>
                  <td className="py-2.5 pr-3 font-bold text-gray-900">{hm(row.activeMinutes)}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600">{hm(row.onTripMinutes)} / {hm(Math.max(0, row.activeMinutes - row.onTripMinutes))}</td>
                  <td className={`py-2.5 pr-3 text-xs ${row.ghostMinutes ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>{row.ghostMinutes ? hm(row.ghostMinutes) : '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{row.trips}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{rupees(row.earnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Report ---------------- */

const PRESETS = [
  { label: 'Today', range: () => ({ from: istToday(), to: istToday() }) },
  { label: 'Yesterday', range: () => ({ from: shiftDays(istToday(), -1), to: shiftDays(istToday(), -1) }) },
  { label: 'Last 7 days', range: () => ({ from: shiftDays(istToday(), -6), to: istToday() }) },
  { label: 'This month', range: () => ({ from: `${istToday().slice(0, 7)}-01`, to: istToday() }) },
];

const ReportTab = ({ filters, onOpen }) => {
  const [range, setRange] = useState(PRESETS[0].range());
  const [sort, setSort] = useState({ key: 'active', order: 'desc' });
  const [data, setData] = useState({ summary: {}, items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService.getDriverHoursReport({ ...filters, ...range, sort: sort.key, order: sort.order })
      .then((res) => { if (!cancelled) setData(unwrap(res)); })
      .catch((err) => toast.error(errorText(err, 'Could not load the report')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, range, sort]);

  const onSort = (key) => setSort((s) => ({ key, order: s.key === key && s.order === 'desc' ? 'asc' : 'desc' }));
  const s = data.summary || {};
  const items = data.items || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {PRESETS.map((preset) => {
          const r = preset.range();
          const on = r.from === range.from && r.to === range.to;
          return (
            <button key={preset.label} type="button" onClick={() => setRange(r)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${on ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{preset.label}</button>
          );
        })}
        <input type="date" className={inputClass} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" className={inputClass} value={range.to} min={range.from} max={istToday()} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <button
          type="button"
          onClick={() => downloadCsv(`driver-hours-${range.from}-${range.to}.csv`,
            ['Driver', 'Phone', 'Vehicle no.', 'Vehicle type', 'City', 'Days worked', '8h+ days', 'Active (min)', 'Avg/day (min)', 'On trip (min)', 'Waiting (min)', 'GPS silent (min)', 'Trips', 'Earned', 'Offers', 'Rejected', 'Accepted', 'Acceptance %', 'Fake GPS'],
            items.map((r) => [r.name, r.phone, r.vehicleNumber, r.vehicleType, r.city, r.daysWorked, r.days8h, r.activeMinutes, r.avgMinutesPerDay, r.onTripMinutes, r.waitingMinutes, r.ghostMinutes, r.trips, r.earnings, r.offersReceived, r.offersRejected, r.offersAccepted, r.acceptanceRate ?? '', r.mockedPings]))}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card icon={Clock} label="Driver-hours" value={s.totalActiveHours ?? 0} sub={`${s.onTripHours ?? 0} h on trips`} />
        <Card icon={Users} label="Drivers active" value={s.driversActive ?? 0} />
        <Card icon={Activity} label="Avg hours / driver / day" value={s.avgHoursPerDay ?? 0} />
        <Card icon={CalendarDays} label="8h+ driver-days" value={s.driverDays8h ?? 0} tone="text-green-600" />
        <Card icon={WifiOff} label="GPS-silent hours" value={s.ghostHours ?? 0} tone="text-orange-600" />
        <Card icon={ShieldAlert} label="Fake GPS drivers" value={s.fakeGpsDrivers ?? 0} tone={s.fakeGpsDrivers ? 'text-red-600' : 'text-gray-900'} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <Th>Driver</Th>
              <Th sortKey="days" sort={sort} onSort={onSort}>Days</Th>
              <Th sortKey="active" sort={sort} onSort={onSort}>Active</Th>
              <Th sortKey="avg" sort={sort} onSort={onSort}>Avg/day</Th>
              <Th>On trip / waiting</Th>
              <Th sortKey="ghost" sort={sort} onSort={onSort}>GPS silent</Th>
              <Th sortKey="trips" sort={sort} onSort={onSort}>Trips</Th>
              <Th sortKey="earnings" sort={sort} onSort={onSort}>Earned</Th>
              <Th>Offers (rej.)</Th>
              <Th sortKey="acceptance" sort={sort} onSort={onSort}>Accept %</Th>
              <Th sortKey="fake" sort={sort} onSort={onSort}>Fake GPS</Th>
              <Th>First – last</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <Spinner />}
            {!loading && !items.length && <Empty>No activity in this range.</Empty>}
            {!loading && items.map((r) => {
              const busy = r.activeMinutes ? Math.round((r.onTripMinutes / r.activeMinutes) * 100) : 0;
              return (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-yellow-50/30">
                  <td className="py-2.5 pr-3"><DriverCell row={r} onOpen={onOpen} /></td>
                  <td className="py-2.5 pr-3 text-gray-700">{r.daysWorked}{r.days8h ? <span className="text-green-600 text-xs"> ({r.days8h}×8h)</span> : ''}</td>
                  <td className="py-2.5 pr-3 font-bold text-gray-900">{hm(r.activeMinutes)}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{hm(r.avgMinutesPerDay)}</td>
                  <td className="py-2.5 pr-3 min-w-[140px]">
                    <div className="flex h-2 rounded-full overflow-hidden bg-gray-100" title={`${busy}% of active time on trips`}>
                      <div className="bg-blue-500" style={{ width: `${busy}%` }} />
                      <div className="bg-green-400" style={{ width: `${100 - busy}%` }} />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{hm(r.onTripMinutes)} / {hm(r.waitingMinutes)}</div>
                  </td>
                  <td className={`py-2.5 pr-3 text-xs ${r.ghostMinutes ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>{r.ghostMinutes ? hm(r.ghostMinutes) : '—'}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{r.trips}</td>
                  <td className="py-2.5 pr-3 text-gray-700">{rupees(r.earnings)}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600">{r.offersReceived} ({r.offersRejected})</td>
                  <td className={`py-2.5 pr-3 text-xs font-semibold ${r.acceptanceRate === null ? 'text-gray-400' : r.acceptanceRate >= 70 ? 'text-green-600' : r.acceptanceRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{r.acceptanceRate === null ? '—' : `${r.acceptanceRate}%`}</td>
                  <td className={`py-2.5 pr-3 text-xs ${r.mockedPings ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{r.mockedPings || '—'}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">{timeText(r.firstActiveAt)} – {timeText(r.lastActiveAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---------------- Attendance ---------------- */

const cellTone = (minutes) => {
  if (!minutes) return 'bg-gray-50 text-gray-300';
  if (minutes >= 480) return 'bg-green-500 text-white';
  if (minutes >= 240) return 'bg-green-200 text-green-900';
  if (minutes >= 60) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-50 text-red-600';
};

const AttendanceTab = ({ filters, onOpen }) => {
  const [month, setMonth] = useState(istToday().slice(0, 7));
  const [data, setData] = useState({ days: [], items: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService.getDriverHoursAttendance({ ...filters, month })
      .then((res) => { if (!cancelled) setData(unwrap(res)); })
      .catch((err) => toast.error(errorText(err, 'Could not load attendance')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, month]);

  const days = data.days || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500" /> 8h+</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200" /> 4–8h</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100" /> 1–4h</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-100" /> under 1h</span>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(`driver-attendance-${month}.csv`,
            ['Driver', 'Phone', 'Vehicle no.', 'Days worked', '8h+ days', 'Total (min)', ...days.map(dateText)],
            (data.items || []).map((r) => [r.name, r.phone, r.vehicleNumber, r.daysWorked, r.days8h, r.totalMinutes, ...r.minutes]))}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50"
        >
          <Download size={14} /> CSV
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto p-4">
        <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left pr-3 text-gray-500 font-semibold sticky left-0 bg-white">Driver</th>
              <th className="px-1 text-gray-500 font-semibold">Days</th>
              <th className="px-1 text-gray-500 font-semibold">Total</th>
              {days.map((d) => <th key={d} className="w-9 text-center text-gray-400 font-semibold">{Number(d.slice(8, 10))}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <Spinner />}
            {!loading && !(data.items || []).length && <Empty>No activity this month.</Empty>}
            {!loading && (data.items || []).map((r) => (
              <tr key={r.id}>
                <td className="pr-3 py-1 sticky left-0 bg-white min-w-[160px]"><DriverCell row={r} onOpen={onOpen} /></td>
                <td className="px-1 text-center font-semibold text-gray-700">{r.daysWorked}</td>
                <td className="px-1 text-center font-semibold text-gray-700 whitespace-nowrap">{hm(r.totalMinutes)}</td>
                {r.minutes.map((m, i) => (
                  <td key={days[i]} title={`${dateText(days[i])}: ${hm(m)}`} className={`w-9 h-8 text-center rounded ${cellTone(m)}`}>
                    {m ? (m >= 60 ? Math.round(m / 60) : '·') : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mt-2">Numbers are hours. Counting started 23 Nov 2026.</p>
      </div>
    </div>
  );
};

/* ---------------- Alerts ---------------- */

const AlertsTab = ({ filters, onOpen }) => {
  const [data, setData] = useState({ ghost: [], fakeGps: [], behindPace: [] });
  const [loading, setLoading] = useState(true);
  const [forcing, setForcing] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(unwrap(await adminService.getDriverHoursAlerts(filters)));
    } catch (err) {
      toast.error(errorText(err, 'Could not load alerts'));
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const forceOffline = async (row) => {
    if (!window.confirm(`Set ${row.name || 'this driver'} offline? They get a notification and can go online again any time.`)) return;
    setForcing(row.id);
    try {
      await adminService.forceDriverOffline(row.id);
      toast.success('Driver set offline');
      await load();
    } catch (err) {
      toast.error(errorText(err, 'Could not set offline'));
    } finally {
      setForcing('');
    }
  };

  const forceAll = async () => {
    const list = data.ghost || [];
    if (!list.length || !window.confirm(`Set all ${list.length} GPS-silent drivers offline?`)) return;
    let done = 0;
    for (const row of list) {
      try { await adminService.forceDriverOffline(row.id); done += 1; } catch { /* already offline */ }
    }
    toast.success(`${done} drivers set offline`);
    load();
  };

  if (loading) return <div className="py-16 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={24} /></div>;
  const Section = ({ icon: Icon, tone, title, note, action, children, count }) => (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className={`font-bold flex items-center gap-2 ${tone}`}><Icon size={16} /> {title} <span className="text-gray-400 font-semibold">({count})</span></h3>
          <p className="text-xs text-gray-500">{note}</p>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto p-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Section
        icon={WifiOff}
        tone="text-orange-600"
        title="Online, but GPS silent 10+ min"
        count={(data.ghost || []).length}
        note="They show as online but get no ride offers. Usually GPS switched off, app killed or no signal."
        action={(data.ghost || []).length > 1 && <button type="button" onClick={forceAll} className="text-xs font-semibold border border-orange-200 text-orange-700 rounded-lg px-3 py-1.5 hover:bg-orange-50">Set all offline</button>}
      >
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100"><Th>Driver</Th><Th>Last location</Th><Th>Online since</Th><Th /></tr></thead>
          <tbody>
            {!(data.ghost || []).length && <Empty>None right now. 👍</Empty>}
            {(data.ghost || []).map((r) => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="py-2 pr-3"><DriverCell row={r} onOpen={onOpen} /></td>
                <td className="py-2 pr-3 text-xs text-orange-600 font-semibold">{r.silentMinutes === null ? 'never sent' : `${hm(r.silentMinutes)} ago`}</td>
                <td className="py-2 pr-3 text-xs text-gray-600">{timeText(r.onlineSince)}</td>
                <td className="py-2 text-right">
                  <button type="button" disabled={forcing === r.id} onClick={() => forceOffline(r)} className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-900 text-white rounded-md px-2.5 py-1 hover:bg-gray-700 disabled:opacity-50">
                    <Power size={12} /> Force offline
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon={ShieldAlert} tone="text-red-600" title="Fake GPS (last 7 days)" count={(data.fakeGps || []).length} note="Location from a fake-GPS app. Those minutes never count. Open the driver to see their route.">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100"><Th>Driver</Th><Th>Day</Th><Th>Fake locations</Th></tr></thead>
          <tbody>
            {!(data.fakeGps || []).length && <Empty>None. (Shows drivers on the new driver app only.)</Empty>}
            {(data.fakeGps || []).map((r) => (
              <tr key={`${r.id}-${r.dateKey}`} className="border-b border-gray-50">
                <td className="py-2 pr-3"><DriverCell row={r} onOpen={onOpen} /></td>
                <td className="py-2 pr-3 text-gray-700">{dateText(r.dateKey)}</td>
                <td className="py-2 pr-3 text-red-600 font-bold">{r.mockedPings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon={AlertTriangle} tone="text-amber-600" title="Behind on a challenge" count={(data.behindPace || []).length} note="Can still win, but counting days slower than the target needs. Worth a nudge.">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100"><Th>Driver</Th><Th>Challenge</Th><Th>Counted</Th><Th>Still needed</Th><Th>Days left</Th></tr></thead>
          <tbody>
            {!(data.behindPace || []).length && <Empty>Nobody behind, or no challenge running.</Empty>}
            {(data.behindPace || []).map((r) => (
              <tr key={`${r.id}-${r.challengeId}`} className="border-b border-gray-50">
                <td className="py-2 pr-3"><DriverCell row={r} onOpen={onOpen} /></td>
                <td className="py-2 pr-3 text-gray-700">{r.challengeTitle}</td>
                <td className="py-2 pr-3 text-gray-700">{r.counted}</td>
                <td className="py-2 pr-3 font-semibold text-amber-700">{r.needed}</td>
                <td className="py-2 pr-3 text-gray-700">{r.daysLeft}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
};

/* ---------------- Heatmap ---------------- */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

const HeatmapTab = ({ filters }) => {
  const [range, setRange] = useState({ from: shiftDays(istToday(), -27), to: istToday() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService.getDriverHoursHeatmap({ ...filters, ...range })
      .then((res) => { if (!cancelled) setData(unwrap(res)); })
      .catch((err) => toast.error(errorText(err, 'Could not load the heatmap')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, range]);

  const grid = data?.avgActiveDrivers || [];
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" className={inputClass} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" className={inputClass} value={range.to} min={range.from} max={istToday()} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        <span className="text-xs text-gray-500">Average drivers active in each hour. {data ? `${data.daysWithData} day(s) with hourly data` : ''} - hourly detail started 23 Nov 2026.</span>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
        {loading ? <div className="py-12 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={22} /></div> : (
          <table className="text-[11px] border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => <th key={h} className="w-8 text-gray-400 font-semibold">{hourLabel(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((day, w) => (
                <tr key={day}>
                  <td className="pr-2 text-gray-500 font-semibold">{day}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const value = grid[w]?.[h] || 0;
                    const alpha = value ? 0.12 + (value / max) * 0.88 : 0;
                    return (
                      <td
                        key={h}
                        title={`${day} ${hourLabel(h)}: ${value} drivers on average`}
                        className="w-8 h-8 rounded text-center font-semibold"
                        style={{ background: value ? `rgba(234, 179, 8, ${alpha})` : '#f8fafc', color: alpha > 0.6 ? '#fff' : '#713f12' }}
                      >
                        {value ? (value >= 10 ? Math.round(value) : value) : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

/* ---------------- Driver detail drawer ---------------- */

const RouteMap = ({ driverId, date, trips }) => {
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const [route, setRoute] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    adminService.getDriverHoursRoute(driverId, { date })
      .then((res) => { if (!cancelled) setRoute(unwrap(res)); })
      .catch(() => { if (!cancelled) setRoute({ points: [] }); });
    return () => { cancelled = true; };
  }, [driverId, date]);

  const path = useMemo(() => (route?.points || []).map((p) => ({ lat: p.lat, lng: p.lng })), [route]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) return;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    trips.forEach((t) => {
      if (t.pickup) bounds.extend({ lat: t.pickup[1], lng: t.pickup[0] });
      if (t.drop) bounds.extend({ lat: t.drop[1], lng: t.drop[0] });
    });
    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 40);
  }, [isLoaded, path, trips]);

  if (!HAS_VALID_GOOGLE_MAPS_KEY || loadError) return <p className="text-xs text-gray-400">Map unavailable.</p>;
  if (!isLoaded || !route) return <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg"><Loader2 className="animate-spin text-yellow-500" size={20} /></div>;
  if (!path.length && !trips.length) return <p className="text-xs text-gray-400 py-6 text-center bg-gray-50 rounded-lg">No location trail for this day (kept for 30 days).</p>;

  return (
    <div>
      <div className="h-72 rounded-lg overflow-hidden border border-gray-200">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={path[0] || INDIA_CENTER}
          zoom={13}
          onLoad={(map) => { mapRef.current = map; }}
          options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
        >
          {path.length > 1 && <Polyline path={path} options={{ strokeColor: '#eab308', strokeWeight: 4, strokeOpacity: 0.9 }} />}
          {path[0] && <Marker position={path[0]} label={{ text: 'S', color: '#fff', fontWeight: '700' }} title="First location" />}
          {path.length > 1 && <Marker position={path[path.length - 1]} label={{ text: 'E', color: '#fff', fontWeight: '700' }} title="Last location" />}
          {trips.map((t) => (
            <React.Fragment key={t.id}>
              {t.pickup && <Marker position={{ lat: t.pickup[1], lng: t.pickup[0] }} icon="https://maps.google.com/mapfiles/ms/icons/green-dot.png" title={`Pickup: ${t.pickupAddress}`} />}
              {t.drop && <Marker position={{ lat: t.drop[1], lng: t.drop[0] }} icon="https://maps.google.com/mapfiles/ms/icons/red-dot.png" title={`Drop: ${t.dropAddress}`} />}
            </React.Fragment>
          ))}
        </GoogleMap>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">{route.totalPoints} location points · S = first, E = last · green = pickup, red = drop</p>
    </div>
  );
};

const DriverDrawer = ({ driverId, onClose }) => {
  const [date, setDate] = useState(istToday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminService.getDriverHoursDetail(driverId, { date })
      .then((res) => { if (!cancelled) setData(unwrap(res)); })
      .catch((err) => toast.error(errorText(err, 'Could not load this driver')))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId, date]);

  const daily = data?.daily || [];
  const maxDaily = Math.max(60, ...daily.map((d) => d.activeMinutes + d.ghostMinutes));
  const hourly = data?.day?.hourly;
  const d = data?.driver;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-3xl h-full bg-gray-50 overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-gray-900">{d?.name || 'Driver'}</h2>
              {d && <StatusChip status={d.status} />}
            </div>
            {d && <p className="text-xs text-gray-500">{d.phone}{d.vehicleNumber ? ` · ${d.vehicleNumber}` : ''}{d.vehicleType ? ` · ${d.vehicleType}` : ''}{d.city ? ` · ${d.city}` : ''}</p>}
            {d && <p className="text-xs text-gray-400">Last location {d.lastLocationAt ? new Date(d.lastLocationAt).toLocaleString('en-IN') : 'never'}{d.zone ? ` · ${d.zone}` : ''}</p>}
          </div>
          <div className="flex items-center gap-2">
            <input type="date" className={inputClass} value={date} max={istToday()} onChange={(e) => setDate(e.target.value || istToday())} />
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
          </div>
        </div>

        {loading && !data ? <div className="py-24 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={26} /></div> : data && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card icon={Clock} label={`Active ${dateText(date)}`} value={hm(data.day.activeMinutes)} />
              <Card icon={Navigation} label="On trips" value={hm(data.day.onTripMinutes)} tone="text-blue-600" sub={`Waiting ${hm(Math.max(0, data.day.activeMinutes - data.day.onTripMinutes))}`} />
              <Card icon={WifiOff} label="GPS silent" value={hm(data.day.ghostMinutes)} tone={data.day.ghostMinutes ? 'text-orange-600' : 'text-gray-900'} />
              <Card icon={ShieldAlert} label="Fake GPS" value={data.day.mockedPings} tone={data.day.mockedPings ? 'text-red-600' : 'text-gray-900'} sub={`${timeText(data.day.firstActiveAt)} – ${timeText(data.day.lastActiveAt)}`} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-900 text-sm mb-3">Last 30 days</h3>
              <div className="flex items-end gap-1 h-32">
                {daily.map((day) => {
                  const trip = (day.onTripMinutes / maxDaily) * 100;
                  const wait = (Math.max(0, day.activeMinutes - day.onTripMinutes) / maxDaily) * 100;
                  const ghost = (day.ghostMinutes / maxDaily) * 100;
                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      onClick={() => setDate(day.dateKey)}
                      title={`${dateText(day.dateKey)}: active ${hm(day.activeMinutes)} (trip ${hm(day.onTripMinutes)}), GPS silent ${hm(day.ghostMinutes)}`}
                      className={`flex-1 h-full flex flex-col justify-end rounded-sm ${day.dateKey === date ? 'ring-2 ring-yellow-400' : ''}`}
                    >
                      <div className="bg-orange-300" style={{ height: `${ghost}%` }} />
                      <div className="bg-green-400" style={{ height: `${wait}%` }} />
                      <div className="bg-blue-500 rounded-b-sm" style={{ height: `${trip}%` }} />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{daily[0] && dateText(daily[0].dateKey)}</span>
                <span className="flex gap-3">
                  <span><span className="inline-block w-2 h-2 bg-blue-500 rounded-sm" /> on trip</span>
                  <span><span className="inline-block w-2 h-2 bg-green-400 rounded-sm" /> waiting</span>
                  <span><span className="inline-block w-2 h-2 bg-orange-300 rounded-sm" /> GPS silent</span>
                </span>
                <span>{daily.length ? dateText(daily[daily.length - 1].dateKey) : ''}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-900 text-sm mb-3">{dateText(date)} hour by hour</h3>
              {!data.day.hasHourly ? (
                <p className="text-xs text-gray-400">No hourly detail for this day (it started on 23 Nov 2026).</p>
              ) : (
                <>
                  <div className="flex gap-[2px] h-16 items-end">
                    {Array.from({ length: 24 }, (_, h) => {
                      const trip = hourly.trip[h];
                      const wait = Math.max(0, hourly.active[h] - trip);
                      const ghost = hourly.ghost[h];
                      return (
                        <div key={h} className="flex-1 h-full flex flex-col justify-end bg-gray-50 rounded-sm" title={`${hourLabel(h)}: trip ${trip}m, waiting ${wait}m, GPS silent ${ghost}m`}>
                          <div className="bg-orange-300" style={{ height: `${(ghost / 60) * 100}%` }} />
                          <div className="bg-green-400" style={{ height: `${(wait / 60) * 100}%` }} />
                          <div className="bg-blue-500" style={{ height: `${(trip / 60) * 100}%` }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-[2px] mt-1">
                    {Array.from({ length: 24 }, (_, h) => <div key={h} className="flex-1 text-center text-[9px] text-gray-400">{h % 3 === 0 ? hourLabel(h) : ''}</div>)}
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2"><MapPin size={15} /> Route on {dateText(date)}</h3>
              <RouteMap driverId={driverId} date={date} trips={data.trips || []} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-900 text-sm mb-2">Trips on {dateText(date)} ({(data.trips || []).length})</h3>
              {!(data.trips || []).length ? <p className="text-xs text-gray-400">No trips.</p> : (
                <div className="divide-y divide-gray-100">
                  {data.trips.map((t) => (
                    <div key={t.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-gray-900 truncate">{t.pickupAddress || 'Pickup'} → {t.dropAddress || 'Drop'}</div>
                        <div className="text-xs text-gray-500">{timeText(t.acceptedAt)} – {timeText(t.completedAt)} · {t.distanceKm} km · {t.serviceType} · {t.status}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-gray-900">{rupees(t.fare)}</div>
                        {t.driverEarnings > 0 && <div className="text-xs text-green-600">earned {rupees(t.driverEarnings)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(data.challenges || []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2"><Flame size={15} className="text-yellow-500" /> Challenges</h3>
                {data.challenges.map((c) => (
                  <div key={c.id} className="py-1.5">
                    <div className="flex justify-between text-sm"><span className="text-gray-800">{c.title}</span><span className="font-semibold text-gray-700">{c.qualifiedDays}/{c.requiredDays} · {c.status.replace('_', ' ')}</span></div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-yellow-400" style={{ width: `${Math.min(100, (c.qualifiedDays / Math.max(1, c.requiredDays)) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- Page ---------------- */

const TABS = [
  { key: 'live', label: 'Live', icon: Activity },
  { key: 'report', label: 'Hours report', icon: Clock },
  { key: 'attendance', label: 'Attendance', icon: CalendarDays },
  { key: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { key: 'heatmap', label: 'When drivers work', icon: Flame },
];

const DriverHours = () => {
  const [tab, setTab] = useState('live');
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState({ serviceLocationId: '', vehicleTypeId: '', search: '' });
  const [searchText, setSearchText] = useState('');
  const [openDriver, setOpenDriver] = useState('');

  useEffect(() => {
    Promise.allSettled([adminService.getVehicleTypes(), adminService.getServiceLocations()]).then(([v, l]) => {
      if (v.status === 'fulfilled') setVehicleTypes(pickList(v.value, 'vehicle_types', 'types').map((x) => ({ id: String(x._id || x.id), name: x.name || 'Vehicle' })));
      if (l.status === 'fulfilled') setLocations(pickList(l.value, 'service_locations', 'locations').map((x) => ({ id: String(x._id || x.id), name: x.service_location_name || x.name || 'City' })));
    });
  }, []);

  // Search applies after typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchText ? f : { ...f, search: searchText })), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), [filters]);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Clock className="text-yellow-500" size={24} /> Driver Hours</h1>
        <p className="text-sm text-gray-500 mt-1">Real working time from each driver's live location - not the Online button. Click a driver for their day, route and trips.</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === key ? 'bg-yellow-400 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <select className={inputClass} value={filters.serviceLocationId} onChange={(e) => setFilters((f) => ({ ...f, serviceLocationId: e.target.value }))}>
            <option value="">All cities</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className={inputClass} value={filters.vehicleTypeId} onChange={(e) => setFilters((f) => ({ ...f, vehicleTypeId: e.target.value }))}>
            <option value="">All vehicles</option>
            {vehicleTypes.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClass} pl-8 w-56`} placeholder="Name, phone, vehicle no." value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
        </div>
      </div>

      {tab === 'live' && <LiveTab filters={query} onOpen={setOpenDriver} />}
      {tab === 'report' && <ReportTab filters={query} onOpen={setOpenDriver} />}
      {tab === 'attendance' && <AttendanceTab filters={query} onOpen={setOpenDriver} />}
      {tab === 'alerts' && <AlertsTab filters={query} onOpen={setOpenDriver} />}
      {tab === 'heatmap' && <HeatmapTab filters={query} />}

      {openDriver && <DriverDrawer driverId={openDriver} onClose={() => setOpenDriver('')} />}
    </div>
  );
};

export default DriverHours;
