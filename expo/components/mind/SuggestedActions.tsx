import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Sparkles } from "lucide-react-native";
import type { SuggestedAction } from "@become/core";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { TokenName } from "@/lib/theme/tokens";

export interface SuggestedActionsProps {
  actions: SuggestedAction[];
  loading?: boolean;
  testID?: string;
}

const ROTATE_MS = 3000;
const RESUME_MS = 5000;

export const SUGGESTED_SYSTEM_COLORS: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    dot: string;
    label: string;
  }
> = {
  "state-shift": {
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    text: "text-cyan-500 dark:text-cyan-300",
    dot: "bg-cyan-500",
    label: "State Shift",
  },
  "self-image": {
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-500 dark:text-violet-300",
    dot: "bg-violet-500",
    label: "Self-Image",
  },
  mission: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-500 dark:text-blue-300",
    dot: "bg-blue-500",
    label: "Mission",
  },
  vision: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-500 dark:text-emerald-300",
    dot: "bg-emerald-500",
    label: "Vision",
  },
  social: {
    bg: "bg-pink-500/10",
    border: "border-pink-500/30",
    text: "text-pink-500 dark:text-pink-300",
    dot: "bg-pink-500",
    label: "Social",
  },
  discipline: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-500 dark:text-red-300",
    dot: "bg-red-500",
    label: "Discipline",
  },
  "anti-sabotage": {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-500 dark:text-orange-300",
    dot: "bg-orange-500",
    label: "Anti-Sabotage",
  },
};

const FALLBACK_STYLE = {
  bg: "bg-zinc-500/10",
  border: "border-zinc-500/30",
  text: "text-zinc-500 dark:text-zinc-400",
  dot: "bg-zinc-500",
  label: "Mind",
};

export function getSystemTokenColor(
  system: string,
  colors: Record<TokenName, string>,
): string {
  switch (system) {
    case "discipline":
      return colors.primary;
    case "anti-sabotage":
      return colors.destructive;
    case "vision":
      return colors.success;
    default:
      return colors.accent;
  }
}

export default function SuggestedActions({
  actions,
  loading,
  testID = "mind-suggested-actions",
}: SuggestedActionsProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { width: windowWidth } = useWindowDimensions();

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [containerWidth, setContainerWidth] = useState(
    Math.max(280, windowWidth - 32),
  );

  const scrollRef = useRef<ScrollView>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const n = actions.length;

  const pauseBriefly = useCallback(() => {
    setPaused(true);
    if (resumeRef.current) clearTimeout(resumeRef.current);
    resumeRef.current = setTimeout(() => {
      setPaused(false);
    }, RESUME_MS);
  }, []);

  // Auto-rotate every 3s
  useEffect(() => {
    if (paused || n <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % n;
        scrollRef.current?.scrollTo({
          x: next * containerWidth,
          animated: true,
        });
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [paused, n, containerWidth]);

  useEffect(() => {
    return () => {
      if (resumeRef.current) clearTimeout(resumeRef.current);
    };
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
    }
  }, []);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (containerWidth <= 0) return;
      const offsetX = e.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / containerWidth);
      if (newIndex >= 0 && newIndex < n) {
        setActiveIndex(newIndex);
      }
      pauseBriefly();
    },
    [containerWidth, n, pauseBriefly],
  );

  if (!n) {
    if (loading) {
      return (
        <View testID={testID} className="mb-4">
          <View className="mb-2 flex-row items-center gap-1.5 px-0.5">
            <Sparkles size={14} color={colors.accent} />
            <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Suggested next
            </Text>
            <Text
              testID="mind-sugg-loading"
              className="text-[10px] text-muted-foreground"
            >
              · tuning…
            </Text>
          </View>
          <View
            testID="mind-suggested-skeleton"
            className="h-28 w-full rounded-2xl bg-muted/60 opacity-60"
          />
        </View>
      );
    }
    return null;
  }

  const safeIdx = Math.min(activeIndex, n - 1);
  const currentAction = actions[safeIdx] ?? actions[0];
  const activeStyle =
    currentAction?.system && SUGGESTED_SYSTEM_COLORS[currentAction.system]
      ? SUGGESTED_SYSTEM_COLORS[currentAction.system]!
      : FALLBACK_STYLE;

  return (
    <View testID={testID} onLayout={onLayout} className="mb-4">
      {/* Header */}
      <View className="mb-2 flex-row items-center justify-between px-0.5">
        <View className="flex-row items-center gap-1.5">
          <Sparkles size={14} color={colors.accent} />
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Suggested next
          </Text>
          {loading ? (
            <Text
              testID="mind-sugg-loading"
              className="text-[10px] text-muted-foreground"
            >
              · tuning…
            </Text>
          ) : null}
        </View>
      </View>

      {/* Swipeable / Auto-rotating Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={pauseBriefly}
        scrollEventThrottle={16}
        style={{ width: containerWidth }}
      >
        {actions.map((action, i) => {
          const s = SUGGESTED_SYSTEM_COLORS[action.system] ?? FALLBACK_STYLE;
          const arrowColor = getSystemTokenColor(action.system, colors);
          return (
            <View
              key={`${action.system}-${action.id}-${i}`}
              style={{ width: containerWidth }}
            >
              <Pressable
                testID={`mind-suggested-action-${action.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${action.title}, ${s.label}`}
                onPress={() => {
                  router.push(`/(tabs)/mind/${action.system}` as any);
                }}
                className={`rounded-2xl border ${s.bg} ${s.border} p-4 justify-between active:opacity-90`}
                style={{ minHeight: 120 }}
              >
                <View>
                  <View className="flex-row items-center justify-between">
                    <Text
                      className={`text-[10px] font-bold uppercase tracking-widest ${s.text}`}
                    >
                      {s.label}
                    </Text>
                    <ArrowRight size={16} color={arrowColor} />
                  </View>
                  <Text className="mt-1.5 text-lg font-extrabold leading-tight text-foreground">
                    {action.title}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-muted-foreground"
                    numberOfLines={2}
                  >
                    {action.reason || action.blurb}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Pagination Dots */}
      {n > 1 ? (
        <View className="mt-2.5 flex-row items-center justify-center gap-1.5">
          {actions.map((_, i) => (
            <Pressable
              key={i}
              testID={`mind-suggested-dot-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Suggestion ${i + 1}`}
              onPress={() => {
                setActiveIndex(i);
                pauseBriefly();
                scrollRef.current?.scrollTo({
                  x: i * containerWidth,
                  animated: true,
                });
              }}
              className={`h-1.5 rounded-full ${
                i === safeIdx
                  ? `w-5 ${activeStyle.dot}`
                  : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
