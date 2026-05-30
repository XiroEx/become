import mongoose, { Schema } from 'mongoose'

export interface IOpenFoodFact {
  code: string
  product_name: string
  brands?: string
  category?: string
  categories_tags?: string
  countries_tags?: string
  nutriments: {
    energy_kcal_100g: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
    fiber_100g?: number
    sugars_100g?: number
    sodium_100g?: number
    saturated_fat_100g?: number
  }
  serving_size?: string
  serving_quantity?: number
  serving_unit?: string
  nutriscore_grade?: string
  image_url?: string
}

const NutrimentsSchema = new Schema({
  energy_kcal_100g: { type: Number, required: true },
  proteins_100g: { type: Number },
  carbohydrates_100g: { type: Number },
  fat_100g: { type: Number },
  fiber_100g: { type: Number },
  sugars_100g: { type: Number },
  sodium_100g: { type: Number },
  saturated_fat_100g: { type: Number }
}, { _id: false })

const OpenFoodFactSchema = new Schema<IOpenFoodFact>({
  code: { type: String, required: true },
  product_name: { type: String, required: true },
  brands: { type: String },
  category: {
    type: String,
    enum: ['Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy', 'Fat', 'Beverage', 'Condiment', 'Snack', 'Other']
  },
  categories_tags: { type: String },
  countries_tags: { type: String },
  nutriments: { type: NutrimentsSchema, required: true },
  serving_size: { type: String },
  serving_quantity: { type: Number },
  serving_unit: { type: String },
  nutriscore_grade: { type: String },
  image_url: { type: String }
}, {
  timestamps: false,
  collection: 'openfoodfacts'
})

// Indexes
OpenFoodFactSchema.index({ product_name: 'text', brands: 'text' })
OpenFoodFactSchema.index({ code: 1 }, { unique: true })
OpenFoodFactSchema.index({ category: 1 })

export default mongoose.models.OpenFoodFact || mongoose.model<IOpenFoodFact>('OpenFoodFact', OpenFoodFactSchema)
