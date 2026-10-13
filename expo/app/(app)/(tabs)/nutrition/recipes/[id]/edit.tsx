import { useCallback, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import type { z } from "zod";
import { apiFetch, RecipeDetailResponseSchema } from "@become/api-client";
import { Text } from "@/components/Text";
import { ScreenState } from "@/components/ScreenState";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  deleteRecipeImage,
  recipeToFormInput,
  updateRecipe,
  type RecipeFormInput,
} from "@/lib/nutrition/recipes";
import { uploadRecipeImage } from "@/lib/media/uploadRecipeImage";
import {
  RecipeEditorSheet,
  type RecipeEditorSubmit,
} from "@/components/recipes/RecipeEditorSheet";

/**
 * EDIT A RECIPE YOU BUILT (NP-144).
 *
 * Native counterpart of `webapp/app/dashboard/recipes/[id]/edit`:
 * `GET /api/nutrition/recipes/{id}` (owner-only for the edit) fills the
 * editor, `PUT` saves it back. The web page renders `RecipeForm` in edit
 * mode and goes to the same two routes.
 *
 * TWO THINGS TRAVEL WITH AN EDIT:
 *
 *   • NO QUOTA. The edit is owner-scoped and never quota-gated, so a member
 *     at 3/3 can still edit — exactly like the web's PUT.
 *   • THE PHOTO RIDES AFTER THE PUT, like the web's form: a fresh capture
 *     uploads (multipart field `image`), a removal deletes the server image.
 *     Both are non-fatal to the save.
 */
export default function EditRecipeRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // `z.infer` spelled out: bare `useFetch(path, schema)` infers `{}` under
  // this repo's zod/TS pairing, as every other screen here notes.
  const recipe = useFetch<z.infer<typeof RecipeDetailResponseSchema>>(
    id ? `/api/nutrition/recipes/${encodeURIComponent(id)}` : null,
    RecipeDetailResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );

  const initialState = useMemo(
    () => (recipe.data ? recipeToFormInput(recipe.data) : null),
    [recipe.data],
  );

  const onSubmit = useCallback(
    async (submit: RecipeEditorSubmit) => {
      if (!id) return;
      setSaving(true);
      setError(null);
      try {
        await updateRecipe(id, submit.input, {
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        if (submit.pendingPhoto) {
          try {
            await uploadRecipeImage(id, {
              uri: submit.pendingPhoto.uri,
              fileName: submit.pendingPhoto.fileName,
              mimeType: submit.pendingPhoto.mimeType,
            });
          } catch {
            // non-fatal: the recipe saved fine.
          }
        } else if (submit.photoRemoved) {
          try {
            await deleteRecipeImage(id, {
              apiFetch,
              token,
              baseUrl: WEBAPP_BASE_URL,
            });
          } catch {
            // non-fatal: the recipe saved fine.
          }
        }
        router.replace(`/(tabs)/nutrition/recipes/${encodeURIComponent(id)}` as never);
      } catch (err) {
        const { handled, message } = routeApiError(err, {
          onPlanGate: (gate) => {
            showUpgradeSheet(gate.gate);
          },
        });
        if (!handled) setError(message);
      } finally {
        setSaving(false);
      }
    },
    [id, router, token],
  );

  const retry = useCallback(() => {
    void recipe.refetch();
  }, [recipe]);

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="recipes-edit-route"
      >
        <View style={{ padding: 16 }}>
          <Text testID="recipes-edit-missing-id" className="text-destructive">
            Missing recipe id
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="recipes-edit-route"
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
              testID="recipes-edit-back"
              accessibilityRole="button"
              accessibilityLabel="Back to the recipe"
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
              <Text className="text-foreground text-2xl font-bold">Edit recipe</Text>
              <Text className="text-muted-foreground text-sm">
                {recipe.data?.name ?? "Your recipe"}
              </Text>
            </View>
          </View>

          <ScreenState
            loading={recipe.loading && !recipe.data}
            error={recipe.error}
            hasData={Boolean(initialState)}
            onRetry={retry}
            serverErrorMessage="Couldn't load this recipe."
            testID="recipes-edit-screen-state"
          >
            {initialState ? (
              <EditForm
                key={id}
                initial={initialState satisfies RecipeFormInput}
                imageUrl={recipe.data?.imageUrl ?? undefined}
                saving={saving}
                error={error}
                onSubmit={onSubmit}
                onCancel={() => router.back()}
              />
            ) : null}
          </ScreenState>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EditForm({
  initial,
  imageUrl,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  initial: RecipeFormInput;
  imageUrl?: string;
  saving: boolean;
  error: string | null;
  onSubmit: (submit: RecipeEditorSubmit) => void | Promise<void>;
  onCancel: () => void;
}) {
  // Mounted once the GET has landed (behind `key={id}` above), so the
  // editor's `useState(initial…)` seeds from the server's copy — the same
  // arrangement as the meal editor's `editorInitial`.
  return (
    <RecipeEditorSheet
      visible
      recipeId="edit"
      initial={{
        name: initial.name,
        description: initial.description,
        servings: initial.servings,
        prepTime: initial.prepTime,
        cookTime: initial.cookTime,
        instructions: initial.instructions,
        tags: initial.tags,
        ingredients: initial.ingredients,
        imageUrl,
      }}
      onClose={onCancel}
      onSubmit={onSubmit}
      submitting={saving}
      error={error}
      testID="recipe-editor"
    />
  );
}
