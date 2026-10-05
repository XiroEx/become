/**
 * ONE place native uploads a recipe photo (NP-144).
 *
 * The web's recipe image route (`webapp/app/api/nutrition/recipes/[id]/image`)
 * posts `multipart/form-data` with the file under field `image` (or a raw
 * `image/*` body) and answers `{ success, imageUrl }` — the same contract as
 * the meal image route, so this mirrors `uploadMealImage` in
 * `lib/media/upload.ts` rather than inventing a second one.
 */

import {
  MEAL_UPLOAD_FIELD,
  uploadImage,
  type UploadableImage,
  type UploadDeps,
  type UploadResult,
} from "@/lib/media/upload";
import { recipeImagePath } from "@/lib/nutrition/recipes";

/** A recipe's photo. Multipart field `image` — see `uploadRecipeImage`. */
export function recipeImageUploadPath(recipeId: string): string {
  return recipeImagePath(recipeId);
}

/** A recipe's photo. Different route, different field name, same helper. */
export function uploadRecipeImage(
  recipeId: string,
  image: UploadableImage,
  deps?: UploadDeps,
): Promise<UploadResult> {
  return uploadImage({
    path: recipeImageUploadPath(recipeId),
    image,
    field: MEAL_UPLOAD_FIELD,
    ...(deps ? { deps } : {}),
  });
}

export type { UploadableImage, UploadDeps, UploadResult };
