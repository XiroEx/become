/**
 * ─── PICK A VARIATION (NP-281) ──────────────────────────────────────────────
 *
 * Native counterpart of `webapp/components/ExerciseVariationPicker.tsx`,
 * which the web program builder renders inside every exercise row: given the
 * slug somebody just picked, it asks the catalogue for that movement's family
 * (`GET /api/exercises/variations?slug=` — the SOURCE is the first entry, see
 * `ExerciseVariationsResponseSchema`) and lets them switch to the exact
 * equipment/style variant before saving.
 *
 * Two rules travel from the web component:
 *   • NOTHING RENDERS until there is more than one variation — a movement
 *     with no siblings has nothing to pick between.
 *   • The pick writes BOTH `exerciseSlug` and `name`: the slug is the link
 *     (hydration, PRs, demos) and the name is what the row reads as.
 */

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { z } from "zod";
import {
  apiFetch,
  ExerciseVariationsResponseSchema,
  type ExerciseVariation,
  type ExerciseVariationsResponse,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface ExerciseVariationChipsProps {
  /** The row's slug. Nothing renders while it is empty. */
  slug?: string | null;
  /** Which chip reads as current. Defaults to `slug` itself, as on the web. */
  selectedSlug?: string | null;
  onSelect: (variation: ExerciseVariation) => void;
  testID?: string;
}

/** The web's `formatEquipment`: `cable_machine` → `Cable Machine`. */
function formatEquipment(equipment: string): string {
  return equipment
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** The web drops the two that say nothing ("none", "bodyweight"). */
function equipmentLine(variation: ExerciseVariation): string {
  return (variation.equipment ?? [])
    .filter((item) => item !== "none" && item !== "bodyweight")
    .map(formatEquipment)
    .join(", ");
}

export function ExerciseVariationChips({
  slug,
  selectedSlug,
  onSelect,
  testID = "exercise-variations",
}: ExerciseVariationChipsProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [variations, setVariations] = useState<ExerciseVariation[]>([]);

  // The network is outside React, so the state write lives in the request's
  // callback rather than the effect body. A failure is silent and the row
  // simply offers no variations — the same as the web's `.catch(() => null)`.
  useEffect(() => {
    const key = (slug ?? "").trim();
    if (!key) return;
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch<
          z.infer<typeof ExerciseVariationsResponseSchema>
        >(
          `/api/exercises/variations?slug=${encodeURIComponent(key)}`,
          ExerciseVariationsResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active) return;
        setVariations(
          ((data as ExerciseVariationsResponse | null)?.variations ??
            []) as ExerciseVariation[],
        );
      } catch {
        if (active) setVariations([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, token]);

  if (variations.length < 2) return null;
  const active = (selectedSlug ?? slug ?? "").trim();

  return (
    <View testID={testID} style={{ gap: 6 }}>
      <Text className="text-muted-foreground text-xs font-semibold">
        PICK A VARIATION
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {variations.map((variation) => {
          const selected = variation.slug === active;
          const equipment = equipmentLine(variation);
          return (
            <Pressable
              key={variation.slug}
              testID={`${testID}-chip-${variation.slug}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={
                equipment
                  ? `${variation.name}, ${equipment}`
                  : variation.name
              }
              onPress={() => onSelect(variation)}
              style={[
                minTouchTarget,
                {
                  justifyContent: "center",
                  maxWidth: 200,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: selected ? colors.info : colors.border,
                  backgroundColor: selected ? colors.muted : colors.card,
                },
              ]}
            >
              <Text
                className={
                  selected
                    ? "text-info text-xs font-semibold"
                    : "text-foreground text-xs font-medium"
                }
                numberOfLines={1}
              >
                {variation.name}
              </Text>
              {equipment ? (
                <Text
                  className="text-muted-foreground text-xs"
                  numberOfLines={1}
                >
                  {equipment}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default ExerciseVariationChips;
