import { ActivityIndicator, Pressable, View } from "react-native";
import { ChevronRight, Lock, Play, Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface TrackRecordEntry {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  protocol: "Protocol run",
  "fear-breakdown": "Fear broken down",
  "pattern-catch": "Pattern caught",
  "did-the-hard-thing": "Hard thing done",
  nonnegotiable: "Non-negotiable set",
  "fight-check": "Fight check",
  connect: "Reached out",
  intro: "Intro completed",
};

function relDay(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function AdaptiveSession({
  loading,
  onStart,
  colorClass,
  bgClass,
  title = "Built from where you are right now",
  subtitle = "Shaped by your recent check-ins, wins, and workouts.",
  testID = "mind-adaptive-session",
}: {
  loading: boolean;
  onStart: () => void;
  colorClass: string;
  bgClass: string;
  title?: string;
  subtitle?: string;
  testID?: string;
}) {
  const { colors } = useThemeTokens();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onStart}
      disabled={loading}
      className={`w-full overflow-hidden rounded-2xl border p-4 ${bgClass}`}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card">
          <Sparkles size={20} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className={`text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>
            Today’s session · built for you
          </Text>
          <Text className="text-sm font-bold text-foreground">
            {loading ? "Building your session…" : title}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {loading ? "Reading your recent reps…" : subtitle}
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2">
          {loading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Play size={12} color={colors.background} />
              <Text className="text-xs font-bold text-background">Begin</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export function SystemHero({
  Icon,
  title,
  tagline,
  statValue,
  statLabel,
  colorClass,
  bgClass,
  iconColor,
  testID = "mind-system-hero",
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  tagline: string;
  statValue: string | number;
  statLabel: string;
  colorClass: string;
  bgClass: string;
  iconColor?: string;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const c = iconColor ?? colors.foreground;

  return (
    <View
      testID={testID}
      className={`flex-row items-center gap-4 rounded-2xl border border-border p-4 ${bgClass}`}
    >
      <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card">
        <Icon size={24} color={c} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-extrabold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{tagline}</Text>
      </View>
      <View className="shrink-0 items-end">
        <Text className={`text-2xl font-extrabold tabular-nums ${colorClass}`}>
          {statValue}
        </Text>
        <Text className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {statLabel}
        </Text>
      </View>
    </View>
  );
}

export function ToolkitCard({
  Icon,
  title,
  blurb,
  onClick,
  iconColor,
  locked = false,
  lockedHint,
  testID,
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  blurb: string;
  onClick: () => void;
  colorClass?: string;
  iconColor?: string;
  locked?: boolean;
  lockedHint?: string;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const c = iconColor ?? colors.foreground;
  const tid =
    testID ?? `mind-toolkit-card-${title.toLowerCase().replace(/\s+/g, "-")}`;

  if (locked) {
    return (
      <View
        testID={tid}
        className="flex-row items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4 opacity-75"
      >
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon size={20} color={colors["muted-foreground"]} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-muted-foreground">
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground/80" numberOfLines={1}>
            {lockedHint ?? blurb}
          </Text>
        </View>
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock size={14} color={colors["muted-foreground"]} />
        </View>
      </View>
    );
  }

  return (
    <Pressable
      testID={tid}
      accessibilityRole="button"
      onPress={onClick}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-90"
    >
      <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon size={20} color={c} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {blurb}
        </Text>
      </View>
      <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground">
        <Play size={12} color={colors.background} />
      </View>
    </Pressable>
  );
}

export function DailyDrop({
  Icon,
  eyebrow,
  title,
  blurb,
  ctaLabel,
  onClick,
  colorClass,
  iconColor,
  testID = "mind-daily-drop",
}: {
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  eyebrow: string;
  title: string;
  blurb: string;
  ctaLabel: string;
  onClick: () => void;
  colorClass: string;
  iconColor?: string;
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const c = iconColor ?? colors.foreground;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onClick}
      className="w-full overflow-hidden rounded-2xl border border-border bg-card p-4 active:opacity-90"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon size={20} color={c} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className={`text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>
            {eyebrow}
          </Text>
          <Text className="text-sm font-bold text-foreground">{title}</Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {blurb}
          </Text>
        </View>
        <View className="shrink-0 rounded-full bg-foreground px-3 py-1.5">
          <Text className="text-xs font-bold text-background">{ctaLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function TrackRecord({
  entries,
  testID = "mind-track-record",
}: {
  entries: TrackRecordEntry[];
  testID?: string;
}) {
  const { colors } = useThemeTokens();

  if (entries.length === 0) {
    return (
      <View
        testID={`${testID}-empty`}
        className="rounded-2xl border border-dashed border-border p-4 items-center justify-center"
      >
        <Text className="text-center text-xs text-muted-foreground">
          Your reps will show up here. Run a tool above — it all counts.
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} className="gap-2">
      {entries.map((e) => (
        <View
          key={e.id}
          testID={`mind-track-record-entry-${e.id}`}
          className="flex-row items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
        >
          <View className="h-2 w-2 shrink-0 rounded-full bg-success" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm text-foreground font-medium" numberOfLines={1}>
              {e.title}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              {KIND_LABEL[e.kind] ?? e.kind} · {relDay(e.createdAt)}
            </Text>
          </View>
          <ChevronRight size={14} color={colors["muted-foreground"]} />
        </View>
      ))}
    </View>
  );
}
