/**
 * APPLE'S OWN BUTTON, DRAWN BY APPLE.
 *
 * `AppleAuthenticationButton` renders the native
 * `ASAuthorizationAppleIDButton`, which is the only way to be sure the button
 * is exactly what Apple's Human Interface Guidelines require: the approved
 * title, the official logo, an approved colour, the right proportions, and
 * localised into the device's language for free. A hand-built Pressable with
 * an SVG apple in it is a rejection waiting to happen — and it would be wrong
 * in every language but English.
 *
 * FOUR RULES ARE ENCODED HERE, AND EACH ONE IS A GUIDELINE
 *
 *   • NO `backgroundColor`, NO `borderRadius` in `style`. Apple's colours and
 *     `cornerRadius` only — the component's own type forbids the first two,
 *     and this is why `cornerRadius` is a prop rather than a class.
 *   • THE COLOUR FOLLOWS THE APP, NOT THE SYSTEM: a BLACK button on our light
 *     surface, a WHITE one on our dark surface, which is what Apple means by
 *     "choose the version that provides the most contrast with the
 *     background". Become's dark mode is near-black, so WHITE_OUTLINE would
 *     be an outline nobody can see.
 *   • HEIGHT 48, NOT 44. Apple's minimum for the button is 44pt and our own
 *     touch-target floor (lib/a11y/touchTarget) is 44 too; 48 matches the
 *     primary Button on the same screen so neither one looks secondary. The
 *     guidelines require Sign in with Apple to be shown no less prominently
 *     than any other sign-in option.
 *   • IT RENDERS ONLY WHERE IT WORKS. Sign in with Apple does not exist on
 *     Android, and a dead Apple button is worse than none. THE PLATFORM CHECK
 *     IS SYNCHRONOUS and `isAvailableAsync()` is only a safety net that can
 *     remove the button — deciding it asynchronously would mean every screen
 *     holding this button re-renders after mount, which is both a flash for
 *     the member and an un-acted state update in every test that renders the
 *     sign-in screen.
 */
import { memo, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Can this platform have Sign in with Apple at all? Synchronous, so a screen
 * can leave out the divider and the heading too rather than drawing a gap
 * where Apple's button would be. iOS 13 is the floor for the API and the
 * installed Expo SDK's minimum iOS is well past it, so the platform IS the
 * answer; `isAvailableAsync` still gets the last word inside the component.
 */
export function appleSignInSupported(): boolean {
  return Platform.OS === "ios";
}

/** Apple's minimum button height is 44pt; 48 matches our primary Button. */
export const APPLE_BUTTON_HEIGHT = 48;
/** Same radius as the app's buttons (rounded-xl). */
export const APPLE_BUTTON_CORNER_RADIUS = 12;

export interface AppleSignInButtonProps {
  onPress: () => void;
  /** 'sign-in' → "Sign in with Apple"; 'sign-up' → "Sign up with Apple". */
  intent?: "sign-in" | "sign-up";
  /** Overrides the availability probe. Tests pass this; the app does not. */
  isAvailableAsync?: () => Promise<boolean>;
  testID?: string;
}

function AppleSignInButtonImpl({
  onPress,
  intent = "sign-in",
  isAvailableAsync,
  testID = "apple-sign-in-button",
}: AppleSignInButtonProps) {
  const { isDark } = useThemeTokens();
  // Starts from the PLATFORM, so the common case (an iPhone) draws the button
  // on the first render and never re-renders. The probe below can only take it
  // away, which is the only direction that matters.
  const [available, setAvailable] = useState<boolean>(appleSignInSupported());

  useEffect(() => {
    if (!appleSignInSupported()) return;
    let cancelled = false;
    const probe = isAvailableAsync ?? AppleAuthentication.isAvailableAsync;
    void (async () => {
      try {
        const ok = await probe();
        if (!cancelled && !ok) setAvailable(false);
      } catch {
        // A probe that throws is not evidence of absence; the platform check
        // already said yes, and Apple's own component renders nothing if it
        // really is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAvailableAsync]);

  if (!available) return null;

  return (
    <View testID={`${testID}-wrapper`} style={{ width: "100%" }}>
      <AppleAuthentication.AppleAuthenticationButton
        testID={testID}
        buttonType={
          intent === "sign-up"
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={
          isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={APPLE_BUTTON_CORNER_RADIUS}
        style={{ width: "100%", height: APPLE_BUTTON_HEIGHT }}
        onPress={onPress}
      />
    </View>
  );
}

/**
 * MEMOISED, and the sign-in screen passes a stable `onPress`. This is a NATIVE
 * view mounted next to a text input: without this it re-rendered on every
 * keystroke in the email box, for a button whose props never change.
 */
const AppleSignInButton = memo(AppleSignInButtonImpl);
AppleSignInButton.displayName = "AppleSignInButton";

export default AppleSignInButton;
