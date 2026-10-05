/**
 * ─── The recipe editor, natively (NP-144) ───────────────────────────────────
 *
 * The native half of `webapp/components/nutrition/RecipeForm.tsx`: name,
 * description, servings, prep/cook times, photo (NP-059's capture + upload at
 * the web's 1600px / 0.82, multipart field `image`), tags (defaults +
 * member's own, plus custom), steps (one per line on the web, one row each
 * here), and ingredients from the search sheet (`FoodSearchSheet` in basket
 * mode — the pick lands as a per-unit row, exactly the web's
 * `handleAddIngredient`) with the quantity picker for the amount.
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back
 * to the screen, which makes the single `POST /api/nutrition/recipes` /
 * `PUT` call. See `lib/nutrition/recipes.ts`.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Camera, ImagePlus, Plus, Trash2, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { AuthedImage } from "@/components/media/AuthedImage";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import {
  MEAL_PHOTO_RESIZE,
  captureImage,
  type CapturedImage,
  type CaptureSource,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";
import {
  normalizeRecipeTag,
  recipeFormTotals,
  titleCaseRecipeTag,
  type RecipeFormInput,
  type RecipeIngredientInput,
  type RecipeIngredientMacros,
} from "@/lib/nutrition/recipes";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Food } from "@become/api-client";

export interface RecipeEditorIngredient extends RecipeIngredientInput {}

export interface RecipeEditorInitial {
  name: string;
  description?: string;
  servings: number;
  prepTime?: number;
  cookTime?: number;
  instructions: string[];
  tags: string[];
  ingredients: RecipeIngredientInput[];
  imageUrl?: string;
}

export interface RecipeEditorSubmit {
  input: RecipeFormInput;
  /** A freshly captured photo waiting for upload (create flow uploads after). */
  pendingPhoto: CapturedImage | null;
  /** True when the photo was removed and the server image must be deleted. */
  photoRemoved: boolean;
}

export interface RecipeEditorSheetProps {
  visible: boolean;
  /** Present = edit mode. Absent = create mode. */
  recipeId?: string | null;
  initial?: RecipeEditorInitial | null;
  availableTags?: { defaults: string[]; userTags: string[] };
  submitting?: boolean;
  /** The server's own words when the save was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (submit: RecipeEditorSubmit) => void | Promise<void>;
  testID?: string;
}

const TAG_FALLBACK = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre-workout",
  "post-workout",
];

function editorKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toEditorIngredients(
  ingredients: RecipeIngredientInput[],
): RecipeEditorIngredient[] {
  return ingredients.map((ing) => ({ ...ing, key: editorKey() }));
}

/** Seed the editor from a fetched recipe (the web's edit-page `initial`). */
export function recipeToEditorInitial(recipe: {
  name?: string;
  description?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  instructions?: string[];
  tags?: string[];
  ingredients?: RecipeIngredientInput[];
  imageUrl?: string;
}): RecipeEditorInitial {
  return {
    name: recipe.name ?? "",
    description: recipe.description,
    servings: recipe.servings ?? 1,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    instructions: Array.isArray(recipe.instructions) ? [...recipe.instructions] : [],
    tags: Array.isArray(recipe.tags) ? [...recipe.tags] : [],
    ingredients: Array.isArray(recipe.ingredients) ? [...recipe.ingredients] : [],
    imageUrl: recipe.imageUrl,
  };
}

export function RecipeEditorSheet({
  visible,
  recipeId,
  initial,
  availableTags,
  submitting = false,
  error,
  onClose,
  onSubmit,
  testID = "recipe-editor",
}: RecipeEditorSheetProps) {
  const { colors } = useThemeTokens();
  const isEdit = Boolean(recipeId);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [servingsText, setServingsText] = useState(String(initial?.servings ?? 1));
  const [prepText, setPrepText] = useState(
    initial?.prepTime != null ? String(initial.prepTime) : "",
  );
  const [cookText, setCookText] = useState(
    initial?.cookTime != null ? String(initial.cookTime) : "",
  );
  const [steps, setSteps] = useState<string[]>(
    initial && initial.instructions.length > 0 ? [...initial.instructions] : [""],
  );
  const [serverImageUrl, setServerImageUrl] = useState<string | undefined>(
    initial?.imageUrl,
  );
  const [pendingPhoto, setPendingPhoto] = useState<CapturedImage | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [ingredients, setIngredients] = useState<RecipeEditorIngredient[]>(() =>
    toEditorIngredients(initial?.ingredients ?? []),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const tagOptions = useMemo(() => {
    const defaults = availableTags?.defaults ?? TAG_FALLBACK;
    const userTags = availableTags?.userTags ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...defaults, ...userTags]) {
      const norm = String(t).trim().toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
    return out;
  }, [availableTags]);

  const servings = useMemo(() => {
    const n = Number(servingsText);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [servingsText]);

  const totals = useMemo(
    () => recipeFormTotals({ ingredients, servings }),
    [ingredients, servings],
  );

  const shownPhoto: string | null = pendingPhoto
    ? pendingPhoto.dataUrl
    : photoRemoved
      ? null
      : (serverImageUrl ?? null);

  const handleClose = useCallback(() => {
    setLocalError(null);
    setPhotoError(null);
    setDenial(null);
    setSearchOpen(false);
    onClose();
  }, [onClose]);

  const handlePickPhoto = useCallback(async (source: CaptureSource) => {
    setPhotoBusy(true);
    setPhotoError(null);
    setDenial(null);
    try {
      const result = await captureImage(source, { spec: MEAL_PHOTO_RESIZE });
      if (result.status === "cancelled") return;
      if (result.status === "permission-denied") {
        setDenial(result);
        return;
      }
      if (result.status === "failed") {
        setPhotoError(result.message);
        return;
      }
      // Hold the resized capture until save (create needs a recipeId to
      // upload; edit uploads right after the PUT lands).
      setPendingPhoto(result.image);
      setPhotoRemoved(false);
    } finally {
      setPhotoBusy(false);
    }
  }, []);

  const handleRemovePhoto = useCallback(() => {
    setPendingPhoto(null);
    setPhotoRemoved(true);
    if (!isEdit) setServerImageUrl(undefined);
  }, [isEdit]);

  const handleToggleTag = useCallback((tag: string) => {
    const norm = tag.trim().toLowerCase();
    if (!norm) return;
    setTags((prev) =>
      prev.includes(norm) ? prev.filter((t) => t !== norm) : [...prev, norm],
    );
  }, []);

  const handleAddCustomTag = useCallback(() => {
    const norm = normalizeRecipeTag(customTagInput);
    if (!norm) return;
    setTags((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
    setCustomTagInput("");
  }, [customTagInput]);

  // The web's `handleAddIngredient`: the pick's servings become the amount,
  // its serving unit the unit, its per-serving nutrition the per-unit basis.
  const handleAddFood = useCallback((food: Food) => {
    const variant = defaultVariantOf(food);
    if (!variant) return;
    const amount = 1;
    const perUnit: RecipeIngredientMacros = {
      calories: variant.nutrition.calories ?? 0,
      protein: variant.nutrition.protein ?? 0,
      carbs: variant.nutrition.carbs ?? 0,
      fats: variant.nutrition.fats ?? 0,
    };
    const rawId = (food as { _id?: unknown; id?: unknown })._id ??
      (food as { _id?: unknown; id?: unknown }).id;
    const foodId = rawId != null && String(rawId).length > 0 ? String(rawId) : undefined;
    setIngredients((prev) => [
      ...prev,
      {
        key: editorKey(),
        name: String(food.name ?? "Food"),
        ...((food as { brand?: unknown }).brand
          ? { brand: String((food as { brand?: unknown }).brand) }
          : {}),
        amount,
        unit: variant.servingUnit || "serving",
        perUnit,
        ...(foodId ? { foodId } : {}),
      },
    ]);
    setSearchOpen(false);
  }, []);

  const handleRemoveIngredient = useCallback((key: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.key !== key));
    setAmountDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleAmountChange = useCallback((key: string, raw: string) => {
    setAmountDrafts((prev) => ({ ...prev, [key]: raw }));
    const amt = Number(raw);
    if (!Number.isFinite(amt) || amt < 0) return;
    setIngredients((prev) =>
      prev.map((ing) => (ing.key === key ? { ...ing, amount: amt } : ing)),
    );
  }, []);

  const handleStepChange = useCallback((idx: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }, []);

  const handleAddStep = useCallback(() => {
    setSteps((prev) => [...prev, ""]);
  }, []);

  const handleRemoveStep = useCallback((idx: number) => {
    setSteps((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== idx)));
  }, []);

  const handleSave = useCallback(() => {
    if (submitting) return;
    if (!name.trim()) {
      setLocalError("Name is required.");
      return;
    }
    if (ingredients.length === 0) {
      setLocalError("Add at least one ingredient.");
      return;
    }
    setLocalError(null);
    const prepNum = prepText.trim() === "" ? undefined : Number(prepText);
    const cookNum = cookText.trim() === "" ? undefined : Number(cookText);
    const input: RecipeFormInput = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      servings: Math.max(1, Number(servingsText) || 1),
      ...(prepNum != null && Number.isFinite(prepNum) ? { prepTime: prepNum } : {}),
      ...(cookNum != null && Number.isFinite(cookNum) ? { cookTime: cookNum } : {}),
      instructions: steps.map((s) => s.trim()).filter(Boolean),
      tags,
      ingredients: ingredients.map(({ key: _key, ...ing }) => ing),
    };
    void onSubmit({ input, pendingPhoto, photoRemoved });
  }, [
    submitting,
    name,
    description,
    servingsText,
    prepText,
    cookText,
    steps,
    tags,
    ingredients,
    pendingPhoto,
    photoRemoved,
    onSubmit,
  ]);

  const shownError = localError ?? error ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEdit ? "Edit recipe" : "New recipe"}
      testID={testID}
      accessibilityLabel={isEdit ? "Edit recipe" : "New recipe"}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          {/* Photo (optional) */}
          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">
              Photo <Text className="text-muted-foreground">(optional)</Text>
            </Text>
            {shownPhoto ? (
              <View
                testID={`${testID}-photo-preview`}
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <AuthedImage
                  source={shownPhoto}
                  accessibilityLabel="Recipe photo preview"
                  testID={`${testID}-photo-image`}
                  containerStyle={{ height: 160 }}
                  style={{ height: 160, width: "100%" }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 8,
                    padding: 8,
                    backgroundColor: colors.card,
                  }}
                >
                  <Pressable
                    testID={`${testID}-photo-replace`}
                    accessibilityRole="button"
                    accessibilityLabel="Replace photo"
                    disabled={photoBusy}
                    onPress={() => void handlePickPhoto("library")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.muted,
                    }}
                  >
                    <Text className="text-foreground text-xs font-semibold">
                      {photoBusy ? "Working…" : "Replace"}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`${testID}-photo-remove`}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    disabled={photoBusy}
                    onPress={handleRemovePhoto}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.destructive,
                    }}
                  >
                    <Text className="text-destructive-foreground text-xs font-semibold">
                      Remove
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-photo-library`}
                    variant="secondary"
                    disabled={photoBusy}
                    onPress={() => void handlePickPhoto("library")}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {photoBusy ? (
                        <ActivityIndicator size="small" />
                      ) : (
                        <ImagePlus size={16} color={colors.foreground} />
                      )}
                      <Text className="text-foreground text-sm font-semibold">
                        {photoBusy ? "Working…" : "Add a photo"}
                      </Text>
                    </View>
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-photo-camera`}
                    variant="secondary"
                    disabled={photoBusy}
                    onPress={() => void handlePickPhoto("camera")}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Camera size={16} color={colors.foreground} />
                      <Text className="text-foreground text-sm font-semibold">
                        Take photo
                      </Text>
                    </View>
                  </Button>
                </View>
              </View>
            )}
            {denial ? (
              <PermissionDeniedNotice
                denial={denial}
                testID={`${testID}-photo-denial`}
              />
            ) : null}
            {photoError ? (
              <Text testID={`${testID}-photo-error`} className="text-destructive text-xs">
                {photoError}
              </Text>
            ) : null}
          </View>

          <Input
            testID={`${testID}-name`}
            label="Name *"
            placeholder="e.g. Turkey Chili"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />

          <Input
            testID={`${testID}-description`}
            label="Description (optional)"
            placeholder="A short note about this recipe…"
            multiline
            value={description}
            onChangeText={setDescription}
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-servings`}
                label="Servings"
                placeholder="1"
                keyboardType="decimal-pad"
                value={servingsText}
                onChangeText={setServingsText}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-prep-time`}
                label="Prep (min)"
                placeholder="—"
                keyboardType="numeric"
                value={prepText}
                onChangeText={setPrepText}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-cook-time`}
                label="Cook (min)"
                placeholder="—"
                keyboardType="numeric"
                value={cookText}
                onChangeText={setCookText}
              />
            </View>
          </View>

          {/* Tags */}
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text className="text-foreground text-sm font-medium">Tags</Text>
              <Pressable
                testID={`${testID}-tags-toggle`}
                accessibilityRole="button"
                accessibilityLabel={tagPickerOpen ? "Done editing tags" : "Edit tags"}
                onPress={() => setTagPickerOpen((v) => !v)}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  {tagPickerOpen ? "Done" : "Edit"}
                </Text>
              </Pressable>
            </View>
            {tags.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {tags.map((tag) => (
                  <View
                    key={tag}
                    testID={`${testID}-tag-${tag}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text className="text-primary-foreground text-xs font-medium">
                      {titleCaseRecipeTag(tag)}
                    </Text>
                    <Pressable
                      testID={`${testID}-tag-remove-${tag}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${tag}`}
                      onPress={() =>
                        setTags((prev) => prev.filter((t) => t !== tag))
                      }
                      hitSlop={8}
                    >
                      <X size={12} color={colors["primary-foreground"]} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {tagPickerOpen ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {tagOptions
                    .filter((t) => !tags.includes(t))
                    .map((tag) => (
                      <Pressable
                        key={tag}
                        testID={`${testID}-tag-option-${tag}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Add tag ${titleCaseRecipeTag(tag)}`}
                        onPress={() => handleToggleTag(tag)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 16,
                          backgroundColor: colors.card,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text className="text-foreground text-xs font-medium">
                          {titleCaseRecipeTag(tag)}
                        </Text>
                      </Pressable>
                    ))}
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      testID={`${testID}-custom-tag`}
                      placeholder="e.g. high-protein"
                      autoCapitalize="none"
                      value={customTagInput}
                      onChangeText={setCustomTagInput}
                      onSubmitEditing={handleAddCustomTag}
                    />
                  </View>
                  <Button
                    testID={`${testID}-custom-tag-add`}
                    variant="secondary"
                    disabled={!customTagInput.trim()}
                    onPress={handleAddCustomTag}
                  >
                    Add
                  </Button>
                </View>
              </View>
            ) : null}
          </View>

          {/* Ingredients — the web's picker rows, with the quantity picker */}
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text className="text-foreground text-sm font-medium">Ingredients</Text>
              {ingredients.length > 0 ? (
                <Text
                  testID={`${testID}-totals`}
                  className="text-muted-foreground text-xs"
                >
                  {totals.calories} cal/serving · P{totals.protein} C{totals.carbs} F
                  {totals.fats}
                </Text>
              ) : null}
            </View>
            {ingredients.length === 0 ? (
              <View
                testID={`${testID}-ingredients-empty`}
                style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}
              >
                <Text className="text-muted-foreground text-sm text-center">
                  No ingredients yet. Add foods to build your recipe.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {ingredients.map((ing) => (
                  <View
                    key={ing.key}
                    testID={`${testID}-ingredient-${ing.key}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        className="text-foreground text-sm font-medium"
                        numberOfLines={1}
                      >
                        {ing.name}
                      </Text>
                      <Text
                        className="text-muted-foreground text-xs"
                        numberOfLines={1}
                      >
                        {Math.round(ing.perUnit.calories * ing.amount)} cal ·{" "}
                        {ing.unit}
                      </Text>
                    </View>
                    <TextInput
                      testID={`${testID}-ingredient-amount-${ing.key}`}
                      accessibilityLabel={`Amount of ${ing.name}`}
                      value={amountDrafts[ing.key] ?? String(ing.amount)}
                      onChangeText={(text) => handleAmountChange(ing.key, text)}
                      keyboardType="decimal-pad"
                      style={{
                        width: 64,
                        height: 40,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        textAlign: "center",
                        fontSize: 14,
                        color: colors.foreground,
                      }}
                    />
                    <Pressable
                      testID={`${testID}-ingredient-remove-${ing.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${ing.name}`}
                      onPress={() => handleRemoveIngredient(ing.key)}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Trash2 size={14} color={colors["muted-foreground"]} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Button
              testID={`${testID}-add-ingredient`}
              variant="secondary"
              onPress={() => setSearchOpen(true)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Plus size={14} color={colors.foreground} />
                <Text className="text-foreground text-sm font-semibold">
                  Add ingredient
                </Text>
              </View>
            </Button>
          </View>

          {/* Steps — the web's one-step-per-line textarea, one row each here */}
          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">
              Cooking instructions
            </Text>
            {steps.map((step, idx) => (
              <View
                key={idx}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text className="text-foreground text-sm font-semibold">
                  {idx + 1}.
                </Text>
                <View style={{ flex: 1 }}>
                  <Input
                    testID={`${testID}-step-${idx}`}
                    accessibilityLabel={`Step ${idx + 1}`}
                    placeholder={`Step ${idx + 1}…`}
                    multiline
                    value={step}
                    onChangeText={(text) => handleStepChange(idx, text)}
                  />
                </View>
                <Pressable
                  testID={`${testID}-step-remove-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove step ${idx + 1}`}
                  onPress={() => handleRemoveStep(idx)}
                  hitSlop={8}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={14} color={colors["muted-foreground"]} />
                </Pressable>
              </View>
            ))}
            <Button
              testID={`${testID}-add-step`}
              variant="secondary"
              onPress={handleAddStep}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Plus size={14} color={colors.foreground} />
                <Text className="text-foreground text-sm font-semibold">Add step</Text>
              </View>
            </Button>
          </View>

          {shownError ? (
            <Text testID={`${testID}-error`} className="text-destructive text-sm">
              {shownError}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-cancel`}
                variant="secondary"
                disabled={submitting}
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-save`}
                variant="primary"
                loading={submitting}
                disabled={submitting || !name.trim() || ingredients.length === 0}
                onPress={handleSave}
              >
                {isEdit ? "Save changes" : "Create recipe"}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Ingredients come from the search sheet (the web's FoodSearchModal). */}
      <FoodSearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        basketMode
        onAddToBasket={handleAddFood}
        testID={`${testID}-search`}
      />
    </BottomSheet>
  );
}
