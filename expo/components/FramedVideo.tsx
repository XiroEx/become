import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { Dumbbell, Play } from "lucide-react-native";
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoContentFit } from "expo-video";
import { Text } from "@/components/Text";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { resolveFraming, type VideoFramingInput, type VideoFramingOverride, type VideoSurface } from "@/lib/videoFraming";
import { resolveTrim, type VideoTrimOverride } from "@/lib/videoTrim";
import {
  getExerciseVideoDisplay,
  getExerciseVideoDisplayAsync,
  resolveExerciseVideo,
  type ExerciseVideoDisplay,
} from "@/lib/data/exerciseVideos";
import { WEBAPP_BASE_URL } from "@/lib/config";

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

/**
 * Resolve a possibly-RELATIVE media url to one the native video/image players
 * can actually load (NP-287).
 *
 * `Exercise.videoUrl` and the legacy `exercise_videos` rows store catalogue
 * clips as a path under the webapp's `public/` dir (`/exercises/squat.mov`),
 * because the web just drops that straight into `<video src>` and the
 * browser resolves it against the page origin. Native has no page origin —
 * `expo-video`'s `uri` needs a full URL — so a relative path silently failed
 * to load and rendered the OS's broken-media glyph (a black box with a
 * crossed-out play icon) instead of the clip. An absolute `https://` url (a
 * CDN clip, or a member's own blob upload) is untouched.
 */
export function resolveMediaUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // already has a scheme
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) {
    return `${WEBAPP_BASE_URL.replace(/\/$/, "")}${trimmed}`;
  }
  return trimmed;
}

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function getYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_REGEX);
  return match?.[1] ?? null;
}

function seekPlayer(player: VideoPlayer, time: number) {
  player.currentTime = time;
}

function setPlayerLoop(player: VideoPlayer, loop: boolean) {
  player.loop = loop;
}

function setPlayerMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

export interface FramedVideoProps extends VideoFramingInput {
  src?: string | null;
  surface: VideoSurface;
  exerciseName?: string;
  thumbnailUrl?: string | null;
  videoTrim?: VideoTrimOverride | null;
  onDuration?: (seconds: number) => void;
  onDimensions?: (width: number, height: number) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  showBadge?: boolean;
  /** In lists, controls whether the active video player is mounted. When false, renders thumbnail with zero player overhead. */
  isPlaying?: boolean;
  /** Called when user taps the play button on the thumbnail view. */
  onPlayPress?: () => void;
}

function VideoPlaceholder({
  exerciseName,
  testID,
}: {
  exerciseName?: string;
  surface: VideoSurface;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <View
      testID={testID ? `${testID}-placeholder` : "framed-video-placeholder"}
      className="relative w-full aspect-video overflow-hidden rounded-xl bg-card/60 border border-border items-center justify-center p-4"
    >
      <Dumbbell size={36} color={colors["muted-foreground"]} style={{ marginBottom: 8, opacity: 0.5 }} />
      <Text
        testID={testID ? `${testID}-placeholder-text` : "framed-video-placeholder-text"}
        className="text-muted-foreground text-sm font-medium text-center"
      >
        {exerciseName ? `${exerciseName} demo is coming` : "Demo is coming"}
      </Text>
    </View>
  );
}

function YouTubeDemo({
  url,
  exerciseName,
  testID,
}: {
  url: string;
  exerciseName?: string;
  surface: VideoSurface;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const videoId = getYouTubeId(url);
  const thumbnailUrl = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;

  const handlePress = useCallback(() => {
    Linking.openURL(url).catch(() => {});
  }, [url]);

  return (
    <Pressable
      testID={testID ? `${testID}-youtube` : "framed-video-youtube"}
      accessibilityRole="button"
      accessibilityLabel={`Open YouTube demo for ${exerciseName || "exercise"}`}
      onPress={handlePress}
      className="relative w-full aspect-video overflow-hidden rounded-xl bg-black items-center justify-center"
    >
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : null}
      <View className="absolute inset-0 bg-black/40 items-center justify-center">
        <View className="h-12 w-12 rounded-full bg-destructive/90 items-center justify-center">
          <Play
            size={24}
            color={colors["destructive-foreground"]}
            fill={colors["destructive-foreground"]}
            style={{ marginLeft: 2 }}
          />
        </View>
        <Text className="text-white text-xs font-semibold mt-2 px-2 py-0.5 rounded bg-black/60">
          Watch on YouTube
        </Text>
      </View>
    </Pressable>
  );
}

function VideoThumbnailView({
  thumbnailUrl,
  exerciseName,
  onPress,
  testID,
  showBadge,
}: {
  thumbnailUrl?: string | null;
  exerciseName?: string;
  surface: VideoSurface;
  onPress?: () => void;
  testID?: string;
  showBadge?: boolean;
}) {
  const { colors } = useThemeTokens();
  return (
    <Pressable
      testID={testID ? `${testID}-thumbnail` : "framed-video-thumbnail"}
      accessibilityRole="button"
      accessibilityLabel={`Play demo video for ${exerciseName || "exercise"}`}
      onPress={onPress}
      className="relative w-full aspect-video overflow-hidden rounded-xl bg-card/60 border border-border items-center justify-center"
    >
      {thumbnailUrl ? (
        <Image
          testID={testID ? `${testID}-thumbnail-image` : "framed-video-thumbnail-image"}
          source={{ uri: thumbnailUrl }}
          className="absolute inset-0 w-full h-full"
          resizeMode="cover"
        />
      ) : (
        <View
          testID={testID ? `${testID}-thumbnail-placeholder` : "framed-video-thumbnail-placeholder"}
          className="items-center justify-center p-4"
        >
          <Dumbbell size={36} color={colors["muted-foreground"]} style={{ marginBottom: 8, opacity: 0.5 }} />
          <Text
            testID={testID ? `${testID}-thumbnail-text` : "framed-video-thumbnail-text"}
            className="text-muted-foreground text-sm font-medium text-center"
          >
            {exerciseName ? `${exerciseName} demo` : "Demo"}
          </Text>
        </View>
      )}
      <View className="absolute inset-0 bg-black/30 items-center justify-center">
        <View
          testID={testID ? `${testID}-play-btn` : "framed-video-play-btn"}
          className="h-12 w-12 rounded-full bg-primary items-center justify-center shadow-lg"
        >
          <Play
            size={22}
            color={colors["primary-foreground"]}
            fill={colors["primary-foreground"]}
            style={{ marginLeft: 2 }}
          />
        </View>
      </View>
      {showBadge ? (
        <View className="absolute top-2 right-2 rounded bg-black/60 px-2 py-1">
          <Text className="text-xs font-medium text-white">Demo</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface DirectVideoProps {
  src: string;
  surface: VideoSurface;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
  onDuration?: (seconds: number) => void;
  onDimensions?: (width: number, height: number) => void;
  showBadge?: boolean;
  testID?: string;
}

function DirectVideo({
  src,
  surface,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  onDuration,
  showBadge,
  testID,
}: DirectVideoProps) {
  const { token } = useAuth();
  const [duration, setDuration] = useState<number | null>(null);

  const trim = useMemo(() => {
    return resolveTrim({ videoTrim }, duration);
  }, [videoTrim, duration]);

  const framing = useMemo(() => {
    return resolveFraming({ videoWidth, videoHeight, videoFraming }, surface);
  }, [videoWidth, videoHeight, videoFraming, surface]);

  const trimRef = useRef(trim);
  useEffect(() => {
    trimRef.current = trim;
  }, [trim]);

  const isCustom = src.includes("custom-exercises/");
  const videoSource = useMemo(() => {
    const headers: Record<string, string> = {};
    if (isCustom && token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return {
      uri: src,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  }, [src, isCustom, token]);

  const player = useVideoPlayer(videoSource, (p) => {
    setPlayerMuted(p, true);
    setPlayerLoop(p, trim.isFullLength);
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });

  useEffect(() => {
    setPlayerMuted(player, true);
    setPlayerLoop(player, trim.isFullLength);
  }, [player, trim.isFullLength]);

  // Handle trim loop and duration listeners
  useEffect(() => {
    const timeSub = player.addListener("timeUpdate", (event) => {
      const currentTrim = trimRef.current;
      if (currentTrim.isFullLength) return;
      const end = currentTrim.end;
      if (end !== null && event.currentTime >= end) {
        seekPlayer(player, currentTrim.start);
        if (!player.playing) {
          player.play();
        }
      } else if (event.currentTime < currentTrim.start - 0.25) {
        seekPlayer(player, currentTrim.start);
      }
    });

    const endSub = player.addListener("playToEnd", () => {
      const currentTrim = trimRef.current;
      if (!currentTrim.isFullLength) {
        seekPlayer(player, currentTrim.start);
        player.play();
      }
    });

    const loadSub = player.addListener("sourceLoad", (event) => {
      if (event.duration > 0) {
        setDuration(event.duration);
        onDuration?.(event.duration);
      }
    });

    return () => {
      timeSub.remove();
      endSub.remove();
      loadSub.remove();
    };
  }, [player, onDuration]);

  // Initial seek to trim.start when trim changes
  useEffect(() => {
    if (!trim.isFullLength && player) {
      if (Math.abs(player.currentTime - trim.start) > 0.05) {
        seekPlayer(player, trim.start);
      }
    }
  }, [player, trim.start, trim.isFullLength]);

  const contentFit: VideoContentFit = framing.fit === "contain" ? "contain" : "cover";
  const scale = framing.zoom !== 100 ? framing.zoom / 100 : 1;
  const transform = scale !== 1 ? [{ scale }] : undefined;

  return (
    <View
      testID={testID ? `${testID}-container` : "framed-video-container"}
      className="relative w-full aspect-video overflow-hidden rounded-xl bg-black"
    >
      <VideoView
        testID={testID ? `${testID}-player` : "framed-video-player"}
        player={player}
        contentFit={contentFit}
        nativeControls={false}
        style={{
          width: "100%",
          height: "100%",
          transform,
        }}
      />
      {showBadge && surface !== "live" ? (
        <View className="absolute top-2 right-2 rounded bg-black/60 px-2 py-1">
          <Text className="text-xs font-medium text-white">Demo</Text>
        </View>
      ) : null}
    </View>
  );
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
  onDuration,
  onDimensions,
  showBadge,
  className,
  style,
  testID,
  isPlaying,
  onPlayPress,
}: FramedVideoProps) {
  const [legacyVideo, setLegacyVideo] = useState<ExerciseVideoDisplay | null>(
    () => (exerciseName ? getExerciseVideoDisplay(exerciseName) : null),
  );

  useEffect(() => {
    if (!src && exerciseName) {
      let active = true;
      void getExerciseVideoDisplayAsync(exerciseName).then((resolved) => {
        if (active && resolved) {
          setLegacyVideo(resolved);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [src, exerciseName]);

  const resolved = useMemo(() => {
    return resolveExerciseVideo(
      {
        videoUrl: src,
        thumbnailUrl,
        videoWidth,
        videoHeight,
        videoFraming,
        videoTrim,
      },
      legacyVideo,
    );
  }, [src, thumbnailUrl, videoWidth, videoHeight, videoFraming, videoTrim, legacyVideo]);

  const activeSrc = resolveMediaUrl(resolved.videoUrl);

  if (!activeSrc) {
    return (
      <View className={className} style={style}>
        <VideoPlaceholder
          exerciseName={exerciseName}
          surface={surface}
          testID={testID}
        />
      </View>
    );
  }

  // When isPlaying is explicitly false (in lists where only one row plays),
  // show the thumbnail or placeholder view with zero video player allocation.
  if (isPlaying === false) {
    return (
      <View className={className} style={style}>
        <VideoThumbnailView
          thumbnailUrl={resolveMediaUrl(resolved.thumbnailUrl)}
          exerciseName={exerciseName}
          surface={surface}
          onPress={onPlayPress}
          showBadge={showBadge}
          testID={testID}
        />
      </View>
    );
  }

  if (isYouTubeUrl(activeSrc)) {
    return (
      <View className={className} style={style}>
        <YouTubeDemo
          url={activeSrc}
          exerciseName={exerciseName}
          surface={surface}
          testID={testID}
        />
      </View>
    );
  }

  return (
    <View className={className} style={style}>
      <DirectVideo
        src={activeSrc}
        surface={surface}
        videoWidth={resolved.videoWidth}
        videoHeight={resolved.videoHeight}
        videoFraming={resolved.videoFraming}
        videoTrim={resolved.videoTrim}
        onDuration={onDuration}
        onDimensions={onDimensions}
        showBadge={showBadge}
        testID={testID}
      />
    </View>
  );
}

export default FramedVideo;
