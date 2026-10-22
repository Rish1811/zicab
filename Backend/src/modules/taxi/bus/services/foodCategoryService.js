import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { uploadDataUrl } from '../../../../utils/fileUpload.js';
import { Dhaba } from '../models/Dhaba.js';
import { FoodCategory } from '../models/FoodCategory.js';

const MAX_CATEGORIES = 100;

export const foodCategoryKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const serializeFoodCategory = (category, { productCount } = {}) => ({
  id: String(category._id),
  name: category.name,
  description: category.description || '',
  image: category.image || '',
  order: Number(category.order || 0),
  active: category.active !== false,
  ...(productCount !== undefined ? { productCount } : {}),
});

/// A data URL is uploaded and its address returned; anything else (an
/// existing address, or '' to clear) is kept as it is.
export const resolveFoodImage = async (value, { prefix, suffix = '' } = {}) => {
  const text = String(value ?? '').trim();
  if (!text.startsWith('data:')) {
    return text;
  }
  const uploaded = await uploadDataUrl({
    dataUrl: text,
    folder: 'dhaba-food',
    publicIdPrefix: prefix,
    publicIdSuffix: suffix || String(Date.now()),
  });
  return uploaded.secureUrl;
};

export const listFoodCategories = async ({ activeOnly = false } = {}) =>
  FoodCategory.find(activeOnly ? { active: true } : {}).sort({ order: 1, name: 1 }).lean();

/// Every category with how many dishes across all dhabas are filed under it.
export const listFoodCategoriesWithCounts = async () => {
  const [categories, counts] = await Promise.all([
    listFoodCategories(),
    Dhaba.aggregate([
      { $unwind: '$menu' },
      { $match: { 'menu.categoryId': { $ne: null } } },
      { $group: { _id: '$menu.categoryId', count: { $sum: 1 } } },
    ]),
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));
  return categories.map((category) =>
    serializeFoodCategory(category, { productCount: countById.get(String(category._id)) || 0 }),
  );
};

const readCategoryInput = (body = {}, { partial = false } = {}) => {
  const input = {};
  if (!partial || body.name !== undefined) {
    input.name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!input.name) throw new ApiError(400, 'Category name is required');
    input.nameKey = foodCategoryKey(input.name);
  }
  if (body.description !== undefined) input.description = String(body.description || '').trim().slice(0, 200);
  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isFinite(order)) throw new ApiError(400, 'Order must be a number');
    input.order = Math.round(order);
  }
  if (body.active !== undefined) input.active = Boolean(body.active);
  return input;
};

const assertNameFree = async (nameKey, exceptId = null) => {
  const clash = await FoodCategory.findOne({ nameKey, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .select('_id')
    .lean();
  if (clash) throw new ApiError(409, 'A category with this name already exists');
};

const loadCategory = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Valid category id is required');
  const category = await FoodCategory.findById(id);
  if (!category) throw new ApiError(404, 'Food category not found');
  return category;
};

export const createFoodCategory = async (body = {}) => {
  const input = readCategoryInput(body);
  await assertNameFree(input.nameKey);
  if ((await FoodCategory.countDocuments()) >= MAX_CATEGORIES) {
    throw new ApiError(400, `At most ${MAX_CATEGORIES} food categories`);
  }
  if (input.order === undefined) {
    const last = await FoodCategory.findOne().sort({ order: -1 }).select('order').lean();
    input.order = Number(last?.order || 0) + 1;
  }
  input.image = await resolveFoodImage(body.image, { prefix: 'food-category' });
  const category = await FoodCategory.create(input);
  return serializeFoodCategory(category, { productCount: 0 });
};

export const updateFoodCategory = async (id, body = {}) => {
  const category = await loadCategory(id);
  const input = readCategoryInput(body, { partial: true });
  if (input.nameKey) await assertNameFree(input.nameKey, category._id);
  if (body.image !== undefined) {
    input.image = await resolveFoodImage(body.image, { prefix: 'food-category', suffix: String(category._id) + '-' + Date.now() });
  }
  const renamed = input.name && input.name !== category.name;
  Object.assign(category, input);
  await category.save();

  // Dishes keep the category name as text too (older apps group on it).
  if (renamed) {
    await Dhaba.updateMany(
      { 'menu.categoryId': category._id },
      { $set: { 'menu.$[dish].category': category.name } },
      { arrayFilters: [{ 'dish.categoryId': category._id }] },
    );
  }
  return serializeFoodCategory(category);
};

export const deleteFoodCategory = async (id) => {
  const category = await loadCategory(id);
  const inUse = await Dhaba.countDocuments({ 'menu.categoryId': category._id });
  if (inUse) {
    throw new ApiError(
      409,
      'Dishes are still filed under this category. Move them to another category, or switch this one off instead.',
    );
  }
  await category.deleteOne();
  return { deleted: true };
};

/// Saves the admin's drag-and-drop order: ids in the order shown.
export const reorderFoodCategories = async (ids = []) => {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(mongoose.isValidObjectId);
  if (!list.length) throw new ApiError(400, 'Category order is required');
  await FoodCategory.bulkWrite(
    list.map((categoryId, index) => ({
      updateOne: { filter: { _id: categoryId }, update: { $set: { order: index + 1 } } },
    })),
  );
  return listFoodCategoriesWithCounts();
};

/// The category a dish is being filed under; it must exist and be switched on.
export const requireActiveFoodCategory = async (categoryId) => {
  if (!mongoose.isValidObjectId(categoryId)) throw new ApiError(400, 'Choose a food category');
  const category = await FoodCategory.findById(categoryId).lean();
  if (!category) throw new ApiError(404, 'Food category not found');
  if (category.active === false) throw new ApiError(400, 'That food category is switched off');
  return category;
};

/**
 * A dhaba's (serialized, available) dishes grouped under their categories in
 * the admin's order. A dish in a switched-off category is left out. Dishes not
 * yet filed under a category are grouped by their old text category, after the
 * real ones.
 */
export const groupMenuByCategory = (menu = [], categories = []) => {
  const groups = new Map(
    categories
      .filter((category) => category.active !== false)
      .map((category) => [String(category._id), { ...serializeFoodCategory(category), items: [] }]),
  );
  const inactive = new Set(categories.filter((category) => category.active === false).map((category) => String(category._id)));
  const loose = new Map();

  for (const item of menu) {
    if (item.categoryId && inactive.has(item.categoryId)) continue;
    const group = item.categoryId ? groups.get(item.categoryId) : null;
    if (group) {
      group.items.push(item);
      continue;
    }
    const name = item.category || 'Meals';
    const key = foodCategoryKey(name);
    if (!loose.has(key)) {
      loose.set(key, { id: '', name, description: '', image: '', order: 9999, active: true, items: [] });
    }
    loose.get(key).items.push(item);
  }

  return [...groups.values(), ...loose.values()].filter((group) => group.items.length > 0);
};
