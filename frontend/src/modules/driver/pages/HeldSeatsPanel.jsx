import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createOwnerBusBookingPaymentOrder,
  payOwnerBusBookingFromWallet,
  releaseOwnerBusBookingHold,
  verifyOwnerBusBookingPayment,
} from '../services/registrationService';
import { openRazorpay } from './busVendorPay';
import { topUpVendorWallet } from './busVendorPay';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const money = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(value || 0));

/**
 * Seats held for the vendor while they pay: a countdown, and pay from the
 * wallet (topping it up first if short) or pay online. When the time runs
 * out the seats go back on sale.
 */
const HeldSeatsPanel = ({ hold, wallet, onPaid, onGone, onWalletChange }) => {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Once an online payment is started, the wallet is off for these seats
  // (the server refuses it, so a vendor can't pay twice).
  const [onlineStarted, setOnlineStarted] = useState(false);
  const goneRef = useRef(false);

  const endsAt = new Date(hold.expiresAt).getTime();
  const left = Math.max(0, Math.floor((endsAt - now) / 1000));
  const balance = Number(wallet?.balance || 0);
  const amount = Number(hold.amount || 0);
  const short = Math.max(0, Math.ceil((amount - balance) * 100) / 100);
  const bookingId = hold.booking.id;
  const seats = (hold.booking.activeSeats || []).map((seat) => seat.seatLabel).join(', ');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left === 0 && !busy && !goneRef.current) {
      goneRef.current = true;
      toast.error('The 10 minutes are over. The seats went back on sale.');
      onGone();
    }
  }, [left, busy, onGone]);

  const run = async (key, work) => {
    setBusy(key);
    setError('');
    try {
      await work();
    } catch (problem) {
      if (!problem?.dismissed) setError(problem?.message || 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const payFromWallet = () =>
    run('wallet', async () => {
      const result = unwrap(await payOwnerBusBookingFromWallet(bookingId));
      goneRef.current = true;
      onPaid(result.booking, result.walletBalance);
    });

  const recharge = () =>
    run('recharge', async () => {
      const next = await topUpVendorWallet(short);
      onWalletChange(next);
      toast.success(`${money(short)} added. Now pay from the wallet.`);
    });

  const payOnline = () =>
    run('online', async () => {
      const order = unwrap(await createOwnerBusBookingPaymentOrder(bookingId));
      setOnlineStarted(true);
      const paid = await openRazorpay({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        description: `Seats ${seats}`,
      });
      const result = unwrap(await verifyOwnerBusBookingPayment(bookingId, paid));
      goneRef.current = true;
      onPaid(result.booking, null);
    });

  const release = () =>
    run('release', async () => {
      await releaseOwnerBusBookingHold(bookingId);
      goneRef.current = true;
      onGone();
    });

  const minutes = String(Math.floor(left / 60)).padStart(2, '0');
  const secs = String(left % 60).padStart(2, '0');
  return (
    <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">Seats {seats} are held for you</p>
          <p className="text-xs text-slate-600">{hold.booking.passenger?.name} · pay to book them</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-lg font-bold tabular-nums ${left < 120 ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-900'}`}>
          <Clock size={16} /> {minutes}:{secs}
        </div>
      </div>

      <div className="rounded-xl bg-white p-3 text-sm">
        <div className="flex justify-between"><span className="text-slate-600">To pay</span><span className="font-bold tabular-nums">{money(amount)}</span></div>
        <div className="mt-1 flex justify-between"><span className="text-slate-600">Wallet balance</span><span className="font-semibold tabular-nums">{money(balance)}</span></div>
        {short > 0 ? (
          <div className="mt-1 flex justify-between text-rose-700"><span>Short by</span><span className="font-semibold tabular-nums">{money(short)}</span></div>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

      {onlineStarted ? (
        <p className="text-xs text-slate-600">Online payment started. Finish it, or release the seats and start again to pay from the wallet.</p>
      ) : short > 0 ? (
        <button type="button" onClick={recharge} disabled={!!busy || left === 0} className="h-12 w-full rounded-xl bg-amber-400 text-base font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50">
          {busy === 'recharge' ? 'Opening...' : `Recharge ${money(short)}`}
        </button>
      ) : (
        <button type="button" onClick={payFromWallet} disabled={!!busy || left === 0} className="h-12 w-full rounded-xl bg-amber-400 text-base font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50">
          {busy === 'wallet' ? 'Paying...' : `Pay ${money(amount)} from wallet`}
        </button>
      )}
      <button type="button" onClick={payOnline} disabled={!!busy || left === 0} className="h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
        {busy === 'online' ? 'Waiting for payment...' : `Pay ${money(amount)} now online`}
      </button>
      <button type="button" onClick={release} disabled={!!busy} className="w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-800">
        Release these seats
      </button>
    </div>
  );
};

export default HeldSeatsPanel;
