/**
 * PERSONAL RECORDS (NP-131) — the native records list and record modal.
 *
 * The web's `webapp/app/dashboard/progress/ProgressClient.tsx` renders a
 * `pbs` list (persisted `exercisePRs`, sorted heaviest-first by the route) and
 * opens `PRChartModal` per record: a per-exercise trend built from
 * `detailedWorkouts`, a correct flow (`PATCH /api/progress/prs
 * { exerciseSlug, weight, reps }` behind a review step) and a remove flow
 * (`DELETE /api/progress/prs?exerciseSlug=`) behind a confirmation. This file
 * ports all three on the NP-130 chart kit (`react-native-svg`, theme tokens,
 * no hard-coded ink — the repo-wide `noHexColorLiterals` suite enforces it).
 *
 * The wire is the web's wire on purpose: the same paths, methods and bodies,
 * so a correction saved here is the record the web renders on its next fetch
 * (acceptance e015c9a1), and removal stays a two-tap confirm inside the app —
 * a `Modal`, not `Alert` — the way `MyExercises` deletes, so a test can press
 * it (acceptance e015c9a2).
 */

import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Circle as SvgCircle,
  Line,
  Polyline,
  Text as SvgText,
} from "react-native-svg";
import { Pencil, Trash2, Trophy, X } from "lucide-react-native";
import { z } from "zod";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import {
  apiFetch,
  ApiError,
  type ProgressDetailedWorkout,
  type ProgressExercisePR,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { usePressed } from "@/lib/a11y/usePressed";

// ─── History ────────────────────────────────────────────────────────────────

export interface PrTrendPoint {
  /** Short display label from the workout ("Fri, Sep 26"). */
  date: string;
  weight: number;
  reps: number;
}

/**
 * Per-exercise history for the trend chart — the web's `getPRHistory`: the
 * best set logged for `slug` in each detailed workout, oldest first.
 * Workouts without the exercise (or without a tracked best set) contribute no
 * point, exactly like the web's `flatMap … .reverse()`.
 */
export function prHistoryForSlug(
  workouts: ProgressDetailedWorkout[] | undefined | null,
  slug: string,
): PrTrendPoint[] {
  return (workouts ?? [])
    .flatMap((w) => {
      const ex = w.exercises.find(
        (e: ProgressDetailedWorkout["exercises"][number]) => e.slug === slug,
      );
      if (!ex?.bestSet) return [];
      return [
        { date: w.date, weight: ex.bestSet.weight, reps: ex.bestSet.reps },
      ];
    })
    .reverse();
}

// ─── Correction validation (the web's `validEdit` rule) ─────────────────────

export interface PrCorrection {
  weight: number;
  reps: number;
}

/**
 * The corrected value, or null when the inputs are not a correction: weight
 * must be a finite positive number, reps a positive whole number, and at
 * least one of the two must differ from the stored record. The server caps
 * both sides; the client only refuses what is not a number or not a change.
 */
export function parsePrCorrection(
  pr: Pick<ProgressExercisePR, "weight" | "reps">,
  weightText: string,
  repsText: string,
): PrCorrection | null {
  const weight = Number(weightText);
  const reps = Number(repsText);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  if (!Number.isInteger(reps) || reps <= 0) return null;
  if (weight === pr.weight && reps === pr.reps) return null;
  return { weight, reps };
}

// ─── The wire (the web's paths, methods and bodies) ─────────────────────────

const PrCorrectResponseSchema = z
  .object({
    success: z.boolean().optional(),
    pr: z
      .object({
        exerciseSlug: z.string(),
        exerciseName: z.string().optional(),
        weight: z.number(),
        reps: z.number(),
        date: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const PrRemoveResponseSchema = z
  .object({ success: z.boolean().optional() })
  .passthrough();

export function prCorrectPath(): string {
  return "/api/progress/prs";
}

export function prRemovePath(slug: string): string {
  return `/api/progress/prs?exerciseSlug=${encodeURIComponent(slug)}`;
}

export interface PrMutationOptions {
  slug: string;
  authToken?: string | null;
}

/**
 * Correct the displayed record. Same endpoint and body the web's
 * `PRChartModal` saves, so the corrected value is what the web renders next.
 */
export async function correctPersonalRecord(
  options: PrMutationOptions & PrCorrection,
): Promise<void> {
  await apiFetch(prCorrectPath(), PrCorrectResponseSchema, {
    method: "PATCH",
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => options.authToken ?? undefined,
    body: {
      exerciseSlug: options.slug,
      weight: options.weight,
      reps: options.reps,
    },
  });
}

/**
 * Remove the displayed record. A future completed set can establish a new
 * one — the server's words, repeated in the confirm copy below.
 */
export async function removePersonalRecord(
  options: PrMutationOptions,
): Promise<void> {
  await apiFetch(prRemovePath(options.slug), PrRemoveResponseSchema, {
    method: "DELETE",
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => options.authToken ?? undefined,
  });
}

/** The server's `error` verbatim when it sent one, else the caller's copy. */
export function prApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: unknown } | null;
    if (body && typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
    return fallback;
  }
  return "Network error — your record is unchanged";
}

// ─── Records list ───────────────────────────────────────────────────────────

const PRS_PAGE = 6;

function PersonalRecordRow({
  pr,
  index,
  onSelect,
}: {
  pr: ProgressExercisePR;
  index: number;
  onSelect: (pr: ProgressExercisePR) => void;
}) {
  const { colors } = useThemeTokens();
  const press = usePressed();
  return (
    <Pressable
      testID={`progress-record-${index}`}
      accessibilityRole="button"
      accessibilityLabel={`${pr.name}, personal record ${pr.weight} pounds for ${pr.reps} reps`}
      accessibilityHint="Shows history and corrections"
      onPress={() => onSelect(pr)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: press.pressed ? 0.7 : 1,
        },
        minTouchTarget,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <Text
          className="text-foreground text-sm font-semibold"
          style={WRAPPABLE_TEXT}
          numberOfLines={1}
        >
          {pr.name}
        </Text>
        <Text className="text-muted-foreground text-xs">
          {pr.date} · history &amp; corrections
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text className="text-foreground text-sm font-bold">
          {pr.weight} lbs
        </Text>
        {pr.reps > 0 ? (
          <Text className="text-muted-foreground text-xs">
            × {pr.reps} reps
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export interface PersonalRecordsSectionProps {
  pbs: ProgressExercisePR[];
  onSelect: (pr: ProgressExercisePR) => void;
  testID?: string;
}

/**
 * The records list — the web's `#records` grid: one row per record with the
 * name, the date line and the weight × reps, opening the modal on tap.
 */
export function PersonalRecordsSection({
  pbs,
  onSelect,
  testID = "progress-records",
}: PersonalRecordsSectionProps) {
  const { colors } = useThemeTokens();
  const [shown, setShown] = useState(PRS_PAGE);

  if (pbs.length === 0) return null;

  return (
    <View testID={`${testID}-section`}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <Trophy size={16} color={colors.accent} />
        <Text
          accessibilityRole="header"
          className="text-foreground text-base font-semibold"
        >
          Personal Records
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        {pbs.slice(0, shown).map((pr, i) => (
          <PersonalRecordRow key={pr.slug} pr={pr} index={i} onSelect={onSelect} />
        ))}
        {pbs.length > PRS_PAGE ? (
          <Pressable
            testID="progress-records-more"
            accessibilityRole="button"
            onPress={() =>
              setShown((n) => (n > PRS_PAGE ? PRS_PAGE : n + PRS_PAGE))
            }
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: 10,
              alignItems: "center",
              ...minTouchTarget,
            }}
          >
            <Text className="text-muted-foreground text-sm font-medium">
              {shown >= pbs.length
                ? "Show less"
                : `Show more (${pbs.length - shown} remaining)`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// ─── Trend chart ────────────────────────────────────────────────────────────

const TREND_HEIGHT = 160;
const TREND_PAD_TOP = 12;
const TREND_PAD_BOTTOM = 24;
const TREND_PAD_LEFT = 44;
const TREND_PAD_RIGHT = 12;

export interface PrTrendChartProps {
  points: PrTrendPoint[];
  testID?: string;
}

/**
 * The per-exercise trend — the web's `LineChart` of best weight across the
 * logged sessions, drawn as a theme-coloured SVG polyline (the NP-130 kit:
 * foreground ink line, border grid, muted labels, all re-resolving on a live
 * system flip).
 */
export function PrTrendChart({
  points,
  testID = "pr-trend-chart",
}: PrTrendChartProps) {
  const { colors } = useThemeTokens();
  const [chartWidth, setChartWidth] = useState<number>(320);

  if (points.length < 2) {
    return (
      <Text
        testID={`${testID}-empty`}
        className="text-muted-foreground text-sm text-center"
        style={{ paddingVertical: 32 }}
      >
        Need at least 2 sessions to show a trend.
      </Text>
    );
  }

  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const plotWidth = Math.max(10, chartWidth - TREND_PAD_LEFT - TREND_PAD_RIGHT);
  const plotHeight = Math.max(
    10,
    TREND_HEIGHT - TREND_PAD_TOP - TREND_PAD_BOTTOM,
  );
  const xAt = (i: number): number =>
    TREND_PAD_LEFT +
    (points.length === 1
      ? plotWidth / 2
      : (i / (points.length - 1)) * plotWidth);
  const yAt = (weight: number): number =>
    TREND_PAD_TOP + plotHeight - ((weight - min) / range) * plotHeight;
  const lineColor = colors.foreground;
  const gridColor = colors.border;
  const labelColor = colors["muted-foreground"];
  const ticks = [min, Math.round((min + max) / 2), max];

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`${points.length} logged sessions, best ${max} pounds`}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - chartWidth) > 1) setChartWidth(w);
      }}
    >
      <Svg width={chartWidth} height={TREND_HEIGHT}>
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <Line
              key={`grid-${tick}`}
              x1={TREND_PAD_LEFT}
              y1={y}
              x2={TREND_PAD_LEFT + plotWidth}
              y2={y}
              stroke={gridColor}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          );
        })}
        {ticks.map((tick) => {
          const y = yAt(tick);
          return (
            <SvgText
              key={`tick-${tick}`}
              x={TREND_PAD_LEFT - 6}
              y={y + 3}
              fontSize={9}
              fill={labelColor}
              textAnchor="end"
            >
              {String(tick)}
            </SvgText>
          );
        })}
        <Polyline
          testID={`${testID}-line`}
          accessibilityLabel={`Best weight across ${points.length} sessions`}
          points={points.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.weight).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <SvgCircle
            key={`dot-${i}`}
            testID={`${testID}-dot-${i}`}
            accessibilityLabel={`${p.date}: ${p.weight} pounds for ${p.reps} reps`}
            cx={xAt(i)}
            cy={yAt(p.weight)}
            r={i === points.length - 1 ? 4 : 3}
            fill={lineColor}
          />
        ))}
        <SvgText
          x={TREND_PAD_LEFT}
          y={TREND_PAD_TOP + plotHeight + 16}
          fontSize={9}
          fill={labelColor}
          textAnchor="start"
        >
          {points[0]?.date ?? ""}
        </SvgText>
        <SvgText
          x={TREND_PAD_LEFT + plotWidth}
          y={TREND_PAD_TOP + plotHeight + 16}
          fontSize={9}
          fill={labelColor}
          textAnchor="end"
        >
          {points[points.length - 1]?.date ?? ""}
        </SvgText>
      </Svg>
    </View>
  );
}

// ─── Record modal ───────────────────────────────────────────────────────────

export type PrModalMode = "chart" | "edit" | "delete";

export interface PersonalRecordModalProps {
  pr: ProgressExercisePR;
  points: PrTrendPoint[];
  onClose: () => void;
  /** Refetch the progress payload (the parent also closes the modal). */
  onChanged: () => void | Promise<void>;
  authToken?: string | null;
  testID?: string;
}

/**
 * The record modal — the web's `PRChartModal`: chart first, then Correct
 * (weight/reps behind a review step) or Remove (behind a confirmation).
 * Mounted with `key={pr.slug}` so each record opens fresh; no prop-sync
 * effects.
 */
export function PersonalRecordModal({
  pr,
  points,
  onClose,
  onChanged,
  authToken = null,
  testID = "pr-modal",
}: PersonalRecordModalProps) {
  const { colors, tint } = useThemeTokens();
  const [mode, setMode] = useState<PrModalMode>("chart");
  const [weightText, setWeightText] = useState(String(pr.weight));
  const [repsText, setRepsText] = useState(String(pr.reps));
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correction = useMemo(
    () => parsePrCorrection(pr, weightText, repsText),
    [pr, weightText, repsText],
  );

  const close = () => {
    if (!submitting) onClose();
  };

  const save = async (): Promise<void> => {
    if (!correction) return;
    setSubmitting(true);
    setError(null);
    try {
      await correctPersonalRecord({
        slug: pr.slug,
        weight: correction.weight,
        reps: correction.reps,
        authToken,
      });
      await onChanged();
    } catch (e) {
      setError(prApiErrorMessage(e, "Could not correct this record"));
      setReviewing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await removePersonalRecord({ slug: pr.slug, authToken });
      await onChanged();
    } catch (e) {
      setError(prApiErrorMessage(e, "Could not remove this record"));
    } finally {
      setSubmitting(false);
    }
  };

  const subtitle =
    mode === "chart"
      ? `${points.length} logged sessions`
      : mode === "edit"
        ? "Correct personal record"
        : "Remove personal record";

  return (
    <Modal
      visible
      onClose={close}
      title={pr.name}
      testID={testID}
      accessibilityLabel={`${pr.name}, personal record`}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text testID={`${testID}-subtitle`} className="text-muted-foreground text-xs">
          {subtitle}
        </Text>
        <Pressable
          testID={`${testID}-close`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={close}
          style={{ padding: 4, ...minTouchTarget }}
        >
          <X size={16} color={colors["muted-foreground"]} />
        </Pressable>
      </View>

      {mode === "chart" ? (
        <View style={{ gap: 12 }}>
          <PrTrendChart points={points} testID={`${testID}-trend`} />
          <View
            testID={`${testID}-summary`}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderRadius: 12,
              backgroundColor: colors.muted,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Text className="text-muted-foreground text-xs">Record</Text>
              <Text
                testID={`${testID}-record-weight`}
                className="text-sm font-bold"
                style={{ color: colors.success }}
              >
                {pr.weight} lbs
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text className="text-muted-foreground text-xs">Reps</Text>
              <Text
                testID={`${testID}-record-reps`}
                className="text-foreground text-sm font-bold"
              >
                {pr.reps}
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text className="text-muted-foreground text-xs">Sessions</Text>
              <Text
                testID={`${testID}-record-sessions`}
                className="text-foreground text-sm font-bold"
              >
                {points.length}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-correct`}
                variant="ghost"
                onPress={() => setMode("edit")}
                accessibilityHint="Correct the displayed record"
              >
                Correct
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-remove`}
                variant="ghost"
                onPress={() => setMode("delete")}
                accessibilityHint="Remove the displayed record"
              >
                Remove
              </Button>
            </View>
          </View>
        </View>
      ) : mode === "edit" ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-weight`}
                label="Weight (lb)"
                keyboardType="decimal-pad"
                value={weightText}
                onChangeText={(v) => {
                  setWeightText(v);
                  setReviewing(false);
                }}
                accessibilityHint="Corrected best weight in pounds"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-reps`}
                label="Reps"
                keyboardType="number-pad"
                value={repsText}
                onChangeText={(v) => {
                  setRepsText(v);
                  setReviewing(false);
                }}
                accessibilityHint="Corrected reps, a whole number"
              />
            </View>
          </View>
          {reviewing && correction ? (
            <View
              testID={`${testID}-review-banner`}
              accessibilityRole="alert"
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.accent,
                backgroundColor: tint("accent", 0.14),
                padding: 12,
              }}
            >
              <Text className="text-foreground text-sm font-bold">
                Confirm record correction
              </Text>
              <Text
                testID={`${testID}-review-change`}
                className="text-foreground text-sm"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {pr.weight} lb × {pr.reps} → {correction.weight} lb ×{" "}
                {correction.reps}
              </Text>
            </View>
          ) : null}
          <Text className="text-muted-foreground text-xs">
            This corrects the displayed record. Correcting a historical workout
            later rebuilds records from the saved log history.
          </Text>
          {error ? (
            <Text
              testID={`${testID}-error`}
              accessibilityRole="alert"
              className="text-destructive text-sm"
            >
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-back`}
                variant="ghost"
                disabled={submitting}
                onPress={() => {
                  if (reviewing) setReviewing(false);
                  else setMode("chart");
                }}
              >
                {reviewing ? "Keep editing" : "Back"}
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-confirm`}
                variant="primary"
                disabled={submitting || !correction}
                loading={submitting}
                onPress={() => {
                  if (reviewing) void save();
                  else setReviewing(true);
                }}
              >
                {submitting
                  ? "Saving…"
                  : reviewing
                    ? "Confirm & save"
                    : "Review correction"}
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View
            testID={`${testID}-delete-warning`}
            accessibilityRole="alert"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.destructive,
              backgroundColor: tint("destructive", 0.12),
              padding: 12,
            }}
          >
            <Text className="text-foreground text-sm font-bold">
              Remove {pr.name} record?
            </Text>
            <Text className="text-muted-foreground text-xs">
              The displayed {pr.weight} lb × {pr.reps} record will be removed.
              A future completed set can establish a new record.
            </Text>
          </View>
          {error ? (
            <Text
              testID={`${testID}-error`}
              accessibilityRole="alert"
              className="text-destructive text-sm"
            >
              {error}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-cancel`}
                variant="ghost"
                disabled={submitting}
                onPress={() => setMode("chart")}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-delete-confirm`}
                variant="destructive"
                disabled={submitting}
                loading={submitting}
                onPress={() => void remove()}
              >
                {submitting ? "Removing…" : "Yes, remove"}
              </Button>
            </View>
          </View>
        </View>
      )}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginTop: 12,
        }}
      >
        {mode === "chart" ? (
          <Pencil size={12} color={colors["muted-foreground"]} />
        ) : mode === "edit" ? (
          <Pencil size={12} color={colors["muted-foreground"]} />
        ) : (
          <Trash2 size={12} color={colors["muted-foreground"]} />
        )}
        <Text className="text-muted-foreground text-xs">
          {mode === "delete"
            ? "Removal only clears the displayed record."
            : "Corrections only change the displayed record."}
        </Text>
      </View>
    </Modal>
  );
}

export default PersonalRecordsSection;
