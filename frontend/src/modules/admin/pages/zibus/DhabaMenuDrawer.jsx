import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { zibusAdminService } from '../../services/zibusAdminService';

const EMPTY_ITEM = { name: '', price: '', category: 'Meals', description: '', isVeg: true, available: true };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';

const ItemForm = ({ initial, saving, onCancel, onSave }) => {
  const [form, setForm] = useState(initial);
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, price: Number(form.price) });
      }}
      className="space-y-3 rounded-2xl border border-blue-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inputClass} value={form.name} onChange={set('name')} placeholder="Item name" required maxLength={100} aria-label="Item name" />
        <input className={inputClass} type="number" min="0" step="0.5" value={form.price} onChange={set('price')} placeholder="Price ₹" required aria-label="Price" />
        <input className={inputClass} value={form.category} onChange={set('category')} placeholder="Category" maxLength={60} aria-label="Category" />
        <input className={inputClass} value={form.description} onChange={set('description')} placeholder="Description (optional)" maxLength={300} aria-label="Description" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.isVeg} onChange={set('isVeg')} /> Veg</label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.available} onChange={set('available')} /> Available</label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </form>
  );
};

/// Admin view and edit of one dhaba's menu: the same rules as the partner's
/// own Menu page, for setting a menu up on a dhaba's behalf or fixing prices.
const DhabaMenuDrawer = ({ dhaba, onClose, onCountChange }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | item id
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    zibusAdminService
      .dhabaMenu(dhaba.id)
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch((error) => toast.error(error?.message || 'Could not load the menu'))
      .finally(() => setLoading(false));
  }, [dhaba.id]);

  const replaceItems = (next) => {
    setItems(next);
    onCountChange?.(next.length);
  };

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((item) => map.set(item.category || 'Meals', [...(map.get(item.category || 'Meals') || []), item]));
    return [...map.entries()];
  }, [items]);

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing === 'new') {
        replaceItems([...items, await zibusAdminService.addDhabaMenuItem(dhaba.id, payload)]);
      } else {
        const updated = await zibusAdminService.updateDhabaMenuItem(dhaba.id, editing, payload);
        replaceItems(items.map((item) => (item.id === updated.id ? updated : item)));
      }
      setEditing(null);
      toast.success('Menu saved');
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (item) => {
    try {
      const updated = await zibusAdminService.updateDhabaMenuItem(dhaba.id, item.id, { available: !item.available });
      replaceItems(items.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (error) {
      toast.error(error?.message || 'Could not update');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.name} from ${dhaba.name}'s menu?`)) return;
    try {
      await zibusAdminService.deleteDhabaMenuItem(dhaba.id, item.id);
      replaceItems(items.filter((entry) => entry.id !== item.id));
    } catch (error) {
      toast.error(error?.message || 'Could not remove');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-2xl space-y-4 overflow-y-auto bg-[#F8F9FA] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Menu</p>
            <h2 className="text-xl font-black text-slate-900">{dhaba.name}</h2>
            <p className="text-xs font-semibold text-slate-500">Changes show to passengers straight away.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-200" aria-label="Close"><X size={18} /></button>
        </div>

        {editing === 'new' ? (
          <ItemForm initial={EMPTY_ITEM} saving={saving} onCancel={() => setEditing(null)} onSave={save} />
        ) : (
          <button type="button" onClick={() => setEditing('new')} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white py-3 text-xs font-black text-slate-700 hover:border-slate-400">
            <Plus size={14} /> Add item
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : items.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">No menu items yet.</p>
        ) : (
          grouped.map(([category, list]) => (
            <section key={category} className="space-y-2">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{category}</h3>
              {list.map((item) =>
                editing === item.id ? (
                  <ItemForm key={item.id} initial={item} saving={saving} onCancel={() => setEditing(null)} onSave={save} />
                ) : (
                  <div key={item.id} className={`flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 ${item.available ? '' : 'opacity-60'}`}>
                    <span className={`h-3 w-3 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-emerald-600' : 'border-rose-600'}`} title={item.isVeg ? 'Veg' : 'Non-veg'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
                      {item.description ? <p className="truncate text-xs font-medium text-slate-500">{item.description}</p> : null}
                    </div>
                    <p className="text-sm font-black text-slate-900">₹{item.price}</p>
                    <button type="button" onClick={() => toggleAvailable(item)} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {item.available ? 'Available' : 'Off'}
                    </button>
                    <button type="button" onClick={() => setEditing(item.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${item.name}`}><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(item)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button>
                  </div>
                ),
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
};

export default DhabaMenuDrawer;
