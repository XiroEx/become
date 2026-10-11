/**
 * The Share button — `webapp/components/share/ShareButton.tsx`'s create half
 * through the system sheet (NP-165). Creates the public snapshot
 * (`POST /api/share`) and opens React Native's `Share` with the absolute
 * public URL; the public page stays on the web. JSON export stays web-only.
 *
 * Renders nothing while `visible` is false (the program-visibility gate —
 * catalogue, own custom, or shared-with-me — lives with the caller, see
 * `canShareProgram` in `@/lib/share/shareLink`).
 */

import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import { Share2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { resolveToken, tintToken } from "@/lib/theme/tokens";
import { shareLink } from "@/lib/share/shareLink";
import type { ShareCreateRequest } from "@become/api-client";

export interface NativeShareButtonProps {
  /** The exact `POST /api/share` body — kind + programId/day/phase/session. */
  body: ShareCreateRequest;
  /** Bearer token getter; omitted, the request goes out unauthenticated. */
  getToken?: () => string | undefined | Promise<string | undefined>;
  /** Hide the button (visibility gate) without unmounting the caller. */
  visible?: boolean;
  /** Error sink; omitted, the error shows inline under the button. */
  onError?: (message: string) => void;
  /** Fires with the absolute public URL after the sheet opens. */
  onShared?: (url: string) => void;
  /** Render as a round icon button with no text label (web header parity). */
  iconOnly?: boolean;
  /** Visual tone: hero uses translucent white pill on dark hero (web parity). */
  tone?: "default" | "hero";
  testID?: string;
}

export function NativeShareButton({
  body,
  getToken,
  visible = true,
  onError,
  onShared,
  iconOnly = false,
  tone = "default",
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
      const url = await shareLink(body, getToken ? { getToken } : {});
      onShared?.(url);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not create a share link.";
      if (onError) {
        onError(message);
      } else {
        setError(message);
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, body, getToken, onError, onShared]);

  if (!visible) return null;

  const darkFg = `rgb(${resolveToken("foreground", "dark")})`;
  const heroBg = tintToken("foreground", "dark", 0.1);
  const fgColor = tone === "hero" ? darkFg : colors.foreground;

  const buttonStyle = iconOnly
    ? {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: colors.muted,
        opacity: sharing ? 0.6 : 1,
      }
    : tone === "hero"
      ? {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 6,
          borderRadius: 9999,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: heroBg,
          opacity: sharing ? 0.6 : 1,
        }
      : {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 6,
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: sharing ? 0.6 : 1,
        };

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Share"
        accessibilityState={{ busy: sharing }}
        onPress={() => void onPress()}
        disabled={sharing}
        style={buttonStyle}
      >
        {sharing ? (
          <ActivityIndicator size="small" color={fgColor} />
        ) : (
          <Share2 size={16} color={fgColor} />
        )}
        {!iconOnly ? (
          <Text style={{ fontSize: 14, fontWeight: tone === "hero" ? "600" : "500", color: fgColor }}>
            {sharing ? "Sharing…" : "Share"}
          </Text>
        ) : null}
      </Pressable>
      {error ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          style={{ fontSize: 12, color: colors.destructive }}
        >
          {error}
        </Text>
      ) : null}
    </>
  );
}
