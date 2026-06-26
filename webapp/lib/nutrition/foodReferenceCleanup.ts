import mongoose from 'mongoose'
import User from '../../models/User'
import Meal from '../../models/Meal'
import MealLog from '../../models/MealLog'
import MealPlan from '../../models/MealPlan'
import Recipe from '../../models/Recipe'
import PlateScan from '../../models/PlateScan'

export interface FoodReferenceCleanupResult {
  savedFoodsModified: number
  mealLogsModified: number
  mealPlansModified: number
  mealsModified: number
  recipeIngredientsModified: number
  recipeSavedFoodModified: number
  plateScansModified: number
}

export async function clearFoodReferences(
  foodId: mongoose.Types.ObjectId | string,
): Promise<FoodReferenceCleanupResult> {
  const foodObjectId = typeof foodId === 'string'
    ? new mongoose.Types.ObjectId(foodId)
    : foodId
  const itemFilter = [{ 'item.foodId': foodObjectId }]
  const ingredientFilter = [{ 'ingredient.foodId': foodObjectId }]

  const [
    savedFoods,
    mealLogs,
    mealPlans,
    meals,
    recipeIngredients,
    recipeSavedFood,
    plateScans,
  ] = await Promise.all([
    User.updateMany(
      { 'savedFoods.foodId': foodObjectId },
      { $pull: { savedFoods: { foodId: foodObjectId } } },
    ),
    MealLog.updateMany(
      { 'items.foodId': foodObjectId },
      { $unset: { 'items.$[item].foodId': '' } },
      { arrayFilters: itemFilter },
    ),
    MealPlan.updateMany(
      { 'items.foodId': foodObjectId },
      { $unset: { 'items.$[item].foodId': '' } },
      { arrayFilters: itemFilter },
    ),
    Meal.updateMany(
      { 'items.foodId': foodObjectId },
      { $unset: { 'items.$[item].foodId': '' } },
      { arrayFilters: itemFilter },
    ),
    Recipe.updateMany(
      { 'ingredients.foodId': foodObjectId },
      { $unset: { 'ingredients.$[ingredient].foodId': '' } },
      { arrayFilters: ingredientFilter },
    ),
    Recipe.updateMany(
      { savedFoodId: foodObjectId },
      { $unset: { savedFoodId: '' } },
    ),
    PlateScan.updateMany(
      { 'items.foodId': foodObjectId },
      { $unset: { 'items.$[item].foodId': '' } },
      { arrayFilters: itemFilter },
    ),
  ])

  return {
    savedFoodsModified: savedFoods.modifiedCount,
    mealLogsModified: mealLogs.modifiedCount,
    mealPlansModified: mealPlans.modifiedCount,
    mealsModified: meals.modifiedCount,
    recipeIngredientsModified: recipeIngredients.modifiedCount,
    recipeSavedFoodModified: recipeSavedFood.modifiedCount,
    plateScansModified: plateScans.modifiedCount,
  }
}
