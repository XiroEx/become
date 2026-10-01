import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/Text";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { Play, Dumbbell } from "lucide-react-native";
import {
  resolveFraming,
  type VideoFramingInput,
  type VideoSurface,
} from "@/lib/videoFraming";
import { resolveTrim, type VideoTrimOverride } from "@/lib/videoTrim";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useOptionalAuth } from "@/lib/auth/AuthProvider";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export function isYouTubeUrl(u?: string | null): boolean {
  if (!u) return false;
  return /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)/i.test(u);
}

export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  return match ? match[1] ?? null : null;
}

export interface FramedVideoProps extends VideoFramingInput {
  src?: string | null;
  surface: VideoSurface;
  exerciseName?: string;
  thumbnailUrl?: string | null;
  videoTrim?: VideoTrimOverride | null;
  token?: string | null;
  onDuration?: (seconds: number) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  showBadge?: boolean;
  showFullscreenToggle?: boolean;
  testID?: string;
  wrapperOverride?: string;
}

function setPlayerMuted(player: VideoPlayer, muted: boolean): void {
  player.muted = muted;
}

function setPlayerLoop(player: VideoPlayer, loop: boolean): void {
  player.loop = loop;
}

function setPlayerCurrentTime(player: VideoPlayer, time: number): void {
  player.currentTime = time;
}

export function FramedVideo({
  src,
  surface,
  exerciseName,
  thumbnailUrl,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  token: explicitToken,
  onDuration,
  style,
  showBadge,
  showFullscreenToggle,
  testID,
  wrapperOverride,
}: FramedVideoProps) {
  const { colors, scrim, tint } = useThemeTokens();
  const auth = useOptionalAuth();
  const token = explicitToken ?? auth?.token ?? null;

  const rawUrl = src?.trim() || "";
  const isYouTube = isYouTubeUrl(rawUrl);

  // Placeholder branch: empty or invalid src
  if (!rawUrl) {
    return (
      <View
        testID={testID ? `${testID}-placeholder` : "framed-video-placeholder"}
        style={[
          surface === "live"
            ? { width: "100%", height: "100%", minHeight: 180 }
            : { width: "100%", aspectRatio: 16 / 9 },
          {
            backgroundColor: tint("muted", 0.4),
            borderColor: tint("border", 0.5),
            borderWidth: 1,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          },
          style,
        ]}
      >
        <Dumbbell
          size={32}
          color={colors["muted-foreground"]}
          style={{ marginBottom: 8, opacity: 0.6 }}
        />
        <Text
          testID={testID ? `${testID}-placeholder-name` : undefined}
          className="text-foreground font-semibold text-center text-sm"
        >
          {exerciseName || "Exercise"}
        </Text>
        <Text
          testID={testID ? `${testID}-placeholder-text` : undefined}
          className="text-muted-foreground text-xs text-center mt-1"
        >
          Demo is coming soon
        </Text>
      </View>
    );
  }

  // YouTube branch: thumbnail that opens YouTube in browser / app
  if (isYouTube) {
    const ytId = extractYouTubeId(rawUrl);
    const ytThumb =
      thumbnailUrl ||
      (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

    return (
      <Pressable
        testID={testID ? `${testID}-youtube` : "framed-video-youtube"}
        accessibilityRole="button"
        accessibilityLabel={`Watch ${exerciseName || "exercise"} demo on YouTube`}
        onPress={() => {
          void Linking.openURL(rawUrl).catch(() => {});
        }}
        style={[
          surface === "live"
            ? { width: "100%", height: "100%", minHeight: 180 }
            : { width: "100%", aspectRatio: 16 / 9 },
          {
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            backgroundColor: colors.card,
            justifyContent: "center",
            alignItems: "center",
          },
          style,
        ]}
      >
        {ytThumb ? (
          <Image
            source={{ uri: ytThumb }}
            style={{ width: "100%", height: "100%", position: "absolute" }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              position: "absolute",
              backgroundColor: tint("muted", 0.6),
            }}
          />
        )}
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.primary,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Play size={24} color={colors["primary-foreground"]} />
          </View>
          <Text className="text-foreground text-xs font-medium mt-2">
            Watch on YouTube
          </Text>
        </View>
      </Pressable>
    );
  }

  // Direct video file playback
  return (
    <DirectFramedVideoPlayer
      src={rawUrl}
      surface={surface}
      videoWidth={videoWidth}
      videoHeight={videoHeight}
      videoFraming={videoFraming}
      videoTrim={videoTrim}
      token={token}
      onDuration={onDuration}
      style={style}
      showBadge={showBadge}
      showFullscreenToggle={showFullscreenToggle}
      testID={testID}
      wrapperOverride={wrapperOverride}
    />
  );
}

interface DirectPlayerProps extends VideoFramingInput {
  src: string;
  surface: VideoSurface;
  videoTrim?: VideoTrimOverride | null;
  token: string | null;
  onDuration?: (seconds: number) => void;
  style?: StyleProp<ViewStyle>;
  showBadge?: boolean;
  showFullscreenToggle?: boolean;
  testID?: string;
  wrapperOverride?: string;
}

function DirectFramedVideoPlayer({
  src,
  surface,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  token,
  onDuration,
  style,
  showBadge,
  testID,
}: DirectPlayerProps) {
  const { colors, scrim } = useThemeTokens();
  const [duration, setDuration] = useState<number | null>(null);

  const resolved = useMemo(
    () => resolveFraming({ videoWidth, videoHeight, videoFraming }, surface),
    [videoWidth, videoHeight, videoFraming, surface],
  );

  const trim = useMemo(
    () => resolveTrim({ videoTrim }, duration),
    [videoTrim, duration],
  );

  const fullUri = src.startsWith("/") ? `${WEBAPP_BASE_URL}${src}` : src;
  const isCustomExercise = fullUri.includes("custom-exercises/");

  const videoSource = useMemo(() => {
    if (isCustomExercise && token) {
      return {
        uri: fullUri,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
    }
    return { uri: fullUri };
  }, [fullUri, isCustomExercise, token]);

  const player = useVideoPlayer(videoSource, (p) => {
    p.muted = true;
    p.loop = trim.isFullLength;
    p.play();
  });

  const handleDuration = useCallback(
    (d: number) => {
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        onDuration?.(d);
      }
    },
    [onDuration],
  );

  // Sync mute and loop state when trim or player changes
  useEffect(() => {
    setPlayerMuted(player, true);
    setPlayerLoop(player, trim.isFullLength);
  }, [player, trim.isFullLength]);

  // Listen to status change to capture duration once ready
  useEffect(() => {
    const sub = player.addListener("statusChange", (event) => {
      if (event.status === "readyToPlay" && player.duration > 0) {
        handleDuration(player.duration);
      }
    });

    return () => {
      sub.remove();
    };
  }, [player, handleDuration]);

  // Trim looping: timeUpdate and playToEnd
  useEffect(() => {
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      if (!trim.isFullLength && trim.end !== null) {
        if (currentTime >= trim.end) {
          setPlayerCurrentTime(player, trim.start);
          if (!player.playing) {
            player.play();
          }
        } else if (currentTime < trim.start - 0.25) {
          setPlayerCurrentTime(player, trim.start);
        }
      }
    });

    const playToEndSub = player.addListener("playToEnd", () => {
      if (!trim.isFullLength) {
        setPlayerCurrentTime(player, trim.start);
        player.play();
      }
    });

    return () => {
      sub.remove();
      playToEndSub.remove();
    };
  }, [player, trim]);

  // Seek to in-point on initial load or trim window change
  useEffect(() => {
    if (trim.isFullLength) return;
    if (Math.abs(player.currentTime - trim.start) < 0.05) return;
    if (
      player.currentTime < trim.start ||
      (trim.end !== null && player.currentTime > trim.end)
    ) {
      setPlayerCurrentTime(player, trim.start);
    }
  }, [player, trim, duration]);

  const transformStyle =
    resolved.zoom !== 100
      ? { transform: [{ scale: resolved.zoom / 100 }] }
      : undefined;

  const wrapperStyle: ViewStyle =
    surface === "live"
      ? {
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 180,
          overflow: "hidden",
          backgroundColor: colors.background,
        }
      : {
          position: "relative",
          width: "100%",
          aspectRatio: 16 / 9,
          overflow: "hidden",
          borderRadius: 12,
          backgroundColor: colors.background,
        };

  return (
    <View
      testID={testID ? `${testID}-container` : "framed-video-container"}
      style={[wrapperStyle, style]}
    >
      <VideoView
        testID={testID || "framed-video-player"}
        player={player}
        style={[{ width: "100%", height: "100%" }, transformStyle]}
        contentFit={resolved.fit}
        nativeControls={false}
      />
      {showBadge && surface !== "live" ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            borderRadius: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: scrim,
          }}
        >
          <Text className="text-foreground text-xs font-medium">Demo</Text>
        </View>
      ) : null}
    </View>
  );
}

export default FramedVideo;
