import React, { useEffect, useState } from 'react';
import { Loader2, Printer, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAdminBuses } from '../../services/busService';
import { zibusAdminService } from '../../services/zibusAdminService';

const today = () => new Date().toLocaleDateString('en-CA');
const inputClass = 'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900';

/// One run's seat count, by who sold each seat, plus the passenger manifest.
const SeatInventory = () => {
  const [buses, setBuses] = useState([]);
  const [busServiceId, setBusServiceId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [travelDate, setTravelDate] = useState(today());
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAdminBuses()
      .then((list) => setBuses(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Could not load buses'));
  }, []);

  const bus = buses.find((item) => String(item.id) === String(busServiceId));

  const load = async (event) => {
    event?.preventDefault();
    if (!busServiceId || !scheduleId || !travelDate) return;
    setLoading(true);
    try {
      setInventory(await zibusAdminService.tripInventory({ busServiceId, scheduleId, travelDate }));
    } catch (error) {
      toast.error(error?.message || 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  };

  const stats = inventory
    ? [
        { label: 'Total seats', value: inventory.totalSeats, tone: 'text-slate-900' },
        { label: 'Booked', value: inventory.bookedCount, tone: 'text-blue-600' },
        { label: 'On hold (paying)', value: inventory.heldCount, tone: 'text-amber-600' },
        { label: 'Blocked', value: inventory.blockedSeatIds.length, tone: 'text-slate-500' },
        { label: 'Available', value: inventory.availableSeats, tone: 'text-emerald-600' },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-600">ZI Bus · Inventory</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Seat Inventory & Manifest</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Live seat count for one run across ZI Bus and every connected channel.</p>
        </div>

        <form onSubmit={load} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-100 bg-white p-4 print:hidden">
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Bus</span>
            <select className={inputClass} value={busServiceId} onChange={(e) => { setBusServiceId(e.target.value); setScheduleId(''); }} required>
              <option value="">Select bus</option>
              {buses.map((item) => (
                <option key={item.id} value={item.id}>{item.busName} · {item.route?.originCity} → {item.route?.destinationCity}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule</span>
            <select className={inputClass} value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} required>
              <option value="">Select</option>
              {(bus?.schedules || []).map((schedule) => (
                <option key={schedule.id} value={schedule.id}>{schedule.label || 'Departs'} {schedule.departureTime}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Travel date</span>
            <input type="date" className={inputClass} value={travelDate} onChange={(e) => setTravelDate(e.target.value)} required />
          </label>
          <button type="submit" className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Show
          </button>
          {inventory ? (
            <button type="button" onClick={() => window.print()} className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700">
              <Printer size={12} /> Print manifest
            </button>
          ) : null}
        </form>

        {inventory ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-black ${stat.tone}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Booked seats by source</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {inventory.bookedBySource.length === 0 ? (
                  <span className="text-sm font-semibold text-slate-500">No seats sold yet.</span>
                ) : inventory.bookedBySource.map((row) => (
                  <span key={row.source} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                    {row.source === 'zibus' ? 'ZI Bus' : row.source}: {row.seats}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3">PNR</th>
                    <th className="px-4 py-3">Seats</th>
                    <th className="px-4 py-3">Passenger</th>
                    <th className="px-4 py-3">Boarding</th>
                    <th className="px-4 py-3">Dropping</th>
                    <th className="px-4 py-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.passengers.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No confirmed passengers.</td></tr>
                  ) : inventory.passengers.map((row) => (
                    <tr key={`${row.pnr}-${row.seats.join()}`}>
                      <td className="px-4 py-3 font-black text-slate-900">{row.pnr || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{row.seats.join(', ')}</td>
                      <td className="px-4 py-3"><p className="font-semibold">{row.name || '—'}</p><p className="text-xs text-slate-500">{row.phone}</p></td>
                      <td className="px-4 py-3 text-xs font-semibold">{row.boarding || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold">{row.dropping || '—'}</td>
                      <td className="px-4 py-3 text-xs font-black uppercase text-slate-500">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default SeatInventory;
