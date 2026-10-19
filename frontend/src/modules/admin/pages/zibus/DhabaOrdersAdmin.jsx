import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { zibusAdminService } from '../../services/zibusAdminService';

const STATUSES = ['', 'placed', 'notified', 'accepted', 'preparing', 'ready', 'served', 'cancelled', 'expired', 'awaiting_payment'];
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const DhabaOrdersAdmin = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await zibusAdminService.listDhabaOrders({ status: status || undefined, date: date || undefined });
      setOrders(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(error?.message || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [status, date]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = orders
    .filter((order) => !['cancelled', 'expired', 'awaiting_payment'].includes(order.status))
    .reduce((sum, order) => ({ gross: sum.gross + order.amount, commission: sum.commission + (order.commissionAmount || 0) }), { gross: 0, commission: 0 });

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-orange-500">ZI Bus · Food</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Dhaba Food Orders</h1>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">
              {STATUSES.map((item) => <option key={item} value={item}>{item ? item.replace('_', ' ') : 'All'}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Travel date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" />
          </label>
          <button type="button" onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700">
            <RefreshCw size={12} /> Refresh
          </button>
          <div className="ml-auto flex gap-3">
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Food sales</p>
              <p className="text-lg font-black text-slate-900">{money(totals.gross)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white px-5 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ZI Bus commission</p>
              <p className="text-lg font-black text-emerald-600">{money(totals.commission)}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Dhaba</th>
                  <th className="px-4 py-3">Bus / passenger</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">No orders match.</td></tr>
                ) : orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-900">{order.orderCode}</p>
                      <p className="text-xs font-semibold text-slate-500">PNR {order.pnr || '—'}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{order.dhabaName}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{order.bus?.busName} {order.bus?.registrationNumber}</p>
                      <p className="text-xs text-slate-500">{order.passengerName} · {order.passengerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ')}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{when(order.expectedArrivalAt)}</td>
                    <td className="px-4 py-3 font-black text-slate-900">
                      {money(order.amount)}
                      {order.refund?.status ? <p className="text-[10px] font-bold text-amber-600">refund {order.refund.status}</p> : null}
                    </td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{order.status.replace('_', ' ')}</span></td>
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

export default DhabaOrdersAdmin;
