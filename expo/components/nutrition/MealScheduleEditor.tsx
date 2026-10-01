import { useCallback, useEffect, useRef, useState } from "react";
import { View, TextInput, Pressable, ActivityIndicator } from "react-native";
import {
  apiFetch,
  MealScheduleResponseSchema,
  TagsResponseSchema,
  type MealScheduleResponse,
  type TagsResponse,
  type MealScheduleWindow,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  formatClockLabel,
  formatHHMM,
  parseTimeValue,
  suggestedWindowForTag,
  titleCase,
  windowLength,
} from "@/lib/nutrition/mealSchedule";
import { ChevronUp, ChevronDown, X, Check, Plus } from "lucide-react-native";

export interface MealScheduleRow {
  tag: string;
  start: string;
  end: string;
}

export interface MealScheduleEditorProps {
  onBack?: () => void;
  testID?: string;
}

export function MealScheduleEditor({
  testID = "meal-schedule-editor",
}: MealScheduleEditorProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [rows, setRows] = useState<MealScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");

  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedRes, tagsRes] = await Promise.all([
        apiFetch<MealScheduleResponse>(
          "/api/nutrition/meal-schedule",
          MealScheduleResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        ).catch(() => ({ windows: [] })),
        apiFetch<TagsResponse>("/api/tags", TagsResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        }).catch(() => ({ defaults: [], userTags: [] })),
      ]);

      const windows: MealScheduleWindow[] = Array.isArray(schedRes?.windows)
        ? schedRes.windows
        : [];
      const byTag = new Map(windows.map((w) => [w.tag.toLowerCase(), w]));

      // Every tag the member uses gets a row
      const known = new Set<string>();
      for (const t of tagsRes?.defaults ?? []) known.add(String(t).toLowerCase());
      for (const t of tagsRes?.userTags ?? []) known.add(String(t).toLowerCase());
      for (const t of byTag.keys()) known.add(t);

      // Saved order first, then any new tags alphabetically
      const savedOrder = windows.map((w) => w.tag.toLowerCase());
      const rest = Array.from(known).filter((tg) => !savedOrder.includes(tg)).sort();

      const initialRows: MealScheduleRow[] = [...savedOrder, ...rest].map((tag) => {
        const w = byTag.get(tag);
        return {
          tag,
          start: w && w.startMinutes != null ? formatHHMM(w.startMinutes) : "",
          end: w && w.endMinutes != null ? formatHHMM(w.endMinutes) : "",
        };
      });

      setRows(initialRows);
      loadedRef.current = true;
    } catch {
      setError("Could not load your schedule.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Initial fetch of meal schedule and tags from the network API
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const saveNow = useCallback(
    async (nextRows: MealScheduleRow[]) => {
      setSaving(true);
      setError(null);
      try {
        // Every row in member order — unscheduled tags are preserved with null
        // times so their array position is remembered, never omitted or defaulted.
        const windows = nextRows.map((r) => {
          const s = r.start.trim() ? parseTimeValue(r.start) : null;
          const e = r.end.trim() ? parseTimeValue(r.end) : null;
          const usable = s !== null && e !== null && s !== e;
          return {
            tag: r.tag,
            startMinutes: usable ? s : null,
            endMinutes: usable ? e : null,
          };
        });

        await apiFetch<MealScheduleResponse>(
          "/api/nutrition/meal-schedule",
          MealScheduleResponseSchema,
          {
            method: "PUT",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            body: { windows },
          },
        );

        setSavedAt(Date.now());
      } catch {
        setError("Could not save that.");
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  // Debounced autosave on any change after initial load
  useEffect(() => {
    if (loading || !loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNow(rows);
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [rows, loading, saveNow]);

  const setRow = (tag: string, patch: Partial<MealScheduleRow>) => {
    setRows((prev) =>
      prev.map((r) => (r.tag === tag ? { ...r, ...patch } : r)),
    );
  };

  const move = (index: number, delta: number) => {
    setRows((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [row] = next.splice(index, 1);
      if (row) {
        next.splice(to, 0, row);
      }
      return next;
    });
  };

  const clearRow = (tag: string) => {
    setRows((prev) =>
      prev.map((r) => (r.tag === tag ? { ...r, start: "", end: "" } : r)),
    );
  };

  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;
    if (rows.some((r) => r.tag === tag)) {
      setError("That tag is already listed.");
      return;
    }
    const s = suggestedWindowForTag(tag);
    const next: MealScheduleRow[] = [
      ...rows,
      {
        tag,
        start: s && s.startMinutes != null ? formatHHMM(s.startMinutes) : "",
        end: s && s.endMinutes != null ? formatHHMM(s.endMinutes) : "",
      },
    ];
    setRows(next);
    setNewTag("");
    setError(null);
    void saveNow(next);
  };

  const rowIssue = (r: MealScheduleRow): string | null => {
    const hasStart = !!r.start.trim();
    const hasEnd = !!r.end.trim();
    if ((hasStart && !hasEnd) || (!hasStart && hasEnd)) {
      return "Needs both a start and an end to count as a time.";
    }
    if (hasStart && hasEnd) {
      const s = parseTimeValue(r.start);
      const e = parseTimeValue(r.end);
      if (s === null || e === null) {
        return "Use 24h format (e.g. 08:00 or 19:30).";
      }
      if (s === e) {
        return "Start and end are the same, so this has no window yet.";
      }
    }
    return null;
  };

  const scheduledCount = rows.filter((r) => {
    const s = parseTimeValue(r.start);
    const e = parseTimeValue(r.end);
    return s !== null && e !== null && s !== e;
  }).length;

  if (loading) {
    return (
      <View
        testID={`${testID}-loading`}
        style={{ paddingVertical: 40, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator size="large" color={colors.foreground} />
        <Text className="text-muted-foreground text-sm mt-3">
          Loading meal schedule...
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 16 }}>
      {error ? (
        <Text
          testID="meal-schedule-error"
          accessibilityRole="alert"
          className="text-destructive text-sm"
        >
          {error}
        </Text>
      ) : null}

      {/* Rows List */}
      <Card testID="meal-schedule-list-card">
        <View style={{ gap: 4 }}>
          {rows.map((row, idx) => {
            const s = parseTimeValue(row.start);
            const e = parseTimeValue(row.end);
            const isComplete = s !== null && e !== null && s !== e;
            const wraps = isComplete && e <= s;
            const len = isComplete
              ? windowLength({ tag: row.tag, startMinutes: s, endMinutes: e })
              : null;
            const issue = rowIssue(row);

            return (
              <View
                key={row.tag}
                testID={`meal-schedule-row-${row.tag}`}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: idx === rows.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                  gap: 8,
                }}
              >
                {/* Header row: Reordering, Tag title, Clear button */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View style={{ flexDirection: "column", gap: 1 }}>
                      <Pressable
                        testID={`up-${row.tag}`}
                        accessibilityLabel={`Move ${titleCase(row.tag)} earlier`}
                        accessibilityRole="button"
                        disabled={idx === 0}
                        onPress={() => move(idx, -1)}
                        style={{
                          opacity: idx === 0 ? 0.25 : 1,
                          padding: 2,
                        }}
                      >
                        <ChevronUp size={16} color={colors.foreground} />
                      </Pressable>
                      <Pressable
                        testID={`down-${row.tag}`}
                        accessibilityLabel={`Move ${titleCase(row.tag)} later`}
                        accessibilityRole="button"
                        disabled={idx === rows.length - 1}
                        onPress={() => move(idx, 1)}
                        style={{
                          opacity: idx === rows.length - 1 ? 0.25 : 1,
                          padding: 2,
                        }}
                      >
                        <ChevronDown size={16} color={colors.foreground} />
                      </Pressable>
                    </View>

                    <Text className="text-foreground text-base font-semibold">
                      {titleCase(row.tag)}
                    </Text>
                  </View>

                  {row.start || row.end ? (
                    <Pressable
                      testID={`clear-${row.tag}`}
                      accessibilityLabel={`Clear ${titleCase(row.tag)} schedule`}
                      accessibilityRole="button"
                      onPress={() => clearRow(row.tag)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 9999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <X size={12} color={colors["muted-foreground"]} />
                      <Text className="text-muted-foreground text-xs font-medium">
                        Clear
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-muted-foreground text-xs">
                      Not scheduled
                    </Text>
                  )}
                </View>

                {/* Time Inputs */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    testID={`start-${row.tag}`}
                    accessibilityLabel={`${titleCase(row.tag)} start time`}
                    placeholder="08:00"
                    placeholderTextColor={colors["muted-foreground"]}
                    value={row.start}
                    onChangeText={(val) => setRow(row.tag, { start: val })}
                    className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground text-sm tabular-nums"
                    style={minTouchTarget}
                  />
                  <Text className="text-muted-foreground text-xs">to</Text>
                  <TextInput
                    testID={`end-${row.tag}`}
                    accessibilityLabel={`${titleCase(row.tag)} end time`}
                    placeholder="10:00"
                    placeholderTextColor={colors["muted-foreground"]}
                    value={row.end}
                    onChangeText={(val) => setRow(row.tag, { end: val })}
                    className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-foreground text-sm tabular-nums"
                    style={minTouchTarget}
                  />
                </View>

                {/* Feedback Notes */}
                {wraps && len !== null ? (
                  <Text className="text-blue-500 text-xs">
                    Runs past midnight — {formatClockLabel(s!)} to {formatClockLabel(e!)},{" "}
                    {Math.round((len / 60) * 10) / 10}h
                  </Text>
                ) : null}
                {issue ? (
                  <Text className="text-amber-500 text-xs">{issue}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      {/* Add a Meal */}
      <Card testID="meal-schedule-add-card">
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
          Add a meal
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            testID="new-tag-input"
            accessibilityLabel="New meal name"
            placeholder="e.g. Before Work"
            placeholderTextColor={colors["muted-foreground"]}
            value={newTag}
            onChangeText={setNewTag}
            onSubmitEditing={addTag}
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-foreground text-sm"
            style={minTouchTarget}
          />
          <Button
            testID="new-tag-add-button"
            variant="primary"
            disabled={!newTag.trim()}
            onPress={addTag}
          >
            <Plus size={16} color={colors.background} /> Add
          </Button>
        </View>
      </Card>

      {/* Status & Save bar */}
      <View
        testID="save-status-container"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 4,
        }}
      >
        <View
          testID="save-status"
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 9999,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color={colors.foreground} />
              <Text className="text-foreground text-xs font-medium">Saving…</Text>
            </>
          ) : savedAt ? (
            <>
              <Check size={14} color={colors.foreground} />
              <Text className="text-foreground text-xs font-medium">
                Saved · {scheduledCount} timed
              </Text>
            </>
          ) : (
            <Text className="text-muted-foreground text-xs font-medium">
              Changes save automatically
            </Text>
          )}
        </View>

        <Button
          testID="meal-schedule-save-button"
          variant="secondary"
          size="sm"
          loading={saving}
          onPress={() => void saveNow(rows)}
        >
          Save
        </Button>
      </View>
    </View>
  );
}
