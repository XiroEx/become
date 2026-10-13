import { Stack } from "expo-router";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useStackAnimation } from "@/lib/navigation/screenAnimation";

/**
 * THE UNGUARDED GROUP: sign-in, the magic-link verifier, and account restore.
 *
 * These three are reachable with no session by definition — two of them are
 * the links in an email, and one of them is how a session starts. Nothing
 * here may sit behind AuthGuard, or tapping the link in a deletion email
 * would bounce a signed-out member to sign-in and the link would be spent.
 *
 * The group name is invisible in URLs: these screens are still `/login`,
 * `/verify` and `/account/restore`, which is what the associated domains and
 * the Android intent filters in `app.json` claim.
 */
export default function AuthGroupLayout() {
  const { colors } = useThemeTokens();
  // One explicit push for every Stack in the app, reduced motion included
  // (NP-340, `lib/navigation/screenAnimation.ts`).
  const animation = useStackAnimation();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation,
      }}
    />
  );
}
