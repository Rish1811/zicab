import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { TXN_LABEL, topUpVendorWallet } from './busVendorPay';

const money = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(value || 0));
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/// The Wallet tab: balance, add money, and every movement.
const BusVendorWalletPanel = ({ wallet, onChange }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const addMoney = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) return toast.error('Enter an amount');
    setBusy(true);
    try {
      onChange(await topUpVendorWallet(value));
      setAmount('');
      toast.success(`${money(value)} added to your wallet`);
    } catch (error) {
      if (!error?.dismissed) toast.error(error?.message || 'Top-up failed');
    } finally {
      setBusy(false);
    }
  };

  const transactions = wallet?.transactions || [];
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-500">Wallet balance</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{money(wallet?.balance)}</p>
        <p className="mt-2 text-sm text-slate-500">
          {wallet?.prepaidRequired
            ? `Each seat you sell at the counter is paid from this wallet (or paid online) before it is booked. Seats stay held for ${wallet?.holdMinutes || 10} minutes while you pay.`
            : 'Counter seats can be paid from this wallet. ZI CAB may switch on paying first for every counter seat.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[500, 1000, 2000, 5000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(String(value))}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${Number(amount) === value ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {money(value)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            min="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
            className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 text-sm font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
          <button
            type="button"
            onClick={addMoney}
            disabled={busy}
            className="h-12 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
          >
            {busy ? 'Opening...' : 'Add money'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">History</h3>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {transactions.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{TXN_LABEL[item.type] || item.type}</p>
                  <p className="text-xs text-slate-500">
                    {[item.bookingCode, item.seatLabels?.length ? `Seats ${item.seatLabels.join(', ')}` : '', item.note && !TXN_LABEL[item.type]?.includes(item.note) ? item.note : '', when(item.createdAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold tabular-nums ${item.amount >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {item.amount >= 0 ? '+' : '-'}{money(Math.abs(item.amount))}
                  </p>
                  {item.balanceAfter !== null ? <p className="text-xs text-slate-400">Balance {money(item.balanceAfter)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default BusVendorWalletPanel;
