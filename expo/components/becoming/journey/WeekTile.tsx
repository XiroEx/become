import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Compass, Flag } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { WeekSnapshot } from "@/lib/becoming/types";
import {
  HORIZON_GROUND,
  HORIZON_RING,
  TILE,
  TILE_CHIP_BACKGROUND,
  TILE_RING_COLOR,
  horizonTrendText,
  tileGradientPoints,
  tileGround,
  tileMark,
  tileStep,
  tileUnit,
  type TileGround,
  type TileStepIcon,
} from "@/lib/becoming/weekTile";
import { becomingStageTokens, rgbOf } from "@/lib/theme/tokens";

/**
 * A week as a TILE — the stage's compact card (NP-204, redrawn in NP-345).
 *
 * The web's `WeekCard` has a `compact` mode for the overview and for any card
 * more than two steps from the focus: a block in the WEEK'S COLOUR — a 160°
 * gradient of the subject's hue under an inset white ring — with a big
 * `W<n>` (`…` for a gap), the week label, the headline and a step chip. In
 * the overview that is what makes the chart read as grey → green → amber
 * blocks behind the markers. The stage mounts this for every far card and
 * swaps the full `WeekCard` in as the member arrives, so a year of weeks is
 * five full cards and forty-eight tiles, not fifty-three cards' worth of
 * highlights, nudges and steps on one screen.
 *
 * Every size is a CARD UNIT (`lib/becoming/weekTile.ts`): the web's px at the
 * card of the phone it was reviewed on, as a fraction of this card's width,
 * so the tile keeps the web's proportions at any card size and scales with
 * the camera like the rest of the world layer. The ground is one
 * expo-linear-gradient along CSS's 160° line for the box (the same
 * `gradientLine` the card's sky uses); its dark stop doubles as the view's
 * solid colour, so the tile is the week's colour before the gradient paints.
 *
 * The web's Horizon has no compact mode — its overview tile is the
 * `HorizonCard` itself — so the Horizon tile wears that card's ground (the
 * violet wash into the card colour) and dashed ring, in the same compact
 * type: Next Sunday, who the member said they are becoming, and where the
 * live week is trending.
 */
export interface WeekTileProps {
  week?: WeekSnapshot | null;
  horizon?: boolean;
  width: number;
  height: number;
  totalWeeks?: number;
  /** This week set a new high on the path — the chip says so, as the web's does. */
  isPeak?: boolean;
  /** The Horizon tile's: who the member said they are becoming. */
  identity?: string | null;
  /** The Horizon tile's: where the live week is trending. */
  trend?: "up" | "flat" | "down";
  testID?: string;
}

const STEP_ICON: Record<TileStepIcon, typeof ArrowRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
  start: Flag,
};

interface TileRing {
  width: number;
  color: string;
  dashed?: boolean;
}

interface TileShellProps {
  width: number;
  height: number;
  ground: TileGround;
  ring: TileRing;
  /** The solid colour under the gradient; the web's Horizon has none. */
  fill?: string;
  testID: string;
  accessibilityLabel: string;
  children: React.ReactNode;
}

/** The box: the ring, the gradient ground inside it, and the web's `p-7` column with its two ends apart. */
function TileShell({ width, height, ground, ring, fill, testID, accessibilityLabel, children }: TileShellProps) {
  const u = tileUnit(width);
  // Yoga lays an absolute child out inside the border, so the gradient's box
  // is the ring's inside — the 160° line is computed for that box.
  const innerW = Math.max(0, width - 2 * ring.width);
  const innerH = Math.max(0, height - 2 * ring.width);
  const points = tileGradientPoints(innerW, innerH);
  return (
    <View
      style={[
        styles.tile,
        {
          width,
          height,
          borderWidth: ring.width,
          borderColor: ring.color,
          borderStyle: ring.dashed ? "dashed" : "solid",
          backgroundColor: fill,
        },
      ]}
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <LinearGradient
        colors={ground.colors}
        locations={ground.locations}
        start={points.start}
        end={points.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        testID="week-tile-ground"
      />
      <View style={[styles.column, { padding: TILE.pad * u }]} testID="week-tile-column">
        {children}
      </View>
    </View>
  );
}

/** The web's step chip: `rounded-full bg-black/25`, an icon and one word. */
function Chip({ icon: Icon, text, u, ink }: { icon: typeof ArrowRight; text: string; u: number; ink: string }) {
  return (
    <View
      style={[
        styles.chip,
        {
          marginTop: TILE.chipGap * u,
          paddingHorizontal: TILE.chipPadX * u,
          paddingVertical: TILE.chipPadY * u,
          gap: TILE.chipInnerGap * u,
          backgroundColor: TILE_CHIP_BACKGROUND,
        },
      ]}
      testID="week-tile-chip"
    >
      <Icon size={TILE.chipIcon * u} color={ink} />
      <Text style={{ fontSize: TILE.chip * u, fontWeight: "700", color: ink }}>{text}</Text>
    </View>
  );
}

function WeekBlock({
  week,
  width,
  height,
  totalWeeks,
  isPeak,
  testID,
}: {
  week: WeekSnapshot;
  width: number;
  height: number;
  totalWeeks?: number;
  isPeak: boolean;
  testID?: string;
}) {
  const u = tileUnit(width);
  const ink = rgbOf(becomingStageTokens.ink);
  const ground = tileGround(week.subject, week.score);
  const step = tileStep(week, isPeak);
  const eyebrow = week.gap
    ? "Away"
    : week.isCurrent
      ? "This week"
      : `Week ${week.index + 1}${totalWeeks && totalWeeks > 1 ? ` of ${totalWeeks}` : ""}`;
  return (
    <TileShell
      width={width}
      height={height}
      ground={ground}
      ring={{ width: TILE.ring, color: TILE_RING_COLOR }}
      fill={ground.colors[1]}
      testID={testID ?? `journey-tile-${week.weekKey}`}
      accessibilityLabel={`${eyebrow}. ${week.label}. ${week.headline}. ${step.text}.`}
    >
      <View>
        <Text
          style={{
            fontSize: TILE.mark * u,
            lineHeight: TILE.mark * u,
            letterSpacing: TILE.markTracking * u,
            fontWeight: "900",
            color: ink,
          }}
          testID="week-tile-mark"
        >
          {tileMark(week)}
        </Text>
        <Text
          style={{
            marginTop: TILE.labelGap * u,
            fontSize: TILE.label * u,
            fontWeight: "600",
            color: rgbOf(becomingStageTokens.ink, 0.85),
          }}
          testID="week-tile-label"
        >
          {week.label}
        </Text>
      </View>
      <View>
        <Text
          style={{
            fontSize: TILE.headline * u,
            lineHeight: TILE.headlineLineHeight * u,
            fontWeight: "800",
            color: ink,
          }}
          numberOfLines={4}
          testID="week-tile-headline"
        >
          {week.headline}
        </Text>
        <Chip icon={STEP_ICON[step.icon]} text={step.text} u={u} ink={ink} />
      </View>
    </TileShell>
  );
}

function HorizonBlock({
  width,
  height,
  identity,
  trend,
  testID,
}: {
  width: number;
  height: number;
  identity?: string | null;
  trend: "up" | "flat" | "down";
  testID?: string;
}) {
  const u = tileUnit(width);
  const ink = rgbOf(becomingStageTokens.ink);
  const trendText = horizonTrendText(trend);
  const said = identity ? `“${identity}”` : "Who am I becoming?";
  return (
    <TileShell
      width={width}
      height={height}
      ground={HORIZON_GROUND}
      ring={{ width: HORIZON_RING.width, color: HORIZON_RING.color, dashed: true }}
      testID={testID ?? "journey-tile-horizon"}
      accessibilityLabel={`Horizon. Next Sunday. ${identity ? `Becoming: ${identity}` : "Who am I becoming?"}. ${trendText}.`}
    >
      <View>
        <Compass size={TILE.mark * u} color={rgbOf(becomingStageTokens.violet)} />
        <Text
          style={{
            marginTop: TILE.labelGap * u,
            fontSize: TILE.label * u,
            fontWeight: "600",
            color: rgbOf(becomingStageTokens.ink, 0.85),
          }}
          testID="week-tile-label"
        >
          Next Sunday
        </Text>
      </View>
      <View>
        <Text
          style={{
            fontSize: TILE.headline * u,
            lineHeight: TILE.headlineLineHeight * u,
            fontWeight: identity ? "600" : "800",
            fontStyle: identity ? "italic" : "normal",
            color: ink,
          }}
          numberOfLines={4}
          testID="week-tile-headline"
        >
          {said}
        </Text>
        <Chip icon={STEP_ICON[trend]} text={trendText} u={u} ink={ink} />
      </View>
    </TileShell>
  );
}

export const WeekTile = memo(function WeekTile({
  week,
  horizon = false,
  width,
  height,
  totalWeeks,
  isPeak = false,
  identity,
  trend = "flat",
  testID,
}: WeekTileProps) {
  if (horizon) return <HorizonBlock width={width} height={height} identity={identity} trend={trend} testID={testID} />;
  if (!week) return null;
  return <WeekBlock week={week} width={width} height={height} totalWeeks={totalWeeks} isPeak={isPeak} testID={testID} />;
});

const styles = StyleSheet.create({
  tile: {
    borderRadius: 24,
    overflow: "hidden",
  },
  /** The web's `flex h-full flex-col justify-between`. */
  column: {
    flex: 1,
    justifyContent: "space-between",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
  },
});

export default WeekTile;
