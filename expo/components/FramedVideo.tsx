import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Dumbbell, Play } from "lucide-react-native";
import { useVideoPlayer, VideoView, type VideoSource } from "expo-video";
import { Text } from "@/components/Text";
import { useOptionalAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  resolveFraming,
  type VideoFramingInput,
  type VideoFramingOverride,
  type VideoSurface,
} from "@/lib/videoFraming";
import { resolveTrim, type VideoTrimOverride } from "@/lib/videoTrim";
import {
  getExerciseVideoDisplay,
  getExerciseVideoDisplayAsync,
  resolveExerciseVideo,
  type ExerciseVideoDisplay,
} from "@/lib/data/exerciseVideos";

export const DIRECT_VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)(\?.*)?$/i;

export function isYouTubeUrl(u?: string | null): boolean {
  if (!u) return false;
  return /(?:youtube\.com|youtu\.be)/i.test(u);
}

export function getYouTubeThumbnailUrl(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/,
  );
  if (match && match[1] && match[1].length === 11) {
    return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return null;
}

export function isCustomExerciseVideo(url: string): boolean {
  return /custom-exercises\//.test(url);
}

export function buildVideoSource(
  rawUrl: string,
  token?: string | null,
  baseUrl: string = WEBAPP_BASE_URL,
): VideoSource {
  let uri = rawUrl.trim();
  if (uri.startsWith("custom-exercises/") || uri.startsWith("exercises/")) {
    uri = `${baseUrl.replace(/\/$/, "")}/api/blob/${uri}`;
  } else if (uri.startsWith("/")) {
    uri = `${baseUrl.replace(/\/$/, "")}${uri}`;
  }

  const isCustom = isCustomExerciseVideo(uri);
  const headers: Record<string, string> = {};
  if (isCustom && token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (Object.keys(headers).length > 0) {
    return { uri, headers };
  }
  return uri;
}

export interface FramedVideoProps extends VideoFramingInput {
  src?: string | null;
  exerciseName?: string;
  surface: VideoSurface;
  thumbnailUrl?: string | null;
  videoTrim?: VideoTrimOverride | null;
  token?: string | null;
  showBadge?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onDuration?: (seconds: number) => void;
  onDimensions?: (width: number, height: number) => void;
}

export function FramedVideo({
  src,
  exerciseName,
  surface,
  thumbnailUrl,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  token,
  showBadge,
  style,
  testID,
  onDuration,
  onDimensions,
}: FramedVideoProps) {
  const [legacyVideo, setLegacyVideo] = useState<ExerciseVideoDisplay | null>(
    () => {
      return exerciseName ? getExerciseVideoDisplay(exerciseName) : null;
    },
  );

  useEffect(() => {
    if (src) {
      setLegacyVideo(null);
      return;
    }
    if (!exerciseName) {
      setLegacyVideo(null);
      return;
    }
    let cancelled = false;
    getExerciseVideoDisplayAsync(exerciseName).then((disp) => {
      if (!cancelled) {
        setLegacyVideo(disp);
      }
    });
    return () => {
      cancelled = true;
    };
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
  }, [
    src,
    thumbnailUrl,
    videoWidth,
    videoHeight,
    videoFraming,
    videoTrim,
    legacyVideo,
  ]);

  const currentVideo = resolved.videoUrl;
  const isYouTube = isYouTubeUrl(currentVideo);
  const auth = useOptionalAuth();
  const effectiveToken = token !== undefined ? token : auth?.token ?? null;

  const [measuredDuration, setMeasuredDuration] = useState<number | null>(null);

  const trim = useMemo(
    () => resolveTrim({ videoTrim: resolved.videoTrim }, measuredDuration),
    [resolved.videoTrim, measuredDuration],
  );

  const source = useMemo(() => {
    if (!currentVideo || isYouTube) return null;
    return buildVideoSource(currentVideo, effectiveToken);
  }, [currentVideo, isYouTube, effectiveToken]);

  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = trim.isFullLength;
    p.timeUpdateEventInterval = 0.1;
    if (trim.start > 0) {
      p.currentTime = trim.start;
    }
    p.play();
  });

  useEffect(() => {
    if (!player) return;

    player.muted = true;
    player.loop = trim.isFullLength;
    player.timeUpdateEventInterval = 0.1;

    const subTime = player.addListener("timeUpdate", ({ currentTime }) => {
      if (trim.isFullLength) return;
      if (trim.end !== null && currentTime >= trim.end) {
        player.currentTime = trim.start;
        if (!player.playing) {
          player.play();
        }
      } else if (currentTime < trim.start - 0.25) {
        player.currentTime = trim.start;
      }
    });

    const subEnd = player.addListener("playToEnd", () => {
      player.currentTime = trim.start;
      player.play();
    });

    const subSourceLoad = player.addListener("sourceLoad", (event) => {
      if (event.duration && event.duration > 0) {
        setMeasuredDuration(event.duration);
        onDuration?.(event.duration);
      }
      const track = event.availableVideoTracks?.[0];
      if (track?.size?.width && track?.size?.height) {
        onDimensions?.(track.size.width, track.size.height);
      }
    });

    const subStatus = player.addListener("statusChange", (status) => {
      if (status.status === "readyToPlay" && !player.playing) {
        player.play();
      }
    });

    return () => {
      subTime.remove();
      subEnd.remove();
      subSourceLoad.remove();
      subStatus.remove();
    };
  }, [player, trim, onDuration, onDimensions]);

  useEffect(() => {
    if (!player) return;
    if (trim.isFullLength) return;
    if (Math.abs(player.currentTime - trim.start) < 0.05) return;
    if (
      player.currentTime < trim.start ||
      (trim.end !== null && player.currentTime > trim.end)
    ) {
      player.currentTime = trim.start;
    }
  }, [player, trim]);

  const resolvedFraming = useMemo(
    () =>
      resolveFraming(
        {
          videoWidth: resolved.videoWidth,
          videoHeight: resolved.videoHeight,
          videoFraming: resolved.videoFraming,
        },
        surface,
      ),
    [resolved.videoWidth, resolved.videoHeight, resolved.videoFraming, surface],
  );

  // 1. Placeholder branch — no video available
  if (!currentVideo) {
    return (
      <View
        testID={testID ? `${testID}-placeholder` : "framed-video-placeholder"}
        style={[
          surface === "live"
            ? styles.placeholderLiveContainer
            : styles.placeholderCardContainer,
          style,
        ]}
      >
        <Dumbbell size={32} color="#71717a" />
        <Text
          testID={
            testID
              ? `${testID}-placeholder-title`
              : "framed-video-placeholder-title"
          }
          className="text-foreground text-sm font-semibold text-center mt-2"
        >
          {exerciseName || "Exercise"}
        </Text>
        <Text
          testID={
            testID
              ? `${testID}-placeholder-message`
              : "framed-video-placeholder-message"
          }
          className="text-muted-foreground text-xs text-center mt-1"
        >
          Demo coming soon
        </Text>
      </View>
    );
  }

  // 2. YouTube branch — open YouTube via thumbnail tap
  if (isYouTube) {
    const thumbUri =
      resolved.thumbnailUrl || getYouTubeThumbnailUrl(currentVideo);

    return (
      <Pressable
        testID={testID ? `${testID}-youtube` : "framed-video-youtube"}
        accessibilityRole="button"
        accessibilityLabel={`Watch ${exerciseName || "exercise"} demo on YouTube`}
        onPress={() => {
          void Linking.openURL(currentVideo);
        }}
        style={[
          surface === "live"
            ? styles.youtubeLiveContainer
            : styles.youtubeCardContainer,
          style,
        ]}
      >
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: "#18181b" }]}
          />
        )}
        <View style={styles.youtubeDarkOverlay} />
        <View style={styles.playButtonCircle}>
          <Play
            size={24}
            color="#ffffff"
            fill="#ffffff"
            style={{ marginLeft: 2 }}
          />
        </View>
        <View style={styles.youtubeBadge}>
          <Text className="text-white text-xs font-semibold">
            Watch on YouTube
          </Text>
        </View>
      </Pressable>
    );
  }

  // 3. Direct video player branch
  const transformStyle: ViewStyle = {};
  if (resolvedFraming.zoom !== 100) {
    transformStyle.transform = [{ scale: resolvedFraming.zoom / 100 }];
  }

  return (
    <View
      testID={testID ? `${testID}-container` : "framed-video-container"}
      style={[
        surface === "live"
          ? styles.videoLiveContainer
          : styles.videoCardContainer,
        style,
      ]}
    >
      <VideoView
        testID={testID ? `${testID}-player` : "framed-video-player"}
        player={player}
        nativeControls={false}
        contentFit={resolvedFraming.fit}
        style={[styles.video, transformStyle]}
      />
      {showBadge && surface !== "live" && (
        <View style={styles.demoBadge}>
          <Text className="text-white text-[10px] font-medium">Demo</Text>
        </View>
      )}
    </View>
  );
}

export default FramedVideo;

const styles = StyleSheet.create({
  video: {
    width: "100%",
    height: "100%",
  },
  videoCardContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#000000",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  videoLiveContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#000000",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderCardContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  placeholderLiveContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  youtubeCardContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#18181b",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  youtubeLiveContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#18181b",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  youtubeDarkOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  playButtonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    elevation: 3,
  },
  youtubeBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 2,
  },
  demoBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
});
