import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, PolygonF, OverlayViewF, OVERLAY_MOUSE_TARGET } from '@react-google-maps/api';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../utils/googleMaps';

const inputClass =
  'w-full border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors shadow-sm';
const labelClass = 'block text-[10px] font-semibold text-gray-500 mb-1';
const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const REFRESH_MS = 60 * 1000;

// Each setting, with the help text an admin needs to set it sensibly.
const FIELDS = [
  { key: 'max_multiplier', label: 'Maximum surge (x)', step: 0.05, min: 1, max: 2, help: 'Legal ceiling is 2x the base fare; some states allow less.' },
  { key: 'min_demand', label: 'Min riders to trigger', step: 1, min: 1, help: 'Distinct riders asking for a price in an area before it can surge.' },
  { key: 'trigger_ratio', label: 'Riders per free driver to start', step: 0.1, min: 0.5, help: 'Surge starts when riders outnumber free drivers by this much.' },
  { key: 'step', label: 'Increase per step (x)', step: 0.01, min: 0.01, max: 0.5, help: 'How much each step adds, e.g. 0.05 = 1.05x, 1.10x, ...' },
  { key: 'ratio_step', label: 'Riders per driver per step', step: 0.1, min: 0.1, help: 'How much busier an area must get for the next step.' },
  { key: 'window_minutes', label: 'Demand window (min)', step: 1, min: 2, max: 60, help: 'How far back rider demand is counted.' },
  { key: 'hold_minutes', label: 'Hold surge for (min)', step: 1, min: 1, max: 60, help: 'A surge lasts at least this long, so prices do not flicker.' },
  { key: 'resolution', label: 'Area size', type: 'select', help: 'Size of each hexagon on the map.' },
];

const RESOLUTIONS = [
  { value: 7, label: 'Large (~5 km²)' },
  { value: 8, label: 'Medium (~0.7 km²)' },
  { value: 9, label: 'Small (~0.1 km²)' },
];

// Deeper red for a higher multiplier, like the driver-app surge map.
const surgeColour = (multiplier) => {
  if (multiplier >= 1.4) return '#B91C1C';
  if (multiplier >= 1.2) return '#DC2626';
  if (multiplier >= 1.1) return '#EF4444';
  return '#F87171';
};

const AutomaticSurgePanel = () => {
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [settings, setSettings] = useState(null);
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = (payload) => {
    const data = payload?.data || payload || {};
    if (data.settings) setSettings(data.settings);
    setActive(Array.isArray(data.active) ? data.active : []);
  };

  const load = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true);
      apply(await api.get('/admin/surge'));
    } catch (err) {
      console.error('Fetch automatic surge failed:', err);
      if (!quiet) toast.error('Could not load automatic surge');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ quiet: true }), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const save = async (patch = {}) => {
    const next = { ...settings, ...patch };
    try {
      setSaving(true);
      apply(await api.patch('/admin/surge', next));
      toast.success(next.enabled ? 'Automatic surge saved' : 'Automatic surge is off');
    } catch (err) {
      console.error('Save automatic surge failed:', err);
      toast.error(err?.response?.data?.message || 'Could not save automatic surge');
    } finally {
      setSaving(false);
    }
  };

  const mapCenter = useMemo(() => {
    if (!active.length) return BENGALURU;
    const lat = active.reduce((sum, area) => sum + area.center.lat, 0) / active.length;
    const lng = active.reduce((sum, area) => sum + area.center.lng, 0) / active.length;
    return { lat, lng };
  }, [active]);

  if (loading || !settings) {
    return (
      <div className="bg-white border border-gray-100 rounded-lg p-6 mb-4 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3 shadow-sm mb-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 mb-2">
        <div>
          <h2 className="text-sm font-bold text-[#1E293B] flex items-center gap-1.5">
            <Zap size={14} className="text-amber-500" /> Automatic surge
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-3xl">
            Like Rapido and Uber: the city is split into hexagons, and every minute each one compares the
            riders asking for a price there with the free drivers nearby. Busy areas get a small surge
            that holds for a while, then eases off. When both an automatic surge and a time slot below
            apply, the higher one is used.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={Boolean(settings.enabled)}
            disabled={saving}
            onChange={(e) => save({ enabled: e.target.checked })}
          />
          {settings.enabled ? 'On' : 'Off'}
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className={labelClass} title={field.help}>{field.label}</label>
            {field.type === 'select' ? (
              <select
                className={inputClass}
                value={settings[field.key]}
                onChange={(e) => setSettings((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))}
              >
                {RESOLUTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                className={inputClass}
                step={field.step}
                min={field.min}
                max={field.max}
                value={settings[field.key]}
                onChange={(e) => setSettings((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            )}
            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{field.help}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          onClick={() => load()}
          className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 px-2 py-1"
        >
          <RefreshCw size={11} /> Refresh
        </button>
        <button
          onClick={() => save()}
          disabled={saving}
          className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-semibold px-3 py-1 rounded-md transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 size={11} className="animate-spin" />}
          Save settings
        </button>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-700">
            Surging now: {active.length} {active.length === 1 ? 'area' : 'areas'}
          </p>
          <p className="text-[10px] text-gray-400">Updates every minute</p>
        </div>

        {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
          <div className="h-72 rounded-lg overflow-hidden border border-gray-100">
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={active.length ? 12 : 11}
              options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
            >
              {active.map((area) => (
                <React.Fragment key={area.hex}>
                  <PolygonF
                    paths={area.boundary}
                    options={{
                      fillColor: surgeColour(area.multiplier),
                      fillOpacity: 0.35,
                      strokeColor: surgeColour(area.multiplier),
                      strokeOpacity: 0.8,
                      strokeWeight: 1,
                    }}
                  />
                  <OverlayViewF position={area.center} mapPaneName={OVERLAY_MOUSE_TARGET}>
                    <div className="-translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow">
                      {area.multiplier.toFixed(2)}x
                    </div>
                  </OverlayViewF>
                </React.Fragment>
              ))}
            </GoogleMap>
          </div>
        ) : null}

        {active.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1 pr-3 font-semibold">Multiplier</th>
                  <th className="py-1 pr-3 font-semibold">Riders</th>
                  <th className="py-1 pr-3 font-semibold">Free drivers</th>
                  <th className="py-1 pr-3 font-semibold">Ends in</th>
                  <th className="py-1 font-semibold">Area</th>
                </tr>
              </thead>
              <tbody>
                {active.map((area) => (
                  <tr key={area.hex} className="border-t border-gray-50 text-gray-700">
                    <td className="py-1 pr-3 font-bold">{area.multiplier.toFixed(2)}x</td>
                    <td className="py-1 pr-3">{area.demand}</td>
                    <td className="py-1 pr-3">{area.supply}</td>
                    <td className="py-1 pr-3">{area.ends_in_minutes} min</td>
                    <td className="py-1 text-gray-400">
                      {area.center.lat.toFixed(4)}, {area.center.lng.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 mt-2">
            {settings.enabled
              ? 'No area is busy enough to surge right now.'
              : 'Turn automatic surge on to start measuring demand.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default AutomaticSurgePanel;
