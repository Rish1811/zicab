import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Copy, IndianRupee, Loader2, Pencil, Plus, Search, Trash2, UtensilsCrossed, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminBuses } from '../../services/busService';
import { zibusAdminService } from '../../services/zibusAdminService';
import DhabaApplications from './DhabaApplications';
import DhabaLedgerDrawer from './DhabaLedgerDrawer';
import DhabaMenuDrawer from './DhabaMenuDrawer';
import DhabaPayoutsOverview from './DhabaPayoutsOverview';

const EMPTY = {
  name: '',
  ownerName: '',
  phone: '',
  email: '',
  password: '',
  address: '',
  city: '',
  highway: '',
  fssaiNumber: '',
  location: { lat: '', lng: '' },
  commissionPercent: 10,
  active: true,
  acceptingOrders: true,
  busStops: [],
};

const TAB_PATHS = {
  partners: '/admin/dhabas',
  pending: '/admin/dhabas/pending',
  rejected: '/admin/dhabas/rejected',
  payouts: '/admin/dhabas/payouts',
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const Label = ({ children }) => <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{children}</span>;

const DhabaForm = ({ initial, buses, onClose, onSaved }) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    password: '',
    location: { lat: initial?.location?.lat ?? '', lng: initial?.location?.lng ?? '' },
    busStops: initial?.busStops || [],
  }));
  const [saving, setSaving] = useState(false);
  const isNew = !initial?.id;
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const updateStop = (index, patch) =>
    setForm((current) => ({
      ...current,
      busStops: current.busStops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)),
    }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        commissionPercent: Number(form.commissionPercent),
        location: form.location.lat !== '' && form.location.lng !== ''
          ? { lat: Number(form.location.lat), lng: Number(form.location.lng) }
          : null,
        busStops: form.busStops
          .filter((stop) => stop.busServiceId)
          .map((stop) => ({
            busServiceId: stop.busServiceId,
            scheduleId: stop.scheduleId || '',
            minutesAfterDeparture: Number(stop.minutesAfterDeparture || 0),
            haltMinutes: Number(stop.haltMinutes ?? 20),
          })),
      };
      if (!payload.password) delete payload.password;
      const saved = isNew
        ? await zibusAdminService.createDhaba(payload)
        : await zibusAdminService.updateDhaba(initial.id, payload);
      toast.success(isNew ? 'Dhaba partner added' : 'Dhaba updated');
      onSaved(saved);
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <form onSubmit={submit} className="h-full w-full max-w-2xl space-y-5 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{isNew ? 'Add dhaba partner' : `Edit ${initial.name}`}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 sm:grid-cols-2">
          <label className="space-y-1"><Label>Dhaba name</Label><input className={inputClass} value={form.name} onChange={set('name')} required /></label>
          <label className="space-y-1"><Label>Owner name</Label><input className={inputClass} value={form.ownerName} onChange={set('ownerName')} /></label>
          <label className="space-y-1"><Label>Login mobile</Label><input className={inputClass} value={form.phone} onChange={set('phone')} required inputMode="numeric" /></label>
          <label className="space-y-1">
            <Label>{isNew ? 'Password' : 'New password (optional)'}</Label>
            <input className={inputClass} type="text" value={form.password} onChange={set('password')} required={isNew} minLength={6} autoComplete="new-password" />
          </label>
          <label className="space-y-1"><Label>Email</Label><input className={inputClass} type="email" value={form.email} onChange={set('email')} /></label>
          <label className="space-y-1"><Label>Commission %</Label><input className={inputClass} type="number" min="0" max="100" step="0.5" value={form.commissionPercent} onChange={set('commissionPercent')} /></label>
          <label className="space-y-1 sm:col-span-2"><Label>Address</Label><input className={inputClass} value={form.address} onChange={set('address')} /></label>
          <label className="space-y-1"><Label>City / town</Label><input className={inputClass} value={form.city} onChange={set('city')} /></label>
          <label className="space-y-1"><Label>Highway</Label><input className={inputClass} value={form.highway} onChange={set('highway')} placeholder="e.g. NH 48" /></label>
          <label className="space-y-1 sm:col-span-2"><Label>FSSAI licence (14 digits)</Label><input className={inputClass} value={form.fssaiNumber} onChange={set('fssaiNumber')} inputMode="numeric" maxLength={17} /></label>
          <label className="space-y-1">
            <Label>Latitude</Label>
            <input className={inputClass} value={form.location.lat} onChange={(e) => setForm((c) => ({ ...c, location: { ...c.location, lat: e.target.value } }))} placeholder="Used for live ETA" />
          </label>
          <label className="space-y-1">
            <Label>Longitude</Label>
            <input className={inputClass} value={form.location.lng} onChange={(e) => setForm((c) => ({ ...c, location: { ...c.location, lng: e.target.value } }))} />
          </label>
          {isNew || (initial.approvalStatus || 'approved') === 'approved' ? (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.active} onChange={set('active')} /> Account active</label>
          ) : (
            <p className="text-xs font-bold text-amber-700">Registration {initial.approvalStatus}. Approve it to activate.</p>
          )}
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.acceptingOrders} onChange={set('acceptingOrders')} /> Taking orders</label>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">Buses that halt here</p>
              <p className="text-xs font-semibold text-slate-500">
                Minutes after departure sets the expected arrival. The dhaba is alerted 30 minutes before it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((c) => ({ ...c, busStops: [...c.busStops, { busServiceId: '', scheduleId: '', minutesAfterDeparture: 180, haltMinutes: 20 }] }))}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white"
            >
              <Plus size={12} /> Link bus
            </button>
          </div>
          {form.busStops.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">
              Not linked to any bus yet, so passengers can&apos;t order from this dhaba.
            </p>
          ) : null}
          {form.busStops.map((stop, index) => {
            const bus = buses.find((item) => String(item.id) === String(stop.busServiceId));
            return (
              <div key={stop.id || index} className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                <select className={inputClass} value={stop.busServiceId} onChange={(e) => updateStop(index, { busServiceId: e.target.value, scheduleId: '' })} required>
                  <option value="">Select bus</option>
                  {buses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.busName} · {item.route?.originCity} → {item.route?.destinationCity}
                    </option>
                  ))}
                </select>
                <select className={inputClass} value={stop.scheduleId} onChange={(e) => updateStop(index, { scheduleId: e.target.value })}>
                  <option value="">All schedules</option>
                  {(bus?.schedules || []).map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.label || 'Departs'} {schedule.departureTime}
                    </option>
                  ))}
                </select>
                <input className={inputClass} type="number" min="0" value={stop.minutesAfterDeparture} onChange={(e) => updateStop(index, { minutesAfterDeparture: e.target.value })} title="Minutes after departure" aria-label="Minutes after departure" />
                <input className={inputClass} type="number" min="0" value={stop.haltMinutes} onChange={(e) => updateStop(index, { haltMinutes: e.target.value })} title="Halt minutes" aria-label="Halt minutes" />
                <button
                  type="button"
                  onClick={() => setForm((c) => ({ ...c, busStops: c.busStops.filter((_, i) => i !== index) }))}
                  className="rounded-xl p-2 text-rose-500 hover:bg-rose-50"
                  aria-label="Remove link"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
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

const DhabaPartners = () => {
  const [dhabas, setDhabas] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const tab = Object.keys(TAB_PATHS).find((key) => TAB_PATHS[key] === location.pathname.replace(/\/+$/, '')) || 'partners';
  const setTab = (key) => navigate(TAB_PATHS[key]);
  const [menuFor, setMenuFor] = useState(null);
  const [ledgerFor, setLedgerFor] = useState(null);
  const [payoutsKey, setPayoutsKey] = useState(0);

  useEffect(() => {
    Promise.all([zibusAdminService.listDhabas(), getAdminBuses().catch(() => [])])
      .then(([list, busList]) => {
        setDhabas(Array.isArray(list) ? list : []);
        setBuses(Array.isArray(busList) ? busList : []);
      })
      .catch((error) => toast.error(error?.message || 'Could not load dhabas'))
      .finally(() => setLoading(false));
  }, []);

  const byStatus = useMemo(() => {
    const groups = { approved: [], pending: [], rejected: [] };
    dhabas.forEach((item) => groups[item.approvalStatus || 'approved']?.push(item));
    return groups;
  }, [dhabas]);

  const filtered = useMemo(() => {
    const list = byStatus[tab === 'partners' ? 'approved' : tab] || [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((item) =>
      [item.name, item.phone, item.city, item.highway].some((value) => String(value || '').toLowerCase().includes(needle)),
    );
  }, [byStatus, search, tab]);

  const upsert = (saved) =>
    setDhabas((current) =>
      current.some((item) => item.id === saved.id)
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current],
    );

  const registerLink = `${window.location.origin}/dhaba/register`;
  const copyRegisterLink = async () => {
    try {
      await navigator.clipboard.writeText(registerLink);
      toast.success('Registration link copied');
    } catch {
      toast.error(registerLink);
    }
  };

  const tabs = [
    { key: 'partners', label: 'Partners', count: byStatus.approved.length },
    { key: 'pending', label: 'Pending approval', count: byStatus.pending.length },
    { key: 'rejected', label: 'Rejected', count: byStatus.rejected.length },
    { key: 'payouts', label: 'Payouts' },
  ];

  const busName = (id) => buses.find((bus) => String(bus.id) === String(id))?.busName || 'Bus';

  const remove = async (dhaba) => {
    if (!window.confirm(`Delete ${dhaba.name}? This cannot be undone.`)) return;
    try {
      await zibusAdminService.deleteDhaba(dhaba.id);
      setDhabas((current) => current.filter((item) => item.id !== dhaba.id));
    } catch (error) {
      toast.error(error?.message || 'Could not delete');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-500">ZI Bus · Food</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Dhaba Partners</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Highway dhabas passengers can pre-order from. Dhabas apply at <span className="font-black text-slate-700">/dhaba/register</span>, you approve them here, and they sign in at <span className="font-black text-slate-700">/dhaba/login</span> to manage their menu and orders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copyRegisterLink} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700">
              <Copy size={14} /> Copy registration link
            </button>
            <Link to="/admin/dhabas/orders" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700">
              Food orders
            </Link>
            <button type="button" onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">
              <Plus size={14} /> Add dhaba
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${tab === item.key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {item.label}
              {item.count !== undefined ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.key === 'pending' && item.count ? 'bg-amber-400 text-slate-900' : tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'payouts' ? (
          <DhabaPayoutsOverview refreshKey={payoutsKey} onOpen={(id) => setLedgerFor(id)} />
        ) : (
        <>
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Search size={16} className="text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, city or highway" className="w-full bg-transparent text-sm font-semibold focus:outline-none" />
        </label>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : tab !== 'partners' ? (
          <DhabaApplications
            applications={filtered}
            emptyText={tab === 'pending' ? 'No registrations waiting for review.' : 'No rejected registrations.'}
            onUpdated={upsert}
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <UtensilsCrossed className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-900">No dhaba partners yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-3">Dhaba</th>
                  <th className="px-5 py-3">Login</th>
                  <th className="px-5 py-3">Buses linked</th>
                  <th className="px-5 py-3">Menu</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((dhaba) => (
                  <tr key={dhaba.id}>
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{dhaba.name}</p>
                      <p className="text-xs font-semibold text-slate-500">{[dhaba.highway, dhaba.city].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{dhaba.phone}</td>
                    <td className="px-5 py-4 text-xs font-semibold text-slate-600">
                      {dhaba.busStops?.length
                        ? dhaba.busStops.map((stop) => `${busName(stop.busServiceId)} (+${stop.minutesAfterDeparture}m)`).join(', ')
                        : <span className="text-rose-500">None</span>}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{dhaba.menu?.length || 0} items</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${!dhaba.active ? 'bg-slate-100 text-slate-500' : dhaba.acceptingOrders ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {!dhaba.active ? 'Inactive' : dhaba.acceptingOrders ? 'Live' : 'Paused'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <button type="button" onClick={() => setMenuFor(dhaba)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Menu of ${dhaba.name}`} title="Menu"><BookOpen size={14} /></button>
                      <button type="button" onClick={() => setLedgerFor(dhaba.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Payouts of ${dhaba.name}`} title="Payouts and commission"><IndianRupee size={14} /></button>
                      <button type="button" onClick={() => setEditing(dhaba)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${dhaba.name}`}><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(dhaba)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label={`Delete ${dhaba.name}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>

      {menuFor ? (
        <DhabaMenuDrawer
          dhaba={menuFor}
          onClose={() => setMenuFor(null)}
          onCountChange={(count) =>
            setDhabas((current) => current.map((item) => (item.id === menuFor.id ? { ...item, menu: Array.from({ length: count }) } : item)))}
        />
      ) : null}

      {ledgerFor ? (
        <DhabaLedgerDrawer dhabaId={ledgerFor} onClose={() => setLedgerFor(null)} onChanged={() => setPayoutsKey((key) => key + 1)} />
      ) : null}

      {editing ? (
        <DhabaForm
          initial={editing}
          buses={buses}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            upsert(saved);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
};

export default DhabaPartners;
