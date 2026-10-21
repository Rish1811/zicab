import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { dhabaApi } from '../services/dhabaApi';

const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const METHOD_LABELS = { bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash', other: 'Other' };
const monthLabel = (month) => {
  const [year, m] = String(month).split('-').map(Number);
  return year && m ? new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : month;
};

const Stat = ({ label, value, tone = 'text-slate-900', note }) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
    {note ? <p className="mt-0.5 text-[11px] font-medium text-slate-400">{note}</p> : null}
  </div>
);

/// What the dhaba has earned on served orders, what ZI Bus has paid out and
/// what is still due.
const DhabaEarnings = () => {
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dhabaApi.ledger().then(setLedger).catch((err) => setError(err?.message || 'Could not load earnings'));
  }, []);

  if (error) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-600">{error}</p>;
  if (!ledger) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance due to you" value={rupees(ledger.balance)} tone="text-emerald-600" note="Earned minus paid out" />
        <Stat label="Earned" value={rupees(ledger.earned)} note={`${ledger.servedOrders} served orders`} />
        <Stat label="Paid out" value={rupees(ledger.paid)} note={`${ledger.payoutCount} payouts`} />
        <Stat label="Upcoming orders" value={rupees(ledger.openAmount)} note={`${ledger.openOrders} not served yet`} />
      </div>
      <p className="text-xs font-medium text-slate-500">
        Earnings are the food amount of served orders less the ZI Bus commission ({rupees(ledger.commission)} so far). Orders count once you mark them served.
      </p>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">By month</h2>
        {ledger.months.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                <tr><th className="py-2">Month</th><th>Orders</th><th>Food sales</th><th>Commission</th><th>Earned</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {ledger.months.map((row) => (
                  <tr key={row.month}>
                    <td className="py-2.5 font-black text-slate-900">{monthLabel(row.month)}</td>
                    <td>{row.orders}</td>
                    <td>{rupees(row.gross)}</td>
                    <td className="text-slate-500">{rupees(row.commission)}</td>
                    <td className="text-emerald-700">{rupees(row.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm font-medium text-slate-500">No served orders yet.</p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-slate-900">Payouts received</h2>
        {ledger.payouts.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {ledger.payouts.map((payout) => (
              <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{rupees(payout.amount)}</p>
                  <p className="text-xs font-medium text-slate-500">
                    {METHOD_LABELS[payout.method] || payout.method}
                    {payout.reference ? ` · Ref ${payout.reference}` : ''}
                    {payout.periodTo ? ` · orders up to ${payout.periodTo}` : ''}
                  </p>
                </div>
                <p className="text-xs font-bold text-slate-400">{payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('en-IN') : ''}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-medium text-slate-500">No payouts yet.</p>
        )}
      </section>
    </div>
  );
};

export default DhabaEarnings;
