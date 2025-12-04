"use client"
import { useState } from 'react'
import PageTransition from '@/components/PageTransition'

interface MacroEntry {
  protein: number
  carbs: number
  fats: number
  calories: number
}

interface Recipe {
  id: number
  title: string
  category: string
  protein: number
  carbs: number
  fats: number
  calories: number
  ingredients: string[]
  instructions: string[]
}

const recipes: Recipe[] = [
  {
    id: 1,
    title: "High-Protein Chicken Bowl",
    category: "Lunch/Dinner",
    protein: 45,
    carbs: 50,
    fats: 12,
    calories: 476,
    ingredients: [
      "6oz grilled chicken breast",
      "1 cup cooked brown rice",
      "1 cup steamed broccoli",
      "1 tbsp olive oil",
      "Salt, pepper, garlic powder"
    ],
    instructions: [
      "Season chicken breast with salt, pepper, and garlic powder",
      "Grill chicken for 6-7 minutes per side until cooked through",
      "Cook brown rice according to package directions",
      "Steam broccoli for 5-7 minutes",
      "Assemble bowl and drizzle with olive oil"
    ]
  },
  {
    id: 2,
    title: "Protein Pancakes",
    category: "Breakfast",
    protein: 30,
    carbs: 35,
    fats: 8,
    calories: 332,
    ingredients: [
      "1 scoop protein powder (vanilla)",
      "2 eggs",
      "1/2 cup oats",
      "1/4 cup almond milk",
      "1/2 banana, mashed",
      "1 tsp baking powder"
    ],
    instructions: [
      "Blend all ingredients until smooth",
      "Heat non-stick pan over medium heat",
      "Pour batter to make 3-4 pancakes",
      "Cook 2-3 minutes per side until golden",
      "Top with berries or sugar-free syrup"
    ]
  },
  {
    id: 3,
    title: "Greek Yogurt Power Bowl",
    category: "Snack",
    protein: 25,
    carbs: 40,
    fats: 6,
    calories: 310,
    ingredients: [
      "1 cup non-fat Greek yogurt",
      "1/2 cup mixed berries",
      "1/4 cup granola",
      "1 tbsp honey",
      "1 tbsp chia seeds"
    ],
    instructions: [
      "Add Greek yogurt to bowl",
      "Top with mixed berries",
      "Add granola and chia seeds",
      "Drizzle with honey",
      "Mix and enjoy"
    ]
  }
]

export default function NutritionPage() {
  const [dailyTargets] = useState<MacroEntry>({
    protein: 180,
    carbs: 250,
    fats: 60,
    calories: 2300
  })

  const [tracked, setTracked] = useState<MacroEntry>({
    protein: 85,
    carbs: 120,
    fats: 28,
    calories: 1048
  })

  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [showLogMealModal, setShowLogMealModal] = useState(false)
  const [mealForm, setMealForm] = useState({
    name: '',
    protein: '',
    carbs: '',
    fats: '',
    calories: ''
  })

  const getProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100)
  }

  const calculateCalories = (protein: string, carbs: string, fats: string) => {
    const p = Number(protein) || 0
    const c = Number(carbs) || 0
    const f = Number(fats) || 0
    return (p * 4 + c * 4 + f * 9).toString()
  }

  const updateMealForm = (field: string, value: string) => {
    const updated = { ...mealForm, [field]: value }
    
    // Auto-calculate calories when macros change
    if (field === 'protein' || field === 'carbs' || field === 'fats') {
      updated.calories = calculateCalories(
        field === 'protein' ? value : mealForm.protein,
        field === 'carbs' ? value : mealForm.carbs,
        field === 'fats' ? value : mealForm.fats
      )
    }
    
    setMealForm(updated)
  }

  const handleLogMeal = (e: React.FormEvent) => {
    e.preventDefault()
    
    const newTracked = {
      protein: tracked.protein + Number(mealForm.protein),
      carbs: tracked.carbs + Number(mealForm.carbs),
      fats: tracked.fats + Number(mealForm.fats),
      calories: tracked.calories + Number(mealForm.calories)
    }
    
    setTracked(newTracked)
    setMealForm({ name: '', protein: '', carbs: '', fats: '', calories: '' })
    setShowLogMealModal(false)
  }

  const handleLogRecipe = (recipe: Recipe) => {
    const newTracked = {
      protein: tracked.protein + recipe.protein,
      carbs: tracked.carbs + recipe.carbs,
      fats: tracked.fats + recipe.fats,
      calories: tracked.calories + recipe.calories
    }
    
    setTracked(newTracked)
    setSelectedRecipe(null)
  }

  return (
    <>
      <PageTransition className="pb-20">
        <h1 className="text-2xl font-bold">Nutrition</h1>
        <p className="mt-2 text-sm text-zinc-600">Daily targets, meal guidance and simple rules to stay on track.</p>

        {/* Daily Tracking */}
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Today's Macros</h2>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">Protein</span>
                <span className="text-zinc-600">{tracked.protein}g / {dailyTargets.protein}g</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${getProgress(tracked.protein, dailyTargets.protein)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">Carbs</span>
                <span className="text-zinc-600">{tracked.carbs}g / {dailyTargets.carbs}g</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
                <div 
                  className="h-full bg-green-600 transition-all duration-300"
                  style={{ width: `${getProgress(tracked.carbs, dailyTargets.carbs)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">Fats</span>
                <span className="text-zinc-600">{tracked.fats}g / {dailyTargets.fats}g</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200">
                <div 
                  className="h-full bg-yellow-600 transition-all duration-300"
                  style={{ width: `${getProgress(tracked.fats, dailyTargets.fats)}%` }}
                />
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900">Calories</span>
                <span className="text-lg font-bold text-zinc-900">{tracked.calories} / {dailyTargets.calories}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowLogMealModal(true)}
            className="mt-4 w-full cursor-pointer rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black"
          >
            + Log Meal
          </button>
        </div>

        {/* Recipes */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-900">Recipes</h2>
          <p className="mt-1 text-sm text-zinc-600">Quick, macro-friendly meal ideas</p>

          <div className="mt-4 space-y-3">
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                className="group w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:scale-[1.01] hover:border-zinc-300 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-900 group-hover:text-black">{recipe.title}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{recipe.category}</p>
                    <div className="mt-2 flex gap-3 text-xs text-zinc-600">
                      <span>P: {recipe.protein}g</span>
                      <span>C: {recipe.carbs}g</span>
                      <span>F: {recipe.fats}g</span>
                      <span className="font-semibold">{recipe.calories} cal</span>
                    </div>
                  </div>
                  <svg 
                    className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-1" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      </PageTransition>

      {/* Recipe Modal */}
      {selectedRecipe && (
        <div 
          className="fixed inset-0 z-100 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setSelectedRecipe(null)}
        >
          <div 
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">{selectedRecipe.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{selectedRecipe.category}</p>
              </div>
              <button
                onClick={() => setSelectedRecipe(null)}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Macros */}
            <div className="mb-6 grid grid-cols-4 gap-3 rounded-lg bg-zinc-50 p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{selectedRecipe.protein}g</div>
                <div className="text-xs text-zinc-600">Protein</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{selectedRecipe.carbs}g</div>
                <div className="text-xs text-zinc-600">Carbs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{selectedRecipe.fats}g</div>
                <div className="text-xs text-zinc-600">Fats</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-900">{selectedRecipe.calories}</div>
                <div className="text-xs text-zinc-600">Calories</div>
              </div>
            </div>

            {/* Ingredients */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Ingredients</h3>
              <ul className="mt-3 space-y-2">
                {selectedRecipe.ingredients.map((ingredient, index) => (
                  <li 
                    key={index}
                    className="flex items-start gap-2 text-sm text-zinc-700"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                    {ingredient}
                  </li>
                ))}
              </ul>
            </div>

            {/* Instructions */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Instructions</h3>
              <ol className="mt-3 space-y-3">
                {selectedRecipe.instructions.map((instruction, index) => (
                  <li 
                    key={index}
                    className="flex gap-3 text-sm text-zinc-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{instruction}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleLogRecipe(selectedRecipe)}
                className="flex-1 cursor-pointer rounded-lg bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-700"
              >
                Log This Meal
              </button>
              <button
                onClick={() => setSelectedRecipe(null)}
                className="flex-1 cursor-pointer rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Meal Modal */}
      {showLogMealModal && (
        <div 
          className="fixed inset-0 z-100 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setShowLogMealModal(false)}
        >
          <div 
            className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-2xl font-bold text-zinc-900">Log Meal</h2>
              <button
                onClick={() => setShowLogMealModal(false)}
                className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 cursor-pointer"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleLogMeal} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Meal Name</label>
                <input
                  type="text"
                  value={mealForm.name}
                  onChange={(e) => updateMealForm('name', e.target.value)}
                  placeholder="e.g., Chicken and Rice"
                  required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Protein (g)</label>
                  <input
                    type="number"
                    value={mealForm.protein}
                    onChange={(e) => updateMealForm('protein', e.target.value)}
                    placeholder="45"
                    required
                    min="0"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Carbs (g)</label>
                  <input
                    type="number"
                    value={mealForm.carbs}
                    onChange={(e) => updateMealForm('carbs', e.target.value)}
                    placeholder="50"
                    required
                    min="0"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Fats (g)</label>
                  <input
                    type="number"
                    value={mealForm.fats}
                    onChange={(e) => updateMealForm('fats', e.target.value)}
                    placeholder="12"
                    required
                    min="0"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Calories (auto)</label>
                  <input
                    type="number"
                    value={mealForm.calories}
                    readOnly
                    placeholder="Auto-calculated"
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogMealModal(false)}
                  className="flex-1 cursor-pointer rounded-lg border border-zinc-300 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 cursor-pointer rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black"
                >
                  Log Meal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
