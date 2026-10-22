import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import toast from 'react-hot-toast';
import FoodImagePicker from './FoodImagePicker';

const EMPTY_ITEM = { name: '', price: '', categoryId: '', description: '', isVeg: true, available: true, image: '' };
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

const ItemForm = ({ initial, categories, saving, onCancel, onSave }) => {
  const [form, setForm] = useState(() => ({
    ...EMPTY_ITEM,
    ...initial,
    // A dish being added goes under the first category unless one is picked.
    categoryId: initial.categoryId || (initial.id ? '' : categories.find((category) => category.active)?.id || ''),
  }));
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.categoryId) {
      toast.error('Choose a category');
      return;
    }
    onSave({
      name: form.name,
      price: Number(form.price),
      categoryId: form.categoryId,
      description: form.description,
      isVeg: form.isVeg,
      available: form.available,
      image: form.image || '',
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row">
        <FoodImagePicker value={form.image} onChange={(image) => setForm((current) => ({ ...current, image }))} label="Dish photo" />
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className={labelClass}>Dish name</span>
            <input className={inputClass} value={form.name} onChange={set('name')} required maxLength={100} />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Price (₹)</span>
            <input className={inputClass} type="number" min="0" step="0.5" value={form.price} onChange={set('price')} required />
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Category</span>
            <select className={inputClass} value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id} disabled={!category.active && category.id !== form.categoryId}>
                  {category.name}
                  {category.active ? '' : ' (switched off)'}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={labelClass}>Description</span>
            <input className={inputClass} value={form.description} onChange={set('description')} maxLength={300} placeholder="Optional" />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={form.isVeg} onChange={set('isVeg')} /> Veg
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={form.available} onChange={set('available')} /> Available
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

const DishThumb = ({ src }) =>
  src ? (
    <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
      <UtensilsCrossed size={18} />
    </span>
  );

/**
 * A dhaba's menu: main food categories (with their picture) and the dishes
 * nested under each, with photos. Used by the admin's menu drawer and the
 * dhaba's own Menu page; `api` does the saving for whichever one it is.
 *
 *   api = { menu(), categories(), add(payload), update(id, payload), remove(id) }
 */
const FoodMenuEditor = ({ api, removeConfirmText = (item) => `Remove ${item.name} from the menu?`, onCountChange, emptyText = 'No dishes yet.' }) => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'new' | item id
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([api.menu(), api.categories()])
      .then(([menu, list]) => {
        if (!alive) return;
        setItems(Array.isArray(menu) ? menu : []);
        setCategories(Array.isArray(list) ? list : []);
      })
      .catch((error) => toast.error(error?.message || 'Could not load the menu'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceItems = (next) => {
    setItems(next);
    onCountChange?.(next.length);
  };

  // Categories in the admin's order with their dishes; dishes not yet filed
  // under one (older menus) come last, grouped by their old text label.
  const sections = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, { category, items: [] }]));
    const loose = new Map();
    items.forEach((item) => {
      const section = item.categoryId ? byId.get(item.categoryId) : null;
      if (section) {
        section.items.push(item);
        return;
      }
      const name = item.category || 'Meals';
      if (!loose.has(name)) loose.set(name, { category: { id: '', name, image: '', active: true, loose: true }, items: [] });
      loose.get(name).items.push(item);
    });
    return [...byId.values(), ...loose.values()].filter((section) => section.items.length > 0);
  }, [categories, items]);

  const save = async (payload) => {
    setSaving(true);
    try {
      if (editing === 'new') {
        replaceItems([...items, await api.add(payload)]);
      } else {
        const updated = await api.update(editing, payload);
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
      const updated = await api.update(item.id, { available: !item.available });
      replaceItems(items.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (error) {
      toast.error(error?.message || 'Could not update');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(removeConfirmText(item))) return;
    try {
      await api.remove(item.id);
      replaceItems(items.filter((entry) => entry.id !== item.id));
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

  const noCategories = !categories.some((category) => category.active);

  return (
    <div className="space-y-4">
      {noCategories ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-xs font-bold text-amber-800">
          No food categories are set up yet. The admin adds them under Dhaba & Food → Food Categories; dishes are filed under them.
        </p>
      ) : editing === 'new' ? (
        <ItemForm initial={EMPTY_ITEM} categories={categories} saving={saving} onCancel={() => setEditing(null)} onSave={save} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white py-3 text-xs font-black text-slate-700 hover:border-slate-400"
        >
          <Plus size={14} /> Add dish
        </button>
      )}

      {items.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">{emptyText}</p>
      ) : (
        sections.map(({ category, items: list }) => (
          <section key={category.id || `loose-${category.name}`} className="space-y-2 rounded-2xl border border-slate-100 bg-white/60 p-3">
            <div className="flex items-center gap-3">
              {category.image ? (
                <img src={category.image} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                  <UtensilsCrossed size={16} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black text-slate-900">{category.name}</h3>
                <p className="text-[11px] font-semibold text-slate-500">
                  {list.length} dish{list.length === 1 ? '' : 'es'}
                  {category.loose ? ' · not in a category yet - edit each dish to pick one' : ''}
                  {!category.active ? ' · category switched off, hidden from passengers' : ''}
                </p>
              </div>
            </div>
            {list.map((item) =>
              editing === item.id ? (
                <ItemForm key={item.id} initial={item} categories={categories} saving={saving} onCancel={() => setEditing(null)} onSave={save} />
              ) : (
                <div key={item.id} className={`flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-2.5 ${item.available ? '' : 'opacity-60'}`}>
                  <DishThumb src={item.image} />
                  <span className={`h-3 w-3 shrink-0 rounded-sm border-2 ${item.isVeg ? 'border-emerald-600' : 'border-rose-600'}`} title={item.isVeg ? 'Veg' : 'Non-veg'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{item.name}</p>
                    {item.description ? <p className="truncate text-xs font-medium text-slate-500">{item.description}</p> : null}
                  </div>
                  <p className="text-sm font-black text-slate-900">₹{item.price}</p>
                  <button
                    type="button"
                    onClick={() => toggleAvailable(item)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black ${item.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {item.available ? 'Available' : 'Sold out'}
                  </button>
                  <button type="button" onClick={() => setEditing(item.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${item.name}`}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => remove(item)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label={`Remove ${item.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ),
            )}
          </section>
        ))
      )}
    </div>
  );
};

export default FoodMenuEditor;
