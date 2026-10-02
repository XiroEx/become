import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Pressable,
  TextInput,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import {
  Flame,
  Smile,
  TrendingUp,
  Target,
  Utensils,
  Droplets,
  Scale,
  Dumbbell,
  Brain,
  UtensilsCrossed,
  Zap,
  Sparkles,
  GripVertical,
  X,
  Plus,
  Trash2,
  Search,
  ChevronLeft,
  Square,
  RectangleHorizontal,
  Check,
  Settings2,
} from "lucide-react-native";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useReducedMotion, modalAnimation } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  apiFetch,
  ApiError,
  type DashboardTile,
  type DashboardTileSize,
  type DashboardTileSettings,
  type StatTileId,
  STAT_TILE_IDS,
  SMART_ROTATING_TILE_ID,
  SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS,
  MAX_DASHBOARD_TILES,
  MAX_SMART_POOL,
  DashboardLayoutPatchResponseSchema,
} from "@become/api-client";

export const MAX_TILES = MAX_DASHBOARD_TILES;
export const SMART_KEY = "smart";

export interface TileOption {
  key: string;
  kind: "stat" | "smart-rotating";
  id: string;
  label: string;
  description: string;
}

export const CATALOG: TileOption[] = [
  {
    key: "streak",
    kind: "stat",
    id: "streak",
    label: "Day Streak",
    description: "Days you've been consistent",
  },
  {
    key: "mood",
    kind: "stat",
    id: "mood",
    label: "Today's Mood",
    description: "Your mood today and recent trend",
  },
  {
    key: "weekly",
    kind: "stat",
    id: "weekly",
    label: "This Week",
    description: "Workouts finished vs your weekly target",
  },
  {
    key: "goal",
    kind: "stat",
    id: "goal",
    label: "Goal",
    description: "How far to your target",
  },
  {
    key: "calories",
    kind: "stat",
    id: "calories",
    label: "Calories",
    description: "Today's calories vs goal",
  },
  {
    key: "water",
    kind: "stat",
    id: "water",
    label: "Water",
    description: "Today's water vs goal",
  },
  {
    key: "weight",
    kind: "stat",
    id: "weight",
    label: "Weight",
    description: "Latest weigh-in and trend",
  },
  {
    key: "workouts",
    kind: "stat",
    id: "workouts",
    label: "Total Workouts",
    description: "Lifetime sessions logged",
  },
  {
    key: "mindset",
    kind: "stat",
    id: "mindset",
    label: "Mindset",
    description: "Jump straight into today's session",
  },
  {
    key: "nutrition",
    kind: "stat",
    id: "nutrition",
    label: "Nutrition",
    description: "Jump straight into logging food",
  },
  {
    key: "workoutNow",
    kind: "stat",
    id: "workoutNow",
    label: "Workout Now",
    description: "Jump straight into starting a workout",
  },
  {
    key: SMART_KEY,
    kind: "smart-rotating",
    id: SMART_ROTATING_TILE_ID,
    label: "Smart Tile",
    description: "Rotates through your most relevant metrics",
  },
];

export interface CustomizerRow {
  rowId: string;
  kind: "stat" | "smart-rotating" | "metric";
  id: string;
  size: DashboardTileSize;
  settings?: DashboardTileSettings;
}

export function richDefaultLayout(): DashboardTile[] {
  return [
    { id: "streak", kind: "stat", size: "1x1" },
    { id: "mood", kind: "stat", size: "1x1" },
    { id: "weekly", kind: "stat", size: "1x1" },
    { id: "goal", kind: "stat", size: "1x1" },
    { id: SMART_ROTATING_TILE_ID, kind: "smart-rotating", size: "2x1", locked: null },
  ];
}

export function buildRows(layout?: DashboardTile[] | null): CustomizerRow[] {
  const effective = (layout && layout.length > 0) ? layout : richDefaultLayout();
  return effective.map((t, i) => ({
    rowId: `r${i}-${t.kind}-${t.id}`,
    kind: t.kind,
    id: t.id,
    size: t.size,
    settings: t.settings ? { ...t.settings } : undefined,
  }));
}

export function optionKeyForRow(row: CustomizerRow): string {
  return row.kind === "smart-rotating" ? SMART_KEY : row.id;
}

export function metaForRow(row: CustomizerRow): { label: string; description: string } {
  if (row.kind === "smart-rotating") {
    return {
      label: "Smart Tile",
      description: "Rotates through your most relevant metrics",
    };
  }
  const option = CATALOG.find((c) => c.id === row.id && c.kind === row.kind);
  return option
    ? { label: option.label, description: option.description }
    : { label: row.id, description: "Metric" };
}

// ── Badges ───────────────────────────────────────────────────────────────────

export function TileBadge({
  kind,
  id,
  size = 18,
}: {
  kind: CustomizerRow["kind"];
  id: string;
  size?: number;
}) {
  const { colors, tint } = useThemeTokens();

  let IconComp = Sparkles;
  let iconColor = colors["muted-foreground"];
  let bgColor = tint("muted", 0.2);

  if (kind === "smart-rotating") {
    IconComp = Sparkles;
    iconColor = colors.accent;
    bgColor = tint("accent", 0.15);
  } else if (id === "streak") {
    IconComp = Flame;
    iconColor = colors.accent;
    bgColor = tint("accent", 0.15);
  } else if (id === "mood") {
    IconComp = Smile;
    iconColor = colors.success;
    bgColor = tint("success", 0.15);
  } else if (id === "weekly") {
    IconComp = TrendingUp;
    iconColor = colors.success;
    bgColor = tint("success", 0.15);
  } else if (id === "goal") {
    IconComp = Target;
    iconColor = colors.accent;
    bgColor = tint("accent", 0.15);
  } else if (id === "calories") {
    IconComp = Utensils;
    iconColor = colors.primary;
    bgColor = tint("primary", 0.15);
  } else if (id === "water") {
    IconComp = Droplets;
    iconColor = colors.accent;
    bgColor = tint("accent", 0.15);
  } else if (id === "weight") {
    IconComp = Scale;
    iconColor = colors["muted-foreground"];
    bgColor = tint("muted", 0.2);
  } else if (id === "workouts") {
    IconComp = Dumbbell;
    iconColor = colors["muted-foreground"];
    bgColor = tint("muted", 0.2);
  } else if (id === "mindset") {
    IconComp = Brain;
    iconColor = colors.accent;
    bgColor = tint("accent", 0.15);
  } else if (id === "nutrition") {
    IconComp = UtensilsCrossed;
    iconColor = colors.primary;
    bgColor = tint("primary", 0.15);
  } else if (id === "workoutNow") {
    IconComp = Zap;
    iconColor = colors.success;
    bgColor = tint("success", 0.15);
  }

  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <IconComp size={size} color={iconColor} strokeWidth={2} />
    </View>
  );
}

// ── Size segmented control ───────────────────────────────────────────────────

export function SizeControl({
  size,
  onChange,
  testIDPrefix = "customize-size",
}: {
  size: DashboardTileSize;
  onChange: (s: DashboardTileSize) => void;
  testIDPrefix?: string;
}) {
  const { colors } = useThemeTokens();
  const isSquare = size === "1x1";
  const isWide = size === "2x1";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <Pressable
        testID={`${testIDPrefix}-1x1`}
        accessibilityRole="button"
        accessibilityLabel="Square (1x1)"
        accessibilityState={{ selected: isSquare }}
        onPress={() => onChange("1x1")}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isSquare ? colors.foreground : "transparent",
        }}
      >
        <Square
          size={14}
          color={isSquare ? colors.background : colors["muted-foreground"]}
        />
      </Pressable>
      <Pressable
        testID={`${testIDPrefix}-2x1`}
        accessibilityRole="button"
        accessibilityLabel="Wide (2x1)"
        accessibilityState={{ selected: isWide }}
        onPress={() => onChange("2x1")}
        style={{
          width: 32,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          borderLeftWidth: 1,
          borderLeftColor: colors.border,
          backgroundColor: isWide ? colors.foreground : "transparent",
        }}
      >
        <RectangleHorizontal
          size={14}
          color={isWide ? colors.background : colors["muted-foreground"]}
        />
      </Pressable>
    </View>
  );
}

// ── Searchable picker panel ──────────────────────────────────────────────────

export function TilePicker({
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
  const options = useMemo(() => {
    return CATALOG.filter(
      (o) =>
        !q ||
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q),
    );
  }, [q]);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Pressable
          testID="tile-picker-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onCancel}
          style={[minTouchTarget, { alignItems: "center", justifyContent: "center", padding: 6 }]}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground text-base font-semibold flex-1">
          {title}
        </Text>
      </View>

      {/* Search Input */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === "ios" ? 10 : 6,
          marginBottom: 12,
          gap: 8,
        }}
      >
        <Search size={18} color={colors["muted-foreground"]} />
        <TextInput
          testID="tile-picker-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search tiles…"
          placeholderTextColor={colors["muted-foreground"]}
          style={{
            flex: 1,
            color: colors.foreground,
            fontSize: 14,
            padding: 0,
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            accessibilityLabel="Clear search"
            style={{ padding: 4 }}
          >
            <X size={16} color={colors["muted-foreground"]} />
          </Pressable>
        )}
      </View>

      {/* Options List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {options.length === 0 && (
          <Text className="text-muted-foreground text-center py-6 text-sm">
            No tiles match “{query}”.
          </Text>
        )}
        {options.map((opt) => {
          const isCurrent = opt.key === currentKey;
          const disabled = !isCurrent && disabledKeys.has(opt.key);
          return (
            <Pressable
              key={opt.key}
              testID={`tile-picker-option-${opt.key}`}
              disabled={disabled}
              onPress={() => onPick(opt)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label}${disabled ? ", already on your dashboard" : ""}`}
              accessibilityState={{ disabled, selected: isCurrent }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                opacity: disabled ? 0.4 : 1,
                gap: 12,
              }}
            >
              <TileBadge kind={opt.kind} id={opt.id} />
              <View style={{ flex: 1 }}>
                <Text className="text-foreground text-sm font-semibold">
                  {opt.label}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {disabled ? "Already on your dashboard" : opt.description}
                </Text>
              </View>
              {isCurrent && (
                <View testID={`tile-picker-check-${opt.key}`}>
                  <Check size={18} color={colors.foreground} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Smart-tile settings panel ────────────────────────────────────────────────

export const FREQ_LABELS: Record<number, string> = {
  4000: "Fast · 4s",
  6000: "Normal · 6s",
  10000: "Relaxed · 10s",
  30000: "Slow · 30s",
};

export const POOL_OPTIONS: { key: string; id: StatTileId; label: string }[] =
  STAT_TILE_IDS.map((id) => {
    const meta = CATALOG.find((c) => c.id === id);
    return {
      key: `stat:${id}`,
      id,
      label: meta?.label ?? id,
    };
  });

export function SmartSettingsPanel({
  settings,
  onChange,
  onCancel,
}: {
  settings: DashboardTileSettings | undefined;
  onChange: (next: DashboardTileSettings) => void;
  onCancel: () => void;
}) {
  const { colors } = useThemeTokens();
  const pool = new Set(
    settings?.pool && settings.pool.length > 0
      ? settings.pool
      : STAT_TILE_IDS.map((id) => `stat:${id}`),
  );
  const intervalMs = settings?.intervalMs ?? DEFAULT_SMART_INTERVAL_MS;

  const togglePool = (key: string) => {
    const next = new Set(pool);
    if (next.has(key)) {
      if (next.size <= 1) return; // keep at least one card
      next.delete(key);
    } else {
      if (next.size >= MAX_SMART_POOL) return;
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
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Pressable
          testID="smart-settings-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onCancel}
          style={[minTouchTarget, { alignItems: "center", justifyContent: "center", padding: 6 }]}
        >
          <ChevronLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground text-base font-semibold flex-1">
          Smart tile settings
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
      >
        {/* Frequency */}
        <View>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
            Rotation speed
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SMART_INTERVAL_OPTIONS_MS.map((ms) => {
              const active = intervalMs === ms;
              return (
                <Pressable
                  key={ms}
                  testID={`smart-settings-freq-${ms}`}
                  accessibilityRole="button"
                  accessibilityLabel={FREQ_LABELS[ms] ?? `${Math.round(ms / 1000)}s`}
                  accessibilityState={{ selected: active }}
                  onPress={() => onChange({ ...settings, intervalMs: ms })}
                  style={{
                    flexBasis: "48%",
                    flexGrow: 1,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? colors.foreground : colors.border,
                    backgroundColor: active ? colors.foreground : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: active ? colors.background : colors.foreground,
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
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
            Cards to rotate through
          </Text>
          <View style={{ gap: 8 }}>
            {POOL_OPTIONS.map((o) => {
              const on = pool.has(o.key);
              return (
                <Pressable
                  key={o.key}
                  testID={`smart-settings-pool-${o.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.label} rotation`}
                  accessibilityState={{ selected: on }}
                  onPress={() => togglePool(o.key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    gap: 12,
                  }}
                >
                  <TileBadge kind="stat" id={o.id} />
                  <Text className="text-foreground text-sm font-medium flex-1">
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
                    {on && <Check size={14} color={colors.background} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-muted-foreground text-xs mt-2">
            The smart tile cycles through the selected cards (excluding ones already pinned).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Modal Props & Body ───────────────────────────────────────────────────────

export interface CustomizeDashboardModalProps {
  visible: boolean;
  layout?: DashboardTile[] | null;
  onClose: () => void;
  onSaved: (layout: DashboardTile[]) => void;
  /** Custom save override (optional, defaults to PATCH /api/dashboard/layout). */
  onSave?: (layout: DashboardTile[]) => Promise<DashboardTile[] | void>;
  testID?: string;
}

type PickerState =
  | null
  | { mode: "add" }
  | { mode: "change"; rowId: string }
  | { mode: "settings"; rowId: string };

function CustomizeDashboardContent({
  layout,
  onClose,
  onSaved,
  onSave,
  testID = "customize-dashboard",
}: Omit<CustomizeDashboardModalProps, "visible">) {
  const { colors } = useThemeTokens();
  const auth = useAuthSafe();
  const [rows, setRows] = useState<CustomizerRow[]>(() => buildRows(layout));
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
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.rowId !== rowId);
    });
  };

  // Stat keys already in use across other rows
  const usedKeys = (exceptRowId?: string) => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.rowId === exceptRowId) continue;
      if (r.kind === "stat") s.add(r.id);
      // smart-rotating is allowed to repeat
    }
    return s;
  };

  const handlePick = (opt: TileOption) => {
    if (!picker) return;
    if (picker.mode === "add") {
      if (rows.length >= MAX_TILES) {
        setError(`A dashboard layout may contain at most ${MAX_TILES} tiles`);
        setPicker(null);
        return;
      }
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
    } else if (picker.mode === "change") {
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === picker.rowId
            ? { ...r, kind: opt.kind, id: opt.id }
            : r,
        ),
      );
    }
    setPicker(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    if (rows.length > MAX_TILES) {
      setError(`A dashboard layout may contain at most ${MAX_TILES} tiles`);
      return;
    }

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

    setSaving(true);
    setError(null);
    try {
      if (onSave) {
        const res = await onSave(next);
        onSaved(Array.isArray(res) ? res : next);
      } else {
        const token = auth?.token ?? undefined;
        const res = await apiFetch(
          "/api/dashboard/layout",
          DashboardLayoutPatchResponseSchema,
          {
            method: "PATCH",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token,
            body: { layout: next },
          },
        );
        onSaved(res.layout ?? next);
      }
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not save your layout");
      }
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

  const renderRowItem = ({
    item: row,
    drag,
    isActive,
  }: RenderItemParams<CustomizerRow>) => {
    const meta = metaForRow(row);
    return (
      <ScaleDecorator>
        <View
          testID={`${testID}-row-${row.rowId}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            marginBottom: 8,
            gap: 8,
            opacity: isActive ? 0.7 : 1,
          }}
        >
          {/* Drag Handle */}
          <Pressable
            testID={`customize-drag-handle-${row.rowId}`}
            onLongPress={drag}
            delayLongPress={100}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${meta.label}`}
            style={{
              paddingHorizontal: 4,
              paddingVertical: 6,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GripVertical size={18} color={colors["muted-foreground"]} />
          </Pressable>

          {/* Tile Badge */}
          <TileBadge kind={row.kind} id={row.id} />

          {/* Title / Tap to change */}
          <Pressable
            testID={`customize-change-${row.rowId}`}
            onPress={() => setPicker({ mode: "change", rowId: row.rowId })}
            accessibilityRole="button"
            accessibilityLabel={`Change tile ${meta.label}`}
            style={{ flex: 1, minWidth: 0, justifyContent: "center" }}
          >
            <Text className="text-foreground text-sm font-semibold truncate" numberOfLines={1}>
              {meta.label}
            </Text>
            <Text className="text-muted-foreground text-xs">
              Tap to change
            </Text>
          </Pressable>

          {/* Size segmented control */}
          <SizeControl
            size={row.size}
            onChange={(s) => setSize(row.rowId, s)}
            testIDPrefix={`customize-size-${row.rowId}`}
          />

          {/* Smart settings button */}
          {row.kind === "smart-rotating" && (
            <Pressable
              testID={`customize-settings-${row.rowId}`}
              onPress={() => setPicker({ mode: "settings", rowId: row.rowId })}
              accessibilityRole="button"
              accessibilityLabel="Smart tile settings"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Settings2 size={18} color={colors["muted-foreground"]} />
            </Pressable>
          )}

          {/* Delete button */}
          <Pressable
            testID={`customize-delete-${row.rowId}`}
            disabled={rows.length <= 1}
            onPress={() => deleteRow(row.rowId)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${meta.label}`}
            accessibilityState={{ disabled: rows.length <= 1 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              opacity: rows.length <= 1 ? 0.3 : 1,
            }}
          >
            <Trash2
              size={18}
              color={rows.length <= 1 ? colors["muted-foreground"] : colors.destructive}
            />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View style={{ flex: 1, flexDirection: "column" }}>
      {/* Header */}
      {!picker && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text className="text-foreground text-lg font-bold">
              Customize Dashboard
            </Text>
            <Text className="text-muted-foreground text-xs mt-1">
              Resize, reorder, swap, or remove your tiles — and add new ones.
            </Text>
          </View>
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={[minTouchTarget, { alignItems: "center", justifyContent: "center", padding: 6 }]}
          >
            <X size={20} color={colors.foreground} />
          </Pressable>
        </View>
      )}

      {/* Main Body */}
      <View style={{ flex: 1, minHeight: 0 }}>
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
          <DraggableFlatList
            data={rows}
            keyExtractor={(item) => item.rowId}
            onDragEnd={({ data }) => setRows(data)}
            renderItem={renderRowItem}
            containerStyle={{ flex: 1 }}
            ListFooterComponent={
              <View style={{ paddingTop: 4, paddingBottom: 16 }}>
                <Pressable
                  testID="customize-dashboard-add-btn"
                  disabled={rows.length >= MAX_TILES}
                  onPress={() => {
                    if (rows.length < MAX_TILES) {
                      setPicker({ mode: "add" });
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Add tile"
                  accessibilityState={{ disabled: rows.length >= MAX_TILES }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    gap: 8,
                    opacity: rows.length >= MAX_TILES ? 0.4 : 1,
                  }}
                >
                  <Plus size={18} color={colors.foreground} />
                  <Text className="text-foreground text-sm font-semibold">
                    Add tile
                  </Text>
                </Pressable>

                {error && (
                  <Text
                    testID="customize-dashboard-error"
                    className="text-destructive text-xs mt-3 text-center"
                    accessibilityRole="alert"
                  >
                    {error}
                  </Text>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Footer buttons (hidden while in sub-picker) */}
      {!picker && (
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-cancel`}
              variant="secondary"
              onPress={onClose}
            >
              Cancel
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-save`}
              variant="primary"
              disabled={!canSave}
              onPress={handleSave}
              loading={saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

function useAuthSafe() {
  try {
    return useAuth();
  } catch {
    return { token: null, user: null };
  }
}

export function CustomizeDashboardModal({
  visible,
  layout,
  onClose,
  onSaved,
  onSave,
  testID = "customize-dashboard",
}: CustomizeDashboardModalProps) {
  const reduceMotion = useReducedMotion();
  const { colors, scrim } = useThemeTokens();

  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("slide", reduceMotion)}
      testID={`${testID}-modal`}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <Pressable
          testID={`${testID}-backdrop`}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scrim, justifyContent: "flex-end" },
          ]}
        >
          <Pressable
            testID={`${testID}-sheet`}
            accessibilityRole="none"
            accessibilityViewIsModal
            accessibilityLabel="Customize Dashboard"
            onAccessibilityEscape={onClose}
            onPress={() => {
              /* swallow */
            }}
            style={{
              backgroundColor: colors.card,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: Platform.OS === "ios" ? 36 : 24,
              height: "88%",
              maxHeight: "92%",
            }}
          >
            {/* Grab handle */}
            <View
              testID={`${testID}-handle`}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 40,
                height: 4,
                backgroundColor: colors["muted-foreground"],
                borderRadius: 2,
                alignSelf: "center",
                marginBottom: 14,
                opacity: 0.5,
              }}
            />

            <View style={{ flex: 1 }}>
              {visible && (
                <CustomizeDashboardContent
                  layout={layout}
                  onClose={onClose}
                  onSaved={onSaved}
                  onSave={onSave}
                  testID={testID}
                />
              )}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

export const CustomizeDashboardSheet = CustomizeDashboardModal;
