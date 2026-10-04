import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Camera, Check, ChevronDown, PencilLine, Trash2, X } from "lucide-react-native";
import {
  NutritionScansResponseSchema,
  apiFetch,
  type NutritionScan,
} from "@become/api-client";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { AuthedImage } from "@/components/media/AuthedImage";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { localDateKey } from "@/lib/time/localDay";
import {
  anchorMinutesForTag,
  defaultTagAt,
  formatClockLabel,
  formatHHMM,
  minutesOfDay,
  parseHHMM,
  type TagWindow,
} from "@/lib/nutrition/mealSchedule";
import { titleCase } from "@/lib/nutrition/mealSchedule";
import {
  deleteSavedScan,
  logScanAgain,
  type ScanLogAgainTimeMode,
} from "@/lib/nutrition/scanHistory";

export interface ScanHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Session JWT. Absent → the list renders empty rather than erroring. */
  token?: string | null;
  /** Today's YYYY-MM-DD — the sheet never logs into the future. */
  todayKey: string;
  /** The member's meal-tag windows (for the tag anchor + default tag). */
  windows: TagWindow[];
  /** All tag options (defaults + user tags + session tags). */
  tagOptions: string[];
  /** Reopen a scan in the native review with its saved items. */
  onReopen: (scan: NutritionScan) => void;
  /** A re-log landed — the day refetches. */
  onLogged?: () => void;
  testID?: string;
}

const SCANS_LIMIT = 60;

function whenLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scanCalories(scan: NutritionScan): number {
  const total = (scan as { totalNutrition?: { calories?: unknown } })
    .totalNutrition;
  const c = typeof total?.calories === "number" ? total.calories : 0;
  return Math.round(c);
}

function itemCalories(item: NutritionScan["items"][number]): number {
  const servings =
    typeof item.servings === "number" && Number.isFinite(item.servings)
      ? item.servings
      : 1;
  const c =
    typeof item.nutrition?.calories === "number" ? item.nutrition.calories : 0;
  return Math.round(c * servings);
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

interface LogSheetState {
  scan: NutritionScan;
  /** YYYY-MM-DD, or null for today. */
  date: string | null;
  tag: string;
  timeMode: ScanLogAgainTimeMode;
  /** "HH:MM" — only read when `timeMode` is `custom`. */
  time: string | null;
}

/**
 * Estimate history (NP-141).
 *
 * The native `webapp/app/dashboard/nutrition/scans/page.tsx`: the saved
 * photo/describe estimates (recent first, thumbnails through `AuthedImage`),
 * each reopenable in the native review with its saved items, re-loggable to
 * a chosen day, time and tag, or deletable with optimistic removal.
 */
export function ScanHistorySheet({
  visible,
  onClose,
  token,
  todayKey,
  windows,
  tagOptions,
  onReopen,
  onLogged,
  testID = "scan-history",
}: ScanHistorySheetProps) {
  const { colors, scrim } = useThemeTokens();
  const [scans, setScans] = useState<NutritionScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [logSheet, setLogSheet] = useState<LogSheetState | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [customTag, setCustomTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<NutritionScan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Opening the sheet IS the load edge — a ref (never state) carries the
  // "already loaded this opening" bit, so there is no set-state-in-effect.
  const openedRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setScans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/nutrition/scans?limit=${SCANS_LIMIT}`,
        NutritionScansResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      setScans(Array.isArray(res.scans) ? res.scans : []);
    } catch {
      setError("Could not load your estimates. Try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // The open edge owns the load: opening the sheet (re)loads the list and
  // resets the transient sheets. The ref bit keeps a re-render from
  // re-firing it; closing clears the bit so the next open loads again.
  // `wasVisible` starts false so a sheet that mounts already open still
  // loads — the open edge is mount-with-visible, not only false→true.
  const wasVisible = useRef(false);
  useEffect(() => {
    const was = wasVisible.current;
    wasVisible.current = visible;
    if (!visible || was === visible) {
      if (!visible) openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setLogSheet(null);
    setTagOpen(false);
    setCustomTag("");
    setConfirmDelete(null);
    setLightbox(null);
    setNotice(null);
    void load();
  }, [visible, load]);

  const allTagOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tagOptions) {
      const norm = String(t).toLowerCase();
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
      }
    }
    return out;
  }, [tagOptions]);

  const openLogSheet = useCallback(
    (scan: NutritionScan) => {
      const fallback = defaultTagAt(windows, minutesOfDay(new Date()));
      const tag = (scan.tag ?? "").trim().toLowerCase() || fallback;
      setLogSheet({ scan, date: null, tag, timeMode: "none", time: null });
      setTagOpen(false);
      setCustomTag("");
    },
    [windows],
  );

  const handleAddCustomTag = useCallback(() => {
    const norm = normalizeTag(customTag);
    if (!norm) return;
    setLogSheet((s) => (s ? { ...s, tag: norm } : s));
    setCustomTag("");
    setTagOpen(false);
  }, [customTag]);

  const handleLogAgain = useCallback(async () => {
    if (!logSheet || busyId) return;
    const { scan, date, tag, timeMode, time } = logSheet;
    setBusyId(scan._id);
    setLogSheet(null);
    try {
      const res = await logScanAgain(
        {
          _id: scan._id,
          source: scan.source,
          ...(scan.note ? { note: scan.note } : {}),
          ...(scan.tag ? { tag: scan.tag } : {}),
          items: (scan.items ?? []).map((it) => ({
            ...(typeof it.foodId === "string" ? { foodId: it.foodId } : {}),
            name: it.name,
            ...(it.brand ? { brand: it.brand } : {}),
            servingSize: it.servingSize ?? 1,
            servingUnit: it.servingUnit ?? "serving",
            servings: it.servings ?? 1,
            nutrition: {
              calories: it.nutrition?.calories ?? 0,
              protein: it.nutrition?.protein ?? 0,
              carbs: it.nutrition?.carbs ?? 0,
              fats: it.nutrition?.fats ?? 0,
            },
          })),
          totalNutrition: {
            calories: scan.totalNutrition?.calories ?? 0,
            protein: scan.totalNutrition?.protein ?? 0,
            carbs: scan.totalNutrition?.carbs ?? 0,
            fats: scan.totalNutrition?.fats ?? 0,
          },
          createdAt: scan.createdAt ?? new Date().toISOString(),
        },
        { dateKey: date, tag, timeMode, time },
        windows,
        { getToken: () => token ?? undefined },
      );
      if (res.ok) {
        setNotice(`Logged to ${date ?? "today"}`);
        onLogged?.();
      } else {
        setNotice(res.error ?? "Could not log. Try again.");
      }
    } catch {
      setNotice("Could not log. Check your connection.");
    } finally {
      setBusyId(null);
    }
  }, [logSheet, busyId, windows, token, onLogged]);

  const handleDelete = useCallback(
    async (scan: NutritionScan) => {
      if (busyId) return;
      setConfirmDelete(null);
      setBusyId(scan._id);
      const prev = scans;
      setScans((s) => s.filter((x) => x._id !== scan._id));
      try {
        await deleteSavedScan(scan._id, {
          getToken: () => token ?? undefined,
        });
      } catch {
        setScans(prev);
        setNotice("Could not delete.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, scans, token],
  );

  const logDateLabel = (date: string | null): string => {
    if (!date) return "today";
    const parts = date.split("-").map(Number);
    const d = new Date(parts[0] ?? 2026, (parts[1] ?? 1) - 1, parts[2] ?? 1);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Today + the six days before it — derived during render from the todayKey
  // prop, so no effect and no impure call. The sheet never logs into the
  // future, exactly like the web's DateOnlyPicker with maxDate=today.
  const dayOptions = useMemo(() => {    const parts = todayKey.split("-").map(Number);
    const y = parts[0] ?? 2026;
    const m = parts[1] ?? 1;
    const d = parts[2] ?? 1;
    const opts: { key: string; label: string; date: string | null }[] = [
      { key: "today", label: "Today", date: null },
    ];
    for (const delta of [-1, -2, -3, -4, -5, -6]) {
      const base = new Date(y, m - 1, d + delta);
      const key = localDateKey(base);
      opts.push({ key, label: logDateLabel(key), date: key });
    }
    return opts;
  }, [todayKey]);

  return (
    <>
      <BottomSheet
        visible={visible && !logSheet && !confirmDelete && !lightbox}
        onClose={onClose}
        title="Estimate history"
        testID={testID}
        accessibilityLabel="Estimate history"
      >
        <ScrollView
          testID={`${testID}-body`}
          style={{ maxHeight: 520 }}
          contentContainerStyle={{ paddingBottom: 8, gap: 12 }}
        >
          <Text className="text-muted-foreground text-sm">
            Your past photo &amp; describe estimates
          </Text>
          {notice ? (
            <Text
              testID={`${testID}-notice`}
              className="text-muted-foreground text-xs"
            >
              {notice}
            </Text>
          ) : null}
          {loading ? (
            <View
              testID={`${testID}-loading`}
              style={{ alignItems: "center", paddingVertical: 32 }}
            >
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
            </View>
          ) : error ? (
            <View style={{ gap: 12, alignItems: "center", paddingVertical: 16 }}>
              <Text
                testID={`${testID}-error`}
                className="text-foreground text-sm text-center"
              >
                {error}
              </Text>
              <Button
                testID={`${testID}-retry`}
                variant="secondary"
                onPress={() => void load()}
              >
                Try again
              </Button>
            </View>
          ) : scans.length === 0 ? (
            <View
              testID={`${testID}-empty`}
              style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}
            >
              <Camera size={28} color={colors["muted-foreground"]} />
              <Text className="text-foreground text-base font-bold text-center">
                No estimates yet
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                Snap or describe a meal and your estimate will show up here.
              </Text>
            </View>
          ) : (
            <View testID={`${testID}-list`} style={{ gap: 12 }}>
              {scans.map((scan) => {
                const thumbSource =
                  typeof scan.thumb === "string" && scan.thumb
                    ? scan.thumb
                    : typeof scan.imageUrl === "string" && scan.imageUrl
                      ? scan.imageUrl
                      : null;
                const fullSource =
                  typeof scan.imageUrl === "string" && scan.imageUrl
                    ? scan.imageUrl
                    : thumbSource;
                const isPhoto = scan.source !== "describe";
                return (
                  <Card key={scan._id} testID={`${testID}-scan-${scan._id}`}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          flex: 1,
                        }}
                      >
                        {thumbSource ? (
                          <Pressable
                            testID={`${testID}-scan-${scan._id}-photo`}
                            accessibilityRole="button"
                            accessibilityLabel="View full photo"
                            onPress={() =>
                              fullSource ? setLightbox(fullSource) : undefined
                            }
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              overflow: "hidden",
                              backgroundColor: colors.muted,
                            }}
                          >
                            <AuthedImage
                              source={thumbSource}
                              accessibilityLabel="Meal photo"
                              testID={`${testID}-scan-${scan._id}-thumb`}
                              containerStyle={{ width: 40, height: 40 }}
                              style={{ width: 40, height: 40 }}
                            />
                          </Pressable>
                        ) : (
                          <View
                            testID={`${testID}-scan-${scan._id}-icon`}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 10,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: colors.muted,
                            }}
                          >
                            {isPhoto ? (
                              <Camera
                                size={16}
                                color={colors["muted-foreground"]}
                              />
                            ) : (
                              <PencilLine
                                size={16}
                                color={colors["muted-foreground"]}
                              />
                            )}
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text className="text-foreground text-sm font-semibold">
                            {scanCalories(scan)} cal
                            {scan.tag ? (
                              <Text className="text-muted-foreground text-xs font-normal">
                                {` · ${scan.tag}`}
                              </Text>
                            ) : null}
                          </Text>
                          <Text className="text-muted-foreground text-xs">
                            {whenLabel(scan.createdAt)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Pressable
                          testID={`${testID}-scan-${scan._id}-reopen`}
                          accessibilityRole="button"
                          accessibilityLabel="Edit and re-log this estimate"
                          onPress={() => onReopen(scan)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <PencilLine size={14} color={colors.foreground} />
                        </Pressable>
                        <Button
                          testID={`${testID}-scan-${scan._id}-log-again`}
                          size="sm"
                          disabled={busyId === scan._id}
                          onPress={() => openLogSheet(scan)}
                        >
                          Log again
                        </Button>
                        <Pressable
                          testID={`${testID}-scan-${scan._id}-delete`}
                          accessibilityRole="button"
                          accessibilityLabel="Delete estimate"
                          disabled={busyId === scan._id}
                          onPress={() => setConfirmDelete(scan)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: busyId === scan._id ? 0.5 : 1,
                          }}
                        >
                          <Trash2 size={16} color={colors.destructive} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={{ marginTop: 8, gap: 0 }}>
                      {(scan.items ?? []).map((it, i) => (
                        <View
                          key={`${scan._id}-item-${i}`}
                          testID={`${testID}-scan-${scan._id}-item-${i}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            paddingVertical: 6,
                            borderTopWidth: i === 0 ? 0 : 1,
                            borderTopColor: colors.border,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              className="text-foreground text-sm"
                              numberOfLines={1}
                            >
                              {(it.servings ?? 1) !== 1
                                ? `${it.servings}× `
                                : ""}
                              {it.name}
                            </Text>
                            {it.brand ? (
                              <Text
                                className="text-muted-foreground text-xs"
                                numberOfLines={1}
                              >
                                {it.brand}
                              </Text>
                            ) : null}
                          </View>
                          <Text className="text-muted-foreground text-xs tabular-nums">
                            {itemCalories(it)} cal
                          </Text>
                        </View>
                      ))}
                    </View>
                    {scan.note ? (
                      <Text className="text-muted-foreground text-xs italic mt-2">
                        “{scan.note}”
                      </Text>
                    ) : null}
                  </Card>
                );
              })}
            </View>
          )}
        </ScrollView>
      </BottomSheet>

      {/* "Log to a day" sheet — day, time and tag for a (re)log. */}
      <BottomSheet
        visible={visible && logSheet !== null}
        onClose={() => {
          setLogSheet(null);
          setTagOpen(false);
        }}
        title="Log to a day"
        testID={`${testID}-log-sheet`}
        accessibilityLabel="Log to a day"
      >
        {logSheet ? (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <Text className="text-muted-foreground text-xs">
              Pick the day, time and tag this estimate was actually eaten.
            </Text>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                Adding to
              </Text>
              <Pressable
                testID={`${testID}-log-tag-toggle`}
                accessibilityRole="button"
                accessibilityLabel={`Adding to ${logSheet.tag}`}
                onPress={() => setTagOpen((v) => !v)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: colors.muted,
                }}
              >
                <Text className="text-foreground text-sm font-semibold capitalize flex-1">
                  {titleCase(logSheet.tag)}
                </Text>
                <ChevronDown size={16} color={colors["muted-foreground"]} />
              </Pressable>
              {tagOpen ? (
                <View
                  testID={`${testID}-log-tag-list`}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    padding: 8,
                    gap: 6,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                    }}
                  >
                    {allTagOptions.map((t) => {
                      const active = logSheet.tag === t;
                      return (
                        <Pressable
                          key={t}
                          testID={`${testID}-log-tag-${t}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Log to ${t}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            setLogSheet((s) => (s ? { ...s, tag: t } : s));
                            setTagOpen(false);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            borderWidth: 1,
                            borderColor: active
                              ? colors.primary
                              : colors.border,
                            backgroundColor: active
                              ? colors.primary
                              : "transparent",
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                          }}
                        >
                          <Text
                            className="text-xs font-semibold capitalize"
                            style={{
                              color: active
                                ? colors["primary-foreground"]
                                : colors.foreground,
                            }}
                          >
                            {t}
                          </Text>
                          {active ? (
                            <Check
                              size={12}
                              color={colors["primary-foreground"]}
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <View
                    style={{ flexDirection: "row", gap: 6, marginTop: 4 }}
                  >
                    <View style={{ flex: 1 }}>
                      <TextInput
                        testID={`${testID}-log-custom-tag`}
                        accessibilityLabel="New tag"
                        placeholder="e.g. brunch"
                        value={customTag}
                        onChangeText={setCustomTag}
                        placeholderTextColor={colors["muted-foreground"]}
                        style={{
                          height: 40,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                          paddingHorizontal: 12,
                          color: colors.foreground,
                        }}
                      />
                    </View>
                    <Button
                      testID={`${testID}-log-custom-tag-add`}
                      variant="secondary"
                      disabled={!customTag.trim()}
                      onPress={handleAddCustomTag}
                    >
                      Add
                    </Button>
                  </View>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                Day
              </Text>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {dayOptions.map((opt) => {
                  const selected =
                    (logSheet.date ?? null) === (opt.date ?? null);
                  return (
                    <Pressable
                      key={opt.key}
                      testID={`${testID}-log-day-${opt.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        opt.date ? `Log to ${opt.date}` : "Log to today"
                      }
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setLogSheet((s) =>
                          s ? { ...s, date: opt.date } : s,
                        )
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: selected
                          ? colors.primary
                          : colors.border,
                        backgroundColor: selected
                          ? colors.primary
                          : "transparent",
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{
                          color: selected
                            ? colors["primary-foreground"]
                            : colors.foreground,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-muted-foreground text-xs">
                Logging to {logDateLabel(logSheet.date)}
              </Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.foreground,
                }}
              >
                Time
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(
                  [
                    { mode: "now" as const, label: "Now" },
                    { mode: "custom" as const, label: "Pick time" },
                    { mode: "none" as const, label: "No time" },
                  ]
                ).map((opt) => {
                  const selected = logSheet.timeMode === opt.mode;
                  return (
                    <Pressable
                      key={opt.mode}
                      testID={`${testID}-log-time-${opt.mode}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        opt.mode === "none"
                          ? "Log with no time"
                          : opt.mode === "now"
                            ? "Log time now"
                            : "Pick custom log time"
                      }
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setLogSheet((s) =>
                          s
                            ? {
                                ...s,
                                timeMode: opt.mode,
                                ...(opt.mode === "custom"
                                  ? {
                                      time:
                                        s.time ??
                                        formatHHMM(
                                          anchorMinutesForTag(
                                            windows,
                                            s.tag,
                                          ),
                                        ),
                                    }
                                  : { time: null }),
                              }
                            : s,
                        )
                      }
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: 8,
                        alignItems: "center",
                        backgroundColor: selected
                          ? colors.primary
                          : colors.card,
                        borderWidth: 1,
                        borderColor: selected
                          ? colors.primary
                          : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: selected
                            ? colors["primary-foreground"]
                            : colors.foreground,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {logSheet.timeMode === "custom" ? (
                <TextInput
                  testID={`${testID}-log-time-input`}
                  accessibilityLabel="Picked time in HH:mm"
                  value={logSheet.time ?? ""}
                  onChangeText={(v) =>
                    setLogSheet((s) =>
                      s ? { ...s, time: v || null } : s,
                    )
                  }
                  placeholder="HH:mm"
                  placeholderTextColor={colors["muted-foreground"]}
                  style={{
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    paddingHorizontal: 12,
                    color: colors.foreground,
                  }}
                />
              ) : null}
              <Text className="text-muted-foreground text-xs">
                {logSheet.timeMode === "none"
                  ? "No time. This sits in your meal order rather than at a clock position."
                  : logSheet.timeMode === "now"
                    ? "Logs untimed, filed by tag — like the web's Now."
                    : logSheet.time && parseHHMM(logSheet.time) != null
                      ? `Logs at ${formatClockLabel(parseHHMM(logSheet.time) ?? 0)}.`
                      : "Pick the clock time this was eaten."}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-log-cancel`}
                  variant="secondary"
                  onPress={() => {
                    setLogSheet(null);
                    setTagOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-log-submit`}
                  disabled={busyId === logSheet.scan._id}
                  loading={busyId === logSheet.scan._id}
                  onPress={() => void handleLogAgain()}
                >
                  Log to {logDateLabel(logSheet.date)}
                </Button>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </BottomSheet>

      {/* Delete confirmation */}
      <Modal
        visible={visible && confirmDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close delete confirmation backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setConfirmDelete(null)}
        >
          <Pressable
            testID={`${testID}-delete-confirm`}
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              width: "100%",
              maxWidth: 320,
              gap: 12,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-foreground text-base font-bold">
              Delete this estimate?
            </Text>
            <Text className="text-muted-foreground text-sm">
              This removes it from your history everywhere.
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-delete-cancel`}
                  variant="secondary"
                  onPress={() => setConfirmDelete(null)}
                >
                  Keep
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`${testID}-delete-confirm-button`}
                  variant="destructive"
                  onPress={() =>
                    confirmDelete ? void handleDelete(confirmDelete) : undefined
                  }
                >
                  Delete
                </Button>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-image lightbox */}
      <Modal
        visible={visible && lightbox !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightbox(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
          onPress={() => setLightbox(null)}
        >
          <Pressable
            testID={`${testID}-lightbox`}
            accessibilityRole="none"
            style={{ maxWidth: "100%", maxHeight: "100%" }}
            onPress={(e) => e.stopPropagation()}
          >
            {lightbox ? (
              <AuthedImage
                source={lightbox}
                accessibilityLabel="Meal photo"
                testID={`${testID}-lightbox-image`}
                containerStyle={{ width: 320, height: 320 }}
                style={{ width: 320, height: 320 }}
                resizeMode="contain"
              />
            ) : null}
          </Pressable>
          <Pressable
            testID={`${testID}-lightbox-close`}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setLightbox(null)}
            style={{
              position: "absolute",
              top: 48,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: scrim,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color={colors["primary-foreground"]} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export const __test__ = { SCANS_LIMIT, whenLabel, normalizeTag };
