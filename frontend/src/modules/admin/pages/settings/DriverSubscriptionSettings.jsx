import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';
import ExpiryEditor from '../../components/ExpiryEditor';

/**
 * The daily pass a driver buys instead of paying commission per trip.
 *
 * Everything here is a choice rather than something fixed in the code: whether
 * a pass is required at all, whether it waives commission and the wallet
 * minimum, what happens when it lapses, and when the day rolls over.
 */

const SectionHeader = ({ title, hint }) => (
  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/30">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-yellow-400 rounded-full" />
      <h3 className="text-[13px] font-bold text-gray-800">{title}</h3>
    </div>
    {hint && <p className="text-xs text-gray-500 mt-1 ml-4">{hint}</p>}
  </div>
);

const ToggleRow = ({ label, hint, checked, onChange }) => (
  <div className="flex items-start justify-between gap-6 py-4 border-b border-gray-100 last:border-0">
    <div>
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-yellow-400' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

const ChoiceRow = ({ label, hint, value, options, onChange }) => (
  <div className="py-4 border-b border-gray-100 last:border-0">
    <p className="text-sm font-medium text-gray-800">{label}</p>
    {hint && <p className="text-xs text-gray-500 mt-0.5 mb-2">{hint}</p>}
    <div className="flex flex-wrap gap-2 mt-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
            value === option.value
              ? 'bg-yellow-400 border-yellow-400 text-black'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const isOn = (value) => ['1', 'true', 'yes', 'on', true].includes(typeof value === 'string' ? value.toLowerCase() : value);
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

const VEHICLE_CLASSES = ['bike', 'auto', 'car'];
const METHOD_LABELS = { trial: 'Free trial', bonus: 'Joining bonus', wallet: 'Wallet', razorpay: 'Online', phonepe: 'Online', admin: 'Admin' };

const inputClass = 'bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-yellow-400';

/**
 * One plan: shown as a line, or as a small form while being edited. The free
 * trial lives here because it belongs to the plan - a car plan can give a
 * week free while the bike plan gives none.
 */
const PlanRow = ({ plan, onSaved, onRemove }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);

  const startEdit = () => {
    setDraft({
      name: plan.name || '',
      amount: String(plan.amount ?? ''),
      vehicle_classes: [...(plan.vehicle_classes || [])],
      free_trial_enabled: Boolean(plan.free_trial_enabled),
      free_trial_days: String(plan.free_trial_days || 7),
    });
    setEditing(true);
  };

  const toggleClass = (value) =>
    setDraft((previous) => ({
      ...previous,
      vehicle_classes: previous.vehicle_classes.includes(value)
        ? previous.vehicle_classes.filter((item) => item !== value)
        : [...previous.vehicle_classes, value],
    }));

  const save = async () => {
    if (!draft.name.trim() || !Number(draft.amount)) {
      toast.error('Give the plan a name and a price');
      return;
    }
    const days = Math.floor(Number(draft.free_trial_days));
    if (draft.free_trial_enabled && !(days >= 1)) {
      toast.error('Give the free trial at least 1 day');
      return;
    }

    try {
      setSaving(true);
      await api.patch(`/admin/driver-subscriptions/plans/${plan._id}`, {
        name: draft.name.trim(),
        amount: Number(draft.amount),
        vehicle_classes: draft.vehicle_classes,
        free_trial_enabled: draft.free_trial_enabled,
        free_trial_days: draft.free_trial_enabled ? days : Math.max(0, days || 0),
      });
      toast.success('Plan saved');
      setEditing(false);
      onSaved();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not save plan');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const trialDays = plan.free_trial_enabled ? Number(plan.free_trial_days || 0) : 0;
    return (
      <div className="flex items-center justify-between gap-4 border border-gray-100 rounded-lg px-4 py-3">
        <div>
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            {plan.name}
            {trialDays > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {trialDays}-day free trial
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {money(plan.amount)} per day ·{' '}
            {(plan.vehicle_classes || []).length ? plan.vehicle_classes.join(', ') : 'all vehicle types'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={startEdit}
            className="text-gray-700 hover:bg-gray-50 p-2 rounded-lg transition-colors"
            aria-label={`Edit ${plan.name}`}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(plan._id)}
            className="text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors"
            aria-label={`Remove ${plan.name}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-yellow-300 bg-yellow-50/30 rounded-lg px-4 py-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Plan name</label>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Price per day</label>
          <input
            type="number"
            min="0"
            value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            className={`w-28 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Covers</label>
          <div className="flex gap-2">
            {VEHICLE_CLASSES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleClass(value)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border capitalize transition-colors ${
                  draft.vehicle_classes.includes(value)
                    ? 'bg-yellow-400 border-yellow-400 text-black'
                    : 'bg-white border-gray-200 text-gray-600'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-lg px-4">
        <ToggleRow
          label="Free trial for new drivers"
          hint="Every new driver on this plan gets these days free, once, as soon as they are approved. Drivers who have already had a pass do not get it. Their joining bonus stays in the wallet as cash."
          checked={draft.free_trial_enabled}
          onChange={(value) => setDraft({ ...draft, free_trial_enabled: value })}
        />
        {draft.free_trial_enabled && (
          <div className="py-4 flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="365"
              value={draft.free_trial_days}
              onChange={(event) => setDraft({ ...draft, free_trial_days: event.target.value })}
              className={`w-20 ${inputClass}`}
              aria-label="Free trial days"
            />
            <span className="text-sm text-gray-600">days free</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-black text-xs font-bold px-4 py-2.5 rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save plan
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 border border-gray-200 bg-white text-gray-700 text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-gray-50"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    </div>
  );
};

const DriverSubscriptionSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState({ results: [], total: 0, collected: 0 });
  const [newPlan, setNewPlan] = useState({ name: '', amount: '', vehicle_classes: [] });
  const [editingPass, setEditingPass] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, plansRes, paymentsRes] = await Promise.all([
        api.get('/admin/general-settings/driver-subscription'),
        api.get('/admin/driver-subscriptions/plans/list'),
        api.get('/admin/driver-subscriptions/payments'),
      ]);
      setSettings(settingsRes.data?.settings || {});
      setPlans(plansRes.data?.data?.results || plansRes.data?.results || []);
      const payload = paymentsRes.data?.data || paymentsRes.data || {};
      setPayments({ results: payload.results || [], total: payload.total || 0, collected: payload.collected || 0 });
    } catch (error) {
      console.error(error);
      toast.error('Could not load subscription settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => setSettings((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    try {
      setSaving(true);
      await api.patch('/admin/general-settings/driver-subscription', { settings });
      toast.success('Subscription settings saved');
    } catch (error) {
      console.error(error);
      toast.error('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const createPlan = async () => {
    if (!newPlan.name.trim() || !Number(newPlan.amount)) {
      toast.error('Give the plan a name and a price');
      return;
    }

    try {
      await api.post('/admin/driver-subscriptions/plans/create', {
        name: newPlan.name.trim(),
        amount: Number(newPlan.amount),
        duration: 1,
        vehicle_classes: newPlan.vehicle_classes,
      });
      setNewPlan({ name: '', amount: '', vehicle_classes: [] });
      toast.success('Plan added');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not add plan');
    }
  };

  const removePlan = async (id) => {
    try {
      await api.delete(`/admin/driver-subscriptions/plans/${id}`);
      toast.success('Plan removed');
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Could not remove plan');
    }
  };

  const togglePlanClass = (value) =>
    setNewPlan((previous) => ({
      ...previous,
      vehicle_classes: previous.vehicle_classes.includes(value)
        ? previous.vehicle_classes.filter((item) => item !== value)
        : [...previous.vehicle_classes, value],
    }));

  const paymentMethods = String(settings.payment_methods || 'wallet,gateway').split(',').map((item) => item.trim());
  const setPaymentMethod = (value) => {
    const next = paymentMethods.includes(value)
      ? paymentMethods.filter((item) => item !== value)
      : [...paymentMethods, value];
    set('payment_methods', (next.length ? next : ['wallet']).join(','));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading subscription settings...
      </div>
    );
  }

  const mode = String(settings.subscription_mode || 'off');

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Driver Subscription</h2>
          <p className="text-xs text-gray-500 mt-0.5">A daily pass drivers buy instead of paying commission per trip.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-black text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save settings
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <SectionHeader title="How drivers pay ZI CAB" />
        <div className="px-6">
          <ChoiceRow
            label="Subscription mode"
            hint="Off keeps the commission model exactly as it is today."
            value={mode}
            onChange={(value) => set('subscription_mode', value)}
            options={[
              { value: 'off', label: 'Off - commission only' },
              { value: 'both', label: 'Both - driver may buy a pass' },
              { value: 'subscription_only', label: 'Subscription required' },
            ]}
          />
          <ToggleRow
            label="Waive commission while a pass is active"
            hint="Driver keeps the full fare. The rider's platform fee still goes to ZI CAB."
            checked={isOn(settings.waive_commission)}
            onChange={(value) => set('waive_commission', value ? '1' : '0')}
          />
          <ToggleRow
            label="Waive the wallet minimum while a pass is active"
            hint="No top-up needed to keep receiving rides for the day."
            checked={isOn(settings.waive_wallet_minimum)}
            onChange={(value) => set('waive_wallet_minimum', value ? '1' : '0')}
          />
          <ChoiceRow
            label="Driver registered for several vehicle types"
            hint="A driver with both an auto and a cab."
            value={String(settings.multi_vehicle_rule || 'highest')}
            onChange={(value) => set('multi_vehicle_rule', value)}
            options={[
              { value: 'highest', label: 'Charge the dearest plan, allow all types' },
              { value: 'driver_choice', label: 'Driver picks; pass covers only its own types' },
            ]}
          />
          <div className="py-4 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">How a driver may pay</p>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">At least one must stay on.</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'wallet', label: 'ZI CAB wallet balance' },
                { value: 'gateway', label: 'UPI / card' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPaymentMethod(option.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    paymentMethods.includes(option.value)
                      ? 'bg-yellow-400 border-yellow-400 text-black'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <ChoiceRow
            label="When a pass expires and is not renewed"
            value={String(settings.on_expiry || 'commission')}
            onChange={(value) => set('on_expiry', value)}
            options={[
              { value: 'commission', label: 'Back to commission' },
              { value: 'block', label: 'Stop sending rides' },
            ]}
          />
          <div className="py-4 flex flex-wrap items-end gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">Day starts at</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">
                A pass runs to this hour the next day, whatever time it was bought.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={settings.cycle_start_hour ?? '6'}
                  onChange={(event) => set('cycle_start_hour', event.target.value)}
                  className="w-20 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-yellow-400"
                />
                <span className="text-sm text-gray-600">:00</span>
                <input
                  type="text"
                  value={settings.cycle_timezone || 'Asia/Kolkata'}
                  onChange={(event) => set('cycle_timezone', event.target.value)}
                  className="w-44 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-yellow-400"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <SectionHeader title="Plans" hint="What a driver is charged, by the kind of vehicle they drive." />
        <div className="p-6 space-y-4">
          {plans.length === 0 && <p className="text-sm text-gray-500">No plans yet. Add one below.</p>}

          {plans.map((plan) => (
            <PlanRow key={plan._id} plan={plan} onSaved={load} onRemove={removePlan} />
          ))}

          <div className="border-t border-gray-100 pt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Plan name</label>
              <input
                value={newPlan.name}
                onChange={(event) => setNewPlan({ ...newPlan, name: event.target.value })}
                placeholder="Daily Subscription"
                className="bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Price per day</label>
              <input
                type="number"
                value={newPlan.amount}
                onChange={(event) => setNewPlan({ ...newPlan, amount: event.target.value })}
                placeholder="29"
                className="w-28 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm outline-none focus:border-yellow-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Covers</label>
              <div className="flex gap-2">
                {VEHICLE_CLASSES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => togglePlanClass(value)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border capitalize transition-colors ${
                      newPlan.vehicle_classes.includes(value)
                        ? 'bg-yellow-400 border-yellow-400 text-black'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={createPlan}
              className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus size={14} /> Add plan
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <SectionHeader
          title="Payment history"
          hint={`${payments.total} payment(s) · ${money(payments.collected)} collected on this page`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-3 font-bold">Driver</th>
                <th className="text-left px-4 py-3 font-bold">Plan</th>
                <th className="text-left px-4 py-3 font-bold">Paid</th>
                <th className="text-left px-4 py-3 font-bold">Method</th>
                <th className="text-left px-4 py-3 font-bold">Valid until</th>
                <th className="text-left px-4 py-3 font-bold">Trips</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.results.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No subscription payments yet.
                  </td>
                </tr>
              )}
              {payments.results.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-6 py-3">
                    <p className="font-semibold text-gray-900">{row.driverName}</p>
                    <p className="text-xs text-gray-500">{row.driverPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.planName}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{money(row.amount)}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{METHOD_LABELS[row.paymentMethod] || row.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-600">{when(row.expiresAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.tripsCovered || 0}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-bold px-2 py-1 rounded ${
                        row.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {row.active ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingPass(row)}
                      className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      Change end
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingPass && (
        <ExpiryEditor
          title={`Change end: ${editingPass.driverName}`}
          subtitle={`${editingPass.planName || 'Pass'} · ${editingPass.driverPhone || ''}`}
          expiresAt={editingPass.expiresAt}
          onClose={() => setEditingPass(null)}
          onSave={async (body) => {
            await api.patch(`/admin/driver-subscriptions/passes/${editingPass.id}/expiry`, body);
            setEditingPass(null);
            toast.success('Pass end changed');
            load();
          }}
        />
      )}
    </div>
  );
};

export default DriverSubscriptionSettings;
