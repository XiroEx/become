import { useCallback, useState } from "react";
import { Pressable } from "react-native";
import { Share2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  shareWorkoutLink,
  type CreateShareInput,
} from "@/lib/share/workoutShare";

/**
 * NATIVE SHARE BUTTON (NP-165).
 *
 * The native half of `webapp/components/share/ShareButton.tsx`: creates the
 * public, read-only snapshot (`POST /api/share`) and opens React Native's
 * `Share.share` with the absolute URL on the web's domain. The public page
 * (`/share/[shareId]`) stays on the web, signed out; JSON export stays
 * web-only.
 *
 * Renders nothing while `visible` is false — callers hide Share on programs
 * the member cannot open (NP-029's rule travels: catalogue programs, their
 * own custom programs, and ones shared with them).
 */

export interface NativeShareButtonProps extends Omit<CreateShareInput, "token"> {
  token?: string | null;
  /** Hide the button (a program the member cannot open). Defaults to true. */
  visible?: boolean;
  label?: string;
  testID?: string;
}

export function NativeShareButton({
  kind,
  programId,
  day,
  phase,
  session,
  token,
  visible = true,
  label = "Share",
  testID = "share-button",
}: NativeShareButtonProps) {
  const { colors } = useThemeTokens();
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    setError(null);
    try {
      await shareWorkoutLink(
        { kind, programId, day, phase, session, token },
        {},
      );
    } catch {
      setError("Could not create a share link.");
    } finally {
      setSharing(false);
    }
  }, [sharing, kind, programId, day, phase, session, token]);

  if (!visible) return null;

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: sharing }}
        disabled={sharing}
        onPress={() => void onPress()}
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: sharing ? 0.6 : 1,
          },
        ]}
      >
        <Share2 size={16} color={colors.foreground} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
          {sharing ? "Creating link…" : label}
        </Text>
      </Pressable>
      {error ? (
        <Text
          testID={`${testID}-error`}
          style={{ fontSize: 12, color: colors.destructive }}
        >
          {error}
        </Text>
      ) : null}
    </>
  );
}
