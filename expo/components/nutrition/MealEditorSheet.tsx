/**
 * ─── The saved-meal editor, natively (NP-143) ───────────────────────────────
 *
 * The native half of `webapp/components/meals/MealForm.tsx`: name,
 * description, photo (NP-059's capture + upload at the web's 1600px / 0.82,
 * multipart field `image`), default meal-time slot, tags (defaults +
 * member's own, plus custom), and items from the search sheet
 * (`FoodSearchSheet` in basket mode — the pick lands as a
 * `buildMealItemPayload` item, exactly the web's `handleAddItem`).
 *
 * The sheet never writes anything itself: `onSubmit` hands the choice back
 * to the screen, which makes the single `POST /api/meals` / `PATCH`
 * call. See `lib/nutrition/savedMeals.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  type CaptureSource,
  type CapturedImage,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";
import {
  normalizeCustomTag,
  titleCaseMealTag,
  type SavedMealInput,
} from "@/lib/nutrition/savedMeals";
import { buildMealItemPayload } from "@/lib/nutrition/mealLogActions";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Food, Meal } from "@become/api-client";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";

export interface MealEditorItem extends MealItemPayload {
  key: string;
}

export interface MealEditorInitial {
  name: string;
  description?: string;
  imageUrl?: string;
  tags: string[];
  defaultTag?: string;
  items: MealItemPayload[];
}

export interface MealEditorSubmit {
  input: SavedMealInput;
  /** A freshly captured photo waiting for upload (create flow uploads after). */
  pendingPhoto: CapturedImage | null;
  /** True when the photo was removed and the server image must be deleted. */
  photoRemoved: boolean;
}

export interface MealEditorSheetProps {
  visible: boolean;
  /** Present = edit mode. Absent = create mode. */
  mealId?: string | null;
  initial?: MealEditorInitial | null;
  availableTags?: { defaults: string[]; userTags: string[] };
  submitting?: boolean;
  /** The server's own words when the save was refused. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (submit: MealEditorSubmit) => void | Promise<void>;
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

function itemKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toEditorItems(items: MealItemPayload[]): MealEditorItem[] {
  return items.map((it) => ({ ...it, key: itemKey() }));
}

export function mealEditorTotals(items: readonly MealItemPayload[]): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fats = 0;
  for (const it of items) {
    const servings = it.servings ?? 1;
    calories += (it.nutrition?.calories ?? 0) * servings;
    protein += (it.nutrition?.protein ?? 0) * servings;
    carbs += (it.nutrition?.carbs ?? 0) * servings;
    fats += (it.nutrition?.fats ?? 0) * servings;
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fats: Math.round(fats),
  };
}

/** Seed the editor from a fetched Meal (the web's edit-page `initial`). */
export function mealToEditorInitial(meal: Meal): MealEditorInitial {
  return {
    name: meal.name ?? "",
    description: meal.description,
    imageUrl: meal.imageUrl,
    tags: Array.isArray(meal.tags) ? [...meal.tags] : [],
    defaultTag: meal.defaultTag,
    items: (Array.isArray(meal.items) ? meal.items : []).map((it) => ({
      ...(it.foodId ? { foodId: String(it.foodId) } : {}),
      ...(it.variantId ? { variantId: String(it.variantId) } : {}),
      ...(it.variantName ? { variantName: String(it.variantName) } : {}),
      name: String(it.name ?? "Food"),
      ...(it.brand ? { brand: String(it.brand) } : {}),
      servingSize: it.servingSize,
      servingUnit: it.servingUnit,
      servings: it.servings,
      nutrition: {
        calories: it.nutrition?.calories ?? 0,
        protein: it.nutrition?.protein ?? 0,
        carbs: it.nutrition?.carbs ?? 0,
        fats: it.nutrition?.fats ?? 0,
        ...(it.nutrition?.fiber != null ? { fiber: it.nutrition.fiber } : {}),
        ...(it.nutrition?.sugar != null ? { sugar: it.nutrition.sugar } : {}),
        ...(it.nutrition?.sodium != null ? { sodium: it.nutrition.sodium } : {}),
      },
      ...(it.servingLabel ? { servingLabel: String(it.servingLabel) } : {}),
      // An item saved before the picker wrote loggedQuantity/loggedUnit is
      // read back the way EditLogItemSheet does it: the same physical amount
      // (servings × servingSize) in the serving unit.
      loggedQuantity:
        it.loggedQuantity != null ? it.loggedQuantity : (it.servings ?? 1) * it.servingSize,
      loggedUnit: it.loggedUnit ? String(it.loggedUnit) : it.servingUnit,
      ...(it.loggedGramsPerServing != null
        ? { loggedGramsPerServing: it.loggedGramsPerServing }
        : {}),
      ...(it.loggedMlPerServing != null
        ? { loggedMlPerServing: it.loggedMlPerServing }
        : {}),
    })),
  };
}

export function MealEditorSheet({
  visible,
  mealId,
  initial,
  availableTags,
  submitting = false,
  error,
  onClose,
  onSubmit,
  testID = "meal-editor",
}: MealEditorSheetProps) {
  const { colors } = useThemeTokens();
  const isEdit = Boolean(mealId);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [serverImageUrl, setServerImageUrl] = useState<string | undefined>(
    initial?.imageUrl,
  );
  const [pendingPhoto, setPendingPhoto] = useState<CapturedImage | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [denial, setDenial] = useState<PermissionDeniedCapture | null>(null);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [defaultTag, setDefaultTag] = useState<string>(initial?.defaultTag ?? "");
  const [items, setItems] = useState<MealEditorItem[]>(() =>
    toEditorItems(initial?.items ?? []),
  );
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // The sheet is mounted once by its caller (`BottomSheet`'s `children` are
  // always in the tree — only the RN `Modal`'s own `visible` toggles), so the
  // `useState` initialisers above only ever ran against whatever `initial`
  // was at THAT first mount — typically null, before the meal had loaded.
  // Edit then opened to every field empty and Save stayed disabled. Re-seed
  // every time the sheet transitions closed → open, the way the web's own
  // edit page re-reads its fetched meal into the form on each visit.
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;
    if (!visible || wasVisible) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setServerImageUrl(initial?.imageUrl);
    setPendingPhoto(null);
    setPhotoRemoved(false);
    setPhotoBusy(false);
    setPhotoError(null);
    setDenial(null);
    setTags(initial?.tags ?? []);
    setDefaultTag(initial?.defaultTag ?? "");
    setItems(toEditorItems(initial?.items ?? []));
    setTagPickerOpen(false);
    setCustomTagInput("");
    setSearchOpen(false);
    setLocalError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  const totals = useMemo(() => mealEditorTotals(items), [items]);

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
      // Hold the resized capture until save (create needs a mealId to
      // upload; edit uploads right after the PATCH lands).
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
    const norm = normalizeCustomTag(customTagInput);
    if (!norm) return;
    setTags((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
    setCustomTagInput("");
  }, [customTagInput]);

  const handleAddFood = useCallback((food: Food) => {
    const variant = defaultVariantOf(food);
    if (!variant) return;
    const item = buildMealItemPayload({
      food: food as unknown as Parameters<typeof buildMealItemPayload>[0]["food"],
      variant,
      quantity: 1,
      unit: variant.servingUnit,
    });
    setItems((prev) => [...prev, { ...item, key: itemKey() }]);
    setSearchOpen(false);
  }, []);

  const handleRemoveItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const handleSave = useCallback(() => {
    if (submitting) return;
    if (!name.trim()) {
      setLocalError("Name is required.");
      return;
    }
    if (items.length === 0) {
      setLocalError("Add at least one item.");
      return;
    }
    setLocalError(null);
    const input: SavedMealInput = {
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      tags,
      ...(defaultTag ? { defaultTag } : {}),
      items: items.map(({ key: _key, ...item }) => item),
    };
    void onSubmit({ input, pendingPhoto, photoRemoved });
  }, [submitting, name, description, tags, defaultTag, items, pendingPhoto, photoRemoved, onSubmit]);

  const shownError = localError ?? error ?? null;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEdit ? "Edit meal" : "New meal"}
      testID={testID}
      accessibilityLabel={isEdit ? "Edit meal" : "New meal"}
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
                  accessibilityLabel="Meal photo preview"
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
            placeholder="e.g. Post-Workout Smoothie"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />

          <Input
            testID={`${testID}-description`}
            label="Description (optional)"
            placeholder="A short note about this meal…"
            multiline
            value={description}
            onChangeText={setDescription}
          />

          {/* Default meal time */}
          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">
              Default meal time
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {tagOptions.map((tag) => {
                const active = defaultTag === tag;
                return (
                  <Pressable
                    key={tag}
                    testID={`${testID}-default-tag-${tag}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Default time ${titleCaseMealTag(tag)}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setDefaultTag(active ? "" : tag)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: active ? colors.primary : colors.card,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      className={`text-xs font-medium ${active ? "text-primary-foreground" : "text-foreground"}`}
                    >
                      {titleCaseMealTag(tag)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-muted-foreground text-xs">
              Optional — just the default slot when you log this meal.
            </Text>
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
                      {titleCaseMealTag(tag)}
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
                        accessibilityLabel={`Add tag ${titleCaseMealTag(tag)}`}
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
                          {titleCaseMealTag(tag)}
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

          {/* Items */}
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text className="text-foreground text-sm font-medium">Items</Text>
              {items.length > 0 ? (
                <Text
                  testID={`${testID}-totals`}
                  className="text-muted-foreground text-xs"
                >
                  {totals.calories} cal · P{totals.protein} C{totals.carbs} F
                  {totals.fats}
                </Text>
              ) : null}
            </View>
            {items.length === 0 ? (
              <View
                testID={`${testID}-items-empty`}
                style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}
              >
                <Text className="text-muted-foreground text-sm text-center">
                  No items yet. Add foods to build your meal.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {items.map((it) => (
                  <View
                    key={it.key}
                    testID={`${testID}-item-${it.key}`}
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
                        {it.name}
                      </Text>
                      <Text
                        className="text-muted-foreground text-xs"
                        numberOfLines={1}
                      >
                        {it.brand ? `${it.brand} · ` : ""}
                        {it.servings} × {it.servingSize}
                        {it.servingUnit}
                      </Text>
                    </View>
                    <Text className="text-foreground text-xs font-semibold">
                      {Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1))}
                    </Text>
                    <Pressable
                      testID={`${testID}-item-remove-${it.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${it.name}`}
                      onPress={() => handleRemoveItem(it.key)}
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
              testID={`${testID}-add-item`}
              variant="secondary"
              onPress={() => setSearchOpen(true)}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Plus size={14} color={colors.foreground} />
                <Text className="text-foreground text-sm font-semibold">
                  Add item
                </Text>
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
                disabled={submitting || !name.trim() || items.length === 0}
                onPress={handleSave}
              >
                {isEdit ? "Save changes" : "Create meal"}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Items come from the search sheet (the web's FoodSearchModal). */}
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
