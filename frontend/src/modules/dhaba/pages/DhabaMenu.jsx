import React from 'react';
import FoodMenuEditor from '../../../shared/food/FoodMenuEditor';
import { dhabaApi } from '../services/dhabaApi';

const menuApi = {
  menu: () => dhabaApi.menu(),
  categories: () => dhabaApi.foodCategories(),
  add: (payload) => dhabaApi.addMenuItem(payload),
  update: (id, payload) => dhabaApi.updateMenuItem(id, payload),
  remove: (id) => dhabaApi.deleteMenuItem(id),
};

/// The dhaba's own menu: dishes with photos, filed under the shared food
/// categories the admin sets up.
const DhabaMenu = () => (
  <div className="space-y-5">
    <div>
      <h1 className="text-xl font-black text-slate-900">Menu & prices</h1>
      <p className="text-xs font-semibold text-slate-500">
        Passengers see only dishes marked available, at the price shown here, under each category. Add a photo to every dish - it sells.
      </p>
    </div>
    <FoodMenuEditor api={menuApi} emptyText="Your menu is empty. Add the dishes passengers can pre-order." />
  </div>
);

export default DhabaMenu;
