import React, { useEffect, useState } from 'react';
import { Gift, Loader2, Pencil, Plus, Save, Trash2, Upload, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response ?? {};

const emptyLevel = {
  title: '',
  description: '',
  rideCount: '',
  image: '',
  rewardType: 'gift',
  walletAmount: '',
  active: true,
  sortOrder: 0,
  audience: 'user',
  // 'none' = never expires, 'days' = expires N days from when it's saved,
  // 'keep' = (editing only) leave the current expiry date as it is.
  expiryMode: 'none',
  expiresInDays: '',
};

const formatExpiry = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const isPast = (value) => Boolean(value) && new Date(value).getTime() <= Date.now();

const expiryPreview = (days) => {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  return formatExpiry(new Date(Date.now() + n * 24 * 60 * 60 * 1000));
};

const AUDIENCES = [
  { value: 'user', label: 'Rider Rewards' },
  { value: 'driver', label: 'Driver Rewards' },
];

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors';

const Toggle = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${value ? 'bg-yellow-400' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const RewardSettings = () => {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState({
    cashbackEnabled: false,
    cashbackPercent: 0,
    maxCashbackPerRide: 0,
    minFareForCashback: 0,
    rewardsEnabled: true,
  });
  const [levels, setLevels] = useState([]);
  const [audience, setAudience] = useState('user');
  const [editing, setEditing] = useState(null); // null | level form object
  const [savingLevel, setSavingLevel] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadLevels = async (forAudience = audience) => {
    const res = await adminService.getRewardLevels({ audience: forAudience });
    setLevels(Array.isArray(unwrap(res)) ? unwrap(res) : []);
  };

  useEffect(() => {
    (async () => {
      try {
        const settingsRes = await adminService.getRewardSettings();
        setSettings((prev) => ({ ...prev, ...unwrap(settingsRes) }));
      } catch (err) {
        toast.error('Failed to load rewards');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    loadLevels(audience).catch(() => toast.error('Failed to load rewards'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await adminService.updateRewardSettings({
        ...settings,
        cashbackPercent: Number(settings.cashbackPercent || 0),
        maxCashbackPerRide: Number(settings.maxCashbackPerRide || 0),
        minFareForCashback: Number(settings.minFareForCashback || 0),
      });
      setSettings((prev) => ({ ...prev, ...unwrap(res) }));
      toast.success('Cashback settings updated');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await adminService.uploadRewardImage(dataUrl);
      setEditing((prev) => ({ ...prev, image: unwrap(res).url || '' }));
    } catch (err) {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveLevel = async () => {
    if (!editing.title?.trim() || Number(editing.rideCount) < 1) {
      toast.error('Title and ride count are required');
      return;
    }
    if (editing.expiryMode === 'days' && !(Number(editing.expiresInDays) > 0)) {
      toast.error('Enter after how many days the reward expires');
      return;
    }
    setSavingLevel(true);
    const { expiryMode, expiresInDays, expired: _expired, expiresAt: _expiresAt, ...rest } = editing;
    const payload = {
      ...rest,
      rideCount: Number(editing.rideCount),
      walletAmount: Number(editing.walletAmount || 0),
      sortOrder: Number(editing.sortOrder || 0),
    };
    // Expiry: N days from now, never, or (when editing) leave it unchanged.
    if (expiryMode === 'days') payload.expiresInDays = Number(expiresInDays);
    else if (expiryMode === 'none') payload.expiresAt = null;
    try {
      if (editing.id) await adminService.updateRewardLevel(editing.id, payload);
      else await adminService.createRewardLevel(payload);
      toast.success('Reward saved');
      setEditing(null);
      await loadLevels();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save reward');
    } finally {
      setSavingLevel(false);
    }
  };

  const removeLevel = async (level) => {
    if (!window.confirm(`Delete reward "${level.title}"?`)) return;
    try {
      await adminService.deleteRewardLevel(level.id);
      toast.success('Reward deleted');
      await loadLevels();
    } catch (err) {
      toast.error('Failed to delete reward');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-yellow-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">
      <div className="max-w-5xl space-y-5">
        <div className="flex gap-2">
          {AUDIENCES.map((tab) => (
            <button key={tab.value} onClick={() => setAudience(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-bold ${audience === tab.value ? 'bg-yellow-400 text-black' : 'bg-white border border-gray-200 text-gray-600'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cashback - riders only */}
        {audience === 'user' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <Wallet size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Per-Ride Cashback</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                  Credited to the rider's wallet on every completed ride. Cashback can only pay for rides — it can't be transferred or withdrawn.
                </p>
              </div>
            </div>
            <Toggle value={settings.cashbackEnabled} onChange={(v) => setSettings({ ...settings, cashbackEnabled: v })} />
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Cashback per ride (%)</label>
              <input type="number" min="0" max="100" step="0.1" className={inputClass} value={settings.cashbackPercent}
                onChange={(e) => setSettings({ ...settings, cashbackPercent: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Max cashback per ride (₹, 0 = no cap)</label>
              <input type="number" min="0" className={inputClass} value={settings.maxCashbackPerRide}
                onChange={(e) => setSettings({ ...settings, maxCashbackPerRide: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Minimum fare (₹)</label>
              <input type="number" min="0" className={inputClass} value={settings.minFareForCashback}
                onChange={(e) => setSettings({ ...settings, minFareForCashback: e.target.value })} />
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <Toggle value={settings.rewardsEnabled} onChange={(v) => setSettings({ ...settings, rewardsEnabled: v })} />
              <span className="text-sm font-semibold text-gray-700">Show ride rewards section in user app</span>
            </div>
          </div>
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button onClick={saveSettings} disabled={savingSettings}
              className="flex items-center gap-2 px-6 py-2.5 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 disabled:opacity-50">
              {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Update Settings
            </button>
          </div>
        </div>
        )}

        {/* Reward levels */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <Gift size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">{audience === 'driver' ? 'Driver Rewards' : 'Ride Rewards'}</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">
                  {audience === 'driver'
                    ? 'Unlock a gift after a number of completed trips (rides and parcels). Drivers claim it from the driver app. No cashback.'
                    : 'Unlock a reward after a number of completed rides. Riders claim it from the app.'}
                </p>
              </div>
            </div>
            <button onClick={() => setEditing({ ...emptyLevel, audience })}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500">
              <Plus size={16} /> Add Reward
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {levels.length === 0 && <p className="p-6 text-sm text-gray-500">No rewards yet. Add the first one.</p>}
            {levels.map((level, index) => (
              <div key={level.id} className="p-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-700">{index + 1}</div>
                <div className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                  {level.image ? <img src={level.image} alt="" className="w-full h-full object-contain" /> : <Gift size={22} className="text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{level.title}</h4>
                    {!level.active && <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>}
                    {isPast(level.expiresAt) && <span className="text-[10px] font-bold uppercase bg-red-50 text-red-600 px-2 py-0.5 rounded">Expired</span>}
                  </div>
                  {level.expiresAt && (
                    <p className={`text-xs font-semibold ${isPast(level.expiresAt) ? 'text-red-600' : 'text-amber-600'}`}>
                      {isPast(level.expiresAt) ? 'Expired on' : 'Expires on'} {formatExpiry(level.expiresAt)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {level.rideCount} rides · {level.rewardType === 'coupon' ? `₹${level.walletAmount} wallet coupon` : 'Gift'}
                    {level.description ? ` · ${level.description}` : ''}
                  </p>
                </div>
                <button onClick={() => setEditing({ ...level, expiryMode: level.expiresAt ? 'keep' : 'none', expiresInDays: '' })} className="p-2 text-gray-500 hover:text-black"><Pencil size={16} /></button>
                <button onClick={() => removeLevel(level)} className="p-2 text-gray-500 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                {editing.id ? 'Edit' : 'Add'} {editing.audience === 'driver' ? 'Driver' : 'Rider'} Reward
              </h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-black"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass}>Title</label>
                <input className={inputClass} placeholder="e.g. 5 Rides" value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <input className={inputClass} placeholder="e.g. Unlock a Food Kit" value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Rides required</label>
                  <input type="number" min="1" className={inputClass} value={editing.rideCount} placeholder={editing.audience === 'driver' ? 'Completed trips' : 'Completed rides'}
                    onChange={(e) => setEditing({ ...editing, rideCount: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Sort order</label>
                  <input type="number" className={inputClass} value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {editing.audience !== 'driver' && (
                <div>
                  <label className={labelClass}>Reward type</label>
                  <select className={inputClass} value={editing.rewardType}
                    onChange={(e) => setEditing({ ...editing, rewardType: e.target.value })}>
                    <option value="gift">Gift (item delivered)</option>
                    <option value="coupon">Wallet coupon (ride-only)</option>
                  </select>
                </div>
                )}
                {editing.audience !== 'driver' && editing.rewardType === 'coupon' && (
                  <div>
                    <label className={labelClass}>Coupon amount (₹)</label>
                    <input type="number" min="0" className={inputClass} value={editing.walletAmount}
                      onChange={(e) => setEditing({ ...editing, walletAmount: e.target.value })} />
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Image</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                    {editing.image ? <img src={editing.image} alt="" className="w-full h-full object-contain" /> : <Gift size={24} className="text-gray-300" />}
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold cursor-pointer hover:bg-gray-50">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Upload
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>Expiry</label>
                <div className="grid grid-cols-2 gap-4">
                  <select className={inputClass} value={editing.expiryMode}
                    onChange={(e) => setEditing({ ...editing, expiryMode: e.target.value })}>
                    <option value="none">Never expires</option>
                    <option value="days">Expires after N days</option>
                    {editing.id && editing.expiresAt && (
                      <option value="keep">Keep current ({formatExpiry(editing.expiresAt)})</option>
                    )}
                  </select>
                  {editing.expiryMode === 'days' && (
                    <input type="number" min="1" className={inputClass} placeholder="Days, e.g. 2"
                      value={editing.expiresInDays}
                      onChange={(e) => setEditing({ ...editing, expiresInDays: e.target.value })} />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {editing.expiryMode === 'days' && expiryPreview(editing.expiresInDays)
                    ? `Expires on ${expiryPreview(editing.expiresInDays)}. Riders and drivers see this date; after it the reward is removed from the app.`
                    : 'Expired rewards disappear from the rider and driver apps and can no longer be claimed.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle value={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />
                <span className="text-sm font-semibold text-gray-700">Active</span>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-semibold text-gray-600">Cancel</button>
              <button onClick={saveLevel} disabled={savingLevel || uploading}
                className="flex items-center gap-2 px-6 py-2 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 disabled:opacity-50">
                {savingLevel ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RewardSettings;
