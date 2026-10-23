import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { AlertCircle, Check, Info } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ToastData, ToastType } from "@/lib/toast/useToast";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  MOTION_MS,
  TOAST_ENTER_TRAVEL,
  motionMs,
} from "@/lib/motion/motion";

/**
 * A single floating toast pinned bottom-center (NP-271) — the native half of
 * the web's `components/ui/Toast.tsx`: a floating pill, not a line of plain
 * text sitting in the scroll flow. Rendered absolutely by the caller, which
 * keeps it on top of whatever screen is showing without this component
 * knowing about safe-area insets or z-order itself.
 */

const BG_CLASS: Record<ToastType, string> = {
  success: "bg-success",
  error: "bg-destructive",
  neutral: "bg-foreground",
  info: "bg-info",
};

const TEXT_CLASS: Record<ToastType, string> = {
  success: "text-primary-foreground",
  error: "text-destructive-foreground",
  neutral: "text-background",
  info: "text-primary-foreground",
};

const TYPE_ICON: Record<ToastType, typeof Check> = {
  success: Check,
  error: AlertCircle,
  neutral: Info,
  info: Info,
};

export interface ToastProps {
  toast: ToastData | null;
  testID?: string;
}

export function Toast({ toast, testID = "toast" }: ToastProps) {
  const { colors } = useThemeTokens();
  // THE RISE — the web's toast slides up 8pt + fades in over 0.2s.
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const travel = useSharedValue(reduced ? 0 : TOAST_ENTER_TRAVEL);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      travel.set(0);
      return;
    }
    const duration = motionMs(MOTION_MS.toast, false);
    opacity.set(withTiming(1, { duration }));
    travel.set(withTiming(0, { duration }));
    // Mount-only enter: a new toast mounts, the old one unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, toast?.message]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: travel.value }],
  }));

  if (!toast) return null;
  const Icon = TYPE_ICON[toast.type];
  const iconColor =
    toast.type === "success"
      ? colors["primary-foreground"]
      : toast.type === "error"
        ? colors["destructive-foreground"]
        : toast.type === "info"
          ? colors["primary-foreground"]
          : colors.background;
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`${BG_CLASS[toast.type]} flex-row items-center gap-2 self-center rounded-xl px-4 py-3 shadow-lg`}
      style={[{ maxWidth: "90%" }, reduced ? undefined : animatedStyle]}
    >
      <Icon size={16} color={iconColor} />
      <Text testID={`${testID}-message`} className={`${TEXT_CLASS[toast.type]} text-sm font-medium`}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

export default Toast;
