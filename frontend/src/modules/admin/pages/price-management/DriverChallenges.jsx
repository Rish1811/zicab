import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Download, Loader2, Pencil, Plus, Save, Search, Trash2, Trophy, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

/**
 * Driver challenges, e.g. "26 days online = full tank CNG free".
 *
 * A day counts when the driver was really active (measured from the phone's
 * location updates, not the Online toggle) for the minimum time and finished
 * the minimum trips. The server judges each finished day overnight; the
 * leaderboard shows who is where, and rewards are paid to the driver wallet.
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

const todayKey = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const monthBounds = () => {
  const [y, m] = todayKey().split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
};
const hoursText = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};
const dateText = (key) => {
  if (!key) return '';
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
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
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors';

const Toggle = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-yellow-400' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
];
const STATUS_STYLE = {
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-amber-50 text-amber-700',
  claimed: 'bg-purple-50 text-purple-700',
  paid: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

const newChallenge = () => {
  const { start, end } = monthBounds();
  return {
    title: '26 Days Online = Full Tank CNG Free',
    description: 'Stay active and complete the offer challenge.',
    terms: 'A day counts when you are online and active for the minimum time and complete the minimum trips.\nTime counts only while the app is sharing your location.\nFake GPS apps disqualify the day.',
    bannerImage: '',
    startDate: start,
    endDate: end,
    requiredDays: 26,
    minActiveHours: 8,
    minTrips: 1,
    vehicleTypeIds: [],
    serviceLocationIds: [],
    rewardLabel: 'Full tank CNG',
    rewardAmount: '',
    autoPay: true,
    active: true,
  };
};

const toForm = (challenge) => ({
  ...challenge,
  terms: (challenge.terms || []).join('\n'),
  minActiveHours: Math.round((Number(challenge.minActiveMinutes || 0) / 60) * 100) / 100,
  rewardAmount: challenge.rewardAmount ?? '',
});

const ChipPicker = ({ options, selected, onChange, emptyLabel }) => (
  <div className="flex flex-wrap gap-2">
    {options.length === 0 && <span className="text-xs text-gray-400">Loading…</span>}
    {options.map((option) => {
      const on = selected.includes(option.id);
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? 'bg-yellow-400 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          {option.name}
        </button>
      );
    })}
    {selected.length === 0 && options.length > 0 && <span className="text-xs text-gray-400 self-center">{emptyLabel}</span>}
  </div>
);

const DriverChallenges = () => {
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [selectedId, setSelectedId] = useState('');
  const [board, setBoard] = useState({ items: [], total: 0, counts: {}, page: 1, limit: 50 });
  const [boardStatus, setBoardStatus] = useState('');
  const [boardSearch, setBoardSearch] = useState('');
  const [boardPage, setBoardPage] = useState(1);
  const [boardLoading, setBoardLoading] = useState(false);
  const [actingId, setActingId] = useState('');

  const [activityRange, setActivityRange] = useState({ from: todayKey(), to: todayKey() });
  const [activity, setActivity] = useState({ items: [], total: 0 });
  const [activityLoading, setActivityLoading] = useState(false);

  const loadChallenges = useCallback(async () => {
    const list = pickList(await adminService.getDriverChallenges());
    setChallenges(list);
    setSelectedId((current) => current || list[0]?.id || '');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [, vehiclesRes, locationsRes] = await Promise.allSettled([
          loadChallenges(),
          adminService.getVehicleTypes(),
          adminService.getServiceLocations(),
        ]);
        if (vehiclesRes.status === 'fulfilled') {
          setVehicleTypes(pickList(vehiclesRes.value, 'vehicle_types', 'types').map((v) => ({ id: String(v._id || v.id), name: v.name || v.vehicle_type_name || 'Vehicle' })));
        }
        if (locationsRes.status === 'fulfilled') {
          setLocations(pickList(locationsRes.value, 'service_locations', 'locations').map((l) => ({ id: String(l._id || l.id), name: l.service_location_name || l.name || 'City' })));
        }
      } catch (err) {
        toast.error('Failed to load challenges');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadChallenges]);

  const loadBoard = useCallback(async () => {
    if (!selectedId) return;
    setBoardLoading(true);
    try {
      const res = await adminService.getDriverChallengeProgress(selectedId, {
        status: boardStatus || undefined,
        search: boardSearch || undefined,
        page: boardPage,
        limit: 50,
      });
      const body = unwrap(res);
      setBoard({ items: body.items || [], total: body.total || 0, counts: body.counts || {}, page: body.page || 1, limit: body.limit || 50 });
    } catch (err) {
      toast.error(errorText(err, 'Failed to load leaderboard'));
    } finally {
      setBoardLoading(false);
    }
  }, [selectedId, boardStatus, boardSearch, boardPage]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const body = unwrap(await adminService.getDriverActivity({ from: activityRange.from, to: activityRange.to, limit: 500 }));
      setActivity({ items: body.items || [], total: body.total || 0 });
    } catch (err) {
      toast.error(errorText(err, 'Failed to load activity'));
    } finally {
      setActivityLoading(false);
    }
  }, [activityRange]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  const selected = useMemo(() => challenges.find((c) => c.id === selectedId) || null, [challenges, selectedId]);
  const optionName = (list, id) => list.find((item) => item.id === id)?.name || 'Unknown';

  const uploadBanner = async (file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Banner must be under 4 MB');
      return;
    }
    setUploading(true);
    try {
      const res = await adminService.uploadDriverChallengeBanner(await readFileAsDataUrl(file));
      setEditing((form) => ({ ...form, bannerImage: unwrap(res).url || '' }));
      toast.success('Banner uploaded');
    } catch (err) {
      toast.error(errorText(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const saveChallenge = async () => {
    const form = editing;
    const payload = {
      ...form,
      minActiveMinutes: Math.round(Number(form.minActiveHours || 0) * 60),
      requiredDays: Number(form.requiredDays || 0),
      minTrips: Number(form.minTrips || 0),
      rewardAmount: Number(form.rewardAmount || 0),
      terms: String(form.terms || '').split('\n'),
    };
    setSaving(true);
    try {
      const res = form.id
        ? await adminService.updateDriverChallenge(form.id, payload)
        : await adminService.createDriverChallenge(payload);
      const saved = unwrap(res);
      toast.success(form.id ? 'Challenge updated' : 'Challenge created');
      setEditing(null);
      await loadChallenges();
      if (saved?.id) setSelectedId(saved.id);
    } catch (err) {
      toast.error(errorText(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const removeChallenge = async (challenge) => {
    if (!window.confirm(`Remove "${challenge.title}"? If rewards were claimed it is only switched off.`)) return;
    try {
      const result = unwrap(await adminService.deleteDriverChallenge(challenge.id));
      toast.success(result.deactivated ? 'Switched off (rewards were claimed)' : 'Challenge removed');
      if (selectedId === challenge.id) setSelectedId('');
      await loadChallenges();
    } catch (err) {
      toast.error(errorText(err, 'Could not remove'));
    }
  };

  const decide = async (row, action) => {
    let body = { action };
    if (action === 'pay') {
      const amount = window.prompt(`Pay ${row.driver.name || 'driver'} into their wallet. Amount (Rs):`, String(selected?.rewardAmount ?? 0));
      if (amount === null) return;
      body = { ...body, amount: Number(amount) };
    } else {
      const note = window.prompt('Reason (shown to the driver):', '');
      if (note === null) return;
      body = { ...body, adminNote: note };
    }
    setActingId(row.id);
    try {
      await adminService.decideDriverChallengeReward(selectedId, row.id, body);
      toast.success(action === 'pay' ? 'Paid to wallet' : 'Rejected');
      await loadBoard();
    } catch (err) {
      toast.error(errorText(err, 'Could not update'));
    } finally {
      setActingId('');
    }
  };

  const exportBoard = async () => {
    try {
      const body = unwrap(await adminService.getDriverChallengeProgress(selectedId, { status: boardStatus || undefined, limit: 200 }));
      downloadCsv(
        `challenge-${selected?.title || selectedId}-${todayKey()}.csv`,
        ['Driver', 'Phone', 'Vehicle number', 'Days counted', 'Required', 'Today active', 'Status', 'Paid amount', 'Note'],
        (body.items || []).map((row) => [row.driver.name, row.driver.phone, row.driver.vehicleNumber, row.qualifiedDays, selected?.requiredDays, hoursText(row.todayActiveMinutes), row.status, row.paidAmount, row.adminNote]),
      );
    } catch (err) {
      toast.error(errorText(err, 'Export failed'));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-yellow-500" size={32} /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Trophy className="text-yellow-500" size={24} /> Driver Challenges</h1>
          <p className="text-sm text-gray-500 mt-1">Reward drivers for days they were really active. Time is measured from the app's live location, not the Online button.</p>
        </div>
        <button type="button" onClick={() => setEditing(newChallenge())} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 rounded-lg text-sm">
          <Plus size={16} /> New challenge
        </button>
      </div>

      {/* Challenges */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {challenges.length === 0 && (
          <div className="col-span-full bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500 text-sm">No challenges yet. Create one to show it in the driver app.</div>
        )}
        {challenges.map((challenge) => {
          const running = challenge.active && challenge.startDate <= todayKey() && challenge.endDate >= todayKey();
          return (
            <div
              key={challenge.id}
              onClick={() => { setSelectedId(challenge.id); setBoardPage(1); }}
              className={`bg-white rounded-xl border cursor-pointer overflow-hidden transition-shadow hover:shadow-md ${selectedId === challenge.id ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-gray-200'}`}
            >
              {challenge.bannerImage
                ? <img src={challenge.bannerImage} alt="" className="w-full h-28 object-cover" />
                : <div className="w-full h-28 bg-gradient-to-r from-slate-800 to-slate-600 flex items-center justify-center text-white/70 text-sm">No banner</div>}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-gray-900 text-sm leading-snug">{challenge.title}</h3>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${running ? 'bg-green-50 text-green-700' : challenge.active ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-600'}`}>
                    {running ? 'Running' : challenge.active ? (challenge.startDate > todayKey() ? 'Upcoming' : 'Ended') : 'Off'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{dateText(challenge.startDate)} – {dateText(challenge.endDate)}</p>
                <p className="text-xs text-gray-700 mt-2">
                  <b>{challenge.requiredDays} days</b> × {hoursText(challenge.minActiveMinutes)} active, {challenge.minTrips}+ trip{challenge.minTrips === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-gray-700 mt-1">Reward: <b>{challenge.rewardLabel || '—'}</b>{challenge.rewardAmount > 0 ? ` (Rs ${challenge.rewardAmount} to wallet${challenge.autoPay ? ', paid on claim' : ', you approve'})` : ''}</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(toForm(challenge)); }} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50"><Pencil size={12} /> Edit</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeChallenge(challenge); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-100 rounded-md px-2.5 py-1 hover:bg-red-50"><Trash2 size={12} /> Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leaderboard */}
      {selected && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-gray-900">Leaderboard · {selected.title}</h2>
              <p className="text-xs text-gray-500">Days are counted overnight (India time). Today's active time is live.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className={`${inputClass} pl-8 w-56`}
                  placeholder="Name, phone or vehicle no."
                  value={boardSearch}
                  onChange={(e) => { setBoardSearch(e.target.value); setBoardPage(1); }}
                />
              </div>
              <button type="button" onClick={exportBoard} className="inline-flex items-center gap-1.5 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"><Download size={14} /> CSV</button>
            </div>
          </div>
          <div className="px-4 pt-3 flex gap-2 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => { setBoardStatus(tab.value); setBoardPage(1); }}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${boardStatus === tab.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {tab.label}{tab.value && board.counts[tab.value] ? ` (${board.counts[tab.value]})` : ''}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">Driver</th>
                  <th className="py-2 pr-3">Days counted</th>
                  <th className="py-2 pr-3">Today active</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Reward</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {boardLoading && <tr><td colSpan={6} className="py-8 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={20} /></td></tr>}
                {!boardLoading && board.items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-sm">No drivers have a counted day yet.</td></tr>}
                {!boardLoading && board.items.map((row) => {
                  const percent = Math.min(100, Math.round((row.qualifiedDays / Math.max(1, selected.requiredDays)) * 100));
                  return (
                    <tr key={row.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-gray-900">{row.driver.name || 'Driver'}</div>
                        <div className="text-xs text-gray-500">{row.driver.phone} {row.driver.vehicleNumber ? `· ${row.driver.vehicleNumber}` : ''}</div>
                      </td>
                      <td className="py-2.5 pr-3 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-yellow-400" style={{ width: `${percent}%` }} /></div>
                          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{row.qualifiedDays}/{selected.requiredDays}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-gray-700">{hoursText(row.todayActiveMinutes)}</td>
                      <td className="py-2.5 pr-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[row.status] || 'bg-gray-100 text-gray-600'}`}>{row.status.replace('_', ' ')}</span></td>
                      <td className="py-2.5 pr-3 text-xs text-gray-600">
                        {row.status === 'paid' ? `Rs ${row.paidAmount} · ${new Date(row.paidAt).toLocaleDateString('en-IN')}` : row.adminNote || '—'}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {['completed', 'claimed'].includes(row.status) && (
                          <button type="button" disabled={actingId === row.id} onClick={() => decide(row, 'pay')} className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-md px-2.5 py-1 mr-1.5 disabled:opacity-50">Pay</button>
                        )}
                        {['in_progress', 'completed', 'claimed'].includes(row.status) && (
                          <button type="button" disabled={actingId === row.id} onClick={() => decide(row, 'reject')} className="text-xs font-semibold border border-red-200 text-red-600 rounded-md px-2.5 py-1 hover:bg-red-50 disabled:opacity-50">Reject</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {board.total > board.limit && (
              <div className="flex items-center justify-end gap-2 pt-3 text-sm">
                <button type="button" disabled={boardPage <= 1} onClick={() => setBoardPage((p) => p - 1)} className="px-3 py-1 border rounded-md disabled:opacity-40">Prev</button>
                <span className="text-gray-500">Page {boardPage} of {Math.ceil(board.total / board.limit)}</span>
                <button type="button" disabled={boardPage >= Math.ceil(board.total / board.limit)} onClick={() => setBoardPage((p) => p + 1)} className="px-3 py-1 border rounded-md disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity report */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><CalendarCheck size={18} className="text-yellow-500" /> Driver active hours</h2>
            <p className="text-xs text-gray-500">Real active time per driver per day. Counting started when this feature went live.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" className={`${inputClass} w-40`} value={activityRange.from} max={activityRange.to} onChange={(e) => setActivityRange((r) => ({ ...r, from: e.target.value }))} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" className={`${inputClass} w-40`} value={activityRange.to} min={activityRange.from} onChange={(e) => setActivityRange((r) => ({ ...r, to: e.target.value }))} />
            <button
              type="button"
              onClick={() => downloadCsv(`driver-active-hours-${activityRange.from}-${activityRange.to}.csv`, ['Date', 'Driver', 'Phone', 'Vehicle number', 'Active (minutes)', 'First active', 'Last active', 'Fake GPS pings'],
                activity.items.map((row) => [row.dateKey, row.name, row.phone, row.vehicleNumber, row.activeMinutes, row.firstActiveAt ? new Date(row.firstActiveAt).toLocaleTimeString('en-IN') : '', row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleTimeString('en-IN') : '', row.mockedPings]))}
              className="inline-flex items-center gap-1.5 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <Download size={14} /> CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4 max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Driver</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3">First – last</th>
                <th className="py-2">Fake GPS</th>
              </tr>
            </thead>
            <tbody>
              {activityLoading && <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={20} /></td></tr>}
              {!activityLoading && activity.items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400 text-sm">No activity in this range.</td></tr>}
              {!activityLoading && activity.items.map((row) => (
                <tr key={`${row.driverId}-${row.dateKey}`} className="border-b border-gray-50">
                  <td className="py-2 pr-3 text-gray-700">{dateText(row.dateKey)}</td>
                  <td className="py-2 pr-3"><span className="font-semibold text-gray-900">{row.name || 'Driver'}</span> <span className="text-xs text-gray-500">{row.phone}</span></td>
                  <td className="py-2 pr-3 font-semibold text-gray-900">{hoursText(row.activeMinutes)}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">{row.firstActiveAt ? new Date(row.firstActiveAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''} – {row.lastActiveAt ? new Date(row.lastActiveAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}</td>
                  <td className={`py-2 text-xs ${row.mockedPings ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{row.mockedPings || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activity.total > activity.items.length && <p className="text-xs text-gray-500 pt-2">Showing the top {activity.items.length} of {activity.total}. Narrow the dates to see more.</p>}
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl my-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{editing.id ? 'Edit challenge' : 'New challenge'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Banner</label>
                {editing.bannerImage && <img src={editing.bannerImage} alt="" className="w-full rounded-lg border border-gray-100 mb-2 max-h-48 object-cover" />}
                <label className="inline-flex items-center gap-2 text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {editing.bannerImage ? 'Replace banner' : 'Upload banner'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadBanner(e.target.files?.[0])} />
                </label>
                <p className="text-xs text-gray-400 mt-1">Shown on the driver app home screen. Wide image, about 2:1.</p>
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input className={inputClass} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Short description</label>
                <input className={inputClass} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start date</label>
                  <input type="date" className={inputClass} value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>End date</label>
                  <input type="date" className={inputClass} value={editing.endDate} min={editing.startDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Days needed</label>
                  <input type="number" min="1" className={inputClass} value={editing.requiredDays} onChange={(e) => setEditing({ ...editing, requiredDays: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Active hours / day</label>
                  <input type="number" min="0" max="24" step="0.5" className={inputClass} value={editing.minActiveHours} onChange={(e) => setEditing({ ...editing, minActiveHours: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Trips / day</label>
                  <input type="number" min="0" className={inputClass} value={editing.minTrips} onChange={(e) => setEditing({ ...editing, minTrips: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Vehicle types</label>
                <ChipPicker options={vehicleTypes} selected={editing.vehicleTypeIds} onChange={(ids) => setEditing({ ...editing, vehicleTypeIds: ids })} emptyLabel="All vehicles" />
              </div>
              <div>
                <label className={labelClass}>Cities</label>
                <ChipPicker options={locations} selected={editing.serviceLocationIds} onChange={(ids) => setEditing({ ...editing, serviceLocationIds: ids })} emptyLabel="All cities" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Reward</label>
                  <input className={inputClass} value={editing.rewardLabel} placeholder="Full tank CNG" onChange={(e) => setEditing({ ...editing, rewardLabel: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Wallet credit (Rs)</label>
                  <input type="number" min="0" className={inputClass} value={editing.rewardAmount} placeholder="e.g. 800" onChange={(e) => setEditing({ ...editing, rewardAmount: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Pay automatically when the driver claims</p>
                  <p className="text-xs text-gray-500">Off: each claim waits for you to press Pay on the leaderboard.</p>
                </div>
                <Toggle value={editing.autoPay} onChange={(value) => setEditing({ ...editing, autoPay: value })} />
              </div>
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Show in the driver app</p>
                  <p className="text-xs text-gray-500">Off hides the challenge; counted days are kept.</p>
                </div>
                <Toggle value={editing.active} onChange={(value) => setEditing({ ...editing, active: value })} />
              </div>
              <div>
                <label className={labelClass}>Rules (one per line)</label>
                <textarea rows={4} className={inputClass} value={editing.terms} onChange={(e) => setEditing({ ...editing, terms: e.target.value })} />
              </div>
              {editing.vehicleTypeIds.length > 0 || editing.serviceLocationIds.length > 0 ? (
                <p className="text-xs text-gray-500">
                  For {editing.vehicleTypeIds.length ? editing.vehicleTypeIds.map((id) => optionName(vehicleTypes, id)).join(', ') : 'all vehicles'} in {editing.serviceLocationIds.length ? editing.serviceLocationIds.map((id) => optionName(locations, id)).join(', ') : 'all cities'}.
                </p>
              ) : null}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button type="button" disabled={saving || uploading} onClick={saveChallenge} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverChallenges;
