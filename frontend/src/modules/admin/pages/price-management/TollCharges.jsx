import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import { Copy, Download, Loader2, MapPin, Pencil, Plus, Route, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../utils/googleMaps';

/**
 * Toll Charges: the toll plazas on outstation routes and what each vehicle
 * pays there. An outstation trip whose route passes a plaza is charged its
 * toll - one way, plus the return price on a round trip - inside the quoted
 * fare, and the toll goes in full to the driver.
 */

const inputClass =
  'w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-[10px] font-semibold text-gray-500 mb-1';
const rupees = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const unwrap = (res) => {
  const body = res?.data?.data ?? res?.data ?? res ?? {};
  return body?.data && !body.results && !body.byVehicle ? body.data : body;
};

const emptyPlaza = () => ({
  name: '',
  highway: '',
  lat: '',
  lng: '',
  radius_meters: 250,
  active: true,
  notes: '',
  service_location_ids: [],
  prices: {},
});

/// Editor state -> API body.
const toBody = (form) => ({
  name: form.name,
  highway: form.highway,
  lat: Number(form.lat),
  lng: Number(form.lng),
  radius_meters: Number(form.radius_meters) || 250,
  active: Boolean(form.active),
  notes: form.notes,
  service_location_ids: form.service_location_ids,
  prices: Object.entries(form.prices)
    .map(([vehicle_type_id, price]) => ({
      vehicle_type_id,
      one_way: Number(price.one_way) || 0,
      return_trip: Number(price.return_trip) || 0,
    }))
    .filter((price) => price.one_way > 0 || price.return_trip > 0),
});

const decodePolyline = (encoded = '') => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
};

// --- CSV --------------------------------------------------------------------

/// One header row: name, highway, lat, lng, radius_meters, then "<vehicle> one way"
/// and "<vehicle> return" for each vehicle.
const csvTemplate = (vehicles) => {
  const header = ['name', 'highway', 'lat', 'lng', 'radius_meters', ...vehicles.flatMap((v) => [`${v.name} one way`, `${v.name} return`])];
  const example = ['Nelamangala Toll Plaza', 'NH48', '13.0950', '77.3990', '250', ...vehicles.flatMap(() => ['', ''])];
  return [header, example].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((value) => String(value).trim()));
};

const csvToRows = (text, vehicles) => {
  const [header, ...lines] = parseCsv(text);
  if (!header) return [];
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const byName = new Map(vehicles.map((v) => [v.name.trim().toLowerCase(), v.id]));
  return lines.map((line) => {
    const prices = new Map();
    header.forEach((h, i) => {
      const match = /^(.*)\s+(one way|return)$/i.exec(h.trim());
      if (!match) return;
      const id = byName.get(match[1].trim().toLowerCase());
      const value = Number(line[i]);
      if (!id || !Number.isFinite(value) || value <= 0) return;
      const price = prices.get(id) || { vehicle_type_id: id, one_way: 0, return_trip: 0 };
      if (/one way/i.test(match[2])) price.one_way = value;
      else price.return_trip = value;
      prices.set(id, price);
    });
    return {
      name: line[col('name')] || '',
      highway: line[col('highway')] || '',
      lat: Number(line[col('lat')]),
      lng: Number(line[col('lng')]),
      radius_meters: Number(line[col('radius_meters')]) || 250,
      prices: [...prices.values()],
    };
  });
};

// --- editor -----------------------------------------------------------------

const PlazaEditor = ({ initial, vehicles, cities, onClose, onSaved }) => {
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setPrice = (vehicleId, key, value) =>
    setForm((prev) => ({ ...prev, prices: { ...prev.prices, [vehicleId]: { ...(prev.prices[vehicleId] || {}), [key]: value } } }));

  const hasPoint = Number.isFinite(Number(form.lat)) && Number.isFinite(Number(form.lng)) && form.lat !== '' && form.lng !== '';
  const center = hasPoint ? { lat: Number(form.lat), lng: Number(form.lng) } : INDIA_CENTER;

  // Fills every vehicle with the first priced vehicle's prices.
  const copyToAll = () => {
    const first = vehicles.map((v) => form.prices[v.id]).find((p) => Number(p?.one_way) > 0 || Number(p?.return_trip) > 0);
    if (!first) {
      toast.error('Enter a price for one vehicle first');
      return;
    }
    setForm((prev) => ({ ...prev, prices: Object.fromEntries(vehicles.map((v) => [v.id, { ...first }])) }));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!hasPoint) return toast.error('Set the location - click the map or type lat/lng');
    try {
      setSaving(true);
      if (form.id) await api.patch(`/admin/tolls/${form.id}`, toBody(form));
      else await api.post('/admin/tolls', toBody(form));
      toast.success(`${form.name} saved`);
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the toll plaza');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">{form.id ? 'Edit toll plaza' : 'Add toll plaza'}</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-800"><X size={16} /></button>
        </div>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nelamangala Toll Plaza" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Highway</label>
                <input className={inputClass} value={form.highway} onChange={(e) => set('highway', e.target.value)} placeholder="NH48" />
              </div>
              <div>
                <label className={labelClass} title="How close a route must pass to be charged">Match radius (m)</label>
                <input type="number" min={50} max={2000} className={inputClass} value={form.radius_meters} onChange={(e) => set('radius_meters', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Latitude *</label>
                <input className={inputClass} value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="13.0950" />
              </div>
              <div>
                <label className={labelClass}>Longitude *</label>
                <input className={inputClass} value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="77.3990" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Cities (optional, for filtering)</label>
              <div className="flex flex-wrap gap-1.5">
                {cities.map((city) => {
                  const on = form.service_location_ids.includes(city.id);
                  return (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => set('service_location_ids', on ? form.service_location_ids.filter((id) => id !== city.id) : [...form.service_location_ids, city.id])}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <input type="checkbox" className="accent-indigo-600" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Active - charge this toll on outstation trips
            </label>
          </div>
          <div className="h-64 lg:h-auto min-h-[240px] rounded-lg overflow-hidden border border-gray-100">
            {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={center}
                zoom={hasPoint ? 15 : 5}
                options={{ streetViewControl: false, mapTypeControl: false }}
                onClick={(e) => {
                  set('lat', e.latLng.lat().toFixed(6));
                  set('lng', e.latLng.lng().toFixed(6));
                }}
              >
                {hasPoint ? <MarkerF position={center} /> : null}
              </GoogleMap>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-400 bg-gray-50">Map unavailable - type lat/lng</div>
            )}
          </div>
        </div>
        <div className="px-4 pb-2">
          <p className="text-[10px] text-gray-400 mb-1 flex items-center gap-1"><MapPin size={10} /> Click the map exactly on the plaza on the highway.</p>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-bold text-gray-800">Toll per vehicle</p>
            <button type="button" onClick={copyToAll} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
              <Copy size={11} /> Copy first price to all vehicles
            </button>
          </div>
          <div className="border border-gray-100 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-1.5">Vehicle</th>
                  <th className="px-3 py-1.5">One way (₹)</th>
                  <th className="px-3 py-1.5" title="Charged for the way back on a round trip. Leave empty to use the one-way price.">Return (₹)</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-t border-gray-50">
                    <td className="px-3 py-1 font-semibold text-gray-800">
                      {vehicle.name}
                      {vehicle.outstation ? <span className="ml-1 text-[9px] text-emerald-600 font-bold">OUTSTATION</span> : null}
                    </td>
                    <td className="px-3 py-1">
                      <input type="number" min={0} className={inputClass} value={form.prices[vehicle.id]?.one_way ?? ''} onChange={(e) => setPrice(vehicle.id, 'one_way', e.target.value)} />
                    </td>
                    <td className="px-3 py-1">
                      <input type="number" min={0} className={inputClass} value={form.prices[vehicle.id]?.return_trip ?? ''} onChange={(e) => setPrice(vehicle.id, 'return_trip', e.target.value)} placeholder="same as one way" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">A vehicle left empty pays no toll here.</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-1.5 rounded-md disabled:opacity-50">
            {saving && <Loader2 size={12} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
};

// --- route tester -------------------------------------------------------------

const RouteTester = () => {
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [tripType, setTripType] = useState('one_way');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    try {
      setLoading(true);
      setResult(unwrap(await api.get('/admin/tolls/preview', { params: { origin, destination, trip_type: tripType } })));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not check the route');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm mb-4">
      <p className="text-xs font-bold text-gray-800 flex items-center gap-1 mb-2"><Route size={13} /> Test a route</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-semibold text-gray-500">From (lat,lng)
          <input className={`${inputClass} mt-1 w-48`} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="12.9716,77.5946" />
        </label>
        <label className="text-[10px] font-semibold text-gray-500">To (lat,lng)
          <input className={`${inputClass} mt-1 w-48`} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="12.2958,76.6394" />
        </label>
        <label className="text-[10px] font-semibold text-gray-500">Trip
          <select className={`${inputClass} mt-1`} value={tripType} onChange={(e) => setTripType(e.target.value)}>
            <option value="one_way">One way</option>
            <option value="round_trip">Round trip</option>
          </select>
        </label>
        <button onClick={run} disabled={loading || !origin || !destination} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-md disabled:opacity-40">
          {loading && <Loader2 size={11} className="animate-spin" />} Check tolls
        </button>
      </div>
      {result ? (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="text-xs">
            {!result.routeFound ? (
              <p className="text-amber-600">No route found between these points.</p>
            ) : result.plazas?.length ? (
              <>
                <p className="font-semibold text-gray-800 mb-1">{result.plazas.length} plaza{result.plazas.length > 1 ? 's' : ''} on this route:</p>
                <ol className="list-decimal ml-4 text-gray-700 mb-2">
                  {result.plazas.map((p) => <li key={p.id}>{p.name}{p.highway ? ` (${p.highway})` : ''}</li>)}
                </ol>
                <table className="w-full text-[11px]">
                  <tbody>
                    {(result.byVehicle || []).map((v) => (
                      <tr key={v.vehicle_type_id} className="border-t border-gray-50">
                        <td className="py-1 font-semibold text-gray-800">{v.vehicle_name}</td>
                        <td className="py-1 text-right font-bold">{rupees(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!(result.byVehicle || []).length ? <p className="text-amber-600">The plazas have no prices set.</p> : null}
              </>
            ) : (
              <p className="text-gray-500">No toll plaza on this route.</p>
            )}
          </div>
          {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded && result.routeFound ? (
            <div className="h-56 rounded-lg overflow-hidden border border-gray-100">
              <RoutePreviewMap result={result} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const RoutePreviewMap = ({ result }) => {
  const [map, setMap] = useState(null);
  const path = useMemo(() => decodePolyline(result.polyline || ''), [result]);
  useEffect(() => {
    if (!map || !window.google || !(result.plazas || []).length) return;
    const bounds = new window.google.maps.LatLngBounds();
    result.plazas.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 30);
  }, [map, result, path]);
  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={result.plazas?.[0] ? { lat: result.plazas[0].lat, lng: result.plazas[0].lng } : INDIA_CENTER}
      zoom={8}
      onLoad={setMap}
      options={{ streetViewControl: false, mapTypeControl: false }}
    >
      {path.length ? <PolylineF path={path} options={{ strokeColor: '#4F46E5', strokeWeight: 3 }} /> : null}
      {(result.plazas || []).map((p) => <MarkerF key={p.id} position={{ lat: p.lat, lng: p.lng }} title={p.name} />)}
    </GoogleMap>
  );
};

// --- page ---------------------------------------------------------------------

const TollCharges = () => {
  const [plazas, setPlazas] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const body = unwrap(await api.get('/admin/tolls', { params: search ? { q: search } : {} }));
      setPlazas(body.results || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load toll plazas');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Taxi vehicles, outstation ones first.
    Promise.all([
      api.get('/admin/types/vehicle-types/list').catch(() => null),
      api.get('/admin/service-locations').catch(() => null),
    ]).then(([vehicleRes, cityRes]) => {
      const vBody = vehicleRes?.data ?? vehicleRes;
      const vList = vBody?.data?.results || vBody?.results || vBody?.data || vBody || [];
      setVehicles(
        (Array.isArray(vList) ? vList : [])
          .filter((v) => v && (v._id || v.id) && String(v.transport_type || 'taxi').toLowerCase() !== 'delivery')
          .map((v) => ({
            id: String(v._id || v.id),
            name: v.name || 'Vehicle',
            outstation: /outstation|traveller|xl/i.test(v.name || '') || (v.app_modules || []).length > 1,
          }))
          .sort((a, b) => Number(b.outstation) - Number(a.outstation) || a.name.localeCompare(b.name)),
      );
      const cBody = cityRes?.data ?? cityRes;
      const cList = cBody?.data?.results || cBody?.results || cBody?.data || cBody || [];
      setCities(
        (Array.isArray(cList) ? cList : [])
          .filter((c) => c && (c._id || c.id))
          .map((c) => ({ id: String(c._id || c.id), name: c.name || c.service_location_name || 'City' })),
      );
    });
  }, []);

  const openEditor = (plaza) => {
    if (!plaza) return setEditing(emptyPlaza());
    setEditing({
      id: plaza.id,
      name: plaza.name,
      highway: plaza.highway,
      lat: plaza.lat ?? '',
      lng: plaza.lng ?? '',
      radius_meters: plaza.radius_meters,
      active: plaza.active,
      notes: plaza.notes,
      service_location_ids: plaza.service_location_ids || [],
      prices: Object.fromEntries((plaza.prices || []).map((p) => [p.vehicle_type_id, { one_way: p.one_way || '', return_trip: p.return_trip || '' }])),
    });
  };

  const remove = async (plaza) => {
    if (!window.confirm(`Delete ${plaza.name}? Outstation trips will stop being charged this toll.`)) return;
    try {
      await api.delete(`/admin/tolls/${plaza.id}`);
      toast.success(`${plaza.name} deleted`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not delete');
    }
  };

  const toggleActive = async (plaza) => {
    try {
      await api.patch(`/admin/tolls/${plaza.id}`, { active: !plaza.active });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update');
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([csvTemplate(vehicles)], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'toll_plazas_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file) => {
    if (!file) return;
    try {
      setImporting(true);
      const rows = csvToRows(await file.text(), vehicles);
      if (!rows.length) {
        toast.error('No rows found in the file');
        return;
      }
      const result = unwrap(await api.post('/admin/tolls/import', { rows }));
      toast.success(`${result.created || 0} added, ${result.updated || 0} updated${result.errors?.length ? `, ${result.errors.length} skipped` : ''}`);
      if (result.errors?.length) console.warn('Toll import skipped rows:', result.errors);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] p-3 lg:p-4 font-sans">
      <div className="mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div>
          <h1 className="text-xl font-bold text-[#1E293B]">Toll Charges</h1>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-3xl">
            Toll plazas on outstation routes and what each vehicle pays. An outstation trip whose route passes a plaza
            is charged its toll inside the quoted fare (the return price too on a round trip), and the toll goes in
            full to the driver - no commission.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1.5">
            <Download size={12} /> CSV template
          </button>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1.5 cursor-pointer">
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button onClick={() => openEditor(null)} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-semibold px-3 py-1.5 rounded-md">
            <Plus size={12} /> Add toll plaza
          </button>
        </div>
      </div>

      <RouteTester />

      <div className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <p className="text-xs font-bold text-gray-800">Toll plazas ({plazas.length})</p>
          <input className={`${inputClass} w-56`} placeholder="Search name or highway" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
              <th className="px-3 py-2">Plaza</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Prices</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center"><Loader2 size={18} className="animate-spin text-indigo-500 inline" /></td></tr>
            ) : plazas.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-gray-400">No toll plazas yet. Add one, or import a CSV.</td></tr>
            ) : plazas.map((plaza) => (
              <tr key={plaza.id} className="border-b border-gray-50 align-top">
                <td className="px-3 py-2">
                  <p className="font-semibold text-gray-800">{plaza.name}</p>
                  <p className="text-[10px] text-gray-400">{plaza.highway || '-'} · {plaza.radius_meters} m radius</p>
                </td>
                <td className="px-3 py-2 text-[10px] text-gray-500 whitespace-nowrap">{plaza.lat?.toFixed?.(5)}, {plaza.lng?.toFixed?.(5)}</td>
                <td className="px-3 py-2">
                  {plaza.prices?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {plaza.prices.map((p) => (
                        <span key={p.vehicle_type_id} className="text-[10px] bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                          {p.vehicle_name || 'Vehicle'}: {rupees(p.one_way)}{p.return_trip ? ` / ${rupees(p.return_trip)} return` : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[10px] text-amber-600">No prices set</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleActive(plaza)} className={`text-[10px] font-bold px-2 py-0.5 rounded ${plaza.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {plaza.active ? 'Active' : 'Off'}
                  </button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <button onClick={() => openEditor(plaza)} className="p-1 text-gray-500 hover:text-indigo-600" title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => remove(plaza)} className="p-1 text-gray-500 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing ? (
        <PlazaEditor
          initial={editing}
          vehicles={vehicles}
          cities={cities}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : null}
    </div>
  );
};

export default TollCharges;
