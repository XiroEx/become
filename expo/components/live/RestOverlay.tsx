import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/** The web's rest-duration presets, in the order it renders them. */
export const REST_PRESETS: { label: string; secs: number }[] = [
  { label: "60s", secs: 60 },
  { label: "90s", secs: 90 },
  { label: "2m", secs: 120 },
  { label: "3m", secs: 180 },
];

/** `0:56` — the web's `formatTime` for the ring's own clock. */
export function formatRest(remainingSec: number): string {
  const safe = Math.max(0, remainingSec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The `Up next:` detail in brackets — the web's rule verbatim: a grouped
 * step reads as its round, an ungrouped one as its set, and a single-set
 * exercise says nothing at all.
 */
export function upNextDetail(
  step: { groupId: string | null; roundNumber: number; setIndex: number } | undefined,
  totalSets: number,
  unit = "Set",
): string | null {
  if (!step) return null;
  if (step.groupId) return `(Round ${step.roundNumber + 1})`;
  if (totalSets > 1) return `(${unit} ${step.setIndex + 1} of ${totalSets})`;
  return null;
}

export interface RestOverlayProps {
  remainingSec: number;
  totalSec: number;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  /** Restart the rest at one of the presets (the web's 60s / 90s / 2m / 3m). */
  onPreset?: (seconds: number) => void;
  /** The exercise the member rests BEFORE (the web's `Up next:` name). */
  upNextName?: string;
  /** `(Set 2 of 3)` / `(Round 2)` — `upNextDetail` builds it. */
  upNextDetail?: string | null;
  testID?: string;
}

/**
 * THE REST OVERLAY — the web live client's full-screen rest (its
 * `isResting` block, `LiveWorkoutClient.tsx` ~2236-2306).
 *
 * Web parity, piece by piece: a ring that empties as the rest runs with
 * `0:56` and `REST` inside it, `Up next: <exercise> (Set 2 of 3)`, the four
 * duration presets, and `Skip Rest`. Native keeps one thing the web does not
 * have — Pause / Resume — because a phone in a gym gets picked up mid-rest
 * and the web's rest cannot be held.
 *
 * The ring is drawn with plain Views (an arc of border on a rotating square
 * is the only SVG-free way to do it, and SVG is not worth a new native
 * module here): a full track plus a sweep that shortens with the remainder,
 * which reads as the web's emptying ring at a glance. Colours come from the
 * theme (`success` is the web's green-500/400 pair), so the overlay is
 * legible in light mode as well as dark.
 */
export function RestOverlay({
  remainingSec,
  totalSec,
  running,
  onPause,
  onResume,
  onSkip,
  onPreset,
  upNextName,
  upNextDetail: detail,
  testID = "rest-timer",
}: RestOverlayProps) {
  const { colors, tint } = useThemeTokens();
  const total = totalSec > 0 ? totalSec : 1;
  const remainingPct = Math.max(
    0,
    Math.min(100, Math.round((remainingSec / total) * 100)),
  );
  const elapsedPct = 100 - remainingPct;

  return (
    <View
      testID={testID}
      // NOT `accessibilityViewIsModal`: the step underneath stays readable
      // (the web's overlay is a plain absolute layer over a live page that
      // is still there), and marking this a modal would hide the step —
      // and the member's own inputs — from assistive technology for the
      // length of every rest.
      accessibilityLabel={`Resting, ${formatRest(remainingSec)} left`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        gap: 16,
        backgroundColor: tint("background", 0.92),
      }}
    >
      {/* The ring: a muted track with a `success` sweep sized by what is left. */}
      <View
        testID={`${testID}-ring`}
        style={{
          width: 192,
          height: 192,
          borderRadius: 999,
          borderWidth: 6,
          borderColor: colors.muted,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <View
          testID={`${testID}-ring-fill`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${remainingPct}%`,
            backgroundColor: tint("success", 0.18),
          }}
        />
        <Text
          testID={`${testID}-time`}
          className="text-foreground text-5xl font-bold tabular-nums"
        >
          {formatRest(remainingSec)}
        </Text>
        <Text
          testID={`${testID}-label`}
          className="text-muted-foreground text-sm mt-1"
        >
          REST
        </Text>
      </View>
      <Text
        testID={`${testID}-percent`}
        className="text-muted-foreground text-xs tabular-nums"
      >
        {`${elapsedPct}%`}
      </Text>

      {upNextName ? (
        <Text
          testID={`${testID}-up-next`}
          className="text-foreground text-lg text-center"
        >
          {`Up next: ${upNextName}${detail ? ` ${detail}` : ""}`}
        </Text>
      ) : null}

      {onPreset ? (
        <View
          testID={`${testID}-presets`}
          style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}
        >
          {REST_PRESETS.map(({ label, secs }) => {
            const selected = totalSec === secs;
            return (
              <Pressable
                key={label}
                testID={`${testID}-preset-${secs}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Rest ${label}`}
                onPress={() => onPreset(secs)}
                style={[
                  minTouchTarget,
                  {
                    paddingHorizontal: 16,
                    borderRadius: 999,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: selected ? colors.foreground : colors.border,
                    backgroundColor: selected ? colors.foreground : "transparent",
                  },
                ]}
              >
                <Text
                  className={`text-xs font-semibold ${
                    selected ? "text-background" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        {running ? (
          <Button
            testID={`${testID}-pause`}
            variant="ghost"
            size="sm"
            onPress={onPause}
          >
            Pause
          </Button>
        ) : (
          <Button
            testID={`${testID}-resume`}
            variant="ghost"
            size="sm"
            onPress={onResume}
          >
            Resume
          </Button>
        )}
        <Button testID={`${testID}-skip`} variant="ghost" size="sm" onPress={onSkip}>
          Skip Rest
        </Button>
      </View>
    </View>
  );
}
