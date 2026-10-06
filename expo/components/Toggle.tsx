import { Pressable, View } from "react-native";
import { hitSlopToMinTarget } from "@/lib/a11y/touchTarget";

/** The track, in points. The thumb and the slop below are derived from it. */
const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;

/**
 * Which "on" colour the track draws. Defaults to `primary` (zinc-900 / white
 * since NP-313, which is the web's own `bg-zinc-900 dark:bg-white` switch —
 * it used to be the brand red). NP-303: the web's Settings
 * notification/email switches are `bg-blue-600` instead — `info` is that same
 * blue-600/400 token.
 */
export type ToggleColor = "primary" | "info";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  color?: ToggleColor;
  /**
   * REQUIRED, and deliberately not optional. A switch has no text of its own,
   * so without this VoiceOver reads it as "switch button" and the member is
   * asked to turn on something nameless. The row's label beside it is a
   * separate element and is NOT the switch's name. Making it a type error is
   * the only check that catches the next toggle that forgets.
   */
  accessibilityLabel: string;
  /** Spoken after the name and the state, for what flipping it will do. */
  accessibilityHint?: string;
  testID?: string;
}

export function Toggle({
  value,
  onValueChange,
  disabled = false,
  color = "primary",
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ToggleProps) {
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // The track is 48 x 28 and stays 48 x 28 — a switch that grows to 44
      // points tall is not a switch any more. The TOUCHABLE area grows
      // instead: 8 points of slop top and bottom make it 48 x 44.
      hitSlop={hitSlopToMinTarget(TRACK_WIDTH, TRACK_HEIGHT)}
      className={`w-12 h-7 rounded-full justify-center px-1 ${
        value ? (color === "info" ? "bg-info" : "bg-primary") : "bg-muted"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View
        testID={testID ? `${testID}-thumb` : undefined}
        className={`w-5 h-5 rounded-full bg-card ${
          value ? "self-end" : "self-start"
        }`}
      />
    </Pressable>
  );
}
