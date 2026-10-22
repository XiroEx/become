import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Blocks, Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  "primary-foreground": resolveToken("primary-foreground", "dark"),
  destructive: resolveToken("destructive", "dark"),
  info: resolveToken("info", "dark"),
  success: resolveToken("success", "dark"),
} as const;

interface Tile {
  id: number;
  word: string;
}

function shuffled(tiles: Tile[]): Tile[] {
  const a = [...tiles];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const first = a[i];
    const second = a[j];
    if (first !== undefined && second !== undefined) {
      a[i] = second;
      a[j] = first;
    }
  }
  if (a.length > 1 && a.every((t, i) => t.id === i)) {
    const first = a[0];
    const last = a[a.length - 1];
    if (first !== undefined && last !== undefined) {
      a[0] = last;
      a[a.length - 1] = first;
    }
  }
  return a;
}

export function AssembleScene({
  move,
  onDone,
  testID = "mind-assemble-scene",
}: MindSceneProps): React.JSX.Element {
  const reduced = useReducedMotion();

  const target = useMemo(
    () => (move.statement ?? "").trim().split(/\s+/).filter(Boolean),
    [move.statement],
  );
  const initialBank = useMemo(
    () => shuffled(target.map((word, id) => ({ id, word }))),
    [target],
  );

  const [bank, setBank] = useState<Tile[]>(initialBank);
  const [placed, setPlaced] = useState<Tile[]>([]);
  const [locked, setLocked] = useState(false);
  const advancedRef = useRef(false);

  const place = (tile: Tile) => {
    if (locked) return;
    setBank((b) => b.filter((t) => t.id !== tile.id));
    setPlaced((p) => [...p, tile]);
  };

  const unplace = (tile: Tile) => {
    if (locked) return;
    setPlaced((p) => p.filter((t) => t.id !== tile.id));
    setBank((b) => [...b, tile]);
  };

  const correct =
    placed.length === target.length &&
    placed.every((t, i) => t.word === target[i]);
  const firstWrong = placed.findIndex((t, i) => t.word !== target[i]);

  useEffect(() => {
    if (!correct || advancedRef.current) return;
    advancedRef.current = true;
    setLocked(true);
    const t = setTimeout(() => onDone(), 1100);
    return () => clearTimeout(t);
  }, [correct, onDone]);

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-black"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
        <Blocks size={24} color={C.info} />
      </View>

      {locked ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <Check size={32} color={C.success} strokeWidth={3} />
          </View>
          <Text className="mt-4 max-w-sm text-center text-xl font-bold leading-snug text-white">
            &ldquo;{move.statement}&rdquo;
          </Text>
          <Text className="mt-2 text-center text-sm text-white/50">
            Built it. Now live it.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="build"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-white/40">
            {move.title}
          </Text>
          <Text className="mt-2 text-center text-sm text-white/50">
            {move.subtitle ?? "Tap the words in order."}
          </Text>

          {/* Placed area */}
          <View className="mt-6 min-h-[72px] w-full flex-row flex-wrap content-start items-start justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/5 p-3">
            {placed.length === 0 ? (
              <Text className="self-center py-2 text-sm text-white/25">
                Tap words below…
              </Text>
            ) : null}
            {placed.map((t, i) => (
              <Pressable
                key={t.id}
                testID={`${testID}-placed-${t.id}`}
                accessibilityRole="button"
                accessibilityLabel={t.word}
                onPress={() => unplace(t)}
                style={minTouchTarget}
                className={`rounded-xl px-3 py-2 ${
                  firstWrong !== -1 && i >= firstWrong
                    ? "border border-red-400/50 bg-red-500/20"
                    : "border border-white/10 bg-white/15"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    firstWrong !== -1 && i >= firstWrong
                      ? "text-red-200"
                      : "text-white"
                  }`}
                >
                  {t.word}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Word bank */}
          <View className="mt-6 w-full flex-row flex-wrap items-center justify-center gap-2">
            {bank.map((t) => (
              <Pressable
                key={t.id}
                testID={`${testID}-bank-${t.id}`}
                accessibilityRole="button"
                accessibilityLabel={t.word}
                onPress={() => place(t)}
                style={minTouchTarget}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <Text className="text-sm font-semibold text-white/90">
                  {t.word}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

export default AssembleScene;
