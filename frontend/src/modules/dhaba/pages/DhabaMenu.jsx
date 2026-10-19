import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { dhabaApi } from '../services/dhabaApi';

const EMPTY = { name: '', price: '', category: 'Meals', description: '', isVeg: true, available: true };

const ItemForm = ({ initial, onCancel, onSave, saving }) => {
  const [form, setForm] = useState(initial);
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ ...form, price: Number(form.price) });
      }}
      className="space-y-3 rounded-3xl border border-orange-200 bg-white p-5 shadow-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Item name</span>
          <input value={form.name} onChange={set('name')} required maxLength={100} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price (₹)</span>
          <input type="number" min="0" step="0.5" value={form.price} onChange={set('price')} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</span>
          <input value={form.category} onChange={set('category')} maxLength={60} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</span>
          <input value={form.description} onChange={set('description')} maxLength={300} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.isVeg} onChange={set('isVeg')} /> Veg
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.available} onChange={set('available')} /> Available today
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </form>
  );
};

const DhabaMenu = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | item id
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dhabaApi
      .menu()
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch((error) => toast.error(error?.message || 'Could not load the menu'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const key = item.category || 'Meals';
      map.set(key, [...(map.get(key) || []), item]);
    });
    return [...map.entries()];
  }, [items]);

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing === 'new') {
        const created = await dhabaApi.addMenuItem(payload);
        setItems((current) => [...current, created]);
      } else {
        const updated = await dhabaApi.updateMenuItem(editing, payload);
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
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
      const updated = await dhabaApi.updateMenuItem(item.id, { available: !item.available });
      setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (error) {
      toast.error(error?.message || 'Could not update');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return;
    try {
      await dhabaApi.deleteMenuItem(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (error) {
      toast.error(error?.message || 'Could not remove');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">Menu & prices</h1>
          <p className="text-xs font-semibold text-slate-500">Passengers see only items marked available, at the price shown here.</p>
        </div>
        {editing !== 'new' ? (
          <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-white">
            <Plus size={14} /> Add item
          </button>
        ) : null}
      </div>

      {editing === 'new' ? <ItemForm initial={EMPTY} onCancel={() => setEditing(null)} onSave={save} saving={saving} /> : null}

      {items.length === 0 && editing !== 'new' ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
          Your menu is empty. Add the dishes passengers can pre-order.
        </div>
      ) : null}

      {grouped.map(([category, list]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400">{category}</h2>
          {list.map((item) =>
            editing === item.id ? (
              <ItemForm key={item.id} initial={item} onCancel={() => setEditing(null)} onSave={save} saving={saving} />
            ) : (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-3 w-3 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-emerald-600' : 'border-rose-600'}`} />
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-black ${item.available ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{item.name}</p>
                    {item.description ? <p className="truncate text-xs font-semibold text-slate-500">{item.description}</p> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-900">₹{item.price}</span>
                  <button
                    type="button"
                    onClick={() => toggleAvailable(item)}
                    className={`rounded-full px-3 py-1 text-[10px] font-black ${item.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {item.available ? 'Available' : 'Sold out'}
                  </button>
                  <button type="button" onClick={() => setEditing(item.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${item.name}`}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => remove(item)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label={`Delete ${item.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ),
          )}
        </section>
      ))}
      {editing && editing !== 'new' && !items.some((item) => item.id === editing) ? (
        <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1 text-xs font-bold text-slate-500">
          <X size={12} /> Close editor
        </button>
      ) : null}
    </div>
  );
};

export default DhabaMenu;
