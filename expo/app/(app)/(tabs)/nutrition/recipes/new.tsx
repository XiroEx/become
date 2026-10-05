import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { apiFetch } from "@become/api-client";
import { Text } from "@/components/Text";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { syntheticGate, useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  createRecipe,
} from "@/lib/nutrition/recipes";
import { uploadRecipeImage } from "@/lib/media/uploadRecipeImage";
import {
  RecipeEditorSheet,
  type RecipeEditorSubmit,
} from "@/components/recipes/RecipeEditorSheet";

/**
 * NEW RECIPE, ON THE PHONE (NP-144).
 *
 * Native counterpart of `webapp/app/dashboard/recipes/new` — which renders
 * `RecipeForm` in create mode — and it posts to the same route:
 * `POST /api/nutrition/recipes` with the web's own shape
 * (`{ name, category: 'Other', description?, servings, prepTime?, cookTime?,
 * instructions[], tags[], ingredients[] }`, per-row `nutrition` as the row
 * total). A recipe created here opens and edits on the web because the body
 * is the web's body.
 *
 * THE THREE THINGS THIS SCREEN OWNS, and why they are here and not in the
 * editor component:
 *
 *   • THE QUOTA. Recipes become foods, so the create reads `custom-foods`
 *     (the same slot save-as-food spends). The check is `canCreate`, never
 *     `allowed` and never `limit - used`, and it happens BEFORE the request:
 *     a member at the cap gets the upgrade sheet (NP-052) and keeps their
 *     form, instead of a round trip that ends in a 403. The server is still
 *     the gate — a 403 that arrives anyway goes through `routeApiError`,
 *     which raises the same sheet from the server's own words.
 *   • THE FORM. Name, description, servings, prep/cook times, photo (NP-059's
 *     capture + upload at the web's 1600px / 0.82, multipart field `image`),
 *     tags, steps, and ingredients from the search sheet with the quantity
 *     picker for the amount.
 *   • WHERE THE MEMBER LANDS. On a create the new recipe's own screen is
 *     where this ends, so the member sees what the web would show them.
 */
export default function NewRecipeRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const mayCreate = canCreate("custom-foods");

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

  const atCap = !mayCreate && Boolean(entitlements) && entitlements?.enforced !== false;

  const onSubmit = useCallback(
    async (submit: RecipeEditorSubmit) => {
      if (atCap) {
        raiseCapSheet();
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const { recipeId } = await createRecipe(submit.input, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        // A fresh capture uploads after the create (the web's form holds the
        // blob until it has a recipeId). Non-fatal — the recipe saved fine.
        if (recipeId && submit.pendingPhoto) {
          try {
            await uploadRecipeImage(recipeId, {
              uri: submit.pendingPhoto.uri,
              fileName: submit.pendingPhoto.fileName,
              mimeType: submit.pendingPhoto.mimeType,
            });
          } catch {
            // non-fatal
          }
        }
        // A create spends a custom-foods slot — re-read the snapshot so the
        // cap the create just spent shows at once.
        await refreshEntitlements().catch(() => {});
        if (recipeId) {
          router.replace(
            `/(tabs)/nutrition/recipes/${encodeURIComponent(recipeId)}` as never,
          );
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
        // so the lock matches what just happened.
        await refreshEntitlements().catch(() => {});
        if (!handled) setError(message);
      } finally {
        setSaving(false);
      }
    },
    [atCap, raiseCapSheet, refreshEntitlements, router, token],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="recipes-new-route"
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
              testID="recipes-new-back"
              accessibilityRole="button"
              accessibilityLabel="Back to recipes"
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
              <Text className="text-foreground text-2xl font-bold">New recipe</Text>
              <Text className="text-muted-foreground text-sm">
                A set of ingredients you save as a food.
              </Text>
            </View>
          </View>

          {/* With enforcement off there is no counter, no lock and no sheet —
              `canCreate()` already answers true there (NP-049). */}
          {entitlements && entitlements.enforced !== false ? (
            <View style={{ gap: 8 }}>
              <AllowanceCounter
                feature="custom-foods"
                testID="recipes-new-allowance-counter"
              />
              <AllowanceLock
                feature="custom-foods"
                onPress={(gate) => showUpgradeSheet(gate)}
                testID="recipes-new-lock"
              />
            </View>
          ) : null}

          <RecipeEditorSheet
            visible
            onClose={() => router.back()}
            onSubmit={onSubmit}
            submitting={saving}
            error={error}
            testID="recipe-editor"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
