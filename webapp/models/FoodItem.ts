import mongoose, { Schema, Types } from 'mongoose'

export interface IFoodItem {
  _id?: Types.ObjectId
  name: string
  brand?: string
  category: string
  servingSize: number
  servingUnit: string
  alternateServings: { label: string; multiplier: number }[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
  barcode?: string
  isVerified: boolean
  createdBy?: Types.ObjectId
  usageCount: number
  createdAt?: Date
  updatedAt?: Date
}

const AlternateServingSchema = new Schema({
  label: { type: String, required: true },
  multiplier: { type: Number, required: true }
}, { _id: false })

const NutritionSchema = new Schema({
  calories: { type: Number, required: true },
  protein: { type: Number, required: true },
  carbs: { type: Number, required: true },
  fats: { type: Number, required: true },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number }
}, { _id: false })

const FoodItemSchema = new Schema<IFoodItem>({
  name: { type: String, required: true },
  brand: { type: String },
  category: {
    type: String,
    required: true,
    enum: ['Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy', 'Fat', 'Beverage', 'Condiment', 'Snack', 'Other']
  },
  servingSize: { type: Number, required: true },
  servingUnit: {
    type: String,
    required: true,
    enum: ['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop']
  },
  alternateServings: { type: [AlternateServingSchema], default: [] },
  nutrition: { type: NutritionSchema, required: true },
  barcode: { type: String },
  isVerified: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  usageCount: { type: Number, default: 0 }
}, {
  timestamps: true
})

// Indexes
FoodItemSchema.index({ name: 'text', brand: 'text' })
FoodItemSchema.index({ barcode: 1 }, { unique: true, sparse: true })
FoodItemSchema.index({ category: 1 })
FoodItemSchema.index({ createdBy: 1 })

export default mongoose.models.FoodItem || mongoose.model<IFoodItem>('FoodItem', FoodItemSchema)
