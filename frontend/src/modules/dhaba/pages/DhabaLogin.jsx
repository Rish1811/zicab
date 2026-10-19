import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, UtensilsCrossed } from 'lucide-react';
import { dhabaApi, setDhabaToken } from '../services/dhabaApi';

const DhabaLogin = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await dhabaApi.login(phone, password);
      setDhabaToken(result.token);
      navigate('/dhaba', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_60%)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-3xl border border-orange-100 bg-white p-7 shadow-xl shadow-orange-100/50">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <UtensilsCrossed size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">ZI Bus</p>
            <h1 className="text-xl font-black text-slate-900">Dhaba Partner Login</h1>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered mobile</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 focus:border-orange-400 focus:outline-none"
            placeholder="10-digit mobile number"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 focus:border-orange-400 focus:outline-none"
            required
          />
        </label>

        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-black text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Sign in
        </button>
        <p className="text-center text-[11px] font-semibold text-slate-400">
          Accounts are created by the ZI Bus team. Contact support to join.
        </p>
      </form>
    </div>
  );
};

export default DhabaLogin;
