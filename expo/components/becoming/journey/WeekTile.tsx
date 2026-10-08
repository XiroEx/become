import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import type { WeekSnapshot } from "@/lib/becoming/types";
import { pillarColor } from "@/lib/becoming/pillarColors";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";

/**
 * A week as a TILE — the stage's compact card (NP-204).
 *
 * The web's `WeekCard` has a `compact` mode for cards more than two steps
 * from the focus and for the overview: the subject colour, the label and the
 * headline, nothing that needs reading up close. The native `WeekCard` was
 * written for a vertical list and has no such mode, so the stage mounts this
 * for every far card and swaps the full card in as the member arrives. A
 * year of weeks is therefore five full cards and forty-eight tiles, not
 * fifty-three cards' worth of highlights, nudges and steps on one screen.
 */
export interface WeekTileProps {
  week?: WeekSnapshot | null;
  horizon?: boolean;
  width: number;
  height: number;
  totalWeeks?: number;
  testID?: string;
}

export const WeekTile = memo(function WeekTile({ week, horizon = false, width, height, totalWeeks, testID }: WeekTileProps) {
  const color = horizon || !week ? rgbOf(becomingStageTokens.violet) : pillarColor(week.subject, week.score, 62);
  const eyebrow = horizon
    ? "Next Sunday"
    : !week
      ? ""
      : week.gap
        ? "Away"
        : week.isCurrent
          ? "This week"
          : `Week ${week.index + 1}${totalWeeks && totalWeeks > 1 ? ` of ${totalWeeks}` : ""}`;
  const label = horizon ? "Horizon" : week?.label ?? "";
  const headline = horizon ? "Who am I becoming?" : week?.headline ?? "";
  return (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          borderColor: color,
          borderStyle: horizon ? "dashed" : "solid",
          backgroundColor: rgbOf(becomingStageTokens.background, 0.92),
        },
      ]}
      testID={testID ?? (horizon ? "journey-tile-horizon" : `journey-tile-${week?.weekKey ?? "week"}`)}
      accessible
      accessibilityLabel={horizon ? "Horizon. Who am I becoming?" : `${label}. ${headline}`}
    >
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <Text style={[styles.eyebrow, { color: rgbOf(becomingStageTokens.ink, 0.6) }]}>{eyebrow}</Text>
      <Text style={[styles.label, { color: rgbOf(becomingStageTokens.ink, 0.85) }]}>{label}</Text>
      <Text style={[styles.headline, { color: rgbOf(becomingStageTokens.ink) }]} numberOfLines={4}>
        {headline}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    borderRadius: 24,
    borderWidth: 2,
    padding: 24,
    overflow: "hidden",
    gap: 8,
  },
  stripe: {
    height: 6,
    width: 72,
    borderRadius: 3,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
  },
  headline: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34,
    letterSpacing: -0.4,
    marginTop: 8,
  },
});

export default WeekTile;
