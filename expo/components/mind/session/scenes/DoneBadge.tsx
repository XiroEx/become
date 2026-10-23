import { Check } from "lucide-react-native";
import { WebGradient } from "@/components/WebGradient";
import {
  darkTokens,
  onDarkForeground,
  rgbOf,
  webGradientRamps,
} from "@/lib/theme/tokens";

/**
 * The 64pt gradient check the web's scenes finish on
 * (`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br
 * from-X to-Y` with a white `Check`). Every stop is mode-invariant and the
 * scene is a fixed black stage, so the colours are the dark palette's tokens
 * and the white of `onDarkForeground`, like the rest of the scenes.
 */
const GREEN = rgbOf(darkTokens["mind-green"]);
const EMERALD = rgbOf(darkTokens["mind-emerald"]);
const ramp = (stops: readonly string[]) => stops.map((t) => rgbOf(t));

/**
 * The cross-hue badges are five-stop ramps sampled in oklab (`webGradientRamps`),
 * because the web blends in oklab and a two-stop sRGB blend of these ends reads
 * greyer or darker mid-ramp.
 */
export const DONE_BADGE_GRADIENTS = {
  /** ContrastScene — `from-emerald-500 to-green-500` (adjacent shades: sRGB is within 1 ΔE) */
  contrast: [EMERALD, GREEN],
  /** TypeScene, WriteAffirm — `from-violet-500 to-green-500` */
  violet: ramp(webGradientRamps.violetToGreen),
  /** ChallengeScene — `from-red-500 to-amber-500` */
  challenge: ramp(webGradientRamps.redToAmber),
  /** AssembleScene — `from-sky-500 to-green-500` */
  assemble: ramp(webGradientRamps.skyToGreen),
  /** WinScene — `from-amber-500 to-green-500` */
  win: ramp(webGradientRamps.amberToGreen),
} as const;

export type DoneBadgeTone = keyof typeof DONE_BADGE_GRADIENTS;

export function DoneBadge({
  tone,
  testID,
}: {
  tone: DoneBadgeTone;
  testID?: string;
}): React.JSX.Element {
  return (
    <WebGradient
      testID={testID}
      colors={DONE_BADGE_GRADIENTS[tone]}
      style={{
        height: 64,
        width: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Check size={32} color={onDarkForeground} strokeWidth={3} />
    </WebGradient>
  );
}

export default DoneBadge;
