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

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

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
  videoTrim?: VideoTrimOverride | null;
  onDuration?: (seconds: number) => void;
  onDimensions?: (width: number, height: number) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  showBadge?: boolean;
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
        videoWidth,
        videoHeight,
        videoFraming,
        videoTrim,
      },
      legacyVideo,
    );
  }, [src, videoWidth, videoHeight, videoFraming, videoTrim, legacyVideo]);

  const activeSrc = resolved.videoUrl;

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
