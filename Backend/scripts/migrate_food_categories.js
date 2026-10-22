// Files every existing dhaba dish under a shared food category.
//
// Dishes used to carry a free-text category ("Meals", "snacks" ...). This
// creates one FoodCategory per distinct name (case and spacing ignored) and
// links each dish not yet linked to it. Dry run by default; --apply writes.
//
//   node scripts/migrate_food_categories.js           # preview
//   node scripts/migrate_food_categories.js --apply   # write
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Dhaba } from '../src/modules/taxi/bus/models/Dhaba.js';
import { FoodCategory } from '../src/modules/taxi/bus/models/FoodCategory.js';
import { foodCategoryKey } from '../src/modules/taxi/bus/services/foodCategoryService.js';

dotenv.config();

const apply = process.argv.includes('--apply');

const titleCase = (text) =>
  String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });

  const dhabas = await Dhaba.find({ 'menu.0': { $exists: true } });
  const existing = await FoodCategory.find().lean();
  const byKey = new Map(existing.map((category) => [category.nameKey, category]));
  let nextOrder = existing.reduce((max, category) => Math.max(max, Number(category.order || 0)), 0);

  const plan = new Map(); // key -> { name, dishes }
  for (const dhaba of dhabas) {
    for (const dish of dhaba.menu) {
      if (dish.categoryId) continue;
      const name = titleCase(dish.category || 'Meals') || 'Meals';
      const key = foodCategoryKey(name);
      if (!plan.has(key)) plan.set(key, { name, dishes: [] });
      plan.get(key).dishes.push(`${dhaba.name}: ${dish.name}`);
    }
  }

  if (!plan.size) {
    console.log('Every dish is already filed under a category.');
    return;
  }
  for (const [key, entry] of plan) {
    console.log(`${byKey.has(key) ? 'existing' : 'NEW'} category "${byKey.get(key)?.name || entry.name}" <- ${entry.dishes.length} dish(es)`);
    entry.dishes.forEach((dish) => console.log(`    ${dish}`));
  }
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  for (const [key, entry] of plan) {
    if (!byKey.has(key)) {
      nextOrder += 1;
      const created = await FoodCategory.create({ name: entry.name, nameKey: key, order: nextOrder });
      byKey.set(key, created.toObject());
    }
  }

  let linked = 0;
  for (const dhaba of dhabas) {
    let changed = false;
    for (const dish of dhaba.menu) {
      if (dish.categoryId) continue;
      const category = byKey.get(foodCategoryKey(titleCase(dish.category || 'Meals') || 'Meals'));
      dish.categoryId = category._id;
      dish.category = category.name;
      changed = true;
      linked += 1;
    }
    if (changed) await dhaba.save();
  }
  console.log(`\nLinked ${linked} dish(es).`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
