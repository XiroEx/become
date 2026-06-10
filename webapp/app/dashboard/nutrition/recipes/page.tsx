import { redirect } from 'next/navigation'

// Legacy recipes UI — folded into Meals (a Meal with recipe.instructions IS a
// recipe). Kept as a redirect so old bookmarks land somewhere sensible.
export default function LegacyRecipesPage() {
  redirect('/dashboard/meals')
}
