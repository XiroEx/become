/**
 * A per-member image, loaded WITH the session (NP-059).
 *
 * `<Image source={{ uri: "/api/blob/scans/…" }}>` cannot work natively for two
 * reasons: the path has no origin on it, and an `<Image>` sends no
 * `Authorization` header — so the blob route, which needs a session for every
 * per-member key, answers 404 (`webapp/app/api/blob/[...key]/route.ts`). The
 * web only gets away with `<img src>` because the browser attaches the
 * `auth_token` cookie.
 *
 * So this component prefixes `WEBAPP_BASE_URL`, fetches the bytes with the
 * Bearer token the app is already holding, and hands the image a `data:` URL.
 * `lib/media/authedBlob.ts` owns the fetch, the refusals and the in-memory,
 * token-keyed cache — nothing is ever written to disk, where another account on
 * the same device could read it.
 *
 * An image that will not load renders a sentence, not an exception: a 404 here
 * is the normal answer for an object that is gone or was never this member's.
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import {
  loadAuthedImage,
  type AuthedImageResult,
} from "@/lib/media/authedBlob";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/** What a member reads when the bytes do not arrive. */
export const AUTHED_IMAGE_ERROR_MESSAGE = "That photo could not be loaded.";

export interface AuthedImageProps {
  /** A Become path (`/api/blob/…`) or an absolute URL on the Become origin. */
  source: string;
  style?: StyleProp<ImageStyle>;
  /** The placeholder and error surface share the image's box. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Required: a photo with no accessible name is invisible to a reader. */
  accessibilityLabel: string;
  resizeMode?: "cover" | "contain" | "center" | "stretch";
  testID?: string;
  /** Injection points. The app leaves both unset. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Told what happened, every time a load settles. */
  onStatus?: (result: AuthedImageResult) => void;
}

export function AuthedImage({
  source,
  style,
  containerStyle,
  accessibilityLabel,
  resizeMode = "cover",
  testID,
  baseUrl,
  fetchImpl,
  onStatus,
}: AuthedImageProps) {
  const { token } = useAuth();
  const { colors } = useThemeTokens();
  const [outcome, setOutcome] = useState<{
    key: string;
    result: AuthedImageResult;
  } | null>(null);

  // The injection points and the callback are read, never reacted to: an
  // inline `fetchImpl` would otherwise be a new value on every render and
  // re-fetch the image forever.
  const injectedRef = useRef({ fetchImpl, onStatus });
  useEffect(() => {
    injectedRef.current = { fetchImpl, onStatus };
  });

  // WHAT this component is showing. Holding it beside the result is what lets
  // a change of image or of session read as "loading" WITHOUT a setState in
  // the effect body — the last answer simply stops matching the question.
  const requestKey = JSON.stringify([source, token, baseUrl ?? null]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const injected = injectedRef.current;
      const result = await loadAuthedImage({
        target: source,
        token,
        ...(baseUrl ? { baseUrl } : {}),
        ...(injected.fetchImpl ? { fetchImpl: injected.fetchImpl } : {}),
      });
      if (cancelled) return;
      setOutcome({ key: requestKey, result });
      injected.onStatus?.(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestKey, source, token, baseUrl]);

  const current = outcome && outcome.key === requestKey ? outcome.result : null;
  const dataUrl = current?.status === "loaded" ? current.dataUrl : null;
  const failed = current !== null && current.status !== "loaded";

  if (dataUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: dataUrl }}
        style={style}
        resizeMode={resizeMode}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  if (failed) {
    return (
      <View
        testID={testID ? `${testID}-error` : undefined}
        style={containerStyle}
        className="items-center justify-center rounded-xl bg-muted p-3"
      >
        <Text className="text-muted-foreground text-sm text-center">
          {AUTHED_IMAGE_ERROR_MESSAGE}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID ? `${testID}-loading` : undefined}
      style={containerStyle}
      accessibilityLabel={`Loading ${accessibilityLabel}`}
      className="items-center justify-center rounded-xl bg-muted"
    >
      <ActivityIndicator size="small" color={colors["muted-foreground"]} />
    </View>
  );
}
