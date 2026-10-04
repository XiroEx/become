import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { apiFetch, FoodDetailResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import {
  CUSTOM_FOOD_CATEGORIES,
  CUSTOM_FOOD_SERVING_UNITS,
  createCustomFood,
  validateCustomFoodInput,
  type CustomFoodInput,
} from "@/lib/nutrition/customFoods";

/**
 * NEW CUSTOM FOOD, ON THE PHONE (NP-145).
 *
 * Native counterpart of `webapp/app/dashboard/foods/new` — which posts
 * `{ name, brand, category, variants }` to the quota-gated
 * `POST /api/nutrition/foods` (`requireQuota('custom-foods')`, counted live
 * on `Food.authoredBy`) and then bookmarks the row (`POST /api/me/foods`).
 *
 * THE THREE THINGS THIS SCREEN OWNS, and why they are here and not in the
 * form component:
 *
 *   • THE QUOTA. `custom-foods` is a counted inventory cap (3 on the free
 *     tier). The check is `canCreate`, never `allowed` and never
 *     `limit - used`, and it happens BEFORE the request: a member at the cap
 *     gets the upgrade sheet (NP-052) and keeps their form, instead of a
 *     round trip that ends in a 403. The server is still the gate — a 403
 *     that arrives anyway goes through `routeApiError`, which raises the same
 *     sheet from the server's own words.
 *   • THE FORM. Name, brand, category, serving size + unit, display label,
 *     required macros, optional micros, and the two bridge values
 *     (`gramsPerServing` / `mlPerServing`) so the picker's mass↔volume
 *     conversions work later — the web's `BridgeFieldGroup` fields, as two
 *     plain numeric inputs.
 *   • WHERE THE MEMBER LANDS. On a create the new food's own screen is where
 *     this ends, so the member sees what the web would show them.
 */

const MACRO_FIELDS = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fats", label: "Fats (g)" },
] as const;

const MICRO_FIELDS = [
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
  { key: "sodium", label: "Sodium (mg)" },
  { key: "saturatedFat", label: "Sat. fat (g)" },
] as const;

type MacroKey = (typeof MACRO_FIELDS)[number]["key"];
type MicroKey = (typeof MICRO_FIELDS)[number]["key"];

function toNumberOrZero(text: string): number {
  const n = Number(text);
  return text.trim() === "" || !Number.isFinite(n) ? NaN : n;
}

function toOptionalNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export default function NewFoodRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreate = canCreate("custom-foods");

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [servingSize, setServingSize] = useState("100");
  const [servingUnit, setServingUnit] = useState<string>("g");
  const [displayLabel, setDisplayLabel] = useState("");
  const [macros, setMacros] = useState<Record<MacroKey, string>>({
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
  });
  const [micros, setMicros] = useState<Record<MicroKey, string>>({
    fiber: "",
    sugar: "",
    sodium: "",
    saturatedFat: "",
  });
  const [gramsPerServing, setGramsPerServing] = useState("");
  const [mlPerServing, setMlPerServing] = useState("");
  const [bookmark, setBookmark] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  /** The cap, explained in the server's vocabulary rather than ours. */
  const raiseCapSheet = useCallback(() => {
    const entitlement = entitlements?.features?.["custom-foods"] ?? null;
    showUpgradeSheet(
      syntheticGate(
        "custom-foods",
        entitlement?.requiresTier ?? "plus",
        entitlement,
      ),
    );
  }, [entitlements]);

  const atCap =
    !mayCreate && Boolean(entitlements) && entitlements?.enforced !== false;

  const setMacro = useCallback((key: MacroKey, value: string) => {
    setMacros((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setMicro = useCallback((key: MicroKey, value: string) => {
    setMicros((prev) => ({ ...prev, [key]: value }));
  }, []);

  const buildInput = useCallback((): CustomFoodInput => {
    return {
      name,
      brand,
      category,
      servingSize: Number(servingSize),
      servingUnit,
      displayLabel,
      nutrition: {
        calories: toNumberOrZero(macros.calories),
        protein: toNumberOrZero(macros.protein),
        carbs: toNumberOrZero(macros.carbs),
        fats: toNumberOrZero(macros.fats),
        ...(toOptionalNumber(micros.fiber) != null
          ? { fiber: toOptionalNumber(micros.fiber) as number }
          : {}),
        ...(toOptionalNumber(micros.sugar) != null
          ? { sugar: toOptionalNumber(micros.sugar) as number }
          : {}),
        ...(toOptionalNumber(micros.sodium) != null
          ? { sodium: toOptionalNumber(micros.sodium) as number }
          : {}),
        ...(toOptionalNumber(micros.saturatedFat) != null
          ? { saturatedFat: toOptionalNumber(micros.saturatedFat) as number }
          : {}),
      },
      ...(toOptionalNumber(gramsPerServing) != null
        ? { gramsPerServing: toOptionalNumber(gramsPerServing) as number }
        : {}),
      ...(toOptionalNumber(mlPerServing) != null
        ? { mlPerServing: toOptionalNumber(mlPerServing) as number }
        : {}),
      bookmark,
    };
  }, [
    name,
    brand,
    category,
    servingSize,
    servingUnit,
    displayLabel,
    macros,
    micros,
    gramsPerServing,
    mlPerServing,
    bookmark,
  ]);

  const onSubmit = useCallback(async () => {
    const input = buildInput();
    const validation = validateCustomFoodInput(input);
    if (validation) {
      setError(validation);
      return;
    }
    if (atCap) {
      raiseCapSheet();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { foodId } = await createCustomFood(input, {
        baseUrl: fetchOpts.baseUrl,
        getToken: fetchOpts.getToken,
      });
      // A create spends a slot, so the shared snapshot is behind by one.
      await refreshEntitlements().catch(() => {});
      if (foodId) {
        // Confirm the row reads back — the web shows it, so the phone must
        // open the same food rather than a dead id.
        try {
          await apiFetch(
            `/api/nutrition/foods/${encodeURIComponent(foodId)}`,
            FoodDetailResponseSchema,
            fetchOpts,
          );
        } catch {
          // non-fatal: the create already succeeded.
        }
        router.replace(`/(tabs)/nutrition/food/${encodeURIComponent(foodId)}` as never);
      } else {
        router.back();
      }
    } catch (err) {
      const { handled, message } = routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
      // A refusal means the snapshot disagrees with the server; re-read it
      // so the lock on this screen matches what just happened.
      await refreshEntitlements().catch(() => {});
      if (!handled) setError(message);
    } finally {
      setSaving(false);
    }
  }, [atCap, buildInput, fetchOpts, raiseCapSheet, refreshEntitlements, router]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-food-new-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable
              testID="nutrition-food-new-back"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-2xl font-bold">
                New custom food
              </Text>
              <Text className="text-muted-foreground text-sm">
                Add a food not in our database.
              </Text>
            </View>
          </View>

          {/* With enforcement off there is no counter, no lock and no sheet —
              `canCreate()` already answers true there (NP-049). */}
          {entitlements && entitlements.enforced !== false ? (
            <View style={{ gap: 8 }}>
              <AllowanceCounter
                feature="custom-foods"
                testID="food-new-allowance-counter"
              />
              <AllowanceLock
                feature="custom-foods"
                onPress={(gate) => showUpgradeSheet(gate)}
                testID="food-new-allowance-lock"
              />
            </View>
          ) : null}

          <Input
            testID="food-new-name"
            label="Name *"
            placeholder="e.g. Grandma's Pancake Mix"
            autoCapitalize="words"
            value={name}
            onChangeText={(v) => setName(v)}
          />

          <Input
            testID="food-new-brand"
            label="Brand (optional)"
            placeholder="e.g. Aunt Jemima"
            autoCapitalize="words"
            value={brand}
            onChangeText={(v) => setBrand(v)}
          />

          <View>
            <Text
              testID="food-new-category-label"
              className="text-foreground text-sm font-medium mb-1"
            >
              Category
            </Text>
            <View
              testID="food-new-category"
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {CUSTOM_FOOD_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <Pressable
                    key={cat}
                    testID={`food-new-category-${cat}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${cat}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setCategory(cat)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: active
                          ? colors["primary-foreground"]
                          : colors.foreground,
                      }}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 2 }}>
              <Input
                testID="food-new-serving-size"
                label="Serving size *"
                placeholder="100"
                keyboardType="decimal-pad"
                value={servingSize}
                onChangeText={(v) => setServingSize(v)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                testID="food-new-serving-unit-label"
                className="text-foreground text-sm font-medium mb-1"
              >
                Unit
              </Text>
              <View
                testID="food-new-serving-unit"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
              >
                {CUSTOM_FOOD_SERVING_UNITS.map((u) => {
                  const active = servingUnit === u;
                  return (
                    <Pressable
                      key={u}
                      testID={`food-new-serving-unit-${u}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Serving unit ${u}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setServingUnit(u)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.card,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: active
                            ? colors["primary-foreground"]
                            : colors.foreground,
                        }}
                      >
                        {u}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <Input
            testID="food-new-display-label"
            label="Display label (optional)"
            placeholder='e.g. "1 medium pancake"'
            value={displayLabel}
            onChangeText={(v) => setDisplayLabel(v)}
          />

          <View
            testID="food-new-macros"
            style={{
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.card,
            }}
          >
            <Text className="text-muted-foreground text-xs font-semibold uppercase">
              Per serving *
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MACRO_FIELDS.map(({ key, label }) => (
                <View key={key} style={{ flexBasis: "47%", flexGrow: 1 }}>
                  <Input
                    testID={`food-new-macro-${key}`}
                    label={label}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={macros[key]}
                    onChangeText={(v) => setMacro(key, v)}
                  />
                </View>
              ))}
            </View>
          </View>

          <View
            testID="food-new-micros"
            style={{
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.card,
            }}
          >
            <Text className="text-muted-foreground text-xs font-semibold uppercase">
              Optional details
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MICRO_FIELDS.map(({ key, label }) => (
                <View key={key} style={{ flexBasis: "47%", flexGrow: 1 }}>
                  <Input
                    testID={`food-new-micro-${key}`}
                    label={label}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    value={micros[key]}
                    onChangeText={(v) => setMicro(key, v)}
                  />
                </View>
              ))}
            </View>
          </View>

          <View
            testID="food-new-bridges"
            style={{
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.card,
            }}
          >
            <Text className="text-muted-foreground text-xs font-semibold uppercase">
              Weight / volume per serving (optional)
            </Text>
            <Text className="text-muted-foreground text-xs">
              Lets the picker convert between mass and volume for this food.
            </Text>
            <Input
              testID="food-new-grams-per-serving"
              label="Grams per serving"
              placeholder="e.g. 100"
              keyboardType="decimal-pad"
              value={gramsPerServing}
              onChangeText={(v) => setGramsPerServing(v)}
            />
            <Input
              testID="food-new-ml-per-serving"
              label="Millilitres per serving"
              placeholder="e.g. 240"
              keyboardType="decimal-pad"
              value={mlPerServing}
              onChangeText={(v) => setMlPerServing(v)}
            />
          </View>

          <Pressable
            testID="food-new-bookmark-toggle"
            accessibilityRole="switch"
            accessibilityLabel="Save to My Foods"
            accessibilityState={{ checked: bookmark }}
            onPress={() => setBookmark((v) => !v)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-medium">
                Save to My Foods
              </Text>
              <Text className="text-muted-foreground text-xs">
                Bookmark for one-tap logging.
              </Text>
            </View>
            <View
              testID="food-new-bookmark-state"
              accessibilityLabel={bookmark ? "On" : "Off"}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                alignItems: bookmark ? "flex-end" : "flex-start",
                justifyContent: "center",
                paddingHorizontal: 2,
                backgroundColor: bookmark ? colors.primary : colors.muted,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: colors["primary-foreground"],
                }}
              />
            </View>
          </Pressable>

          {error ? (
            <Text testID="food-new-error" className="text-destructive text-sm">
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="food-new-cancel"
                variant="ghost"
                onPress={() => router.back()}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="food-new-save"
                loading={saving}
                disabled={saving || !name.trim()}
                onPress={() => void onSubmit()}
                accessibilityHint="Save custom food"
              >
                {saving ? "Saving…" : "Save food"}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
