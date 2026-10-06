/**
 * BUILD AS YOU GO — the native add-exercise sheet (NP-138).
 *
 * Native port of `webapp/components/workout/AddExerciseSheet.tsx`: search the
 * catalogue plus the member's custom exercises (creating one on the spot when
 * the machine in front of them is not in the catalogue), set a prescription,
 * and decide where the exercise lands — on its own at the end, or straight
 * into the group they are standing in. The caller owns persistence; this hands
 * back a plain exercise plus a placement.
 *
 * Rules that travel from the web:
 *  - the sheet is a one-shot action: every open resets the pick, the
 *    prescription and the placement;
 *  - a timed pick prescribes seconds, anything else prescribes sets × reps;
 *  - the placement choice only shows when the caller names an anchor (the
 *    exercise the member is standing in);
 *  - creating a custom exercise at the cap raises the upgrade sheet
 *    (NP-052), never an inline error.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { Plus, Search, X } from "lucide-react-native";
import {
  apiFetch,
  classifyApiError,
  CustomExerciseResponseSchema,
  CustomExercisesResponseSchema,
  ExerciseAlternativesResponseSchema,
  ExerciseSearchResponseSchema,
} from "@become/api-client";
import type {
  AlternativeCandidate,
  CustomExercise,
  ExerciseSearchResult,
} from "@become/api-client";
import {
  DEFAULT_SETS,
  agreesOnSets,
  setUnitLabel,
  type GroupKind,
} from "@become/core";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import {
  DEFAULT_CUSTOM_EXERCISE_FORM,
  toCustomExerciseWriteBody,
  type CustomExerciseFormValues,
} from "@/lib/workout/customExercises";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import { buildSuggestedExercises } from "@/lib/workout/suggestedExercises";
import { useEntitlements, syntheticGate } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

export type AddExercisePlacement = "end" | "group";

export interface AddExerciseResult {
  exercise: LiveWorkoutExercise;
  placement: AddExercisePlacement;
  /** Only meaningful for placement 'group'. */
  groupKind: GroupKind;
}

export interface AddExerciseSheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (result: AddExerciseResult) => void | Promise<void>;
  /** The exercise the member is standing in, if any — the superset anchor. */
  anchorName?: string | null;
  /**
   * Slug of the anchor exercise. Drives the "Suggested" list shown before the
   * member types anything — omit it and the sheet falls back to the plain
   * "search for what you are about to do" empty state.
   */
  anchorSlug?: string | null;
  /** True when the anchor already belongs to a group, so we say "add into it". */
  anchorInGroup?: boolean;
  /**
   * The anchor's set count. A new exercise defaults to it rather than to a
   * flat 3 — adding one exercise to a five-set session should not quietly
   * produce a workout that disagrees with itself.
   */
  anchorSets?: number | null;
  /**
   * The anchor's group kind, when it is already in one. A circuit runs every
   * member for the same rounds, so joining one is not a free choice.
   */
  anchorGroupType?: string | null;
  /** Exercise slugs already in this workout, so suggestions don't repeat one. */
  workoutExerciseSlugs?: string[];
  title?: string;
  testID?: string;
}

interface SearchRow {
  slug: string;
  name: string;
  trackingType: string;
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
  isCustom: boolean;
}

function toRow(
  e: {
    slug: string;
    name: string;
    trackingType?: string | null;
    equipment?: string[];
    laterality?: string | null;
    movementPatterns?: string[];
    isCustom?: boolean;
  },
  isCustom: boolean,
): SearchRow {
  return {
    slug: e.slug,
    name: e.name,
    trackingType: e.trackingType ?? "reps_weight",
    ...(e.equipment ? { equipment: e.equipment } : {}),
    ...(e.laterality ? { laterality: e.laterality } : {}),
    ...(e.movementPatterns ? { movementPatterns: e.movementPatterns } : {}),
    isCustom,
  };
}

const isTimed = (t?: string) =>
  !!t && (t.startsWith("time") || t === "intervals");

function slugFor(row: SearchRow): string {
  return row.slug || row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function AddExerciseSheet({
  visible,
  onClose,
  onAdd,
  anchorName,
  anchorSlug,
  anchorInGroup = false,
  anchorSets,
  anchorGroupType,
  workoutExerciseSlugs = [],
  title = "Add an exercise",
  testID = "add-exercise-sheet",
}: AddExerciseSheetProps) {
  const { colors, scrim } = useThemeTokens();
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [customs, setCustoms] = useState<SearchRow[]>([]);
  const [suggested, setSuggested] = useState<SearchRow[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customForm, setCustomForm] = useState<CustomExerciseFormValues>(
    DEFAULT_CUSTOM_EXERCISE_FORM,
  );
  const [picked, setPicked] = useState<SearchRow | null>(null);
  const defaultSets =
    anchorSets && anchorSets > 0 ? Math.max(1, Math.floor(anchorSets)) : DEFAULT_SETS;
  const [sets, setSets] = useState(defaultSets);
  const [reps, setReps] = useState("8-12");
  const [seconds, setSeconds] = useState(45);
  const [placement, setPlacement] = useState<AddExercisePlacement>("end");
  const [groupKind, setGroupKind] = useState<GroupKind>("superset");
  const [adding, setAdding] = useState(false);
  const searchSeq = useRef(0);
  const { data: entitlements, canCreate, refresh: refreshEntitlements } =
    useEntitlements();
  const mayCreateCustom = canCreate("custom-exercises");
  // Debounced catalogue search (the same hook the session editor uses).
  const debouncedQuery = useDebouncedValue(query, 250);

  // Reset every time the sheet opens: it is a one-shot action, and a stale
  // pick from last time reads as the wrong exercise being added. The reset
  // reads the open state — outside React — so it lands in an effect.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot reset on open (outside React) */
  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setResults([]);
    setSuggested([]);
    setPicked(null);
    setSets(defaultSets);
    setReps("8-12");
    setSeconds(45);
    setPlacement("end");
    setGroupKind("superset");
    setShowCreateForm(false);
    setCreatingError(null);
    setCustomForm(DEFAULT_CUSTOM_EXERCISE_FORM);
  }, [visible, defaultSets]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const workoutSlugsKey = workoutExerciseSlugs.join(",");

  // What to add next, guessed from the exercise you're standing in — shown
  // before you type anything, so the sheet isn't just a naked search box.
  // The member's own first move always wins over it: the effect only fires
  // on open / anchor change, never on typing.
  useEffect(() => {
    if (!visible || !anchorSlug) {
      return;
    }
    let cancelled = false;
    // Raising the loading flag as the fetch starts is the effect's job.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for a fetch started here
    setLoadingSuggested(true);
    void (async () => {
      try {
        const params = new URLSearchParams({ slug: anchorSlug, limit: "12" });
        if (workoutSlugsKey) params.set("workoutSlugs", workoutSlugsKey);
        const data = await apiFetch(
          `/api/exercises/alternatives?${params.toString()}`,
          ExerciseAlternativesResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (cancelled) return;
        // Same source, order and dedupe/limit rules as the web's "Add an
        // exercise" sheet (`webapp/lib/workout/suggestedExercises.ts`), so
        // the two apps never show a different suggestion list for the same
        // anchor exercise (NP-289).
        setSuggested(
          buildSuggestedExercises(
            (data?.alternatives ?? []) as AlternativeCandidate[],
            workoutSlugsKey ? workoutSlugsKey.split(",") : [],
          ).map((a) => toRow(a, a.isCustom ?? false)),
        );
      } catch {
        if (!cancelled) setSuggested([]);
      } finally {
        if (!cancelled) setLoadingSuggested(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, anchorSlug, workoutSlugsKey, token]);

  // Your custom exercises, so a machine you named yourself is one search away.
  useEffect(() => {
    if (!visible || customs.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch(
          "/api/exercises/custom",
          CustomExercisesResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (cancelled) return;
        setCustoms(
          ((data?.exercises ?? []) as CustomExercise[]).map((e) =>
            toRow(e, true),
          ),
        );
      } catch {
        if (!cancelled) setCustoms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, customs.length, token]);

  // Debounced catalogue search. The sequence guard drops a slow response that
  // resolves after a newer query has already landed. The debounced query
  // arrives from the timer — outside React — so the empty-query reset lands
  // in an effect.
  /* eslint-disable react-hooks/set-state-in-effect -- sync from outside React (debounced network input) */
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch(
          `/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`,
          ExerciseSearchResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active || seq !== searchSeq.current) return;
        setResults(
          ((data?.exercises ?? []) as ExerciseSearchResult[]).map((e) =>
            toRow(e, e.isCustom ?? false),
          ),
        );
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
  /* eslint-enable react-hooks/set-state-in-effect */

  const choose = useCallback((r: SearchRow) => {
    setPicked(r);
    setReps(isTimed(r.trackingType) ? "" : "8-12");
    setQuery("");
    setResults([]);
  }, []);

  // The machine in front of you is not always in the catalog — the same form
  // the library uses, so "custom exercise" means the same thing here and
  // there. A member at the cap gets the upgrade sheet, not a form error.
  const createCustom = useCallback(async () => {
    if (!customForm.name.trim() || creating) return;
    if (!mayCreateCustom && entitlements && entitlements.enforced !== false) {
      const entitlement = entitlements.features?.["custom-exercises"] ?? null;
      showUpgradeSheet(
        syntheticGate(
          "custom-exercises",
          entitlement?.requiresTier ?? "plus",
          entitlement,
        ),
      );
      return;
    }
    setCreating(true);
    setCreatingError(null);
    try {
      const created = await apiFetch(
        "/api/exercises/custom",
        CustomExerciseResponseSchema,
        {
          method: "POST",
          body: toCustomExerciseWriteBody(customForm),
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const ex = created.exercise as CustomExercise;
      const row = toRow(ex, true);
      setCustoms((prev) =>
        prev.some((c) => c.slug === row.slug) ? prev : [...prev, row],
      );
      choose(row);
      setShowCreateForm(false);
      await refreshEntitlements().catch(() => {});
    } catch (err) {
      const classification = classifyApiError(err);
      if (classification.kind === "plan-gate") {
        setCreating(false);
        setShowCreateForm(false);
        showUpgradeSheet(classification.gate);
        await refreshEntitlements().catch(() => {});
        return;
      }
      setCreatingError(
        classification.message ?? "Could not create that exercise. Try again.",
      );
    } finally {      setCreating(false);
    }
  }, [customForm, creating, choose, mayCreateCustom, entitlements, token, refreshEntitlements]);

  // Joining a circuit is not a free choice of set count: a circuit is rounds
  // of the whole block, so the anchor's count is the count. Reported from the
  // field — a 3-set exercise added to a 5-set one as a circuit produced five
  // rounds with the newcomer missing from two of them.
  const joiningCircuit =
    placement === "group" &&
    !!anchorName &&
    agreesOnSets(anchorInGroup ? anchorGroupType ?? undefined : groupKind);
  const lockedSets =
    joiningCircuit && anchorSets && anchorSets > 0 ? Math.max(1, Math.floor(anchorSets)) : null;
  const effectiveSets = lockedSets ?? sets;

  const submit = useCallback(async () => {
    if (!picked || adding) return;
    setAdding(true);
    try {
      const timed = isTimed(picked.trackingType);
      const slug = slugFor(picked);
      const exercise: LiveWorkoutExercise = {
        slug,
        name: picked.name,
        sets: effectiveSets,
        ...(timed ? {} : { repsLabel: reps.trim() || "8-12" }),
        ...(timed ? { durationLabel: `${seconds} sec` } : {}),
        trackingType: picked.trackingType,
        ...(picked.equipment ? { equipment: picked.equipment } : {}),
        ...(picked.laterality ? { laterality: picked.laterality } : {}),
        ...(picked.movementPatterns
          ? { movementPatterns: picked.movementPatterns }
          : {}),
        addedAdHoc: true as const,
      };
      await onAdd({ exercise, placement, groupKind });
      onClose();
    } finally {
      setAdding(false);
    }
  }, [picked, adding, effectiveSets, reps, seconds, placement, groupKind, onAdd, onClose]);

  if (!visible) return null;

  const q = query.trim().toLowerCase();
  const customMatches =
    q.length >= 2
      ? customs.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q),
        )
      : [];
  const merged = [
    ...results,
    ...customMatches.filter((c) => !results.some((r) => r.slug === c.slug)),
  ];
  const timed = isTimed(picked?.trackingType);
  const setsLabel = setUnitLabel(picked?.trackingType ?? null, effectiveSets);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: scrim }}>
        <View
          testID={`${testID}-sheet`}
          style={{
            backgroundColor: colors.card,
            padding: 16,
            paddingBottom: 32,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "86%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <Text
              testID={`${testID}-title`}
              accessibilityRole="header"
              className="text-foreground text-base font-bold"
            >
              {title}
            </Text>
            <Pressable
              testID={`${testID}-close`}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={minTouchTarget}
            >
              <X size={18} color={colors["muted-foreground"]} />
            </Pressable>
          </View>

          {!picked ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    testID={`${testID}-search`}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search exercises…"
                    returnKeyType="search"
                    accessibilityLabel="Search exercises"
                  />
                </View>
                {searching ? (
                  <ActivityIndicator
                    testID={`${testID}-searching`}
                    size="small"
                    color={colors["muted-foreground"]}
                  />
                ) : (
                  <Search size={18} color={colors["muted-foreground"]} />
                )}
              </View>

              <View style={{ gap: 4, marginTop: 12 }}>
                {merged.map((r) => (
                  <Pressable
                    key={r.slug}
                    testID={`${testID}-result`}
                    onPress={() => choose(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${r.name}`}
                    style={[minTouchTarget, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }]}
                  >
                    <Text className="text-foreground text-sm font-medium" style={{ flexShrink: 1 }}>
                      {r.name}
                      {r.isCustom ? " · Yours" : ""}
                    </Text>
                    <Plus size={16} color={colors["muted-foreground"]} />
                  </Pressable>
                ))}
                {q.length < 2 && anchorSlug ? (
                  <View testID={`${testID}-suggested`}>
                    {suggested.length > 0 ? (
                      <>
                        <Text className="text-muted-foreground text-xs font-semibold uppercase">
                          Suggested
                        </Text>
                        {suggested.map((s) => (
                          <Pressable
                            key={s.slug}
                            testID={`${testID}-suggested-result`}
                            onPress={() => choose(s)}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${s.name}`}
                            style={[minTouchTarget, { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }]}
                          >
                            <Text className="text-foreground text-sm font-medium" style={{ flexShrink: 1 }}>
                              {s.name}
                            </Text>
                            <Plus size={16} color={colors["muted-foreground"]} />
                          </Pressable>
                        ))}
                      </>
                    ) : loadingSuggested ? (
                      <ActivityIndicator
                        testID={`${testID}-suggested-loading`}
                        size="small"
                        color={colors["muted-foreground"]}
                      />
                    ) : (
                      <Text className="text-muted-foreground text-xs text-center" style={{ paddingVertical: 24 }}>
                        Search for what you are about to do.
                      </Text>
                    )}
                  </View>
                ) : null}
                {q.length < 2 && !anchorSlug ? (
                  <Text className="text-muted-foreground text-xs text-center" style={{ paddingVertical: 24 }}>
                    Search for what you are about to do.
                  </Text>
                ) : null}
                {!showCreateForm ? (
                  <Pressable
                    testID={`${testID}-create-open`}
                    onPress={() => {
                      setCustomForm((prev) => ({ ...prev, name: query.trim() }));
                      setShowCreateForm(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={query.trim() ? `Create ${query.trim()} as a new exercise` : "Create an exercise"}
                    style={[minTouchTarget, { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }]}
                  >
                    <Plus size={16} color={colors.primary} />
                    <Text className="text-primary text-sm font-semibold">
                      {query.trim()
                        ? `Create “${query.trim()}” as a new exercise`
                        : "Create an exercise"}
                    </Text>
                  </Pressable>
                ) : null}
                {showCreateForm ? (
                  <View style={{ gap: 12, marginTop: 8 }}>
                    <Pressable
                      testID={`${testID}-create-back`}
                      onPress={() => setShowCreateForm(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Back to search"
                      style={minTouchTarget}
                    >
                      <Text className="text-muted-foreground text-sm font-semibold">
                        ← Back to search
                      </Text>
                    </Pressable>
                    <CustomExerciseForm
                      values={customForm}
                      onChange={setCustomForm}
                      error={creatingError}
                      submitting={creating}
                      submitLabel="Create & Add"
                      onSubmit={() => void createCustom()}
                      onCancel={() => setShowCreateForm(false)}
                      testID={`${testID}-create-form`}
                    />
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <View
                style={{
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: colors.muted,
                  marginBottom: 12,
                }}
              >
                <Text className="text-foreground text-sm font-semibold">
                  {picked.name}
                </Text>
                <Pressable
                  testID={`${testID}-pick-different`}
                  onPress={() => setPicked(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Pick a different exercise"
                >
                  <Text className="text-muted-foreground text-xs underline">
                    pick a different one
                  </Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                    {setsLabel}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Pressable
                      testID={`${testID}-sets-less`}
                      disabled={lockedSets !== null}
                      onPress={() => setSets((v) => Math.max(1, Math.min(10, v - 1)))}
                      accessibilityRole="button"
                      accessibilityLabel={`Fewer ${setsLabel}`}
                      style={[minTouchTarget, { opacity: lockedSets !== null ? 0.4 : 1 }]}
                    >
                      <Text className="text-foreground text-lg font-bold">−</Text>
                    </Pressable>
                    <Text testID={`${testID}-sets`} className="text-foreground text-sm font-bold" style={{ minWidth: 24, textAlign: "center" }}>
                      {effectiveSets}
                    </Text>
                    <Pressable
                      testID={`${testID}-sets-more`}
                      disabled={lockedSets !== null}
                      onPress={() => setSets((v) => Math.max(1, Math.min(10, v + 1)))}
                      accessibilityRole="button"
                      accessibilityLabel={`More ${setsLabel}`}
                      style={[minTouchTarget, { opacity: lockedSets !== null ? 0.4 : 1 }]}
                    >
                      <Text className="text-foreground text-lg font-bold">+</Text>
                    </Pressable>
                  </View>
                </View>
                {timed ? (
                  <View style={{ flex: 1 }}>
                    <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                      Seconds
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Pressable
                        testID={`${testID}-seconds-less`}
                        onPress={() => setSeconds((v) => Math.max(5, Math.min(600, v - 15)))}
                        accessibilityRole="button"
                        accessibilityLabel="Fewer seconds"
                        style={minTouchTarget}
                      >
                        <Text className="text-foreground text-lg font-bold">−</Text>
                      </Pressable>
                      <Text testID={`${testID}-seconds`} className="text-foreground text-sm font-bold" style={{ minWidth: 32, textAlign: "center" }}>
                        {seconds}
                      </Text>
                      <Pressable
                        testID={`${testID}-seconds-more`}
                        onPress={() => setSeconds((v) => Math.max(5, Math.min(600, v + 15)))}
                        accessibilityRole="button"
                        accessibilityLabel="More seconds"
                        style={minTouchTarget}
                      >
                        <Text className="text-foreground text-lg font-bold">+</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Input
                      testID={`${testID}-reps`}
                      label="Reps"
                      value={reps}
                      onChangeText={setReps}
                      keyboardType="numeric"
                      placeholder="8-12"
                    />
                  </View>
                )}
              </View>

              {anchorName ? (
                <View style={{ marginTop: 16 }}>
                  <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">
                    Where it goes
                  </Text>
                  <View style={{ gap: 6 }}>
                    <Pressable
                      testID={`${testID}-place-end`}
                      onPress={() => setPlacement("end")}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: placement === "end" }}
                      accessibilityLabel="On its own. Runs after everything else"
                      style={[minTouchTarget, { borderRadius: 12, borderWidth: placement === "end" ? 2 : 1, borderColor: placement === "end" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 10 }]}
                    >
                      <Text className="text-foreground text-sm font-semibold">On its own</Text>
                      <Text className="text-muted-foreground text-xs">Runs after everything else</Text>
                    </Pressable>
                    <Pressable
                      testID={`${testID}-place-group`}
                      onPress={() => setPlacement("group")}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: placement === "group" }}
                      accessibilityLabel={anchorInGroup ? "Into this group. Same rounds, straight after it" : `Superset with ${anchorName}. Alternate sets, back to back`}
                      style={[minTouchTarget, { borderRadius: 12, borderWidth: placement === "group" ? 2 : 1, borderColor: placement === "group" ? colors.primary : colors.border, paddingHorizontal: 12, paddingVertical: 10 }]}
                    >
                      <Text className="text-foreground text-sm font-semibold">
                        {anchorInGroup ? "Into this group" : `Superset with ${anchorName}`}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        {anchorInGroup ? "Same rounds, straight after it" : "Alternate sets, back to back"}
                      </Text>
                    </Pressable>
                  </View>
                  {placement === "group" && !anchorInGroup ? (
                    <View testID={`${testID}-kind-row`} style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                      {(["superset", "circuit"] as GroupKind[]).map((k) => (
                        <Pressable
                          key={k}
                          testID={`${testID}-kind-${k}`}
                          onPress={() => setGroupKind(k)}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: groupKind === k }}
                          accessibilityLabel={k === "superset" ? "Superset" : "Circuit"}
                          style={[minTouchTarget, { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: groupKind === k ? colors.primary : colors.muted }]}
                        >
                          <Text
                            className={groupKind === k ? "text-primary-foreground text-xs font-semibold" : "text-foreground text-xs font-semibold"}
                          >
                            {k === "superset" ? "Superset" : "Circuit"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {lockedSets !== null ? (
                    <Text
                      testID={`${testID}-circuit-note`}
                      className="text-muted-foreground text-xs"
                      style={{ marginTop: 8 }}
                    >
                      {`A circuit runs every exercise the same number of rounds, so this one follows ${anchorName} at ${lockedSets}.`}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={{ marginTop: 16 }}>
                <Button
                  testID={`${testID}-confirm`}
                  onPress={() => void submit()}
                  disabled={adding}
                  loading={adding}
                  accessibilityLabel="Add to this workout"
                >
                  Add to this workout
                </Button>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export type { GroupKind };
