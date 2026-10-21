import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { zibusAdminService } from '../../services/zibusAdminService';
import { rupees } from './dhabaFormat';

const Total = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`mt-1 text-xl font-black ${tone}`}>{value}</p>
  </div>
);

/// Earnings, commission and balance due for every dhaba, highest balance
/// first. `refreshKey` reloads it after a payout is recorded elsewhere.
const DhabaPayoutsOverview = ({ refreshKey, onOpen }) => {
  const [report, setReport] = useState(null);

  useEffect(() => {
    let alive = true;
    zibusAdminService
      .dhabaPayouts()
      .then((data) => { if (alive) setReport(data); })
      .catch((error) => toast.error(error?.message || 'Could not load payouts'));
    return () => { alive = false; };
  }, [refreshKey]);

  if (!report) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>;
  const { totals, results } = report;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Total label="Food sales (served)" value={rupees(totals.gross)} />
        <Total label="ZI Bus commission" value={rupees(totals.commission)} tone="text-blue-700" />
        <Total label="Owed to dhabas" value={rupees(totals.earned)} />
        <Total label="Paid out" value={rupees(totals.paid)} />
        <Total label="Balance due" value={rupees(totals.balance)} tone="text-emerald-600" />
      </div>
      <p className="text-xs font-medium text-slate-500">
        Earnings count once a dhaba marks an order served. {rupees(totals.openAmount)} more is in orders not served yet.
      </p>

      <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-5 py-3">Dhaba</th>
              <th className="px-5 py-3">Orders</th>
              <th className="px-5 py-3">Sales</th>
              <th className="px-5 py-3">Commission</th>
              <th className="px-5 py-3">Paid</th>
              <th className="px-5 py-3">Balance due</th>
              <th className="px-5 py-3">Last payout</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((row) => (
              <tr key={row.dhabaId}>
                <td className="px-5 py-4">
                  <p className="font-black text-slate-900">{row.name}</p>
                  <p className="text-xs font-semibold text-slate-500">{[row.highway, row.city].filter(Boolean).join(' · ')} · {row.commissionPercent}%</p>
                </td>
                <td className="px-5 py-4 font-semibold text-slate-700">{row.servedOrders}{row.openOrders ? <span className="text-slate-400"> +{row.openOrders} open</span> : null}</td>
                <td className="px-5 py-4 font-semibold text-slate-700">{rupees(row.gross)}</td>
                <td className="px-5 py-4 font-semibold text-blue-700">{rupees(row.commission)}</td>
                <td className="px-5 py-4 font-semibold text-slate-700">{rupees(row.paid)}</td>
                <td className={`px-5 py-4 font-black ${row.balance > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{rupees(row.balance)}</td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-500">{row.lastPayoutAt ? new Date(row.lastPayoutAt).toLocaleDateString('en-IN') : 'Never'}</td>
                <td className="px-5 py-4 text-right">
                  <button type="button" onClick={() => onOpen(row.dhabaId)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white">
                    {row.balance > 0 ? 'Pay' : 'Details'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!results.length ? <p className="p-10 text-center text-sm font-bold text-slate-500">No approved dhabas yet.</p> : null}
      </div>
    </div>
  );
};

export default DhabaPayoutsOverview;
