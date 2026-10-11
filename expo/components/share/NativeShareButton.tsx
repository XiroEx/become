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
import { getTokens, tintToken } from "@/lib/theme/tokens";
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
  /**
   * `"hero"` (NP-361): the web's hero action-row Share pill —
   * `rounded-full bg-white/10 px-4 py-2.5` with white text/icon — for a
   * caller that sits on a dark-pinned photo hero, instead of the default
   * light/dark-adaptive card chip every other caller uses.
   */
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

  // `tone="hero"` is dark-pinned (NP-361), independent of app light/dark
  // mode — the same `heroRgb`/`heroTint` reasoning `ProgramDetail.tsx` uses
  // for its own always-dark photo hero.
  const heroTokens = tone === "hero" ? getTokens("dark") : null;
  const iconColor = heroTokens ? `rgb(${heroTokens.foreground})` : colors.foreground;
  const labelColor = iconColor;
  const heroBg = heroTokens ? tintToken("foreground", "dark", 0.1) : colors.card;

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

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Share"
        accessibilityState={{ busy: sharing }}
        onPress={() => void onPress()}
        disabled={sharing}
        style={
          iconOnly
            ? {
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: heroTokens ? heroBg : colors.muted,
                opacity: sharing ? 0.6 : 1,
              }
            : tone === "hero"
              ? {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: heroBg,
                  opacity: sharing ? 0.6 : 1,
                }
              : {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: sharing ? 0.6 : 1,
                }
        }
      >
        {sharing ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Share2 size={16} color={iconColor} />
        )}
        {!iconOnly ? (
          <Text
            style={{
              fontSize: 14,
              fontWeight: tone === "hero" ? "600" : "500",
              color: labelColor,
            }}
          >
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
