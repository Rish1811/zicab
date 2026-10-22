import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Pencil, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';
import toast from 'react-hot-toast';
import FoodImagePicker from '../../../../shared/food/FoodImagePicker';
import { zibusAdminService } from '../../services/zibusAdminService';

const EMPTY = { name: '', description: '', image: '', active: true };
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-blue-400 focus:outline-none';
const Label = ({ children }) => <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{children}</span>;

const CategoryForm = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const isNew = !initial?.id;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description, active: form.active };
      // Only send the picture when it changed, so an unchanged one isn't re-sent.
      if (isNew || form.image !== initial.image) payload.image = form.image;
      const saved = isNew
        ? await zibusAdminService.createFoodCategory(payload)
        : await zibusAdminService.updateFoodCategory(initial.id, payload);
      toast.success(isNew ? 'Category added' : 'Category saved');
      onSaved(saved);
    } catch (error) {
      toast.error(error?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900">{isNew ? 'Add food category' : `Edit ${initial.name}`}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <FoodImagePicker value={form.image} onChange={(image) => setForm((current) => ({ ...current, image }))} label="Category photo" size="h-28 w-28" />
        <label className="block space-y-1">
          <Label>Name</Label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} placeholder="e.g. Thali, Snacks, Beverages" />
        </label>
        <label className="block space-y-1">
          <Label>Short description</Label>
          <input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="Optional" />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Show to passengers
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null} Save
          </button>
        </div>
      </form>
    </div>
  );
};

/// The shared main food categories every dhaba files its dishes under. Their
/// order here is the order passengers see in the app.
const FoodCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (new) | category
  const [dragIndex, setDragIndex] = useState(null);

  const load = () =>
    zibusAdminService
      .foodCategories()
      .then((list) => setCategories(Array.isArray(list) ? list : []))
      .catch((error) => toast.error(error?.message || 'Could not load categories'))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const saveOrder = async (next) => {
    const previous = categories;
    setCategories(next);
    try {
      setCategories(await zibusAdminService.reorderFoodCategories(next.map((category) => category.id)));
    } catch (error) {
      setCategories(previous);
      toast.error(error?.message || 'Could not save the order');
    }
  };

  const move = (from, to) => {
    if (to < 0 || to >= categories.length || from === to) return;
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveOrder(next);
  };

  const toggleActive = async (category) => {
    try {
      const updated = await zibusAdminService.updateFoodCategory(category.id, { active: !category.active });
      setCategories((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    } catch (error) {
      toast.error(error?.message || 'Could not update');
    }
  };

  const remove = async (category) => {
    if (!window.confirm(`Delete the ${category.name} category?`)) return;
    try {
      await zibusAdminService.deleteFoodCategory(category.id);
      setCategories((list) => list.filter((item) => item.id !== category.id));
      toast.success('Category deleted');
    } catch (error) {
      toast.error(error?.message || 'Could not delete');
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Dhaba & Food</p>
          <h1 className="text-2xl font-black text-slate-900">Food Categories</h1>
          <p className="text-xs font-semibold text-slate-500">
            The main sections of every dhaba menu. Drag (or use the arrows) to set the order passengers see.
          </p>
        </div>
        <button type="button" onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white">
          <Plus size={14} /> Add category
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : categories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
          No categories yet. Add Thali, Snacks, Beverages... with a photo each.
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div
              key={category.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 rounded-2xl border bg-white p-3 ${dragIndex === index ? 'border-blue-300 opacity-60' : 'border-slate-100'} ${category.active ? '' : 'opacity-70'}`}
            >
              <GripVertical size={16} className="hidden shrink-0 cursor-grab text-slate-300 sm:block" />
              {category.image ? (
                <img src={category.image} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-400"><UtensilsCrossed size={20} /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900">{category.name}</p>
                <p className="truncate text-xs font-semibold text-slate-500">
                  {category.productCount ?? 0} dish{category.productCount === 1 ? '' : 'es'} across dhabas
                  {category.description ? ` · ${category.description}` : ''}
                  {category.image ? '' : ' · no photo yet'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col">
                <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={13} /></button>
                <button type="button" onClick={() => move(index, index + 1)} disabled={index === categories.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={13} /></button>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(category)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${category.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                title={category.active ? 'Shown to passengers - click to hide' : 'Hidden from passengers - click to show'}
              >
                {category.active ? 'Live' : 'Off'}
              </button>
              <button type="button" onClick={() => setEditing(category)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${category.name}`}><Pencil size={14} /></button>
              <button type="button" onClick={() => remove(category)} className="shrink-0 rounded-lg p-2 text-rose-500 hover:bg-rose-50" aria-label={`Delete ${category.name}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <CategoryForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setCategories((list) =>
              list.some((item) => item.id === saved.id)
                ? list.map((item) => (item.id === saved.id ? { ...item, ...saved } : item))
                : [...list, saved],
            );
          }}
        />
      ) : null}
    </div>
  );
};

export default FoodCategories;
