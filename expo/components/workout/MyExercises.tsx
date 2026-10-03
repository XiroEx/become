import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, Clock, Dumbbell, Globe2, Pencil, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  CUSTOM_EXERCISE_TRACKING_LABELS,
  formatCustomMuscle,
  toCustomExerciseForm,
  type CustomExerciseFormValues,
  type CustomExerciseSummary,
} from "@/lib/workout/customExercises";

export interface MyExercisesProps {
  exercises: CustomExerciseSummary[];
  /** Save an edit (PATCH). */
  onSave?: (slug: string, values: CustomExerciseFormValues) => void | Promise<void>;
  /** Delete an owned exercise (caller confirms first — see below). */
  onDelete?: (slug: string) => void | Promise<void>;
  /** Submit for catalogue review (POST …/submit) / withdraw (DELETE …/submit). */
  onSubmitReview?: (slug: string) => void | Promise<void>;
  onWithdrawReview?: (slug: string) => void | Promise<void>;
  /** Open the web library signed in (demo upload + trim live there). */
  onOpenWebLibrary?: () => void | Promise<void>;
  /** Open the create form. */
  onCreate?: () => void | Promise<void>;
  savingSlug?: string | null;
  deletingSlug?: string | null;
  submittingSlug?: string | null;
  actionError?: string | null;
  testID?: string;
}

/**
 * THE MY-EXERCISES LIST — the rows a member built themselves on the web or
 * natively.
 *
 * Native counterpart of the list in
 * `webapp/app/dashboard/workout/library/ExerciseLibraryClient.tsx`: every row
 * expands to edit + delete + submit-for-review, and a row with a demo links
 * out to the web library because upload and trim stay web-only (NP-169).
 *
 * Delete is a TWO-TAP confirm inside the app (a `Modal`, not `Alert`): the
 * web asks with `confirm()`, and `Alert.alert` has no web equivalent in this
 * codebase and renders nothing in jest, so a modal is what a test can press.
 */
export function MyExercises({
  exercises,
  onSave,
  onDelete,
  onSubmitReview,
  onWithdrawReview,
  onOpenWebLibrary,
  onCreate,
  savingSlug = null,
  deletingSlug = null,
  submittingSlug = null,
  actionError = null,
  testID = "my-exercises",
}: MyExercisesProps) {
  const { colors } = useThemeTokens();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CustomExerciseFormValues | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  // Saving an edit replaces the row's content: close the edit form once the
  // save for THIS row settles, so the test (and the member) sees the row
  // again instead of a stale form. Derived during render would set state in
  // render; this syncs from the save completing, which lives outside React.
  const prevSavingSlug = useRef(savingSlug);
  useEffect(() => {
    if (prevSavingSlug.current !== null && savingSlug === null) {
      setEditingSlug(null);
      setEditValues(null);
    }
    prevSavingSlug.current = savingSlug;
  }, [savingSlug]);

  const confirmTarget = confirmSlug
    ? (exercises.find((e) => e.slug === confirmSlug) ?? null)
    : null;

  const closeConfirm = () => setConfirmSlug(null);

  const confirmDelete = () => {
    const slug = confirmSlug;
    setConfirmSlug(null);
    if (slug) void onDelete?.(slug);
  };

  const startEdit = (ex: CustomExerciseSummary) => {
    setEditingSlug(ex.slug);
    setEditValues(toCustomExerciseForm(ex));
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setEditValues(null);
  };

  const saveEdit = (slug: string) => {
    if (editValues) void onSave?.(slug, editValues);
  };

  if (exercises.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16, gap: 12 }}>
        <Text className="text-muted-foreground text-center text-sm">
          You haven&apos;t created any custom exercises yet. Build your own and
          use it in any workout or program.
        </Text>
        {onCreate ? (
          <Button
            testID={`${testID}-create-empty`}
            onPress={() => void onCreate()}
            accessibilityLabel="Create your first exercise"
          >
            Create your first exercise
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 12, padding: 16 }}>
      {actionError ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          className="text-destructive text-xs"
        >
          {actionError}
        </Text>
      ) : null}
      {exercises.map((ex) => {
        const expanded = expandedSlug === ex.slug;
        const editing = editingSlug === ex.slug;
        const saving = savingSlug === ex.slug;
        const deleting = deletingSlug === ex.slug;
        const submitting = submittingSlug === ex.slug;
        return (
          <Card key={ex.slug} testID={`${testID}-item-${ex.slug}`}>
            <Pressable
              testID={`${testID}-toggle-${ex.slug}`}
              onPress={() => setExpandedSlug(expanded ? null : ex.slug)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${ex.name}`}
              style={[minTouchTarget, { flexDirection: "row", alignItems: "center", gap: 12 }]}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                }}
              >
                <Dumbbell size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text className="text-foreground font-semibold text-sm" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {ex.name}
                  </Text>
                  {ex.isUniversal ? (
                    <Globe2
                      size={14}
                      color={colors.primary}
                      accessibilityLabel="Universal — visible to everyone"
                    />
                  ) : ex.reviewStatus === "pending" ? (
                    <Clock
                      size={14}
                      color={colors["muted-foreground"]}
                      accessibilityLabel="Pending admin review"
                    />
                  ) : null}
                </View>
                <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                  {CUSTOM_EXERCISE_TRACKING_LABELS[ex.trackingType] ?? ex.trackingType}
                  {ex.primaryMuscles.length > 0
                    ? ` · ${ex.primaryMuscles.slice(0, 2).map(formatCustomMuscle).join(", ")}`
                    : ""}
                </Text>
              </View>
              <ChevronDown
                size={16}
                color={colors["muted-foreground"]}
                style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {expanded ? (
              <View style={{ marginTop: 12, gap: 12 }}>
                {editing && editValues ? (
                  <CustomExerciseForm
                    values={editValues}
                    onChange={setEditValues}
                    submitting={saving}
                    submitLabel={saving ? "Saving..." : "Save Changes"}
                    onSubmit={() => saveEdit(ex.slug)}
                    onCancel={cancelEdit}
                    testID={`${testID}-edit-${ex.slug}`}
                  />
                ) : (
                  <>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        testID={`${testID}-edit-${ex.slug}`}
                        onPress={() => startEdit(ex)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${ex.name}`}
                        style={[
                          minTouchTarget,
                          {
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
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
                      <Pressable
                        testID={`${testID}-delete-${ex.slug}`}
                        onPress={() => setConfirmSlug(ex.slug)}
                        disabled={deleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${ex.name}`}
                        style={[
                          minTouchTarget,
                          {
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: colors.destructive,
                            opacity: deleting ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Trash2 size={14} color={colors["destructive-foreground"]} />
                        <Text className="text-destructive-foreground text-xs font-semibold">
                          {deleting ? "Deleting…" : "Delete"}
                        </Text>
                      </Pressable>
                    </View>

                    {ex.videoUrl && onOpenWebLibrary ? (
                      <Pressable
                        testID={`${testID}-video-${ex.slug}`}
                        onPress={() => void onOpenWebLibrary()}
                        accessibilityRole="button"
                        accessibilityLabel={`Manage demo video for ${ex.name} on the web`}
                        style={[minTouchTarget, { justifyContent: "center" }]}
                      >
                        <Text className="text-primary text-xs font-medium">
                          Manage demo video on the web
                        </Text>
                      </Pressable>
                    ) : null}

                    {ex.isUniversal ? (
                      <Text
                        testID={`${testID}-universal-${ex.slug}`}
                        className="text-primary text-xs font-medium"
                      >
                        Universal — verified and visible to everyone
                      </Text>
                    ) : ex.reviewStatus === "pending" ? (
                      <View style={{ gap: 4 }}>
                        <Text
                          testID={`${testID}-pending-${ex.slug}`}
                          className="text-muted-foreground text-xs font-medium"
                        >
                          Submitted — waiting on admin review
                        </Text>
                        {onWithdrawReview ? (
                          <Pressable
                            testID={`${testID}-withdraw-${ex.slug}`}
                            onPress={() => void onWithdrawReview(ex.slug)}
                            disabled={submitting}
                            accessibilityRole="button"
                            accessibilityLabel={`Withdraw submission for ${ex.name}`}
                            style={[minTouchTarget, { justifyContent: "center" }]}
                          >
                            <Text className="text-muted-foreground text-xs underline">
                              Withdraw submission
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : (
                      <View style={{ gap: 4 }}>
                        {ex.reviewStatus === "rejected" ? (
                          <Text
                            testID={`${testID}-rejected-${ex.slug}`}
                            className="text-destructive text-xs"
                          >
                            Not approved
                            {ex.reviewNote ? `: ${ex.reviewNote}` : "."} Make
                            changes and resubmit whenever you&apos;re ready.
                          </Text>
                        ) : null}
                        {onSubmitReview ? (
                          <Pressable
                            testID={`${testID}-submit-${ex.slug}`}
                            onPress={() => void onSubmitReview(ex.slug)}
                            disabled={submitting}
                            accessibilityRole="button"
                            accessibilityLabel={`Submit ${ex.name} to Universal`}
                            style={[
                              minTouchTarget,
                              {
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                paddingVertical: 8,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: colors.border,
                                opacity: submitting ? 0.5 : 1,
                              },
                            ]}
                          >
                            <Globe2 size={14} color={colors["muted-foreground"]} />
                            <Text className="text-muted-foreground text-xs font-medium">
                              {submitting
                                ? "Submitting..."
                                : ex.reviewStatus === "rejected"
                                  ? "Resubmit to Universal"
                                  : "Submit to Universal"}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </>
                )}
              </View>
            ) : null}
          </Card>
        );
      })}

      <Modal
        testID={`${testID}-delete-modal`}
        visible={confirmTarget !== null}
        onClose={closeConfirm}
        title="Delete this exercise?"
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

export default MyExercises;
