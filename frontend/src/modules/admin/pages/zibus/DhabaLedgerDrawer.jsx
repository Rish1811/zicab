import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { zibusAdminService } from '../../services/zibusAdminService';
import { rupees } from './dhabaFormat';

const METHOD_LABELS = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', other: 'Other' };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const Stat = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-3">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 text-lg font-black ${tone}`}>{value}</p>
  </div>
);

/// One dhaba's earnings, commission and payouts, with a form to record a
/// payout that was sent outside the app (bank transfer, UPI, cash).
const DhabaLedgerDrawer = ({ dhabaId, onClose, onChanged }) => {
  const [ledger, setLedger] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', method: 'bank_transfer', reference: '', periodTo: today(), note: '', allowAdvance: false });

  const load = useCallback(
    () => zibusAdminService.dhabaLedger(dhabaId).then(setLedger).catch((error) => toast.error(error?.message || 'Could not load payouts')),
    [dhabaId],
  );
  useEffect(() => { load(); }, [load]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const record = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await zibusAdminService.recordDhabaPayout(dhabaId, { ...form, amount: Number(form.amount) });
      toast.success('Payout recorded');
      setForm((current) => ({ ...current, amount: '', reference: '', note: '', allowAdvance: false }));
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || 'Could not record payout');
    } finally {
      setSaving(false);
    }
  };

  const removePayout = async (payout) => {
    if (!window.confirm(`Delete the ${rupees(payout.amount)} payout? Only do this to correct a mistake.`)) return;
    try {
      await zibusAdminService.deleteDhabaPayout(dhabaId, payout.id);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error?.message || 'Could not delete payout');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-2xl space-y-5 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Payouts & commission</p>
            <h2 className="text-xl font-black text-slate-900">{ledger?.dhaba?.name || 'Dhaba'}</h2>
            {ledger?.dhaba ? (
              <p className="text-xs font-semibold text-slate-500">Commission {ledger.dhaba.commissionPercent}% · {ledger.dhaba.phone}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>

        {!ledger ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Balance due" value={rupees(ledger.balance)} tone={ledger.balance > 0 ? 'text-emerald-600' : 'text-slate-900'} />
              <Stat label="Earned (net)" value={rupees(ledger.earned)} />
              <Stat label="Paid out" value={rupees(ledger.paid)} />
              <Stat label="Food sales" value={rupees(ledger.gross)} />
              <Stat label="Commission" value={rupees(ledger.commission)} tone="text-blue-700" />
              <Stat label="Not served yet" value={`${rupees(ledger.openAmount)} · ${ledger.openOrders}`} />
            </div>

            <form onSubmit={record} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
              <p className="text-sm font-black text-slate-900">Record a payout</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputClass} type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder={`Amount (due ${rupees(ledger.balance)})`} required aria-label="Amount" />
                <select className={inputClass} value={form.method} onChange={set('method')} aria-label="Method">
                  {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input className={inputClass} value={form.reference} onChange={set('reference')} placeholder="UTR / transaction ref" maxLength={120} aria-label="Reference" />
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Covers orders up to</span>
                  <input className={inputClass} type="date" value={form.periodTo} onChange={set('periodTo')} />
                </label>
                <input className={`${inputClass} sm:col-span-2`} value={form.note} onChange={set('note')} placeholder="Note (optional)" maxLength={300} aria-label="Note" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input type="checkbox" checked={form.allowAdvance} onChange={set('allowAdvance')} /> Advance (more than balance due)
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={ledger.balance <= 0} onClick={() => setForm((current) => ({ ...current, amount: String(ledger.balance) }))} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 disabled:opacity-40">
                    Pay full balance
                  </button>
                  <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : null} Record payout
                  </button>
                </div>
              </div>
            </form>

            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              <p className="text-sm font-black text-slate-900">By month (served orders)</p>
              {ledger.months.length ? (
                <table className="mt-3 w-full text-left text-sm">
                  <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <tr><th className="py-2">Month</th><th>Orders</th><th>Sales</th><th>Commission</th><th>Net</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {ledger.months.map((row) => (
                      <tr key={row.month}>
                        <td className="py-2 font-black text-slate-900">{row.month}</td>
                        <td>{row.orders}</td>
                        <td>{rupees(row.gross)}</td>
                        <td className="text-blue-700">{rupees(row.commission)}</td>
                        <td>{rupees(row.earned)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-sm font-medium text-slate-500">No served orders yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              <p className="text-sm font-black text-slate-900">Payout history</p>
              {ledger.payouts.length ? (
                <ul className="mt-2 divide-y divide-slate-100">
                  {ledger.payouts.map((payout) => (
                    <li key={payout.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{rupees(payout.amount)} <span className="font-semibold text-slate-500">· {METHOD_LABELS[payout.method] || payout.method}</span></p>
                        <p className="text-xs font-medium text-slate-500">
                          {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('en-IN') : ''}
                          {payout.reference ? ` · Ref ${payout.reference}` : ''}
                          {payout.periodTo ? ` · up to ${payout.periodTo}` : ''}
                          {payout.note ? ` · ${payout.note}` : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => removePayout(payout)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label="Delete payout"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm font-medium text-slate-500">No payouts recorded yet.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default DhabaLedgerDrawer;
