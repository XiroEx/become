import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Minus, Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  BUILDER_TARGET_USER_OPTIONS,
  MAX_DURATION_WEEKS,
  MAX_TRAINING_DAYS_PER_WEEK,
  type CustomProgramBuilderPayload,
  type ProgramBuilderState,
  addPhase,
  addWorkout,
  clampDurationWeeks,
  emptyProgramBuilderState,
  removePhase,
  removeWorkout,
  toCustomProgramPayload,
  totalWorkouts,
  updatePhase,
  updateWorkout,
  validateProgram,
  withTrainingDays,
} from "@/lib/programs/programBuilder";
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
  { key: "details", title: "Details" },
  { key: "phases", title: "Phases" },
  { key: "review", title: "Review" },
] as const;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * THE NATIVE PROGRAM BUILDER — the frame (NP-168).
 *
 * Native counterpart of `ProgramCreator.tsx` + `PhaseEditor.tsx`: program
 * details, phases with their week ranges and focus, and the sessions inside
 * them with their day labels and titles. Exercise rows are NP-171 and drag
 * reorder NP-172; the exercises a workout already has are shown as a count and
 * ride through every save untouched.
 *
 * Everything it knows about a program is in `lib/programs/programBuilder.ts`,
 * which is where the three rules live (schema fields only, unique day labels,
 * the strings the web editor calls `.trim()` on during render). This file is
 * the surface: three steps, one save, and the draft.
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
  const { colors } = useThemeTokens();
  const [state, setState] = useState<ProgramBuilderState>(
    () => initialState ?? emptyProgramBuilderState(),
  );
  const [step, setStep] = useState(0);
  const [draftRestored, setDraftRestored] = useState(false);
  const [confirmRemovePhase, setConfirmRemovePhase] = useState<number | null>(
    null,
  );
  const [showProblems, setShowProblems] = useState(false);
  /**
   * The draft has been READ. Nothing is written back before it is, or the
   * blank first render would delete the draft this mount is about to restore
   * — both effects fire on the same mount, and the write is not ordered
   * against the read.
   */
  const [draftLoaded, setDraftLoaded] = useState(false);
  const seededRef = useRef(initialState !== null);
  const draftReadRef = useRef(false);

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
        setDraftRestored(true);
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
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const onSave = useCallback(() => {
    // At the cap, the answer is the upgrade sheet and it does not depend on
    // the program being finished — hand over without validating.
    if (!locked && !validation.canSave) {
      setShowProblems(true);
      return;
    }
    void onSubmit(toCustomProgramPayload(state));
  }, [locked, onSubmit, state, validation.canSave]);

  const removeTarget =
    confirmRemovePhase !== null ? state.phases[confirmRemovePhase] : undefined;

  return (
    <View testID={testID} style={{ gap: 16 }}>
      {/* The three steps, as pills — the web's stepper, with one difference:
          every step stays reachable. The web disables a later pill until the
          one before it validates; on a phone that reads as a broken tab, and
          Save already refuses with the list of what is missing. */}
      <View
        testID={`${testID}-steps`}
        style={{ flexDirection: "row", gap: 8 }}
      >
        {STEPS.map((s, index) => {
          const selected = index === step;
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
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: selected ? colors.primary : colors.muted,
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

      {/* ── Step 1: the program itself ─────────────────────────────────── */}
      {step === 0 ? (
        <Card testID={`${testID}-details`} title="Program details">
          <View style={{ gap: 12 }}>
            <Input
              testID={`${testID}-name`}
              label="Name"
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
              label="Goal"
              placeholder="e.g. Build strength"
              value={state.goal}
              onChangeText={(text) => setField("goal", text)}
            />
            <Input
              testID={`${testID}-weeks`}
              label={`Length in weeks (1–${MAX_DURATION_WEEKS})`}
              keyboardType="number-pad"
              value={String(state.duration_weeks)}
              onChangeText={(text) => {
                const digits = text.replace(/[^0-9]/g, "");
                if (digits === "") return;
                setField("duration_weeks", clampDurationWeeks(Number(digits)));
              }}
            />

            {/* A STEPPER, not a text field: this number resizes every phase,
                and a half-typed "" would have to mean 1. */}
            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Sessions a week
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Pressable
                  testID={`${testID}-days-decrease`}
                  accessibilityRole="button"
                  accessibilityLabel="One session a week fewer"
                  disabled={state.training_days_per_week <= 1}
                  onPress={() =>
                    setState((prev) =>
                      withTrainingDays(prev, prev.training_days_per_week - 1),
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
                    state.training_days_per_week >= MAX_TRAINING_DAYS_PER_WEEK
                  }
                  onPress={() =>
                    setState((prev) =>
                      withTrainingDays(prev, prev.training_days_per_week + 1),
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

            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Who it is for
              </Text>
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
                        <Check size={14} color={colors["primary-foreground"]} />
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
            </View>
          </View>
        </Card>
      ) : null}

      {/* ── Step 2: phases and the sessions in them ────────────────────── */}
      {step === 1 ? (
        <View style={{ gap: 12 }}>
          {state.phases.map((phase, phaseIndex) => {
            const dupes = validation.duplicateDays[phaseIndex] ?? [];
            return (
              <Card
                key={`phase-${phaseIndex}`}
                testID={`${testID}-phase-${phaseIndex}`}
                title={phase.phase}
                subtitle={`${phase.workouts.length} workout${phase.workouts.length === 1 ? "" : "s"}`}
              >
                <View style={{ gap: 12 }}>
                  <Input
                    testID={`${testID}-phase-${phaseIndex}-weeks`}
                    label="Weeks"
                    placeholder="e.g. 1-4"
                    value={phase.weeks}
                    onChangeText={(text) =>
                      setState((prev) =>
                        updatePhase(prev, phaseIndex, { weeks: text }),
                      )
                    }
                  />
                  <Input
                    testID={`${testID}-phase-${phaseIndex}-focus`}
                    label="Focus"
                    placeholder="e.g. Build a base"
                    value={phase.focus}
                    onChangeText={(text) =>
                      setState((prev) =>
                        updatePhase(prev, phaseIndex, { focus: text }),
                      )
                    }
                  />

                  {phase.workouts.map((workout, workoutIndex) => (
                    <View
                      key={`workout-${workoutIndex}`}
                      testID={`${testID}-phase-${phaseIndex}-workout-${workoutIndex}`}
                      className="border border-border rounded-xl p-3"
                      style={{ gap: 8 }}
                    >
                      <Input
                        testID={`${testID}-phase-${phaseIndex}-workout-${workoutIndex}-day`}
                        label="Day label"
                        placeholder="e.g. Day 1"
                        value={workout.day}
                        onChangeText={(text) =>
                          setState((prev) =>
                            updateWorkout(prev, phaseIndex, workoutIndex, {
                              day: text,
                            }),
                          )
                        }
                      />
                      <Input
                        testID={`${testID}-phase-${phaseIndex}-workout-${workoutIndex}-title`}
                        label="Title"
                        placeholder="e.g. Upper Power"
                        value={workout.title}
                        onChangeText={(text) =>
                          setState((prev) =>
                            updateWorkout(prev, phaseIndex, workoutIndex, {
                              title: text,
                            }),
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
                        <Text
                          testID={`${testID}-phase-${phaseIndex}-workout-${workoutIndex}-exercises`}
                          className="text-muted-foreground text-xs"
                        >
                          {workout.exercises.length === 0
                            ? "No exercises yet"
                            : `${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"}`}
                        </Text>
                        {phase.workouts.length > 1 ? (
                          <Pressable
                            testID={`${testID}-phase-${phaseIndex}-workout-${workoutIndex}-remove`}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${workout.day || `workout ${workoutIndex + 1}`} from ${phase.phase}`}
                            onPress={() =>
                              setState((prev) =>
                                removeWorkout(prev, phaseIndex, workoutIndex),
                              )
                            }
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
                        ) : null}
                      </View>
                    </View>
                  ))}

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
                      onPress={() =>
                        setState((prev) => addWorkout(prev, phaseIndex))
                      }
                    >
                      Add workout
                    </Button>
                    {state.phases.length > 1 ? (
                      <Button
                        testID={`${testID}-phase-${phaseIndex}-remove`}
                        variant="ghost"
                        size="sm"
                        accessibilityLabel={`Remove ${phase.phase}`}
                        onPress={() => setConfirmRemovePhase(phaseIndex)}
                      >
                        Remove phase
                      </Button>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}

          <Button
            testID={`${testID}-add-phase`}
            variant="secondary"
            accessibilityLabel="Add a phase"
            onPress={() => setState((prev) => addPhase(prev))}
          >
            Add phase
          </Button>
        </View>
      ) : null}

      {/* ── Step 3: what is about to be saved ─────────────────────────── */}
      {step === 2 ? (
        <Card testID={`${testID}-review`} title="Review">
          <View style={{ gap: 6 }}>
            <Text testID={`${testID}-summary`} className="text-foreground text-sm">
              {`${state.name.trim() || "Untitled program"} — ${state.phases.length} phase${state.phases.length === 1 ? "" : "s"}, ${sessions} workout${sessions === 1 ? "" : "s"}, ${state.duration_weeks} week${state.duration_weeks === 1 ? "" : "s"}`}
            </Text>
            {state.goal.trim() ? (
              <Text className="text-muted-foreground text-sm">
                {`Goal: ${state.goal.trim()}`}
              </Text>
            ) : null}
            {state.phases.map((phase, phaseIndex) => (
              <Text
                key={`review-phase-${phaseIndex}`}
                testID={`${testID}-review-phase-${phaseIndex}`}
                className="text-muted-foreground text-xs"
              >
                {`${phase.phase}${phase.weeks.trim() ? ` · weeks ${phase.weeks.trim()}` : ""} · ${phase.workouts.map((w) => w.day.trim()).join(", ")}`}
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
            onPress={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button
            testID={`${testID}-next`}
            onPress={() => setStep((prev) => Math.min(STEPS.length - 1, prev + 1))}
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
                setState((prev) => removePhase(prev, index));
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
