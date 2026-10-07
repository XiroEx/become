import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from "react-native";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Dumbbell,
  Minus,
  Plus,
  Trash2,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { hitSlopToMinTarget, minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  BUILDER_EQUIPMENT_OPTIONS,
  BUILDER_TARGET_USER_OPTIONS,
  BUILDER_TRAINING_DAY_OPTIONS,
  MAX_DURATION_WEEKS,
  MAX_TRAINING_DAYS_PER_WEEK,
  type BuilderExercise,
  type BuilderGroupType,
  type CustomProgramBuilderPayload,
  type ProgramBuilderState,
  addBuilderExercise,
  addPhase,
  addWorkout,
  clampDurationWeeks,
  copyWorkout,
  emptyProgramBuilderState,
  groupBuilderExercises,
  hasBuilderContent,
  moveBuilderExercise,
  removeBuilderExercise,
  removeBuilderExerciseFromGroup,
  removePhase,
  removeWorkout,
  toCustomProgramPayload,
  toggleBuilderEquipment,
  totalWorkouts,
  ungroupBuilderExercises,
  updateBuilderExercise,
  updateBuilderGroup,
  updatePhase,
  updateWorkout,
  validateProgram,
  withTrainingDays,
} from "@/lib/programs/programBuilder";
import type { ExercisePickerSelection } from "@/components/programs/ExercisePicker";
import { BuilderWorkoutExercises } from "@/components/programs/BuilderExerciseRow";
import type { ProgramDraftStore } from "@/lib/programs/programDraft";

export type ProgramBuilderMode = "create" | "edit";

export interface ProgramBuilderProps {
  mode: ProgramBuilderMode;
  /**
   * The program to open with. In edit mode it is the server's copy and arrives
   * after the fetch, so it is adopted the first time it is non-null.
   */
  initialState?: ProgramBuilderState | null;
  /**
   * Where the local draft lives. Create mode passes a store (NP-168's third
   * criterion: a half-built program survives the app being killed); edit mode
   * passes nothing, because there the server's copy is the truth — the web
   * builder makes the same split.
   */
  draft?: ProgramDraftStore | null;
  /** True while the save request is in flight. */
  saving?: boolean;
  /** A refusal's own words, from the server, rendered verbatim. */
  error?: string | null;
  /**
   * The member is at their allowance and enforcement is on. Save then hands
   * straight over to `onSubmit`, which answers with the upgrade sheet instead
   * of a request (NP-052) — asking somebody to finish a program they are not
   * allowed to save, and only then telling them, is the wrong order.
   */
  locked?: boolean;
  /** Save handler. The CALLER owns the quota decision (see the route). */
  onSubmit: (payload: CustomProgramBuilderPayload) => void | Promise<void>;
  onCancel?: () => void;
  testID?: string;
}

const STEPS = [
  { key: "details", title: "Details", Icon: ClipboardList },
  { key: "phases", title: "Phases", Icon: Dumbbell },
  { key: "review", title: "Review", Icon: CheckCircle2 },
] as const;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * THE NATIVE PROGRAM BUILDER — the frame (NP-168) with the exercise rows (NP-171),
 * drag reorder and the group editor (NP-172), laid out like the web (NP-281).
 *
 * Native counterpart of `ProgramCreator.tsx` + `PhaseEditor.tsx`: program
 * details, phases with their week ranges and focus, and the sessions inside
 * them with their day labels and titles — plus, inside each session, the rows
 * from `WorkoutEditor.tsx` + `ExerciseEditor.tsx`: a search picker over the
 * catalogue and the member's custom exercises, the prescription a coach
 * writes (sets, reps, rest, tempo, RPE, percent of 1RM, duration), the role,
 * the coach notes, removal, drag reorder and grouping into supersets,
 * circuits, trisets, giant sets, EMOM and AMRAP blocks with a label, rest and
 * rounds.
 *
 * Everything it knows about a program is in `lib/programs/programBuilder.ts`,
 * which is where the three rules live (schema fields only, unique day labels,
 * the strings the web editor calls `.trim()` on during render). This file is
 * the surface: three steps, one save, and the draft.
 *
 * WHAT NP-281 CHANGED, and why each one is a parity fix and not a redesign:
 *
 *   • REQUIRED EQUIPMENT. The web's sixteen chips, which the phone could not
 *     edit at all — so a program built on a phone claimed no equipment.
 *   • TRAINING DAYS/WEEK as chips 2–7, the web's control, with the ± stepper
 *     kept beside them because the chip row cannot say "one session a week"
 *     and the builder allows it.
 *   • THE FLOATING SAVE. The web's always-reachable `Save` / `Saved` pill, so
 *     saving does not mean stepping through to Review first. It floats over
 *     the scroll (this component owns the ScrollView for exactly that reason)
 *     and it is the same `onSave` the Review step's button calls.
 *   • THE PHASES STEP as the web lays it out: a collapsible phase header with
 *     its number badge and `Weeks 1-4 • 2 workouts`, the sessions as Day tabs
 *     with "Copy current to…", and ONE session open at a time — native used
 *     to stack every session of every phase in one column.
 *   • THE KEYBOARD. A tap that lands on the page (or a drag) dismisses it; it
 *     used to sit over Next with nothing to tap to get rid of it.
 *   • THE DRAFT LINE. "Picked up where you left off" only when the restored
 *     draft actually has something in it.
 */
export function ProgramBuilder({
  mode,
  initialState = null,
  draft = null,
  saving = false,
  error = null,
  locked = false,
  onSubmit,
  onCancel,
  testID = "program-builder",
}: ProgramBuilderProps) {
  const { colors, tint } = useThemeTokens();
  const [state, setState] = useState<ProgramBuilderState>(
    () => initialState ?? emptyProgramBuilderState(),
  );
  const [step, setStep] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [confirmRemovePhase, setConfirmRemovePhase] = useState<number | null>(
    null,
  );
  const [showProblems, setShowProblems] = useState(false);
  /** Edits since the screen opened — what makes the save pill say "Saved". */
  const [dirty, setDirty] = useState(false);
  /** Phase index → collapsed. Expanded is the default, as on the web. */
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  /** Phase index → which Day tab is open. The first one, as on the web. */
  const [activeDay, setActiveDay] = useState<Record<number, number>>({});
  /** Which phase's "Copy current to…" menu is open, if any. */
  const [copyMenu, setCopyMenu] = useState<number | null>(null);
  /**
   * The draft has been READ. Nothing is written back before it is, or the
   * blank first render would delete the draft this mount is about to restore
   * — both effects fire on the same mount, and the write is not ordered
   * against the read.
   */
  const [draftLoaded, setDraftLoaded] = useState(false);
  const seededRef = useRef(initialState !== null);
  const draftReadRef = useRef(false);

  /**
   * Every EDIT goes through here rather than `setState`, which is what makes
   * `dirty` honest: seeding from the server and restoring a draft are not
   * edits (the web's `firstFormDataPass` ref exists for the same reason) and
   * they call `setState` directly.
   */
  const update = useCallback(
    (next: (prev: ProgramBuilderState) => ProgramBuilderState) => {
      setDirty(true);
      setState(next);
    },
    [],
  );

  // THE SERVER'S COPY, once. Edit mode mounts before the fetch lands, so the
  // first non-null `initialState` is adopted and later ones are ignored —
  // re-adopting would throw away what the member has typed since.
  useEffect(() => {
    if (seededRef.current || !initialState) return;
    seededRef.current = true;
    setState(initialState);
  }, [initialState]);

  // THE DRAFT, once, before the member can have typed anything. AsyncStorage
  // is outside React and the read is async, so this is a sync-from-elsewhere
  // effect rather than a derivation.
  useEffect(() => {
    if (draftReadRef.current || !draft) return;
    draftReadRef.current = true;
    // Opened on something already known (an import, a server copy): there is
    // nothing to restore, but writes still have to be unblocked.
    if (seededRef.current) {
      setDraftLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const stored = await draft.load().catch(() => null);
      if (cancelled) return;
      if (stored) {
        setState(stored.state);
        // A BLANK draft is restored silently. Saying "picked up where you
        // left off" over an empty form is the line the full-pass review
        // caught: there was nothing to pick up.
        if (hasBuilderContent(stored.state)) setDraftRestored(true);
      }
      setDraftLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft]);

  // …and back out again after every change. Writing on each edit rather than
  // on an unmount or a background event is the point: the OS kills a
  // backgrounded app with no notice and no event to hook.
  useEffect(() => {
    if (!draft || !draftLoaded) return;
    void draft.save(state);
  }, [draft, draftLoaded, state]);

  const validation = useMemo(() => validateProgram(state), [state]);
  const sessions = totalWorkouts(state);

  const setField = useCallback(
    <K extends keyof ProgramBuilderState>(
      key: K,
      value: ProgramBuilderState[K],
    ) => {
      update((prev) => ({ ...prev, [key]: value }));
    },
    [update],
  );

  const onSave = useCallback(() => {
    Keyboard.dismiss();
    // At the cap, the answer is the upgrade sheet and it does not depend on
    // the program being finished — hand over without validating.
    if (!locked && !validation.canSave) {
      setShowProblems(true);
      return;
    }
    void onSubmit(toCustomProgramPayload(state));
  }, [locked, onSubmit, state, validation.canSave]);

  const onCancelPress = useCallback(() => {
    Keyboard.dismiss();
    onCancel?.();
  }, [onCancel]);

  const removeTarget =
    confirmRemovePhase !== null ? state.phases[confirmRemovePhase] : undefined;

  const isEdit = mode === "edit";
  // The web's rule, to the condition: the pill is dead while saving, while
  // step 1 is unanswerable, and — in edit mode — while nothing has changed.
  const saveDisabled =
    saving || !validation.detailsComplete || (isEdit && !dirty);
  const saveLabel = saving
    ? "Saving…"
    : isEdit
      ? dirty
        ? "Save changes"
        : "Saved"
      : dirty
        ? "Save changes"
        : "Save";
  const savePillColor = saveDisabled
    ? colors.muted
    : dirty
      ? colors.accent
      : colors.success;

  return (
    <View testID={`${testID}-shell`} style={{ flex: 1 }}>
      <ScrollView
        testID={`${testID}-scroll`}
        contentContainerStyle={{
          padding: 16,
          // Room for the floating pill, which would otherwise cover the last
          // control on the page.
          paddingBottom: 112,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* THE OUTSIDE TAP (NP-281). A tap anywhere that is not a control puts
            the keyboard away, so Next and Save stop hiding under it.
            `accessible={false}` keeps this out of the a11y tree: it is a
            gesture target, not a button. */}
        <Pressable
          testID={`${testID}-dismiss-keyboard`}
          // Not a button: a gesture target that the a11y tree skips.
          accessibilityRole="none"
          accessible={false}
          onPress={() => Keyboard.dismiss()}
          style={{ gap: 16 }}
        >
          {/* The three steps, as pills — the web's icon stepper, with one
              difference: every step stays reachable. The web disables a later
              pill until the one before it validates; on a phone that reads as
              a broken tab, and Save already refuses with the list of what is
              missing. */}
          <View
            testID={`${testID}-steps`}
            style={{ flexDirection: "row", gap: 8 }}
          >
            {STEPS.map((s, index) => {
              const selected = index === step;
              const done = index < step;
              const StepIcon = s.Icon;
              return (
                <Pressable
                  key={s.key}
                  testID={`${testID}-step-${s.key}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Step ${index + 1}, ${s.title}`}
                  onPress={() => setStep(index)}
                  style={[
                    minTouchTarget,
                    {
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      backgroundColor: selected
                        ? colors.primary
                        : done
                          ? tint("success", 0.18)
                          : colors.muted,
                    },
                  ]}
                >
                  <StepIcon
                    size={14}
                    color={
                      selected
                        ? colors["primary-foreground"]
                        : done
                          ? colors.success
                          : colors["muted-foreground"]
                    }
                  />
                  <Text
                    className={
                      selected
                        ? "text-primary-foreground text-sm font-semibold"
                        : done
                          ? "text-success text-sm font-semibold"
                          : "text-muted-foreground text-sm font-semibold"
                    }
                  >
                    {s.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {draftRestored ? (
            <Text
              testID={`${testID}-draft-restored`}
              className="text-muted-foreground text-xs"
            >
              Picked up where you left off — your draft was saved on this phone.
            </Text>
          ) : null}

          {/* ── Step 1: the program itself ─────────────────────────────── */}
          {step === 0 ? (
            <View style={{ gap: 16 }}>
              <Card testID={`${testID}-details`} title="Program Details">
                <View style={{ gap: 12 }}>
                  <Input
                    testID={`${testID}-name`}
                    label="Program Name *"
                    placeholder="e.g. 12-Week Strength Builder"
                    value={state.name}
                    onChangeText={(text) => setField("name", text)}
                  />
                  <Input
                    testID={`${testID}-description`}
                    label="Description"
                    placeholder="What is this program for?"
                    value={state.description}
                    onChangeText={(text) => setField("description", text)}
                    multiline
                    numberOfLines={3}
                  />
                  <Input
                    testID={`${testID}-goal`}
                    label="Goal *"
                    placeholder="e.g. Build strength"
                    value={state.goal}
                    onChangeText={(text) => setField("goal", text)}
                  />
                </View>
              </Card>

              <Card testID={`${testID}-schedule`} title="Duration & Schedule">
                <View style={{ gap: 12 }}>
                  <Input
                    testID={`${testID}-weeks`}
                    label="Duration (weeks) *"
                    accessibilityHint={`Between 1 and ${MAX_DURATION_WEEKS}`}
                    keyboardType="number-pad"
                    value={String(state.duration_weeks)}
                    onChangeText={(text) => {
                      const digits = text.replace(/[^0-9]/g, "");
                      if (digits === "") return;
                      setField(
                        "duration_weeks",
                        clampDurationWeeks(Number(digits)),
                      );
                    }}
                  />

                  {/* THE WEB'S CHIPS, 2–7, plus the ± pair: a stepper can say
                      "one session a week" and the chip row cannot, and this
                      number resizes every phase, so a half-typed "" must not
                      have to mean 1. */}
                  <View style={{ gap: 6 }}>
                    <Text className="text-foreground text-sm font-medium">
                      Training Days/Week *
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {BUILDER_TRAINING_DAY_OPTIONS.map((days) => {
                        const selected = state.training_days_per_week === days;
                        return (
                          <Pressable
                            key={days}
                            testID={`${testID}-days-${days}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${days} training days a week`}
                            onPress={() =>
                              update((prev) => withTrainingDays(prev, days))
                            }
                            style={[
                              minTouchTarget,
                              {
                                flex: 1,
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 12,
                                backgroundColor: selected
                                  ? colors.primary
                                  : colors.muted,
                              },
                            ]}
                          >
                            <Text
                              className={
                                selected
                                  ? "text-primary-foreground text-sm font-semibold"
                                  : "text-muted-foreground text-sm font-semibold"
                              }
                            >
                              {days}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <Pressable
                        testID={`${testID}-days-decrease`}
                        accessibilityRole="button"
                        accessibilityLabel="One session a week fewer"
                        disabled={state.training_days_per_week <= 1}
                        onPress={() =>
                          update((prev) =>
                            withTrainingDays(
                              prev,
                              prev.training_days_per_week - 1,
                            ),
                          )
                        }
                        style={[
                          minTouchTarget,
                          {
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 12,
                            backgroundColor: colors.muted,
                            opacity: state.training_days_per_week <= 1 ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Minus size={18} color={colors["muted-foreground"]} />
                      </Pressable>
                      <Text
                        testID={`${testID}-days-value`}
                        className="text-foreground text-base font-semibold"
                      >
                        {state.training_days_per_week}
                      </Text>
                      <Pressable
                        testID={`${testID}-days-increase`}
                        accessibilityRole="button"
                        accessibilityLabel="One session a week more"
                        disabled={
                          state.training_days_per_week >=
                          MAX_TRAINING_DAYS_PER_WEEK
                        }
                        onPress={() =>
                          update((prev) =>
                            withTrainingDays(
                              prev,
                              prev.training_days_per_week + 1,
                            ),
                          )
                        }
                        style={[
                          minTouchTarget,
                          {
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 12,
                            backgroundColor: colors.muted,
                            opacity:
                              state.training_days_per_week >=
                              MAX_TRAINING_DAYS_PER_WEEK
                                ? 0.5
                                : 1,
                          },
                        ]}
                      >
                        <Plus size={18} color={colors["muted-foreground"]} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Card>

              <Card testID={`${testID}-audience`} title="Target Audience">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {BUILDER_TARGET_USER_OPTIONS.map((option) => {
                    const selected = state.target_user === option;
                    return (
                      <Pressable
                        key={option}
                        testID={`${testID}-target-${slug(option)}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={option}
                        onPress={() => setField("target_user", option)}
                        style={[
                          minTouchTarget,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 999,
                            backgroundColor: selected
                              ? colors.primary
                              : colors.muted,
                          },
                        ]}
                      >
                        {selected ? (
                          <Check
                            size={14}
                            color={colors["primary-foreground"]}
                          />
                        ) : null}
                        <Text
                          className={
                            selected
                              ? "text-primary-foreground text-xs font-semibold"
                              : "text-muted-foreground text-xs font-semibold"
                          }
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>

              {/* REQUIRED EQUIPMENT (NP-281): the web's sixteen chips, green
                  when picked — `success` is the token for the web's
                  `bg-green-600`, and `brand-foreground` is white in BOTH
                  modes, which `primary-foreground` is not. */}
              <Card testID={`${testID}-equipment`} title="Required Equipment">
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {BUILDER_EQUIPMENT_OPTIONS.map((item) => {
                    const selected = state.equipment.includes(item);
                    return (
                      <Pressable
                        key={item}
                        testID={`${testID}-equipment-${slug(item)}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={item}
                        onPress={() =>
                          update((prev) => toggleBuilderEquipment(prev, item))
                        }
                        style={[
                          minTouchTarget,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 999,
                            backgroundColor: selected
                              ? colors.success
                              : colors.muted,
                          },
                        ]}
                      >
                        {selected ? (
                          <Check
                            size={14}
                            color={colors["brand-foreground"]}
                          />
                        ) : null}
                        {/* The ink is INLINE, like every other coloured chip
                            in the app: `brand-foreground` is white in BOTH
                            modes, and `primary-foreground` would flip to dark
                            ink in dark mode and vanish on the green. */}
                        <Text
                          className="text-xs font-semibold"
                          style={{
                            color: selected
                              ? colors["brand-foreground"]
                              : colors["muted-foreground"],
                          }}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            </View>
          ) : null}

          {/* ── Step 2: phases and the sessions in them ────────────────── */}
          {step === 1 ? (
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text className="text-foreground text-base font-semibold">
                  {`Program Phases (${state.phases.length})`}
                </Text>
                <Button
                  testID={`${testID}-add-phase`}
                  size="sm"
                  icon={<Plus size={14} color={colors["primary-foreground"]} />}
                  accessibilityLabel="Add a phase"
                  onPress={() => update((prev) => addPhase(prev))}
                >
                  Add Phase
                </Button>
              </View>

              {state.phases.map((phase, phaseIndex) => {
                const dupes = validation.duplicateDays[phaseIndex] ?? [];
                const expanded = collapsed[phaseIndex] !== true;
                const dayIndex = Math.min(
                  activeDay[phaseIndex] ?? 0,
                  Math.max(0, phase.workouts.length - 1),
                );
                const workout = phase.workouts[dayIndex];
                return (
                  <View
                    key={`phase-${phaseIndex}`}
                    testID={`${testID}-phase-${phaseIndex}`}
                    className="bg-card rounded-2xl border border-border"
                    style={{ overflow: "hidden" }}
                  >
                    {/* THE PHASE HEADER (the web's): a number badge, the
                        label, `Weeks 1-4 • 2 workouts`, remove, and the
                        collapse chevron. */}
                    <Pressable
                      testID={`${testID}-phase-${phaseIndex}-header`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      accessibilityLabel={`${phase.phase}, ${expanded ? "collapse" : "expand"}`}
                      onPress={() =>
                        setCollapsed((prev) => ({
                          ...prev,
                          [phaseIndex]: expanded,
                        }))
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        backgroundColor: tint("muted", 0.6),
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Text className="text-primary-foreground text-sm font-bold">
                          {phaseIndex + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text className="text-foreground text-base font-semibold">
                          {phase.phase}
                        </Text>
                        <Text
                          testID={`${testID}-phase-${phaseIndex}-summary`}
                          className="text-muted-foreground text-sm"
                        >
                          {`${phase.weeks.trim() ? `Weeks ${phase.weeks.trim()}` : "Set weeks..."} • ${phase.workouts.length} workout${phase.workouts.length === 1 ? "" : "s"}`}
                        </Text>
                      </View>
                      {state.phases.length > 1 ? (
                        <Pressable
                          testID={`${testID}-phase-${phaseIndex}-remove`}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${phase.phase}`}
                          hitSlop={hitSlopToMinTarget(28, 28)}
                          onPress={() => setConfirmRemovePhase(phaseIndex)}
                          style={{
                            width: 28,
                            height: 28,
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 8,
                          }}
                        >
                          <Trash2 size={16} color={colors.destructive} />
                        </Pressable>
                      ) : null}
                      {expanded ? (
                        <ChevronUp
                          size={18}
                          color={colors["muted-foreground"]}
                        />
                      ) : (
                        <ChevronDown
                          size={18}
                          color={colors["muted-foreground"]}
                        />
                      )}
                    </Pressable>

                    {expanded ? (
                      <View
                        className="border-t border-border"
                        style={{ padding: 12, gap: 12 }}
                      >
                        <Input
                          testID={`${testID}-phase-${phaseIndex}-weeks`}
                          label="Weeks Range *"
                          placeholder="e.g. 1-4"
                          value={phase.weeks}
                          onChangeText={(text) =>
                            update((prev) =>
                              updatePhase(prev, phaseIndex, { weeks: text }),
                            )
                          }
                        />
                        <Input
                          testID={`${testID}-phase-${phaseIndex}-focus`}
                          label="Phase Focus *"
                          placeholder="e.g. Build a base"
                          value={phase.focus}
                          onChangeText={(text) =>
                            update((prev) =>
                              updatePhase(prev, phaseIndex, { focus: text }),
                            )
                          }
                        />

                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <Text className="text-muted-foreground text-xs font-semibold">
                            WORKOUTS
                          </Text>
                          {phase.workouts.length > 1 ? (
                            <Pressable
                              testID={`${testID}-phase-${phaseIndex}-copy`}
                              accessibilityRole="button"
                              accessibilityState={{
                                expanded: copyMenu === phaseIndex,
                              }}
                              accessibilityLabel={`Copy ${workout?.day.trim() || `workout ${dayIndex + 1}`} to another day`}
                              onPress={() =>
                                setCopyMenu((prev) =>
                                  prev === phaseIndex ? null : phaseIndex,
                                )
                              }
                              style={[
                                minTouchTarget,
                                {
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <Copy
                                size={13}
                                color={colors["muted-foreground"]}
                              />
                              <Text className="text-muted-foreground text-xs">
                                Copy current to...
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>

                        {copyMenu === phaseIndex ? (
                          <View
                            testID={`${testID}-phase-${phaseIndex}-copy-menu`}
                            className="border border-border rounded-xl"
                            style={{ padding: 4, gap: 2 }}
                          >
                            {phase.workouts.map((target, targetIndex) =>
                              targetIndex === dayIndex ? null : (
                                <Pressable
                                  key={`copy-${targetIndex}`}
                                  testID={`${testID}-phase-${phaseIndex}-copy-to-${targetIndex}`}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Copy this workout over ${target.day.trim() || `workout ${targetIndex + 1}`}`}
                                  onPress={() => {
                                    setCopyMenu(null);
                                    update((prev) =>
                                      copyWorkout(
                                        prev,
                                        phaseIndex,
                                        dayIndex,
                                        targetIndex,
                                      ),
                                    );
                                  }}
                                  style={[
                                    minTouchTarget,
                                    {
                                      justifyContent: "center",
                                      paddingHorizontal: 12,
                                      borderRadius: 10,
                                    },
                                  ]}
                                >
                                  <Text className="text-foreground text-sm">
                                    {target.day.trim() ||
                                      `Workout ${targetIndex + 1}`}
                                  </Text>
                                </Pressable>
                              ),
                            )}
                          </View>
                        ) : null}

                        {/* THE DAY TABS (the web's): one session open at a
                            time, every session one tap away. */}
                        <ScrollView
                          testID={`${testID}-phase-${phaseIndex}-days`}
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                        >
                          {phase.workouts.map((tab, tabIndex) => {
                            const selected = tabIndex === dayIndex;
                            return (
                              <Pressable
                                key={`day-tab-${tabIndex}`}
                                testID={`${testID}-phase-${phaseIndex}-day-${tabIndex}`}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`${tab.day.trim() || `Workout ${tabIndex + 1}`}${tab.title.trim() ? `, ${tab.title.trim()}` : ", untitled"}`}
                                onPress={() => {
                                  setCopyMenu(null);
                                  setActiveDay((prev) => ({
                                    ...prev,
                                    [phaseIndex]: tabIndex,
                                  }));
                                }}
                                style={[
                                  minTouchTarget,
                                  {
                                    justifyContent: "center",
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    borderRadius: 12,
                                    backgroundColor: selected
                                      ? colors.primary
                                      : colors.muted,
                                  },
                                ]}
                              >
                                <Text
                                  className={
                                    selected
                                      ? "text-primary-foreground text-xs"
                                      : "text-muted-foreground text-xs"
                                  }
                                >
                                  {tab.day.trim() || `Workout ${tabIndex + 1}`}
                                </Text>
                                <Text
                                  className={
                                    selected
                                      ? "text-primary-foreground text-sm font-semibold"
                                      : "text-muted-foreground text-sm font-semibold"
                                  }
                                >
                                  {tab.title.trim() || "Untitled"}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>

                        {workout ? (
                          <View
                            testID={`${testID}-phase-${phaseIndex}-workout-${dayIndex}`}
                            className="border border-border rounded-xl"
                            style={{ padding: 12, gap: 12 }}
                          >
                            <Input
                              testID={`${testID}-phase-${phaseIndex}-workout-${dayIndex}-day`}
                              label="Day label"
                              placeholder="e.g. Day 1"
                              value={workout.day}
                              onChangeText={(text) =>
                                update((prev) =>
                                  updateWorkout(prev, phaseIndex, dayIndex, {
                                    day: text,
                                  }),
                                )
                              }
                            />
                            <Input
                              testID={`${testID}-phase-${phaseIndex}-workout-${dayIndex}-title`}
                              label="Workout Title *"
                              placeholder="e.g. Upper Power"
                              value={workout.title}
                              onChangeText={(text) =>
                                update((prev) =>
                                  updateWorkout(prev, phaseIndex, dayIndex, {
                                    title: text,
                                  }),
                                )
                              }
                            />
                            <BuilderWorkoutExercises
                              testID={`${testID}-phase-${phaseIndex}-workout-${dayIndex}`}
                              exercises={workout.exercises}
                              onAdd={(
                                selection: ExercisePickerSelection,
                                defaults?: Partial<BuilderExercise>,
                              ) =>
                                update((prev) =>
                                  addBuilderExercise(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    selection.exerciseSlug,
                                    selection.name,
                                    defaults,
                                  ),
                                )
                              }
                              onChange={(
                                exerciseIndex: number,
                                patch: Partial<BuilderExercise>,
                              ) =>
                                update((prev) =>
                                  updateBuilderExercise(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    exerciseIndex,
                                    patch,
                                  ),
                                )
                              }
                              onRemove={(exerciseIndex: number) =>
                                update((prev) =>
                                  removeBuilderExercise(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    exerciseIndex,
                                  ),
                                )
                              }
                              onReorder={(fromIndex: number, toIndex: number) =>
                                update((prev) =>
                                  moveBuilderExercise(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    fromIndex,
                                    toIndex,
                                  ),
                                )
                              }
                              onGroup={(
                                indexes: number[],
                                groupType: BuilderGroupType,
                              ) =>
                                update((prev) =>
                                  groupBuilderExercises(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    indexes,
                                    groupType,
                                  ),
                                )
                              }
                              onUngroup={(exerciseIndex: number) =>
                                update((prev) =>
                                  ungroupBuilderExercises(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    exerciseIndex,
                                  ),
                                )
                              }
                              onRemoveFromGroup={(exerciseIndex: number) =>
                                update((prev) =>
                                  removeBuilderExerciseFromGroup(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    exerciseIndex,
                                  ),
                                )
                              }
                              onUpdateGroup={(
                                exerciseIndex: number,
                                patch: Partial<
                                  Pick<
                                    BuilderExercise,
                                    "groupLabel" | "groupRest" | "groupRounds"
                                  >
                                >,
                              ) =>
                                update((prev) =>
                                  updateBuilderGroup(
                                    prev,
                                    phaseIndex,
                                    dayIndex,
                                    exerciseIndex,
                                    patch,
                                  ),
                                )
                              }
                            />
                            {phase.workouts.length > 1 ? (
                              <View
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <Pressable
                                  testID={`${testID}-phase-${phaseIndex}-workout-${dayIndex}-remove`}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Remove ${workout.day || `workout ${dayIndex + 1}`} from ${phase.phase}`}
                                  onPress={() => {
                                    setActiveDay((prev) => ({
                                      ...prev,
                                      [phaseIndex]: Math.max(0, dayIndex - 1),
                                    }));
                                    update((prev) =>
                                      removeWorkout(prev, phaseIndex, dayIndex),
                                    );
                                  }}
                                  style={[
                                    minTouchTarget,
                                    {
                                      flexDirection: "row",
                                      alignItems: "center",
                                      justifyContent: "flex-end",
                                      gap: 6,
                                      paddingHorizontal: 8,
                                    },
                                  ]}
                                >
                                  <Trash2 size={14} color={colors.destructive} />
                                  <Text className="text-destructive text-xs font-semibold">
                                    Remove
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        ) : null}

                        {dupes.length > 0 ? (
                          <Text
                            testID={`${testID}-phase-${phaseIndex}-day-error`}
                            accessibilityRole="alert"
                            className="text-destructive text-xs"
                          >
                            {`“${dupes.join("”, “")}” is used more than once. Your schedule and your logs are keyed on the day label, so each one has to be unique inside a phase.`}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Button
                            testID={`${testID}-phase-${phaseIndex}-add-workout`}
                            variant="secondary"
                            size="sm"
                            accessibilityLabel={`Add a workout to ${phase.phase}`}
                            onPress={() => {
                              setActiveDay((prev) => ({
                                ...prev,
                                [phaseIndex]: phase.workouts.length,
                              }));
                              update((prev) => addWorkout(prev, phaseIndex));
                            }}
                          >
                            Add workout
                          </Button>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* ── Step 3: what is about to be saved ─────────────────────── */}
          {step === 2 ? (
            <Card testID={`${testID}-review`} title="Review">
              <View style={{ gap: 6 }}>
                <Text
                  testID={`${testID}-summary`}
                  className="text-foreground text-sm"
                >
                  {`${state.name.trim() || "Untitled program"} — ${state.phases.length} phase${state.phases.length === 1 ? "" : "s"}, ${sessions} workout${sessions === 1 ? "" : "s"}, ${state.duration_weeks} week${state.duration_weeks === 1 ? "" : "s"}`}
                </Text>
                {state.goal.trim() ? (
                  <Text className="text-muted-foreground text-sm">
                    {`Goal: ${state.goal.trim()}`}
                  </Text>
                ) : null}
                <Text
                  testID={`${testID}-review-equipment`}
                  className="text-muted-foreground text-sm"
                >
                  {`Equipment: ${state.equipment.length > 0 ? state.equipment.join(", ") : "None selected"}`}
                </Text>
                {state.phases.map((phase, phaseIndex) => (
                  <Text
                    key={`review-phase-${phaseIndex}`}
                    testID={`${testID}-review-phase-${phaseIndex}`}
                    className="text-muted-foreground text-xs"
                  >
                    {`${phase.phase}${phase.weeks.trim() ? ` · weeks ${phase.weeks.trim()}` : ""} · ${phase.workouts.map((w) => `${w.day.trim()} (${w.exercises.length})`).join(", ")}`}
                  </Text>
                ))}
              </View>
            </Card>
          ) : null}

          {/* The problems: on the review step, where they answer "why can I not
              save this?", and after a refused save from anywhere else. Not under
              a form nobody has filled in yet — that is just noise. */}
          {(showProblems || step === 2) && validation.errors.length > 0 ? (
            <View testID={`${testID}-validation`} style={{ gap: 4 }}>
              {validation.errors.map((line, index) => (
                <Text
                  key={`error-${index}`}
                  accessibilityRole="alert"
                  className="text-destructive text-xs"
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {/* The server's words, verbatim. A plan refusal never lands here: the
              route hands a 403 to the upgrade sheet (NP-052). */}
          {error ? (
            <Text
              testID={`${testID}-error`}
              accessibilityRole="alert"
              className="text-destructive text-xs"
            >
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 8 }}>
            {step > 0 ? (
              <Button
                testID={`${testID}-back`}
                variant="ghost"
                onPress={() => setStep((prev) => Math.max(0, prev - 1))}
              >
                Back
              </Button>
            ) : onCancel ? (
              <Button
                testID={`${testID}-cancel`}
                variant="ghost"
                onPress={onCancelPress}
              >
                Cancel
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button
                testID={`${testID}-next`}
                onPress={() => {
                  Keyboard.dismiss();
                  setStep((prev) => Math.min(STEPS.length - 1, prev + 1));
                }}
              >
                Next
              </Button>
            ) : (
              <Button
                testID={`${testID}-save`}
                loading={saving}
                disabled={saving}
                accessibilityLabel={
                  mode === "create" ? "Create this program" : "Save changes"
                }
                onPress={onSave}
              >
                {mode === "create" ? "Create program" : "Save changes"}
              </Button>
            )}
          </View>
        </Pressable>
      </ScrollView>

      {/* THE FLOATING SAVE (NP-281) — the web's fixed pill, always reachable
          so saving never means stepping through to Review first. It sits over
          the scroll rather than in it, which is why this component owns the
          ScrollView. `box-none` so the empty space around it is not a
          tap-eating overlay. */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", right: 16, bottom: 16 }}
      >
        <Pressable
          testID={`${testID}-floating-save`}
          accessibilityRole="button"
          accessibilityState={{ disabled: saveDisabled }}
          accessibilityLabel={
            mode === "create" ? "Save program" : "Update program"
          }
          disabled={saveDisabled}
          onPress={onSave}
          style={[
            minTouchTarget,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingHorizontal: 20,
              borderRadius: 999,
              backgroundColor: savePillColor,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator
              size="small"
              color={colors["brand-foreground"]}
            />
          ) : (
            <Check
              size={16}
              color={
                saveDisabled
                  ? colors["muted-foreground"]
                  : colors["brand-foreground"]
              }
            />
          )}
          <Text
            className="text-sm font-semibold"
            style={{
              color: saveDisabled
                ? colors["muted-foreground"]
                : colors["brand-foreground"],
            }}
          >
            {saveLabel}
          </Text>
        </Pressable>
      </View>

      <Modal
        testID={`${testID}-remove-phase-modal`}
        visible={confirmRemovePhase !== null}
        onClose={() => setConfirmRemovePhase(null)}
        title="Remove this phase?"
      >
        <Text className="text-muted-foreground text-sm mb-4">
          {removeTarget
            ? `${removeTarget.phase} and its ${removeTarget.workouts.length} workout${removeTarget.workouts.length === 1 ? "" : "s"} will be removed.`
            : "This cannot be undone."}
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID={`${testID}-remove-phase-confirm`}
            variant="destructive"
            onPress={() => {
              const index = confirmRemovePhase;
              setConfirmRemovePhase(null);
              if (index !== null) {
                update((prev) => removePhase(prev, index));
              }
            }}
          >
            Yes, remove it
          </Button>
          <Button
            testID={`${testID}-remove-phase-cancel`}
            variant="ghost"
            onPress={() => setConfirmRemovePhase(null)}
          >
            Keep it
          </Button>
        </View>
      </Modal>
    </View>
  );
}

export default ProgramBuilder;
