import { useState } from "react";
import { Pressable, View } from "react-native";
import { Lightbulb, Pencil, Play, Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import {
  canEditCustomProgram,
  type CustomProgramSummary,
} from "@/lib/programs/customPrograms";
import { PROGRAM_TOUR_STEPS } from "@/lib/programs/programTour";

export interface MyProgramsProps {
  programs: CustomProgramSummary[];
  /** Enrol in this program (opens the enrol flow). */
  onEnroll?: (id: string) => void | Promise<void>;
  /** Delete this owned program (caller confirms first — see below). */
  onDelete?: (id: string) => void | Promise<void>;
  /** Open a program's detail screen. */
  onItemPress?: (id: string) => void;
  /** Open the editor for this owned program (native builder, NP-171). */
  onEdit?: (id: string) => void | Promise<void>;
  /** Open the creator (native builder, NP-171). */
  onCreate?: () => void | Promise<void>;
  /** True while one enrol request is in flight (disables its row button). */
  enrollingId?: string | null;
  /** True while one delete request is in flight (disables its row button). */
  deletingId?: string | null;
  testID?: string;
}

/**
 * THE MY-PROGRAMS LIST — the rows a member built themselves on the web.
 *
 * Native counterpart of the list in
 * `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`: enrol on every
 * row, edit + delete on rows the member OWNS, and nothing but enrol on rows a
 * trainer shared with them (`isOwner === false`).
 *
 * Delete is a TWO-TAP confirm inside the app (a `Modal`, not `Alert`): the
 * web asks with `confirm()`, and `Alert.alert` has no web equivalent in this
 * codebase and renders nothing in jest, so a modal is what a test can press.
 */
export function MyPrograms({
  programs,
  onEnroll,
  onDelete,
  onItemPress,
  onEdit,
  onCreate,
  enrollingId = null,
  deletingId = null,
  testID = "my-programs",
}: MyProgramsProps) {
  const { colors, tint } = useThemeTokens();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The empty state's "Walk me through it" (NP-330): web starts its 8-step
  // "Design your own program" tour (dots + this same label on step 1)
  // instead of jumping straight to the builder — this index tracks which of
  // `PROGRAM_TOUR_STEPS` is on screen, `null` meaning the tour is closed.
  const [tourStepIndex, setTourStepIndex] = useState<number | null>(null);

  const confirmTarget = confirmId
    ? (programs.find((p) => p.id === confirmId) ?? null)
    : null;

  const closeConfirm = () => setConfirmId(null);

  const confirmDelete = () => {
    const id = confirmId;
    setConfirmId(null);
    if (id) void onDelete?.(id);
  };

  // `noUncheckedIndexedAccess` makes `ARRAY[i]` read `T | undefined`
  // regardless of any bounds check on `i` itself — resolved once, here,
  // rather than re-indexing (and re-asserting) at every render site below.
  const currentTourStep =
    tourStepIndex !== null ? PROGRAM_TOUR_STEPS[tourStepIndex] ?? null : null;

  const closeTour = () => setTourStepIndex(null);

  // Advance one step; past the last one, close the tour and open the
  // builder — the web's last step keeps its own "Save" nudge in view, native
  // has nowhere to land but the builder itself.
  const advanceTour = () => {
    setTourStepIndex((current) => {
      if (current === null) return null;
      const next = current + 1;
      if (next >= PROGRAM_TOUR_STEPS.length) {
        void onCreate?.();
        return null;
      }
      return next;
    });
  };

  if (programs.length === 0) {
    // Native counterpart of the web's `EmptyState` on
    // `MyProgramsClient.tsx`: an icon circle, title + description, and the
    // "Create Your First Program" CTA — plus a nudge toward the creator in
    // the words of the web's onboarding tour
    // (`webapp/lib/tutorials/sections/programs.ts`'s `programs-new` segment).
    // "Walk me through it" steps through that 8-step tour's copy (dots +
    // Next, see `PROGRAM_TOUR_STEPS`) before landing on the same creator
    // `onCreate` opens (NP-330) — the interactive spotlight overlay ITSELF
    // stays a later decision for native (NP-164, PARITY_GAP_ANALYSIS.md
    // §"Guided tour"), since there is no DOM to anchor it to.
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16, gap: 16 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.muted,
            }}
          >
            <Plus size={28} color={colors["muted-foreground"]} />
          </View>
          {/*
            NP-330: Android measured this bold title narrower than it drew
            it, clipping the last word ("yet") once the screen re-rendered —
            `numberOfLines` plus an explicit full-width, padded box makes it
            wrap instead of clip, at any font scale.
          */}
          <Text
            className="text-foreground text-base font-semibold text-center"
            numberOfLines={3}
            style={{ alignSelf: "stretch", paddingHorizontal: 8 }}
          >
            You haven&apos;t created any custom programs yet
          </Text>
          <Text className="text-muted-foreground text-sm text-center">
            Build your own training program tailored to your goals.
          </Text>
          {onCreate ? (
            <View style={{ marginTop: 4, alignSelf: "stretch", alignItems: "center" }}>
              {/*
                NP-330: the same Android clipping bug ("Create Your First
                Progra") traced back to this label being a `<Text>` nested
                INSIDE `Button`'s own wrapping `<Text>` (via a `View` child) —
                invalid text nesting that measures fine in Jest but not on a
                real Android TextView. A plain `Pressable` with the icon and
                label as SIBLINGS, the label `flexShrink`-able and allowed two
                lines, fixes the measurement instead of papering over it.
              */}
              <Pressable
                testID={`${testID}-create-empty`}
                onPress={() => void onCreate()}
                accessibilityRole="button"
                accessibilityLabel="Create your first program"
                style={[
                  minTouchTarget,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: colors.success,
                    maxWidth: "100%",
                  },
                ]}
              >
                <Plus size={16} color={colors["primary-foreground"]} />
                <Text
                  className="text-primary-foreground text-sm font-semibold"
                  style={WRAPPABLE_TEXT}
                  numberOfLines={2}
                >
                  Create Your First Program
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {onCreate ? (
          <Card testID={`${testID}-empty-tip`}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Lightbulb size={18} color={colors.accent} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text className="text-foreground text-sm font-semibold">
                  Design your own program
                </Text>
                <Text className="text-muted-foreground text-xs leading-relaxed">
                  Pick the exercises, prescribe the sets and reps, and
                  structure it in phases — then follow it with the same live
                  workout view as coach-built programs.
                </Text>
                <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
                  <Button
                    testID={`${testID}-empty-tip-cta`}
                    variant="inverted"
                    size="sm"
                    onPress={() => setTourStepIndex(0)}
                    accessibilityLabel="Walk me through it"
                  >
                    Walk me through it
                  </Button>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {/*
          NP-330: web's own 8-step "Design your own program" tour (dots +
          "Walk me through it" on step 1) that starts automatically on
          `/dashboard/programs/new` — "Walk me through it" on native used to
          skip straight to the builder, which is the bug this closes. The
          interactive spotlight overlay itself stays NP-164 (no DOM to anchor
          to); this is the same copy, stepped through with dots, ending in
          the same creator `onCreate` opens either way.
        */}
        <Modal
          testID={`${testID}-tour-modal`}
          visible={currentTourStep !== null}
          onClose={closeTour}
          title={currentTourStep?.title}
        >
          {currentTourStep ? (
            <View style={{ gap: 16 }}>
              <Text className="text-muted-foreground text-sm leading-relaxed">
                {currentTourStep.body}
              </Text>
              <View
                testID={`${testID}-tour-dots`}
                style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}
              >
                {PROGRAM_TOUR_STEPS.map((_, i) => (
                  <View
                    key={i}
                    testID={`${testID}-tour-dot-${i}`}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === tourStepIndex ? colors.accent : colors.muted,
                    }}
                  />
                ))}
              </View>
              <View style={{ gap: 8 }}>
                <Button
                  testID={`${testID}-tour-next`}
                  variant="inverted"
                  onPress={advanceTour}
                >
                  {currentTourStep.nextLabel}
                </Button>
                <Button
                  testID={`${testID}-tour-skip`}
                  variant="ghost"
                  onPress={closeTour}
                >
                  Skip
                </Button>
              </View>
            </View>
          ) : null}
        </Modal>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 12, padding: 16 }}>
      {programs.map((p) => {
        const editable = canEditCustomProgram(p);
        const enrolling = enrollingId === p.id;
        const deleting = deletingId === p.id;
        return (
          <Card key={p.id} testID={`${testID}-item-${p.id}`} title={p.name}>
            <Pressable
              testID={`${testID}-open-${p.id}`}
              onPress={() => onItemPress?.(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open program ${p.name}`}
            >
              {p.description ? (
                <Text
                  className="text-muted-foreground text-sm"
                  numberOfLines={2}
                >
                  {p.description}
                </Text>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                {typeof p.durationWeeks === "number" ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-muted-foreground text-xs font-medium">
                      {p.durationWeeks}w
                    </Text>
                  </View>
                ) : null}
                {typeof p.trainingDaysPerWeek === "number" ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-muted-foreground text-xs font-medium">
                      {p.trainingDaysPerWeek}x/wk
                    </Text>
                  </View>
                ) : null}
                {p.isOwner ? (
                  <View className="rounded-full bg-purple-500/10 px-2 py-0.5 border border-purple-500/20">
                    <Text className="text-xs font-medium text-purple-500">
                      Custom
                    </Text>
                  </View>
                ) : (
                  <View className="rounded-full bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
                    <Text className="text-xs font-medium text-blue-500">
                      {p.sharedByName ? `Shared by ${p.sharedByName}` : "Shared"}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
              }}
            >
              <Pressable
                testID={`${testID}-enroll-${p.id}`}
                onPress={() => void onEnroll?.(p.id)}
                disabled={enrolling}
                accessibilityRole="button"
                accessibilityLabel={`Enroll in ${p.name}`}
                style={[
                  minTouchTarget,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    // Enroll is a positive, non-destructive action — the
                    // web's `bg-green-600`, native's `success` token (NP-282).
                    backgroundColor: colors.success,
                    opacity: enrolling ? 0.5 : 1,
                  },
                ]}
              >
                <Play size={14} color={colors["primary-foreground"]} />
                <Text className="text-primary-foreground text-xs font-semibold">
                  {enrolling ? "Enrolling…" : "Enroll"}
                </Text>
              </Pressable>

              {editable && onEdit ? (
                <Pressable
                  testID={`${testID}-edit-${p.id}`}
                  onPress={() => void onEdit(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${p.name}`}
                  style={[
                    minTouchTarget,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.muted,
                    },
                  ]}
                >
                  <Pencil size={14} color={colors["muted-foreground"]} />
                  <Text className="text-muted-foreground text-xs font-semibold">
                    Edit
                  </Text>
                </Pressable>
              ) : null}

              {editable && onDelete ? (
                <Pressable
                  testID={`${testID}-delete-${p.id}`}
                  onPress={() => setConfirmId(p.id)}
                  disabled={deleting}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${p.name}`}
                  style={[
                    minTouchTarget,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      // The web's Delete is a LIGHT red text button
                      // (`bg-red-50 text-red-600`, `dark:bg-red-900/20
                      // dark:text-red-400`) — a tint of `destructive`, not a
                      // solid fill (NP-282). Enroll stays the only solid
                      // action pill on the row.
                      backgroundColor: tint("destructive", 0.12),
                      opacity: deleting ? 0.5 : 1,
                    },
                  ]}
                >
                  <Trash2 size={14} color={colors.destructive} />
                  <Text className="text-destructive text-xs font-semibold">
                    {deleting ? "Deleting…" : "Delete"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Modal
        testID={`${testID}-delete-modal`}
        visible={confirmTarget !== null}
        onClose={closeConfirm}
        title="Delete this program?"
      >
        <Text className="text-muted-foreground text-sm mb-4">
          {confirmTarget
            ? `“${confirmTarget.name}” will be gone for good. This cannot be undone.`
            : "This cannot be undone."}
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID={`${testID}-delete-confirm`}
            variant="destructive"
            onPress={confirmDelete}
          >
            Yes, delete it
          </Button>
          <Button
            testID={`${testID}-delete-cancel`}
            variant="ghost"
            onPress={closeConfirm}
          >
            Keep it
          </Button>
        </View>
      </Modal>
    </View>
  );
}

export default MyPrograms;
