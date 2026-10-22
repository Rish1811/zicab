import mongoose from 'mongoose';

// The main food categories (Thali, Snacks, Beverages ...) every dhaba files
// its dishes under. One shared list the admin runs, so the rider app looks the
// same at every stop and each category has one good picture.
const foodCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lower-cased name, so "Snacks" and "snacks " can't both exist.
    nameKey: { type: String, required: true, unique: true },
    description: { type: String, default: '', trim: true },
    image: { type: String, default: '', trim: true },
    order: { type: Number, default: 0 },
    // Off hides the category and every dish in it from riders.
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const FoodCategory =
  mongoose.models.TaxiFoodCategory || mongoose.model('TaxiFoodCategory', foodCategorySchema);
