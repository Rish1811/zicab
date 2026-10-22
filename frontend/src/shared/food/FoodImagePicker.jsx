import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { compressFoodImage } from './foodImage';

/// A square photo slot: shows the current picture (an address or a freshly
/// picked data URL), lets one be picked or removed. `value` is '' for none.
const FoodImagePicker = ({ value, onChange, label = 'Photo', size = 'h-24 w-24' }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressFoodImage(file));
    } catch (error) {
      toast.error(error?.message || 'Could not use that image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative ${size} shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-slate-400`}
        aria-label={value ? `Change ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      >
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            {label}
          </span>
        )}
      </button>
      <div className="space-y-1 text-[11px] font-semibold text-slate-500">
        <button type="button" onClick={() => inputRef.current?.click()} className="block font-black text-slate-700 hover:underline">
          {value ? 'Change photo' : 'Upload photo'}
        </button>
        {value ? (
          <button type="button" onClick={() => onChange('')} className="flex items-center gap-1 text-rose-500 hover:underline">
            <X size={11} /> Remove
          </button>
        ) : (
          <p>JPG or PNG, square works best</p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
};

export default FoodImagePicker;
