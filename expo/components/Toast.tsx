import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useEffect } from "react";
import { AlertCircle, Check, Info } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ToastData, ToastType } from "@/lib/toast/useToast";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { TOAST_ENTER_DISTANCE, TOAST_MS, motionMs } from "@/lib/motion/motion";

/**
 * A single floating toast pinned bottom-center (NP-271) — the native half of
 * the web's `components/ui/Toast.tsx`: a floating pill, not a line of plain
 * text sitting in the scroll flow. Rendered absolutely by the caller, which
 * keeps it on top of whatever screen is showing without this component
 * knowing about safe-area insets or z-order itself.
 *
 * The web's toast rises 8pt while fading in over 200ms (`initial={{ opacity:
 * 0, y: 8 }}`); this is that rise. Under Reduce Motion it draws in place.
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
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(
      withTiming(1, {
        duration: motionMs(TOAST_MS, false),
        easing: Easing.out(Easing.quad),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [reduced, toast?.message, toast?.type]);

  const rise = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: TOAST_ENTER_DISTANCE * (1 - t.value) }],
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
      style={[{ maxWidth: "90%" }, reduced ? undefined : rise]}
    >
      <Icon size={16} color={iconColor} />
      <Text testID={`${testID}-message`} className={`${TEXT_CLASS[toast.type]} text-sm font-medium`}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

export default Toast;
