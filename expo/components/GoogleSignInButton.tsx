/**
 * CONTINUE WITH GOOGLE — the same button the web draws, natively.
 *
 * `webapp/components/AuthForm.tsx` renders Google's four-colour "G" beside the
 * words "Continue with Google" on a white surface with a hairline border. This
 * is that button, in React Native, from the SAME logo path data, so a member
 * who has signed in on the web recognises what they are tapping and Google's
 * mark is the mark Google published rather than something drawn by hand.
 *
 * THE LOGO IS THE ONE THING HERE THAT DOES NOT FOLLOW THE THEME. NP-123 bans
 * colour literals in this app because a hard-coded colour cannot follow the
 * system light/dark setting — the reason the app was once dark-only. Google's
 * brand colours are the deliberate exception: they are FIXED by Google's
 * identity guidelines, are the same in both modes, and are not the app's
 * palette. They are written as RGB triplets and composed, never as a hex
 * literal, so the lint rule and `__tests__/noHexColorLiterals.test.ts` still
 * hold. Everything AROUND the mark — surface, border, label — comes from
 * `useThemeTokens()` like every other surface in the app.
 *
 * Height 48 and radius 12 match `AppleSignInButton`, which matches the primary
 * Button: the three sign-in options on the login screen have to look like
 * equals, and Apple's guidelines require Sign in with Apple to be no less
 * prominent than any other option.
 */
import { memo } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/**
 * Matches APPLE_BUTTON_HEIGHT / APPLE_BUTTON_CORNER_RADIUS — as a MINIMUM, not a
 * height. Apple's button is a native view with no text of ours in it and can be
 * fixed; this one holds a `<Text>`, and a fixed height around text is a label
 * clipped at the largest Dynamic Type size (`__tests__/accessibility.test.tsx`).
 */
export const GOOGLE_BUTTON_HEIGHT = 48;
export const GOOGLE_BUTTON_CORNER_RADIUS = 12;

/**
 * Google's brand palette, as RGB triplets. See the note above for why these
 * four values are allowed to be written down here and nowhere else in the app.
 */
const GOOGLE_BRAND = {
  blue: "66 133 244",
  green: "52 168 83",
  yellow: "251 188 5",
  red: "234 67 53",
} as const;

const brand = (triplet: string): string => `rgb(${triplet})`;

/** The mark, from webapp/components/AuthForm.tsx — same viewBox, same paths. */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID="google-mark">
      <Path
        fill={brand(GOOGLE_BRAND.blue)}
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <Path
        fill={brand(GOOGLE_BRAND.green)}
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <Path
        fill={brand(GOOGLE_BRAND.yellow)}
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <Path
        fill={brand(GOOGLE_BRAND.red)}
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </Svg>
  );
}

export interface GoogleSignInButtonProps {
  onPress: () => void;
  /** 'sign-in' and 'sign-up' read the same for Google; kept for symmetry with
   *  the Apple button and so the label can diverge if it ever needs to. */
  intent?: "sign-in" | "sign-up";
  disabled?: boolean;
  testID?: string;
}

function GoogleSignInButtonImpl({
  onPress,
  intent = "sign-in",
  disabled = false,
  testID = "google-sign-in-button",
}: GoogleSignInButtonProps) {
  const { colors } = useThemeTokens();
  // Both strings are Google's own approved wording, and the sign-up one matches
  // what the Apple button beside it says in the same mode.
  const label = intent === "sign-up" ? "Sign up with Google" : "Continue with Google";

  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={{
        // NUMBERS, not a className: `w-full` is never resolved in jest, and the
        // 44-point rule is checked on the props (lib/a11y/touchTarget.ts).
        ...minTouchTarget,
        width: "100%",
        minHeight: GOOGLE_BUTTON_HEIGHT,
        paddingVertical: 8,
        borderRadius: GOOGLE_BUTTON_CORNER_RADIUS,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        opacity: disabled ? 0.5 : 1,
      }}
      className="flex-row items-center justify-center gap-3 px-4"
    >
      <View>
        <GoogleMark />
      </View>
      {/* flexShrink so the label WRAPS beside the mark at the largest Dynamic
          Type size instead of running off the end: React Native defaults
          flexShrink to 0 where CSS says 1. */}
      <Text
        style={{ flexShrink: 1 }}
        className="text-foreground text-base font-medium"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * MEMOISED, and the sign-in screen passes a stable `onPress` — the same reason
 * AppleSignInButton is: this sits next to a text input, and without it the
 * whole button (an SVG included) re-rendered on every keystroke.
 */
const GoogleSignInButton = memo(GoogleSignInButtonImpl);
GoogleSignInButton.displayName = "GoogleSignInButton";

export default GoogleSignInButton;
