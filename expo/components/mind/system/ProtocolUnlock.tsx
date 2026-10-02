import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface UnlockableProtocol {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
}

/** How many protocols are open at a given rep count. */
export function openCount(reps: number, total: number): number {
  return Math.max(0, Math.min(1 + reps, total));
}

/**
 * Watch `reps` and report protocols that cross from locked to unlocked.
 */
export function useProtocolUnlocks<T extends UnlockableProtocol>(
  protocols: T[],
  reps: number | null,
): { unlocked: T[]; dismiss: () => void } {
  const baseline = useRef<number | null>(null);
  const [unlocked, setUnlocked] = useState<T[]>([]);

  useEffect(() => {
    if (reps === null) return;
    const open = openCount(reps, protocols.length);
    const before = baseline.current;
    baseline.current = open;
    if (before === null || open <= before) return;
    setUnlocked(protocols.slice(before, open));
  }, [reps, protocols]);

  return { unlocked, dismiss: () => setUnlocked([]) };
}

export default function ProtocolUnlockModal({
  unlocked,
  onDismiss,
  accentColor,
}: {
  unlocked: UnlockableProtocol[];
  onDismiss: () => void;
  accentColor?: string;
}) {
  const { colors } = useThemeTokens();
  const accent = accentColor ?? colors.accent;
  const many = unlocked.length > 1;

  if (unlocked.length === 0) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={unlocked.length > 0}
      onRequestClose={onDismiss}
    >
      <View
        testID="protocol-unlock-modal"
        className="flex-1 items-center justify-center bg-black/70 px-6"
      >
        <View className="w-full max-w-sm rounded-3xl bg-card p-6 border border-border items-center">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
            <Sparkles size={28} color={accent} />
          </View>

          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">
            {many ? `${unlocked.length} protocols unlocked` : "Protocol unlocked"}
          </Text>

          <Text className="mt-1.5 text-xl font-extrabold text-foreground text-center">
            {many ? "Your reps paid off" : unlocked[0]?.title}
          </Text>

          {!many && unlocked[0]?.blurb ? (
            <Text className="mt-1.5 text-sm text-muted-foreground text-center">
              {unlocked[0].blurb}
            </Text>
          ) : null}

          {many ? (
            <View className="mt-4 w-full gap-2">
              {unlocked.map((p) => {
                const PIcon = p.Icon;
                return (
                  <View
                    key={p.id}
                    className="flex-row items-center gap-3 rounded-xl bg-muted px-3.5 py-2.5"
                  >
                    <PIcon size={16} color={accent} />
                    <Text
                      className="flex-1 text-sm font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {p.title}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text className="mt-4 text-xs text-muted-foreground text-center">
            Keep putting in reps to open the rest.
          </Text>

          <Pressable
            testID="protocol-unlock-dismiss"
            accessibilityRole="button"
            onPress={onDismiss}
            className="mt-5 w-full items-center justify-center rounded-2xl bg-foreground py-3.5 active:opacity-90"
          >
            <Text className="text-base font-bold text-background">
              Let&apos;s go
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
