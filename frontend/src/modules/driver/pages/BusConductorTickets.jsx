import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Loader2, QrCode, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/axiosInstance';

const raw = (response) => response?.data?.__raw ?? response?.data ?? response;
const todayKey = () => new Date().toLocaleDateString('en-CA');

/// Ticket QR codes read "ZIBUS|<PNR>|<date>|<schedule>|<seats>"; a bare PNR
/// typed in works too.
const pnrFromScan = (text) => {
  const value = String(text || '').trim();
  return value.startsWith('ZIBUS|') ? value.split('|')[1] : value;
};

const QrScanner = ({ onResult, onClose }) => {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream = null;
    let timer = null;
    let stopped = false;

    const start = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('This phone can’t scan QR codes in the browser. Type the PNR instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const scan = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              onResult(codes[0].rawValue);
              return;
            }
          } catch {
            // Frame not ready yet.
          }
          timer = setTimeout(scan, 250);
        };
        scan();
      } catch {
        setError('Camera permission was not given. Type the PNR instead.');
      }
    };
    start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm font-black">Scan the passenger&apos;s ticket QR</p>
        <button type="button" onClick={onClose} aria-label="Close scanner"><X /></button>
      </div>
      {error ? (
        <p className="m-4 rounded-2xl bg-white p-4 text-sm font-bold text-slate-700">{error}</p>
      ) : (
        <video ref={videoRef} playsInline muted className="w-full flex-1 object-cover" />
      )}
    </div>
  );
};

const BusConductorTickets = () => {
  const navigate = useNavigate();
  const [travelDate, setTravelDate] = useState(todayKey());
  const [scheduleId, setScheduleId] = useState('');
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pnr, setPnr] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/bus-tickets/manifest', { params: { travelDate, scheduleId: scheduleId || undefined } });
      const data = raw(response);
      setManifest(data);
      if (!scheduleId && data?.scheduleId) setScheduleId(data.scheduleId);
    } catch (error) {
      toast.error(error?.message || 'Could not load passengers');
      setManifest(null);
    } finally {
      setLoading(false);
    }
  }, [travelDate, scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const board = async (value) => {
    const code = pnrFromScan(value).toUpperCase();
    if (!code) return;
    setBusy(true);
    try {
      const response = await api.post(`/bus-tickets/board/${encodeURIComponent(code)}`, { scheduleId, travelDate });
      const ticket = raw(response);
      setLastResult({ ok: true, ticket });
      setPnr('');
      setManifest((current) =>
        current
          ? {
              ...current,
              passengers: current.passengers.map((item) => (item.pnr === ticket.pnr ? ticket : item)),
              totals: {
                ...current.totals,
                boardedSeats: current.passengers
                  .map((item) => (item.pnr === ticket.pnr ? ticket : item))
                  .filter((item) => item.boardedAt)
                  .reduce((sum, item) => sum + item.seats.length, 0),
              },
            }
          : current,
      );
    } catch (error) {
      setLastResult({ ok: false, message: error?.message || 'Ticket not valid for this bus' });
    } finally {
      setBusy(false);
    }
  };

  // The scanner keeps one stable callback (so the camera doesn't restart),
  // which always calls the latest board() for the selected run.
  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  });
  const handleScan = useCallback((text) => {
    setScanning(false);
    boardRef.current(text);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white px-4 pb-4 pt-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-slate-900">Ticket check-in</h1>
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{manifest?.busName || 'Your bus'}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <input type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold" />
          <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
            {(manifest?.schedules || []).map((item) => <option key={item.id} value={item.id}>{item.label || 'Departs'} {item.departureTime}</option>)}
          </select>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-slate-900">{manifest?.totals?.seats ?? 0}</p><p className="text-[10px] font-bold text-slate-400">seats sold</p></div>
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-emerald-600">{manifest?.totals?.boardedSeats ?? 0}</p><p className="text-[10px] font-bold text-slate-400">on board</p></div>
          <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-xl font-black text-amber-600">{Math.max(0, (manifest?.totals?.seats ?? 0) - (manifest?.totals?.boardedSeats ?? 0))}</p><p className="text-[10px] font-bold text-slate-400">to board</p></div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); board(pnr); }} className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
            <Search size={16} className="text-slate-400" />
            <input value={pnr} onChange={(e) => setPnr(e.target.value)} placeholder="Type PNR" className="w-full bg-transparent py-3 text-sm font-black uppercase tracking-wider focus:outline-none" autoCapitalize="characters" />
          </label>
          <button type="submit" disabled={busy || !pnr.trim()} className="rounded-2xl bg-slate-900 px-4 text-sm font-black text-white disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Check in'}
          </button>
          <button type="button" onClick={() => setScanning(true)} className="flex items-center rounded-2xl bg-orange-500 px-4 text-white" aria-label="Scan QR">
            <Camera size={18} />
          </button>
        </form>

        {lastResult ? (
          <div className={`rounded-2xl border p-4 ${lastResult.ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
            {lastResult.ok ? (
              <>
                <p className="flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 size={16} /> Boarded · {lastResult.ticket.pnr}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{lastResult.ticket.passengerName || 'Passenger'} · Seat {lastResult.ticket.seats.join(', ')}</p>
                {lastResult.ticket.boardingPoint || lastResult.ticket.droppingPoint ? (
                  <p className="text-xs font-semibold text-slate-500">
                    {[lastResult.ticket.boardingPoint, lastResult.ticket.droppingPoint].filter(Boolean).join(' → ')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm font-black text-rose-700">{lastResult.message}</p>
            )}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : !manifest?.passengers?.length ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500">
            <QrCode className="mx-auto mb-2 text-slate-300" /> No confirmed passengers for this run.
          </div>
        ) : (
          <ul className="space-y-2">
            {manifest.passengers.map((item) => (
              <li key={item.pnr} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">Seat {item.seats.join(', ')} · {item.passengerName || '—'}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{item.pnr} · {item.boardingPoint || 'Boarding not set'}{item.channel ? ` · ${item.channel}` : ''}</p>
                </div>
                {item.boardedAt ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700">On board</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => board(item.pnr)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">
                    Check in
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {scanning ? <QrScanner onResult={handleScan} onClose={() => setScanning(false)} /> : null}
    </div>
  );
};

export default BusConductorTickets;
