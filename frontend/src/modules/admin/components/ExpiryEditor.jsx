import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';

/**
 * Change when a bought pass or plan ends: move it by days (extend or
 * shorten), set an exact date, or end it now. `onSave` gets the request body
 * for the expiry endpoint and should throw on failure.
 */

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const show = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No end date';

const MODES = [
  { value: 'shift', label: 'Add / remove days' },
  { value: 'set', label: 'Set exact date' },
  { value: 'end', label: 'End now' },
];

const ExpiryEditor = ({ title, subtitle, expiresAt, onSave, onClose }) => {
  const [mode, setMode] = useState('shift');
  const [days, setDays] = useState('');
  const [date, setDate] = useState(toLocalInput(expiresAt));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // "Now" as of opening the editor, so the preview stays steady while typing.
  const [openedAt] = useState(() => Date.now());

  const dayCount = Number(days);
  const validDays = Number.isInteger(dayCount) && dayCount !== 0;
  const base = expiresAt && new Date(expiresAt).getTime() > openedAt ? new Date(expiresAt) : new Date(openedAt);
  const preview =
    mode === 'end'
      ? new Date(openedAt)
      : mode === 'set'
        ? (date ? new Date(date) : null)
        : validDays
          ? new Date(base.getTime() + dayCount * 24 * 3600 * 1000)
          : null;
  const canSave = mode === 'end' || (mode === 'set' && date) || (mode === 'shift' && validDays);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        mode,
        ...(mode === 'shift' ? { days: dayCount } : {}),
        ...(mode === 'set' ? { expiresAt: new Date(date).toISOString() } : {}),
        note,
      });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-gray-500">
            Ends now: <span className="font-semibold text-gray-800">{show(expiresAt)}</span>
          </p>

          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  mode === m.value
                    ? m.value === 'end' ? 'border-rose-500 bg-rose-500 text-white' : 'border-yellow-400 bg-yellow-400 text-black'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'shift' && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Days (use a minus to shorten, e.g. -2)</label>
              <input
                type="number"
                step="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="4"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-yellow-400 focus:bg-white"
              />
            </div>
          )}

          {mode === 'set' && (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">New end date and time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-yellow-400 focus:bg-white"
              />
            </div>
          )}

          {mode === 'end' && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              It stops working right away. No money is refunded.
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-gray-500">Reason (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. app was down for 2 days"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-yellow-400 focus:bg-white"
            />
          </div>

          {preview && (
            <p className="text-xs text-gray-500">
              New end: <span className="font-semibold text-gray-900">{show(preview)}</span>
            </p>
          )}
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || saving}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-500 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpiryEditor;
