import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { Blocks, Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

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
  const { colors } = useThemeTokens();
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
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-5 h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <Blocks size={24} color={colors.primary} />
      </View>

      {locked ? (
        <Animated.View
          key="done"
          entering={reduced ? undefined : FadeIn.duration(250)}
          className="w-full max-w-sm items-center"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-success/20">
            <Check size={32} color={colors.success} strokeWidth={3} />
          </View>
          <Text className="mt-4 max-w-sm text-center text-xl font-bold leading-snug text-foreground">
            &ldquo;{move.statement}&rdquo;
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            Built it. Now live it.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          key="build"
          entering={reduced ? undefined : FadeInUp.duration(300)}
          className="w-full max-w-sm items-center"
        >
          <Text className="text-center text-xs uppercase tracking-widest text-muted-foreground">
            {move.title}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {move.subtitle ?? "Tap the words in order."}
          </Text>

          {/* Placed area */}
          <View className="mt-6 min-h-[72px] w-full flex-row flex-wrap content-start items-start justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-3">
            {placed.length === 0 ? (
              <Text className="self-center py-2 text-sm text-muted-foreground">
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
                    ? "border border-destructive bg-destructive/20"
                    : "border border-border bg-muted"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    firstWrong !== -1 && i >= firstWrong
                      ? "text-destructive"
                      : "text-foreground"
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
                className="rounded-xl border border-border bg-card px-3 py-2"
              >
                <Text className="text-sm font-semibold text-foreground">
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
