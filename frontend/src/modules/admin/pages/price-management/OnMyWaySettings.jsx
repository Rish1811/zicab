import React, { useEffect, useState } from 'react';
import { Loader2, Navigation, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

/**
 * Ride On My Way (driver destination mode): a driver heading somewhere sets
 * it as their destination and is only offered rides that take them closer.
 * A ride counts when the detour is small and the drop leaves the driver
 * clearly nearer their destination.
 */

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? {};
const pickList = (response, ...keys) => {
  const body = unwrap(response);
  if (Array.isArray(body)) return body;
  for (const key of ['results', 'items', ...keys]) {
    if (Array.isArray(body?.[key])) return body[key];
    if (Array.isArray(body?.data?.[key])) return body.data[key];
  }
  return [];
};
const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none';

const Toggle = ({ value, onChange }) => (
  <button type="button" onClick={() => onChange(!value)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-yellow-400' : 'bg-gray-200'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const Chips = ({ options, selected, onChange, emptyLabel }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((option) => {
      const on = selected.includes(option.id);
      return (
        <button key={option.id} type="button" onClick={() => onChange(on ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${on ? 'bg-yellow-400 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-600'}`}>
          {option.name}
        </button>
      );
    })}
    {!selected.length && <span className="text-xs text-gray-400 self-center">{emptyLabel}</span>}
  </div>
);

const NumberField = ({ label, hint, value, onChange, step = 1 }) => (
  <div>
    <label className={labelClass}>{label}</label>
    <input type="number" step={step} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
  </div>
);

const OnMyWaySettings = () => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [cities, setCities] = useState([]);
  const [usingNow, setUsingNow] = useState([]);

  useEffect(() => {
    adminService.getOnMyWaySettings().then((res) => setSettings(unwrap(res))).catch((err) => toast.error(errorText(err, 'Could not load settings')));
    Promise.allSettled([adminService.getVehicleTypes(), adminService.getServiceLocations(), adminService.getDriverHoursLive({})]).then(([v, l, live]) => {
      if (v.status === 'fulfilled') setVehicleTypes(pickList(v.value, 'vehicle_types', 'types').map((x) => ({ id: String(x._id || x.id), name: x.name || 'Vehicle' })));
      if (l.status === 'fulfilled') setCities(pickList(l.value, 'service_locations', 'locations').map((x) => ({ id: String(x._id || x.id), name: x.service_location_name || x.name || 'City' })));
      if (live.status === 'fulfilled') setUsingNow((unwrap(live.value).items || []).filter((row) => row.onMyWay));
    });
  }, []);

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminService.updateOnMyWaySettings({
        ...settings,
        usesPerDay: Number(settings.usesPerDay),
        maxDetourPercent: Number(settings.maxDetourPercent),
        maxDetourKm: Number(settings.maxDetourKm),
        minProgressPercent: Number(settings.minProgressPercent),
        maxHours: Number(settings.maxHours),
        arriveRadiusMeters: Number(settings.arriveRadiusMeters),
      });
      setSettings(unwrap(res));
      toast.success('Ride On My Way settings saved');
    } catch (err) {
      toast.error(errorText(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="py-24 text-center"><Loader2 className="animate-spin inline text-yellow-500" size={28} /></div>;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Navigation className="text-yellow-500" size={24} /> Ride On My Way</h1>
        <p className="text-sm text-gray-500 mt-1">
          A driver heading home (or anywhere) sets a destination in the driver app and only gets rides that take them closer to it.
          It switches off on arrival, after the time limit, or when they turn it off.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Ride On My Way is on</p>
            <p className="text-xs text-gray-500">Off: drivers cannot turn it on, and anyone using it gets all offers again.</p>
          </div>
          <Toggle value={settings.enabled} onChange={set('enabled')} />
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField label="Uses per day" hint="Rides completed in this mode, per driver per day." value={settings.usesPerDay} onChange={set('usesPerDay')} />
          <NumberField label="Time limit (hours)" hint="Switches off after this long." step="0.5" value={settings.maxHours} onChange={set('maxHours')} />
          <NumberField label="Arrived within (m)" hint="Switches off this close to the destination." value={settings.arriveRadiusMeters} onChange={set('arriveRadiusMeters')} />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-bold text-gray-800 mb-1">Which rides count as "on the way"</p>
          <p className="text-xs text-gray-500 mb-3">Both must hold. Example: a driver 10 km from home with 25% / 3 km and 30% may take a ride that adds at most 3 km and drops them at most 7 km from home.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <NumberField label="Max detour %" hint="Extra length vs going straight home." value={settings.maxDetourPercent} onChange={set('maxDetourPercent')} />
            <NumberField label="or max detour (km)" hint="Whichever is larger is allowed." step="0.5" value={settings.maxDetourKm} onChange={set('maxDetourKm')} />
            <NumberField label="Min progress %" hint="How much closer to home the drop must be." value={settings.minProgressPercent} onChange={set('minProgressPercent')} />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-4">
          <div>
            <label className={labelClass}>Vehicle types</label>
            <Chips options={vehicleTypes} selected={settings.vehicleTypeIds || []} onChange={set('vehicleTypeIds')} emptyLabel="All vehicles" />
          </div>
          <div>
            <label className={labelClass}>Cities</label>
            <Chips options={cities} selected={settings.serviceLocationIds || []} onChange={set('serviceLocationIds')} emptyLabel="All cities" />
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Include parcels</p>
              <p className="text-xs text-gray-500">Parcel deliveries on the way count too.</p>
            </div>
            <Toggle value={settings.includeParcels} onChange={set('includeParcels')} />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-bold text-gray-900 mb-2">Using it right now ({usingNow.length})</h2>
        {!usingNow.length ? <p className="text-sm text-gray-400">Nobody. Drivers turn it on from the driver app (new app version).</p> : (
          <div className="divide-y divide-gray-100">
            {usingNow.map((row) => (
              <div key={row.id} className="py-2 flex justify-between text-sm">
                <span className="font-semibold text-gray-900">{row.name} <span className="text-xs text-gray-500 font-normal">{row.phone}</span></span>
                <span className="text-gray-600">→ {row.onMyWay.label}{row.onMyWay.expiresAt ? ` · until ${new Date(row.onMyWay.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnMyWaySettings;
