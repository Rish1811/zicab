import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminBuses } from '../../services/busService';
import { zibusAdminService } from '../../services/zibusAdminService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400';
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const OperatorForm = ({ initial, buses, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: initial?.name || '',
    legalName: initial?.legalName || '',
    gstin: initial?.gstin || '',
    contactName: initial?.contactName || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    address: initial?.address || '',
    city: initial?.city || '',
    commissionPercent: initial?.commissionPercent ?? 10,
    status: initial?.status || 'active',
    notes: initial?.notes || '',
  });
  const [busIds, setBusIds] = useState(() => (initial?.buses || []).map((bus) => bus.id));
  const [owners, setOwners] = useState(initial?.owners || []);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerResults, setOwnerResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    const term = ownerSearch.trim();
    if (term.length < 2) {
      setOwnerResults([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      zibusAdminService.searchOwners(term).then((list) => setOwnerResults(Array.isArray(list) ? list : [])).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [ownerSearch]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, commissionPercent: Number(form.commissionPercent), ownerIds: owners.map((owner) => owner.id), busServiceIds: busIds };
      const saved = initial?.id
        ? await zibusAdminService.updateOperator(initial.id, payload)
        : await zibusAdminService.createOperator(payload);
      toast.success('Operator saved');
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
          <h2 className="text-xl font-black text-slate-900">{initial?.id ? `Edit ${initial.name}` : 'Add bus operator'}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 sm:grid-cols-2">
          <label className="space-y-1"><span className={labelClass}>Brand name (shown to passengers)</span><input className={inputClass} value={form.name} onChange={set('name')} required /></label>
          <label className="space-y-1"><span className={labelClass}>Legal name</span><input className={inputClass} value={form.legalName} onChange={set('legalName')} /></label>
          <label className="space-y-1"><span className={labelClass}>GSTIN</span><input className={inputClass} value={form.gstin} onChange={set('gstin')} /></label>
          <label className="space-y-1"><span className={labelClass}>Default commission %</span><input className={inputClass} type="number" min="0" max="100" step="0.5" value={form.commissionPercent} onChange={set('commissionPercent')} /></label>
          <label className="space-y-1"><span className={labelClass}>Contact person</span><input className={inputClass} value={form.contactName} onChange={set('contactName')} /></label>
          <label className="space-y-1"><span className={labelClass}>Phone</span><input className={inputClass} value={form.phone} onChange={set('phone')} /></label>
          <label className="space-y-1"><span className={labelClass}>Email</span><input className={inputClass} type="email" value={form.email} onChange={set('email')} /></label>
          <label className="space-y-1"><span className={labelClass}>City</span><input className={inputClass} value={form.city} onChange={set('city')} /></label>
          <label className="space-y-1 sm:col-span-2"><span className={labelClass}>Address</span><input className={inputClass} value={form.address} onChange={set('address')} /></label>
          <label className="space-y-1">
            <span className={labelClass}>Status</span>
            <select className={inputClass} value={form.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
          <div>
            <p className="text-sm font-black text-slate-900">Login accounts</p>
            <p className="text-xs font-semibold text-slate-500">Owner accounts that manage this company&apos;s buses, bookings and earnings.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {owners.map((owner) => (
              <span key={owner.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                {owner.name} {owner.phone ? `· ${owner.phone}` : ''}
                <button type="button" onClick={() => setOwners((current) => current.filter((item) => item.id !== owner.id))} aria-label={`Remove ${owner.name}`}><X size={12} /></button>
              </span>
            ))}
            {owners.length === 0 ? <span className="text-xs font-semibold text-slate-400">No login linked yet.</span> : null}
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Search size={14} className="text-slate-400" />
            <input value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} placeholder="Find owner by name, phone or email" className="w-full bg-transparent text-sm font-semibold focus:outline-none" />
          </label>
          {ownerResults.length ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100">
              {ownerResults.filter((owner) => !owners.some((item) => item.id === owner.id)).map((owner) => (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => { setOwners((current) => [...current, owner]); setOwnerSearch(''); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span className="font-bold text-slate-800">{owner.name} {owner.company ? `· ${owner.company}` : ''}</span>
                  <span className="text-xs text-slate-500">{owner.phone}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-5">
          <p className="text-sm font-black text-slate-900">Buses run by this company</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {buses.map((bus) => (
              <label key={bus.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={busIds.includes(String(bus.id))}
                  onChange={(e) => setBusIds((current) => (e.target.checked ? [...current, String(bus.id)] : current.filter((id) => id !== String(bus.id))))}
                />
                {bus.busName} · {bus.registrationNumber || 'no reg'} · {bus.route?.originCity} → {bus.route?.destinationCity}
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

const ReportDrawer = ({ operator, onClose }) => {
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA'));
  const [to, setTo] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    zibusAdminService
      .operatorReport(operator.id, { from, to })
      .then(setReport)
      .catch((error) => toast.error(error?.message || 'Could not load report'))
      .finally(() => setLoading(false));
  }, [operator.id, from, to]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-3xl space-y-5 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">{operator.name} · settlement</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1"><span className={labelClass}>From travel date</span><input type="date" className={inputClass} value={from} onChange={(e) => { setLoading(true); setFrom(e.target.value); }} /></label>
          <label className="space-y-1"><span className={labelClass}>To</span><input type="date" className={inputClass} value={to} onChange={(e) => { setLoading(true); setTo(e.target.value); }} /></label>
        </div>
        {loading || !report ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Seats sold (all sources)', report.totals.seats],
                ['ZI Bus sales', money(report.totals.zibusGross)],
                ['ZI Bus commission', money(report.totals.commission)],
                ['Payable to operator', money(report.totals.payout)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className={labelClass}>{label}</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr><th className="px-4 py-3">Bus</th><th className="px-4 py-3">Seats by source</th><th className="px-4 py-3">ZI Bus sales</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Payout</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.buses.map((bus) => (
                    <tr key={bus.busServiceId}>
                      <td className="px-4 py-3"><p className="font-black text-slate-900">{bus.busName}</p><p className="text-xs text-slate-500">{bus.registrationNumber}</p></td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                        {bus.seatsBySource.length ? bus.seatsBySource.map((row) => `${row.source === 'user' ? 'ZI Bus app' : row.source}: ${row.seats}`).join(' · ') : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">{money(bus.zibusGross)}</td>
                      <td className="px-4 py-3 font-semibold">{money(bus.commission)} <span className="text-xs text-slate-400">({bus.commissionPercent}%)</span></td>
                      <td className="px-4 py-3 font-black text-emerald-600">{money(bus.payout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              Commission applies to tickets sold in the ZI Bus app. A rate set on a bus in Bus Commission overrides the company default.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const BusOperators = () => {
  const [operators, setOperators] = useState([]);
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [reportFor, setReportFor] = useState(null);

  const load = async () => {
    try {
      const [list, busList] = await Promise.all([zibusAdminService.listOperators(), getAdminBuses().catch(() => [])]);
      setOperators(Array.isArray(list) ? list : []);
      setBuses(Array.isArray(busList) ? busList : []);
    } catch (error) {
      toast.error(error?.message || 'Could not load operators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">ZI Bus · Operators</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Bus Operators</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Bus companies on ZI Bus: their logins, their buses, and what they are owed.
            </p>
          </div>
          <button type="button" onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">
            <Plus size={14} /> Add operator
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : operators.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <Building2 className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-black text-slate-900">No operators yet</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {operators.map((operator) => (
              <div key={operator.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-slate-900">{operator.name}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {[operator.legalName, operator.gstin, operator.city].filter(Boolean).join(' · ') || 'No company details yet'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${operator.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {operator.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{operator.buses?.length || 0}</p><p className="text-[10px] font-bold text-slate-400">buses</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{operator.owners?.length || 0}</p><p className="text-[10px] font-bold text-slate-400">logins</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-black text-slate-900">{operator.commissionPercent}%</p><p className="text-[10px] font-bold text-slate-400">commission</p></div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(operator)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><Pencil size={12} /> Edit</button>
                  <button type="button" onClick={() => setReportFor(operator)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">Settlement report</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <OperatorForm
          initial={editing}
          buses={buses}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
      {reportFor ? <ReportDrawer operator={reportFor} onClose={() => setReportFor(null)} /> : null}
    </div>
  );
};

export default BusOperators;
