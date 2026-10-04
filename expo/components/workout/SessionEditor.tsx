/**
 * ─── EDIT A SAVED / DRAFTED SESSION BEFORE IT STARTS (NP-137) ───────────────
 *
 * Native port of `webapp/components/workout/SessionEditor.tsx`: rename it,
 * retune sets and reps, reorder, remove, and add exercises (searching the
 * catalogue plus the member's custom exercises, the same two sources the
 * builder merges).
 *
 * Deliberately edits a LOCAL copy and hands the result back on Save, so
 * Cancel is a real cancel and the caller owns persistence (the stash for a
 * draft, plus the server for a session that already exists there).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Layers,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react-native";
import type { z } from "zod";
import { apiFetch } from "@become/api-client";
import {
  CustomExercisesResponseSchema,
  ExerciseSearchResponseSchema,
} from "@become/api-client";
import type {
  CustomExercise,
  CustomExercisesResponse,
  ExerciseSearchResponse,
  ExerciseSearchResult,
} from "@become/api-client";
import {
  groupIndexes,
  sanitizeGroups,
  setUnitLabel,
  ungroupAt,
  type DraftExercise,
} from "@become/core";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

export interface SessionEditorProps {
  title: string;
  exercises: DraftExercise[];
  onSave: (next: { title: string; exercises: DraftExercise[] }) => void | Promise<void>;
  onCancel: () => void;
  /** Shown on the save button — e.g. "Saved to your plan". */
  saveLabel?: string;
  saving?: boolean;
  error?: string | null;
  testID?: string;
}

function stripGroup(ex: DraftExercise): DraftExercise {
  const next = { ...ex };
  delete next.groupId;
  delete next.groupType;
  delete next.groupLabel;
  delete next.groupRest;
  delete next.groupRounds;
  return next;
}

export function SessionEditor({
  title,
  exercises,
  onSave,
  onCancel,
  saveLabel = "Save changes",
  saving = false,
  error = null,
  testID = "session-editor",
}: SessionEditorProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [draftTitle, setDraftTitle] = useState(title);
  const [rows, setRows] = useState<DraftExercise[]>(exercises);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseSearchResult[]>([]);
  const [customs, setCustoms] = useState<CustomExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchSeq = useRef(0);

  // The member's custom exercises, once per mount — matched client-side and
  // merged custom-first, the same merge the builder uses.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch<z.infer<typeof CustomExercisesResponseSchema>>(
          "/api/exercises/custom",
          CustomExercisesResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active) return;
        setCustoms(((data as CustomExercisesResponse | null)?.exercises ?? []) as CustomExercise[]);
      } catch {
        if (active) setCustoms([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // Debounced exercise search for the "add" picker. The sequence guard drops
  // a slow response that resolves after a newer query has already landed.
  const debouncedQuery = useDebouncedValue(query, 250);
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from outside React (debounced network input)
      setResults([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from outside React (debounced network input)
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch<z.infer<typeof ExerciseSearchResponseSchema>>(
          `/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`,
          ExerciseSearchResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active || seq !== searchSeq.current) return;
        setResults((((data as ExerciseSearchResponse | null)?.exercises ?? []) as ExerciseSearchResult[]));
      } catch {
        if (active && seq === searchSeq.current) setResults([]);
      } finally {
        if (active && seq === searchSeq.current) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [debouncedQuery, token]);

  const patchRow = useCallback(
    (i: number, patch: Partial<DraftExercise>) =>
      setRows((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex))),
    [],
  );

  const removeRow = useCallback(
    (i: number) =>
      setRows((prev) => {
        const gid = prev[i]?.groupId;
        const next = prev.filter((_, idx) => idx !== i);
        // A superset of one is not a superset.
        if (gid && next.filter((e) => e.groupId === gid).length < 2) {
          return next.map((e) => (e.groupId === gid ? stripGroup(e) : e));
        }
        return next;
      }),
    [],
  );

  /** Superset this exercise with the one below it — or break the group up. */
  const toggleGroup = useCallback(
    (i: number) =>
      setRows((prev) => {
        const row = prev[i];
        if (!row) return prev;
        if (row.groupId) return ungroupAt(prev, i).exercises;
        if (i + 1 >= prev.length) return prev;
        return groupIndexes(prev, [i, i + 1], "superset").exercises;
      }),
    [],
  );

  const moveRow = useCallback(
    (i: number, delta: number) =>
      setRows((prev) => {
        const j = i + delta;
        if (j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        const tmp = next[i]!;
        next[i] = next[j]!;
        next[j] = tmp;
        // Reordering can carry an exercise out of its superset — a group
        // whose members are no longer neighbours is not a group any more.
        return sanitizeGroups(next);
      }),
    [],
  );

  const addExercise = useCallback(
    (ex: { slug: string; name: string; trackingType?: string; equipment?: string[]; laterality?: string; movementPatterns?: string[] }) => {
      const trackingType = ex.trackingType ?? "reps_weight";
      const isTime = trackingType === "time";
      setRows((prev) => [
        ...prev,
        {
          exerciseSlug: ex.slug,
          name: ex.name,
          trackingType,
          sets: 3,
          reps: isTime ? "" : "8-12",
          ...(isTime ? { duration: "30" } : {}),
          ...(ex.equipment ? { equipment: ex.equipment } : {}),
          ...(ex.laterality ? { laterality: ex.laterality } : {}),
          ...(ex.movementPatterns ? { movementPatterns: ex.movementPatterns } : {}),
        },
      ]);
      setQuery("");
      setResults([]);
      setAdding(false);
    },
    [],
  );

  const canSave = draftTitle.trim().length > 0 && rows.length > 0 && !saving;

  const q = debouncedQuery.trim().toLowerCase();
  const customMatches =
    q.length >= 2
      ? customs.filter((c) => c.name.toLowerCase().includes(q))
      : [];
  const customSlugs = new Set(customMatches.map((c) => c.slug));
  const merged: { slug: string; name: string; trackingType?: string; equipment?: string[]; laterality?: string; movementPatterns?: string[]; isCustom: boolean }[] = [
    ...customMatches.map((c) => ({
      slug: c.slug,
      name: c.name,
      trackingType: c.trackingType,
      equipment: c.equipment,
      isCustom: true,
    })),
    ...results
      .filter((r) => !customSlugs.has(r.slug))
      .map((r) => ({ ...r, isCustom: false })),
  ];

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <Input
        testID={`${testID}-title`}
        label="Session name"
        placeholder="Session name"
        value={draftTitle}
        onChangeText={setDraftTitle}
        autoCapitalize="words"
      />

      <View testID={`${testID}-rows`} style={{ gap: 8 }}>
        {rows.map((ex, i) => {
          const isTime = ex.trackingType === "time";
          return (
            <View
              key={`${ex.exerciseSlug || ex.name}-${i}`}
              testID={`${testID}-row-${i}`}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                    {ex.name}
                  </Text>
                  {ex.groupId ? (
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.primary }}>
                      {ex.groupLabel || "Superset"}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  {ex.groupId || i + 1 < rows.length ? (
                    <Pressable
                      testID={`${testID}-group-${i}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        ex.groupId
                          ? `Break up the group containing ${ex.name}`
                          : `Superset ${ex.name} with the next exercise`
                      }
                      onPress={() => toggleGroup(i)}
                      style={{ padding: 6, ...minTouchTarget }}
                    >
                      {ex.groupId ? (
                        <Unlink size={16} color={colors.primary} strokeWidth={2} />
                      ) : (
                        <Layers size={16} color={colors["muted-foreground"]} strokeWidth={2} />
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    testID={`${testID}-up-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${ex.name} up`}
                    disabled={i === 0}
                    onPress={() => moveRow(i, -1)}
                    style={{ padding: 6, opacity: i === 0 ? 0.3 : 1, ...minTouchTarget }}
                  >
                    <ArrowUp size={16} color={colors["muted-foreground"]} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    testID={`${testID}-down-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${ex.name} down`}
                    disabled={i === rows.length - 1}
                    onPress={() => moveRow(i, 1)}
                    style={{ padding: 6, opacity: i === rows.length - 1 ? 0.3 : 1, ...minTouchTarget }}
                  >
                    <ArrowDown size={16} color={colors["muted-foreground"]} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    testID={`${testID}-remove-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${ex.name}`}
                    onPress={() => removeRow(i)}
                    style={{ padding: 6, ...minTouchTarget }}
                  >
                    <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text className="text-muted-foreground text-xs">
                    {setUnitLabel(ex.trackingType, ex.sets)}
                  </Text>
                  <Input
                    testID={`${testID}-sets-${i}`}
                    value={String(ex.sets)}
                    onChangeText={(text) =>
                      patchRow(i, { sets: Math.max(1, Math.min(20, Number(text) || 1)) })
                    }
                    keyboardType="number-pad"
                    accessibilityLabel={`${setUnitLabel(ex.trackingType, ex.sets)} for ${ex.name}`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    testID={`${testID}-reps-${i}`}
                    label={isTime ? "Seconds" : "Reps"}
                    value={isTime ? (ex.duration ?? "") : ex.reps}
                    onChangeText={(text) =>
                      patchRow(i, isTime ? { duration: text } : { reps: text })
                    }
                    placeholder={isTime ? "30" : "8-12"}
                    accessibilityLabel={`${isTime ? "Seconds" : "Reps"} for ${ex.name}`}
                    keyboardType={isTime ? "number-pad" : "default"}
                  />
                </View>
              </View>
            </View>
          );
        })}

        {rows.length === 0 ? (
          <View
            testID={`${testID}-empty`}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: "dashed",
              padding: 24,
              alignItems: "center",
            }}
          >
            <Text className="text-muted-foreground text-sm">
              No exercises left. Add at least one to save.
            </Text>
          </View>
        ) : null}
      </View>

      {adding ? (
        <View
          testID={`${testID}-add`}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-search`}
                placeholder="Search exercises…"
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search exercises"
                autoFocus
              />
            </View>
            <Pressable
              testID={`${testID}-add-close`}
              accessibilityRole="button"
              accessibilityLabel="Cancel adding an exercise"
              onPress={() => {
                setAdding(false);
                setQuery("");
              }}
              style={{ padding: 6, ...minTouchTarget }}
            >
              <X size={18} color={colors["muted-foreground"]} strokeWidth={2} />
            </Pressable>
          </View>
          {searching ? (
            <Text testID={`${testID}-searching`} className="text-muted-foreground text-xs">
              Searching…
            </Text>
          ) : null}
          {!searching && query.trim().length >= 2 && merged.length === 0 ? (
            <Text testID={`${testID}-no-matches`} className="text-muted-foreground text-xs">
              No matches.
            </Text>
          ) : null}
          <View style={{ gap: 2 }}>
            {merged.map((r) => (
              <Pressable
                key={r.slug}
                testID={`${testID}-result-${r.slug}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${r.name}`}
                onPress={() => addExercise(r)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 8,
                  ...minTouchTarget,
                }}
              >
                <Text className="text-foreground text-sm" style={{ flex: 1 }} numberOfLines={1}>
                  {r.name}
                  {r.isCustom ? " · Custom" : ""}
                </Text>
                <Plus size={16} color={colors["muted-foreground"]} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Pressable
          testID={`${testID}-add-open`}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          onPress={() => setAdding(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: "dashed",
            paddingVertical: 10,
            ...minTouchTarget,
          }}
        >
          <Plus size={16} color={colors["muted-foreground"]} strokeWidth={2} />
          <Text className="text-muted-foreground text-sm font-medium">Add exercise</Text>
        </Pressable>
      )}

      {error ? (
        <Text testID={`${testID}-error`} accessibilityRole="alert" style={{ fontSize: 12, color: colors.destructive }}>
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          testID={`${testID}-save`}
          accessibilityRole="button"
          accessibilityLabel={saving ? "Saving…" : saveLabel}
          disabled={!canSave}
          onPress={() => void onSave({ title: draftTitle.trim(), exercises: rows })}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 12,
            paddingVertical: 10,
            backgroundColor: colors.primary,
            opacity: !canSave ? 0.5 : 1,
            ...minTouchTarget,
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors["primary-foreground"]} />
          ) : (
            <Check size={16} color={colors["primary-foreground"]} strokeWidth={2} />
          )}
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors["primary-foreground"] }}>
            {saving ? "Saving…" : saveLabel}
          </Text>
        </Pressable>
        <Pressable
          testID={`${testID}-cancel`}
          accessibilityRole="button"
          accessibilityLabel="Cancel editing"
          disabled={saving}
          onPress={onCancel}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 16,
            paddingVertical: 10,
            alignItems: "center",
            justifyContent: "center",
            opacity: saving ? 0.5 : 1,
            ...minTouchTarget,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
