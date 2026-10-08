import React, { useState, useRef } from "react";
import {
  View,
  Pressable,
  TextInput,
  Modal as RNModal,
  FlatList,
  ScrollView,
} from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget, hitSlopToMinTarget } from "@/lib/a11y/touchTarget";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { usePressed } from "@/lib/a11y/usePressed";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";
import {
  GripVertical,
  X,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  Square,
  RectangleHorizontal,
  Sparkles,
  Check,
  Settings2,
  Flame,
  TrendingUp,
  Target,
  Utensils,
  Droplets,
  Scale,
  Dumbbell,
  Brain,
  UtensilsCrossed,
  Zap,
  Smile,
} from "lucide-react-native";
import {
  type DashboardTile,
  type DashboardTileSize,
  type DashboardTileSettings,
  MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS,
  STAT_TILE_IDS,
  SMART_ROTATING_TILE_ID,
  DashboardLayoutPatchResponseSchema,
  apiFetch,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { writeCachedLayout } from "@/lib/dashboard/tileLayout";

export const MAX_TILES = MAX_DASHBOARD_TILES;
export const SMART_KEY = "smart";

export interface TileOption {
  key: string;
  kind: "stat" | "smart-rotating";
  id: string;
  label: string;
  description: string;
}

export const ALL_TILE_IDS = [
  ...STAT_TILE_IDS,
  "mindset",
  "nutrition",
  "workoutNow",
] as const;

export type TileId = (typeof ALL_TILE_IDS)[number];

export const TILE_DEFS: Record<
  string,
  { id: string; label: string; description: string }
> = {
  streak: {
    id: "streak",
    label: "Day Streak",
    description: "Days you've been consistent",
  },
  mood: {
    id: "mood",
    label: "Today's Mood",
    description: "Your mood today and recent trend",
  },
  weekly: {
    id: "weekly",
    label: "This Week",
    description: "Workouts finished vs your weekly target",
  },
  goal: {
    id: "goal",
    label: "Goal",
    description: "How far to your target",
  },
  calories: {
    id: "calories",
    label: "Calories",
    description: "Today's calories vs goal",
  },
  water: {
    id: "water",
    label: "Water",
    description: "Today's water vs goal",
  },
  weight: {
    id: "weight",
    label: "Weight",
    description: "Latest weigh-in and trend",
  },
  workouts: {
    id: "workouts",
    label: "Total Workouts",
    description: "Lifetime sessions logged",
  },
  mindset: {
    id: "mindset",
    label: "Mindset",
    description: "Jump straight into today's session",
  },
  nutrition: {
    id: "nutrition",
    label: "Nutrition",
    description: "Jump straight into logging food",
  },
  workoutNow: {
    id: "workoutNow",
    label: "Workout Now",
    description: "Jump straight into starting a workout",
  },
};

export const CATALOG: TileOption[] = [
  ...ALL_TILE_IDS.map((id) => ({
    key: id,
    kind: "stat" as const,
    id,
    label: TILE_DEFS[id]?.label ?? id,
    description: TILE_DEFS[id]?.description ?? "Metric",
  })),
  {
    key: SMART_KEY,
    kind: "smart-rotating" as const,
    id: SMART_ROTATING_TILE_ID,
    label: "Smart Tile",
    description: "Rotates through your most relevant metrics",
  },
];

export interface Row {
  rowId: string;
  kind: "stat" | "smart-rotating" | "metric";
  id: string;
  size: DashboardTileSize;
  settings?: DashboardTileSettings;
}

export function buildRows(layout: DashboardTile[]): Row[] {
  return layout.map((t, i) => ({
    rowId: `r${i}-${t.kind}-${t.id}`,
    kind: t.kind,
    id: t.id,
    size: t.size,
    settings: t.settings,
  }));
}

export function optionKeyForRow(row: Row): string {
  return row.kind === "smart-rotating" ? SMART_KEY : row.id;
}

export function metaForRow(row: Row): { label: string; description: string } {
  if (row.kind === "smart-rotating") {
    return {
      label: "Smart Tile",
      description: "Rotates through your most relevant metrics",
    };
  }
  const def = TILE_DEFS[row.id];
  return def
    ? { label: def.label, description: def.description }
    : { label: row.id, description: "Metric" };
}

export const FREQ_LABELS: Record<number, string> = {
  4000: "Fast · 4s",
  6000: "Normal · 6s",
  10000: "Relaxed · 10s",
  30000: "Slow · 30s",
};

export const POOL_OPTIONS = ALL_TILE_IDS.map((id) => ({
  key: `stat:${id}`,
  label: TILE_DEFS[id]?.label ?? id,
  id,
}));

export const DEFAULT_SMART_POOL: string[] = STAT_TILE_IDS.map(
  (id) => `stat:${id}`,
);

export function TileBadge({
  kind,
  id,
}: {
  kind: Row["kind"];
  id: string;
}) {
  const { colors, tint } = useThemeTokens();
  if (kind === "smart-rotating") {
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tint("indigo", 0.15),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkles size={18} color={colors.indigo} />
      </View>
    );
  }
  if (id === "mood") {
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tint("success", 0.15),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Smile size={18} color={colors.success} />
      </View>
    );
  }
  const map: Record<
    string,
    {
      Icon: React.ComponentType<{ size: number; color: string }>;
      color: string;
      bg: string;
    }
  > = {
    streak: { Icon: Flame, color: colors.amber, bg: tint("amber", 0.15) },
    weekly: {
      Icon: TrendingUp,
      color: colors.success,
      bg: tint("success", 0.15),
    },
    goal: { Icon: Target, color: colors.purple, bg: tint("purple", 0.15) },
    calories: {
      Icon: Utensils,
      color: colors.destructive,
      bg: tint("destructive", 0.15),
    },
    water: { Icon: Droplets, color: colors.primary, bg: tint("primary", 0.15) },
    weight: {
      Icon: Scale,
      color: colors["muted-foreground"],
      bg: colors.muted,
    },
    workouts: {
      Icon: Dumbbell,
      color: colors["muted-foreground"],
      bg: colors.muted,
    },
    mindset: { Icon: Brain, color: colors.purple, bg: tint("purple", 0.15) },
    nutrition: {
      Icon: UtensilsCrossed,
      color: colors.destructive,
      bg: tint("destructive", 0.15),
    },
    workoutNow: {
      Icon: Zap,
      color: colors.success,
      bg: tint("success", 0.15),
    },
  };
  const match = map[id];
  if (!match) {
    return (
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkles size={18} color={colors["muted-foreground"]} />
      </View>
    );
  }
  const { Icon, color, bg } = match;
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={18} color={color} />
    </View>
  );
}

function SizeControl({
  size,
  onChange,
  rowId,
}: {
  size: DashboardTileSize;
  onChange: (s: DashboardTileSize) => void;
  rowId: string;
}) {
  const { colors } = useThemeTokens();
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <Pressable
        testID={`customizer-size-square-${rowId}`}
        accessibilityRole="button"
        accessibilityLabel="Square"
        accessibilityState={{ selected: size === "1x1" }}
        onPress={() => onChange("1x1")}
        hitSlop={hitSlopToMinTarget(32, 28)}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: size === "1x1" ? colors.foreground : "transparent",
        }}
      >
        <Square
          size={14}
          color={
            size === "1x1"
              ? colors["primary-foreground"]
              : colors["muted-foreground"]
          }
        />
      </Pressable>
      <Pressable
        testID={`customizer-size-wide-${rowId}`}
        accessibilityRole="button"
        accessibilityLabel="Wide"
        accessibilityState={{ selected: size === "2x1" }}
        onPress={() => onChange("2x1")}
        hitSlop={hitSlopToMinTarget(32, 28)}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          borderLeftWidth: 1,
          borderLeftColor: colors.border,
          backgroundColor: size === "2x1" ? colors.foreground : "transparent",
        }}
      >
        <RectangleHorizontal
          size={14}
          color={
            size === "2x1"
              ? colors["primary-foreground"]
              : colors["muted-foreground"]
          }
        />
      </Pressable>
    </View>
  );
}

function DeleteRowButton({
  rowId,
  label,
  disabled,
  onDelete,
}: {
  rowId: string;
  label: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { colors, tint } = useThemeTokens();
  const { pressed, onPressIn, onPressOut } = usePressed();

  return (
    <Pressable
      testID={`customizer-delete-${rowId}`}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onDelete}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={hitSlopToMinTarget(32, 32)}
      style={[
        {
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.3 : 1,
        },
        pressed && !disabled ? { backgroundColor: tint("destructive", 0.15) } : null,
      ]}
    >
      {({ pressed: rnPressed }) => {
        const isDestructive = (pressed || rnPressed) && !disabled;
        return (
          <Trash2
            size={16}
            color={isDestructive ? colors.destructive : colors["muted-foreground"]}
          />
        );
      }}
    </Pressable>
  );
}

function TilePicker({
  title,
  disabledKeys,
  currentKey,
  onPick,
  onCancel,
}: {
  title: string;
  disabledKeys: Set<string>;
  currentKey?: string;
  onPick: (opt: TileOption) => void;
  onCancel: () => void;
}) {
  const { colors } = useThemeTokens();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const options = CATALOG.filter(
    (o) =>
      !q ||
      o.label.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q),
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          testID="customizer-picker-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onCancel}
          hitSlop={hitSlopToMinTarget(36, 36)}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
          }}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 17,
            fontWeight: "600",
            color: colors.foreground,
            flex: 1,
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
      </View>

      {/* Search Input */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 16,
          marginVertical: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          gap: 8,
        }}
      >
        <Search size={16} color={colors["muted-foreground"]} />
        <TextInput
          testID="customizer-picker-search"
          accessibilityLabel="Search tiles"
          value={query}
          onChangeText={setQuery}
          placeholder="Search tiles…"
          placeholderTextColor={colors["muted-foreground"]}
          style={{
            flex: 1,
            flexShrink: 1,
            fontSize: 15,
            color: colors.foreground,
            padding: 0,
          }}
        />
      </View>

      {/* Options List */}
      <FlatList
        data={options}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListEmptyComponent={
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 14,
                color: colors["muted-foreground"],
                textAlign: "center",
                flexShrink: 1,
              }}
            >
              No tiles match “{query}”.
            </Text>
          </View>
        }
        renderItem={({ item: opt }) => {
          const isCurrent = opt.key === currentKey;
          const disabled = !isCurrent && disabledKeys.has(opt.key);
          return (
            <Pressable
              key={opt.key}
              testID={`customizer-picker-option-${opt.key}`}
              disabled={disabled}
              onPress={() => onPick(opt)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: isCurrent, disabled }}
              style={[
                minTouchTarget,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isCurrent ? colors.foreground : colors.border,
                  backgroundColor: colors.card,
                  gap: 12,
                  opacity: disabled ? 0.4 : 1,
                },
              ]}
            >
              <TileBadge kind={opt.kind} id={opt.id} />
              <View style={{ flex: 1, flexShrink: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: colors.foreground,
                    flexShrink: 1,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors["muted-foreground"],
                    flexShrink: 1,
                  }}
                >
                  {disabled ? "Already on your dashboard" : opt.description}
                </Text>
              </View>
              {isCurrent ? (
                <Check size={18} color={colors.foreground} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function SmartSettingsPanel({
  settings,
  onChange,
  onCancel,
}: {
  settings: DashboardTileSettings | undefined;
  onChange: (next: DashboardTileSettings) => void;
  onCancel: () => void;
}) {
  const { colors } = useThemeTokens();
  const pool = new Set(settings?.pool ?? DEFAULT_SMART_POOL);
  const intervalMs = settings?.intervalMs ?? DEFAULT_SMART_INTERVAL_MS;

  const togglePool = (key: string) => {
    const next = new Set(pool);
    if (next.has(key)) {
      if (next.size <= 1) return; // Keep at least one card
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange({
      ...settings,
      pool: POOL_OPTIONS.filter((o) => next.has(o.key)).map((o) => o.key),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          testID="customizer-settings-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onCancel}
          hitSlop={hitSlopToMinTarget(36, 36)}
          style={{
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
          }}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{
            fontSize: 17,
            fontWeight: "600",
            color: colors.foreground,
            flex: 1,
            flexShrink: 1,
          }}
        >
          Smart tile settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 24,
          gap: 16,
        }}
      >
        {/* Frequency */}
        <View>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: colors["muted-foreground"],
              marginBottom: 10,
              flexShrink: 1,
            }}
          >
            Rotation speed
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {SMART_INTERVAL_OPTIONS_MS.map((ms) => {
              const active = intervalMs === ms;
              return (
                <Pressable
                  key={ms}
                  testID={`customizer-speed-${ms}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Rotation speed ${FREQ_LABELS[ms] ?? `${Math.round(ms / 1000)}s`}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => onChange({ ...settings, intervalMs: ms })}
                  style={[
                    minTouchTarget,
                    {
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? colors.foreground : colors.border,
                      backgroundColor: active ? colors.foreground : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: active
                        ? colors["primary-foreground"]
                        : colors.foreground,
                      flexShrink: 1,
                    }}
                  >
                    {FREQ_LABELS[ms] ?? `${Math.round(ms / 1000)}s`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pool */}
        <View>
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: colors["muted-foreground"],
              marginBottom: 10,
              flexShrink: 1,
            }}
          >
            Cards to rotate through
          </Text>
          <View style={{ gap: 8 }}>
            {POOL_OPTIONS.map((o) => {
              const on = pool.has(o.key);
              return (
                <Pressable
                  key={o.key}
                  testID={`customizer-pool-${o.id}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={o.label}
                  accessibilityState={{ checked: on }}
                  onPress={() => togglePool(o.key)}
                  style={[
                    minTouchTarget,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      gap: 12,
                    },
                  ]}
                >
                  <TileBadge kind="stat" id={o.id} />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "500",
                      color: colors.foreground,
                      flex: 1,
                      flexShrink: 1,
                    }}
                  >
                    {o.label}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: on ? colors.foreground : colors.border,
                      backgroundColor: on ? colors.foreground : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {on ? (
                      <Check
                        size={14}
                        color={colors["primary-foreground"]}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text
            style={{
              fontSize: 12,
              color: colors["muted-foreground"],
              marginTop: 8,
              flexShrink: 1,
            }}
          >
            The smart tile cycles through the selected cards (excluding ones already pinned).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

export type PickerState =
  | null
  | { mode: "add" }
  | { mode: "change"; rowId: string }
  | { mode: "settings"; rowId: string };

function useSafeAuth() {
  try {
    return useAuth();
  } catch {
    return { token: null, user: null };
  }
}

export interface CustomizeDashboardModalProps {
  visible: boolean;
  layout: DashboardTile[];
  onClose: () => void;
  onSaved: (layout: DashboardTile[]) => void | Promise<void>;
  onSave?: (layout: DashboardTile[]) => Promise<DashboardTile[] | void> | void;
  testID?: string;
}

function CustomizerBody({
  layout,
  onClose,
  onSaved,
  onSave,
  testID,
}: Omit<CustomizeDashboardModalProps, "visible">) {
  const { colors, scrim } = useThemeTokens();
  const auth = useSafeAuth();
  const [rows, setRows] = useState<Row[]>(() => buildRows(layout));
  const [picker, setPicker] = useState<PickerState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const canSave = rows.length >= 1 && rows.length <= MAX_TILES && !saving;

  const setSize = (rowId: string, size: DashboardTileSize) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, size } : r)),
    );
  };

  const setRowSettings = (rowId: string, settings: DashboardTileSettings) => {
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, settings } : r)),
    );
  };

  const deleteRow = (rowId: string) => {
    setRows((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.rowId !== rowId),
    );
  };

  const usedKeys = (exceptRowId?: string) => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.rowId === exceptRowId) continue;
      if (r.kind === "stat") s.add(r.id);
    }
    return s;
  };

  const handlePick = (opt: TileOption) => {
    if (!picker) return;
    if (picker.mode === "add") {
      if (rows.length >= MAX_TILES) return;
      counter.current += 1;
      setRows((prev) => [
        ...prev,
        {
          rowId: `new-${counter.current}`,
          kind: opt.kind,
          id: opt.id,
          size: "1x1",
        },
      ]);
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === picker.rowId ? { ...r, kind: opt.kind, id: opt.id } : r,
        ),
      );
    }
    setPicker(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next: DashboardTile[] = rows.map((r) => {
        if (r.kind === "smart-rotating") {
          const tile: DashboardTile = {
            id: r.id,
            kind: "smart-rotating",
            size: r.size,
            locked: null,
          };
          if (r.settings && (r.settings.pool?.length || r.settings.intervalMs)) {
            tile.settings = r.settings;
          }
          return tile;
        }
        return { id: r.id, kind: r.kind, size: r.size };
      });

      if (onSave) {
        const result = await onSave(next);
        await onSaved(result ?? next);
      } else {
        const res = await apiFetch(
          "/api/dashboard/layout",
          DashboardLayoutPatchResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => auth?.token ?? undefined,
            method: "PATCH",
            body: { layout: next },
          },
        );
        const saved = res.layout ?? next;
        const memberId =
          typeof auth?.user?.id === "string" ? auth.user.id : null;
        await writeCachedLayout(saved, memberId);
        await onSaved(saved);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your layout",
      );
    } finally {
      setSaving(false);
    }
  };

  const changingRow =
    picker?.mode === "change"
      ? rows.find((r) => r.rowId === picker.rowId)
      : undefined;
  const settingsRow =
    picker?.mode === "settings"
      ? rows.find((r) => r.rowId === picker.rowId)
      : undefined;

  const renderItem = ({
    item: row,
    drag,
    isActive,
  }: RenderItemParams<Row>) => {
    const meta = metaForRow(row);
    return (
      <ScaleDecorator>
        <View
          testID={`customizer-row-${row.rowId}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isActive ? colors.foreground : colors.border,
            backgroundColor: colors.card,
            marginBottom: 8,
            gap: 10,
            opacity: isActive ? 0.8 : 1,
          }}
        >
          {/* Drag handle */}
          <Pressable
            testID={`customizer-drag-${row.rowId}`}
            accessibilityRole="button"
            accessibilityLabel={`Drag to reorder ${meta.label}`}
            onLongPress={drag}
            delayLongPress={100}
            hitSlop={hitSlopToMinTarget(32, 32)}
            style={{
              padding: 4,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <GripVertical size={18} color={colors["muted-foreground"]} />
          </Pressable>

          {/* Badge */}
          <TileBadge kind={row.kind} id={row.id} />

          {/* Label + change type */}
          <Pressable
            testID={`customizer-change-${row.rowId}`}
            accessibilityRole="button"
            accessibilityLabel={`Change tile type, currently ${meta.label}`}
            onPress={() => setPicker({ mode: "change", rowId: row.rowId })}
            style={{ flex: 1, flexShrink: 1, minWidth: 0 }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.foreground,
                flexShrink: 1,
              }}
            >
              {meta.label}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: colors["muted-foreground"],
                flexShrink: 1,
              }}
            >
              Tap to change
            </Text>
          </Pressable>

          {/* Size toggle */}
          <SizeControl
            size={row.size}
            onChange={(s) => setSize(row.rowId, s)}
            rowId={row.rowId}
          />

          {/* Settings if smart-rotating */}
          {row.kind === "smart-rotating" ? (
            <Pressable
              testID={`customizer-settings-${row.rowId}`}
              accessibilityRole="button"
              accessibilityLabel="Smart tile settings"
              onPress={() => setPicker({ mode: "settings", rowId: row.rowId })}
              hitSlop={hitSlopToMinTarget(32, 32)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings2 size={16} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}

          {/* Delete button */}
          <DeleteRowButton
            rowId={row.rowId}
            label={meta.label}
            disabled={rows.length <= 1}
            onDelete={() => deleteRow(row.rowId)}
          />
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <Pressable
      testID={testID ? `${testID}-backdrop` : "customizer-backdrop"}
      accessibilityRole="none"
      accessible={false}
      importantForAccessibility="no"
      onPress={onClose}
      style={{
        flex: 1,
        backgroundColor: scrim,
        justifyContent: "flex-end",
      }}
    >
      <Pressable
        testID={testID ? `${testID}-sheet` : "customizer-sheet"}
        accessibilityRole="none"
        accessibilityViewIsModal
        accessibilityLabel="Customize dashboard"
        onAccessibilityEscape={onClose}
        onPress={() => {}}
        style={{
          maxHeight: "90%",
          height: "85%",
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          width: "100%",
          overflow: "hidden",
        }}
      >
        {picker?.mode === "settings" && settingsRow ? (
          <SmartSettingsPanel
            settings={settingsRow.settings}
            onChange={(next) => setRowSettings(settingsRow.rowId, next)}
            onCancel={() => setPicker(null)}
          />
        ) : picker && picker.mode !== "settings" ? (
          <TilePicker
            title={picker.mode === "add" ? "Add a tile" : "Change tile"}
            disabledKeys={usedKeys(
              picker.mode === "change" ? picker.rowId : undefined,
            )}
            currentKey={
              changingRow ? optionKeyForRow(changingRow) : undefined
            }
            onPick={handlePick}
            onCancel={() => setPicker(null)}
          />
        ) : (
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                gap: 12,
              }}
            >
              <View style={{ flex: 1, flexShrink: 1 }}>
                <Text
                  accessibilityRole="header"
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.foreground,
                    flexShrink: 1,
                  }}
                >
                  Customize Dashboard
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors["muted-foreground"],
                    marginTop: 2,
                    flexShrink: 1,
                  }}
                >
                  Resize, reorder, swap, or remove your tiles — and add new ones.
                </Text>
              </View>
              <Pressable
                testID="customizer-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={hitSlopToMinTarget(36, 36)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color={colors["muted-foreground"]} />
              </Pressable>
            </View>

            {/* Draggable List */}
            <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }}>
              <DraggableFlatList
                data={rows}
                keyExtractor={(item) => item.rowId}
                onDragEnd={({ data }) => setRows(data)}
                renderItem={renderItem}
                ListFooterComponent={
                  <View style={{ paddingTop: 8, paddingBottom: 24 }}>
                    <Pressable
                      testID="customizer-add-tile"
                      accessibilityRole="button"
                      accessibilityLabel="Add tile"
                      accessibilityState={{ disabled: rows.length >= MAX_TILES }}
                      disabled={rows.length >= MAX_TILES}
                      onPress={() => setPicker({ mode: "add" })}
                      style={[
                        minTouchTarget,
                        {
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: colors.border,
                          opacity: rows.length >= MAX_TILES ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Plus size={16} color={colors.foreground} />
                      <Text
                        style={{
                          fontWeight: "600",
                          fontSize: 14,
                          color: colors.foreground,
                          flexShrink: 1,
                        }}
                      >
                        Add tile
                      </Text>
                    </Pressable>

                    {error ? (
                      <Text
                        testID="customizer-error"
                        accessibilityRole="alert"
                        style={{
                          color: colors.destructive,
                          fontSize: 12,
                          marginTop: 8,
                          textAlign: "center",
                          flexShrink: 1,
                        }}
                      >
                        {error}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            </View>

            {/* Footer */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <Pressable
                testID="customizer-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onClose}
                style={[
                  minTouchTarget,
                  {
                    flex: 1,
                    flexShrink: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: "600",
                    fontSize: 14,
                    color: colors.foreground,
                    flexShrink: 1,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                testID="customizer-save"
                accessibilityRole="button"
                accessibilityLabel={saving ? "Saving" : "Save"}
                accessibilityState={{ disabled: !canSave }}
                disabled={!canSave}
                onPress={handleSave}
                style={[
                  minTouchTarget,
                  {
                    flex: 1,
                    flexShrink: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: canSave
                      ? colors.foreground
                      : colors.muted,
                    opacity: canSave ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: "600",
                    fontSize: 14,
                    color: canSave
                      ? colors["primary-foreground"]
                      : colors["muted-foreground"],
                    flexShrink: 1,
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    </Pressable>
  );
}

export function CustomizeDashboardModal({
  visible,
  layout,
  onClose,
  onSaved,
  onSave,
  testID = "customize-dashboard-modal",
}: CustomizeDashboardModalProps) {
  const reduceMotion = useReducedMotion();

  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("slide", reduceMotion)}
      testID={testID}
    >
      {visible ? (
        <CustomizerBody
          layout={layout}
          onClose={onClose}
          onSaved={onSaved}
          onSave={onSave}
          testID={testID}
        />
      ) : null}
    </RNModal>
  );
}

export default CustomizeDashboardModal;
