import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';

/**
 * Bus vendors' prepaid wallets: who has how much, every movement, a manual
 * add/take with a reason, and the switch that makes counter seats paid first.
 */

const money = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(value || 0));
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const isOn = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
const TXN_LABEL = {
  top_up: 'Top-up',
  booking_charge: 'Seats booked',
  booking_refund: 'Cancelled seats',
  admin_credit: 'Added by admin',
  admin_debit: 'Taken by admin',
};
const payload = (response) => response?.data?.data ?? response?.data ?? response;

const VendorDrawer = ({ vendor, onClose, onChanged }) => {
  const [rows, setRows] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/admin/bus-vendor-wallets/${vendor.accountType}/${vendor.accountId}/transactions`);
      setRows(payload(response)?.results || []);
    } catch {
      setRows([]);
      toast.error('Could not load the history');
    }
  }, [vendor]);

  useEffect(() => {
    load();
  }, [load]);

  const adjust = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) return toast.error('Enter an amount, e.g. 500 or -200');
    if (!note.trim()) return toast.error('Write the reason');
    setSaving(true);
    try {
      const response = await api.post(`/admin/bus-vendor-wallets/${vendor.accountType}/${vendor.accountId}/adjust`, { amount: value, note });
      toast.success(`Balance now ${money(payload(response)?.balance)}`);
      setAmount('');
      setNote('');
      onChanged();
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Could not change the balance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{vendor.name}</h3>
            <p className="text-xs text-gray-500">{vendor.phone} · {vendor.accountType === 'owner' ? 'Fleet owner' : 'Bus operator'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-bold uppercase text-gray-500">Add or take money</p>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="500 to add, -200 to take"
            className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold outline-none focus:border-yellow-400 focus:bg-white"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            placeholder="Reason (required)"
            className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:bg-white"
          />
          <button type="button" onClick={adjust} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-500 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} Save
          </button>
        </div>

        <h4 className="mt-5 text-sm font-bold text-gray-900">History</h4>
        {rows === null ? (
          <Loader2 size={18} className="mt-3 animate-spin text-gray-400" />
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {rows.map((row) => (
              <li key={row.id} className="flex justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{TXN_LABEL[row.type] || row.type}</p>
                  <p className="text-xs text-gray-500">{[row.bookingCode, row.seatLabels?.join(', '), row.note, when(row.createdAt)].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-bold tabular-nums ${row.amount >= 0 ? 'text-emerald-700' : 'text-gray-900'}`}>{row.amount >= 0 ? '+' : '-'}{money(Math.abs(row.amount))}</p>
                  {row.balanceAfter !== null ? <p className="text-xs text-gray-400">{money(row.balanceAfter)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const BusVendorWallets = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [prepaid, setPrepaid] = useState(false);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try {
      const [walletsRes, settingsRes] = await Promise.all([
        api.get('/admin/bus-vendor-wallets'),
        api.get('/admin/general-settings/transport-ride'),
      ]);
      setRows(payload(walletsRes)?.results || []);
      setPrepaid(isOn(settingsRes?.data?.settings?.bus_vendor_prepaid ?? settingsRes?.settings?.bus_vendor_prepaid));
    } catch {
      toast.error('Could not load vendor wallets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async () => {
    const next = !prepaid;
    if (next && !window.confirm('From now on, bus vendors must pay for each counter seat (wallet or online) before it is booked. Turn this on?')) return;
    setSavingSwitch(true);
    try {
      await api.patch('/admin/general-settings/transport-ride', { settings: { bus_vendor_prepaid: next ? '1' : '0' } });
      setPrepaid(next);
      toast.success(next ? 'Vendors now pay before booking' : 'Vendors can book without paying first');
    } catch {
      toast.error('Could not save');
    } finally {
      setSavingSwitch(false);
    }
  };

  const shown = rows.filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(search.toLowerCase()));
  const total = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);

  return (
    <div className="space-y-5 p-4 lg:p-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Vendor Wallets</h1>
        <p className="text-sm text-gray-500">Money bus vendors keep with ZI CAB to pay for seats they sell at the counter.</p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900">Vendors pay before booking</p>
          <p className="mt-0.5 text-xs text-gray-500">
            On: a counter seat is held for 10 minutes and booked only once paid from the wallet or online. Off: vendors book as before.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={prepaid}
          onClick={toggle}
          disabled={savingSwitch || loading}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prepaid ? 'bg-yellow-400' : 'bg-gray-200'}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${prepaid ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <p className="text-sm text-gray-600">{rows.length} vendors · {money(total)} held in wallets</p>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or phone" className="w-48 border-none bg-transparent p-0 text-sm outline-none focus:ring-0" />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">No bus vendors found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left font-bold">Vendor</th>
                <th className="px-4 py-3 text-left font-bold">Type</th>
                <th className="px-4 py-3 text-right font-bold">Balance</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={`${row.accountType}:${row.accountId}`} className="border-t border-gray-100">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-900">{row.name}</p>
                    <p className="text-xs text-gray-500">{row.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.accountType === 'owner' ? 'Fleet owner' : 'Bus operator'}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">{money(row.balance)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setOpen(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                      <Wallet size={13} /> Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && <VendorDrawer vendor={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
};

export default BusVendorWallets;
