import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  ArrowDownAZ,
  ChevronDown,
  Clock,
  Dumbbell,
  Globe2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { geistFontFamily } from "@/lib/theme/fonts";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  CUSTOM_EXERCISE_BODY_PART_FILTERS,
  CUSTOM_EXERCISE_ROLE_FILTERS,
  CUSTOM_EXERCISE_SORT_OPTIONS,
  CUSTOM_EXERCISE_TRACKING_LABELS,
  customExerciseChipTags,
  filterAndSortCustomExercises,
  formatCustomMuscle,
  formatCustomTag,
  toCustomExerciseForm,
  type CustomExerciseFormValues,
  type CustomExerciseSortMode,
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
 * NP-276 brings this up to the web's own list: search, Recent/A–Z sort,
 * body-part and role filter chips, a `Yours` badge and the chip row
 * (sets/reps/category tags) on every row, a green identity (icon + badge)
 * instead of the brand red, an outline Delete, an `Add a video` entry point
 * even before a demo exists, and an amber pending-review banner. The search
 * and filter PIPELINE is `filterAndSortCustomExercises`
 * (`lib/workout/customExercises.ts`) — pinned there once rather than copied
 * into this JSX, and shared with its own tests.
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
  const { colors, tint } = useThemeTokens();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CustomExerciseFormValues | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<CustomExerciseSortMode>("recent");
  const [bodyPartFilter, setBodyPartFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

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

  const filteredExercises = useMemo(
    () =>
      filterAndSortCustomExercises(exercises, {
        search,
        sortMode,
        bodyPartFilter,
        roleFilter,
      }),
    [exercises, search, sortMode, bodyPartFilter, roleFilter],
  );

  const hasActiveFilters = search.trim().length > 0 || bodyPartFilter !== null || roleFilter !== null;

  const clearFilters = () => {
    setSearch("");
    setBodyPartFilter(null);
    setRoleFilter(null);
  };

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

  // A library with nothing in it yet — not to be confused with the filters
  // narrowing a non-empty one down to nothing (that is handled below, once
  // the search/sort/filter row has something to filter).
  if (exercises.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16, alignItems: "center" }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.muted,
            marginBottom: 12,
          }}
        >
          <Dumbbell size={24} color={colors["muted-foreground"]} />
        </View>
        <Text className="text-foreground text-sm font-semibold text-center">
          No custom exercises yet
        </Text>
        <Text className="text-muted-foreground text-xs text-center mt-1">
          Tap &quot;Add&quot; to create your first exercise.
        </Text>
        {onCreate ? (
          <Pressable
            testID={`${testID}-create-empty`}
            onPress={() => void onCreate()}
            accessibilityRole="button"
            accessibilityLabel="Create your first exercise"
            style={[
              minTouchTarget,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.success,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                marginTop: 16,
              },
            ]}
          >
            <Plus size={14} color={colors["brand-foreground"]} strokeWidth={2.5} />
            <Text
              className="text-xs font-semibold"
              style={{ color: colors["brand-foreground"] }}
            >
              Create Exercise
            </Text>
          </Pressable>
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

      <View
        className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2.5"
        style={minTouchTarget}
      >
        <Search size={16} color={colors["muted-foreground"]} />
        <TextInput
          testID={`${testID}-search`}
          placeholder="Search exercises..."
          placeholderTextColor={colors["muted-foreground"]}
          value={search}
          onChangeText={setSearch}
          className="flex-1 ml-2 text-foreground text-sm py-0"
          style={{
            color: colors.foreground,
            fontFamily: geistFontFamily("text-foreground text-sm"),
          }}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search exercises"
          accessibilityHint="Filters the list by name, muscle or tag"
        />
        {search.length > 0 ? (
          <Pressable
            testID={`${testID}-search-clear`}
            onPress={() => setSearch("")}
            accessibilityRole="button"
            accessibilityLabel="Clear search text"
            hitSlop={8}
          >
            <X size={16} color={colors["muted-foreground"]} />
          </Pressable>
        ) : null}
      </View>

      <View
        testID={`${testID}-sort`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
      >
        {CUSTOM_EXERCISE_SORT_OPTIONS.map((opt) => {
          const active = sortMode === opt.value;
          const Icon = opt.value === "alphabetical" ? ArrowDownAZ : Clock;
          return (
            <Pressable
              key={opt.value}
              testID={`${testID}-sort-${opt.value}`}
              onPress={() => setSortMode(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`Sort by ${opt.label}`}
              hitSlop={8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.success : colors.border,
                backgroundColor: active ? tint("success", 0.12) : "transparent",
              }}
            >
              <Icon
                size={12}
                color={active ? colors.success : colors["muted-foreground"]}
              />
              <Text
                className="text-xs font-medium"
                style={{ color: active ? colors.success : colors["muted-foreground"] }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        testID={`${testID}-body-part-filters`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
      >
        <FilterChip
          testID={`${testID}-body-part-all`}
          label="All body parts"
          active={bodyPartFilter === null}
          isAll
          onPress={() => setBodyPartFilter(null)}
        />
        {CUSTOM_EXERCISE_BODY_PART_FILTERS.map((opt) => (
          <FilterChip
            key={opt.value}
            testID={`${testID}-body-part-${opt.value}`}
            label={opt.label}
            active={bodyPartFilter === opt.value}
            onPress={() => setBodyPartFilter((p) => (p === opt.value ? null : opt.value))}
          />
        ))}
      </View>

      <View
        testID={`${testID}-role-filters`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
      >
        <FilterChip
          testID={`${testID}-role-all`}
          label="All roles"
          active={roleFilter === null}
          isAll
          onPress={() => setRoleFilter(null)}
        />
        {CUSTOM_EXERCISE_ROLE_FILTERS.map((opt) => (
          <FilterChip
            key={opt.value}
            testID={`${testID}-role-${opt.value}`}
            label={opt.label}
            active={roleFilter === opt.value}
            onPress={() => setRoleFilter((p) => (p === opt.value ? null : opt.value))}
          />
        ))}
      </View>

      {filteredExercises.length === 0 ? (
        <View testID={`${testID}-no-matches`} style={{ padding: 16, alignItems: "center", gap: 8 }}>
          <Text className="text-muted-foreground text-sm text-center font-medium">
            {search.trim()
              ? `No exercises match "${search.trim()}"`
              : "No exercises match these filters"}
          </Text>
          {hasActiveFilters ? (
            <Pressable
              testID={`${testID}-clear-filters`}
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear search and filters"
              style={[minTouchTarget, { justifyContent: "center" }]}
            >
              <Text className="text-success text-sm font-medium">
                Clear search &amp; filters
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        filteredExercises.map((ex) => {
          const expanded = expandedSlug === ex.slug;
          const editing = editingSlug === ex.slug;
          const saving = savingSlug === ex.slug;
          const deleting = deletingSlug === ex.slug;
          const submitting = submittingSlug === ex.slug;
          const chipTags = customExerciseChipTags(ex);
          const pending = !ex.isUniversal && ex.reviewStatus === "pending";
          return (
            <Card key={ex.slug} testID={`${testID}-item-${ex.slug}`}>
              <Pressable
                testID={`${testID}-toggle-${ex.slug}`}
                onPress={() => setExpandedSlug(expanded ? null : ex.slug)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${ex.name}`}
                style={[minTouchTarget, { flexDirection: "row", alignItems: "flex-start", gap: 12 }]}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: tint("success", 0.15),
                  }}
                >
                  <Dumbbell size={20} color={colors.success} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text className="text-foreground font-semibold text-sm" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {ex.name}
                    </Text>
                    <View
                      testID={`${testID}-yours-${ex.slug}`}
                      accessibilityLabel="Your custom exercise"
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 2,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: tint("success", 0.15),
                      }}
                    >
                      <Sparkles size={10} color={colors.success} />
                      <Text className="text-[10px] font-semibold" style={{ color: colors.success }}>
                        Yours
                      </Text>
                    </View>
                    {ex.isUniversal ? (
                      <Globe2
                        size={14}
                        color={colors.success}
                        accessibilityLabel="Universal — visible to everyone"
                      />
                    ) : pending ? (
                      <Clock
                        size={14}
                        color={colors.accent}
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
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {typeof ex.defaultSets === "number" ? (
                      <Chip testID={`${testID}-chip-sets-${ex.slug}`} label={`${ex.defaultSets} sets`} />
                    ) : null}
                    {ex.defaultReps ? (
                      <Chip testID={`${testID}-chip-reps-${ex.slug}`} label={ex.defaultReps} />
                    ) : null}
                    {chipTags.map((tag) => (
                      <Chip key={tag} testID={`${testID}-chip-tag-${ex.slug}-${tag}`} label={formatCustomTag(tag)} />
                    ))}
                  </View>
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
                              borderWidth: 1,
                              borderColor: colors.border,
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
                              borderWidth: 1,
                              borderColor: colors.destructive,
                              opacity: deleting ? 0.5 : 1,
                            },
                          ]}
                        >
                          <Trash2 size={14} color={colors.destructive} />
                          <Text className="text-destructive text-xs font-semibold">
                            {deleting ? "Deleting…" : "Delete"}
                          </Text>
                        </Pressable>
                      </View>

                      {onOpenWebLibrary ? (
                        <View style={{ gap: 4, alignItems: "flex-start" }}>
                          <Pressable
                            testID={`${testID}-video-${ex.slug}`}
                            onPress={() => void onOpenWebLibrary()}
                            accessibilityRole="button"
                            accessibilityLabel={
                              ex.videoUrl
                                ? `Manage demo video for ${ex.name} on the web`
                                : `Add a video for ${ex.name} on the web`
                            }
                            hitSlop={8}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 8,
                              backgroundColor: colors.primary,
                            }}
                          >
                            <Upload size={14} color={colors["primary-foreground"]} />
                            <Text
                              className="text-xs font-medium"
                              style={{ color: colors["primary-foreground"] }}
                            >
                              {ex.videoUrl ? "Manage demo video on the web" : "Add a video"}
                            </Text>
                          </Pressable>
                          {!ex.videoUrl ? (
                            <Text
                              testID={`${testID}-video-hint-${ex.slug}`}
                              className="text-muted-foreground text-[11px]"
                            >
                              Pick a clip from your photo library, files, or camera. MP4 /
                              MOV / WebM, up to 100 MB — on the web library.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      {ex.isUniversal ? (
                        <Text
                          testID={`${testID}-universal-${ex.slug}`}
                          className="text-success text-xs font-medium"
                        >
                          Universal — verified and visible to everyone
                        </Text>
                      ) : pending ? (
                        <View style={{ gap: 6 }}>
                          <View
                            testID={`${testID}-pending-${ex.slug}`}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              borderRadius: 8,
                              backgroundColor: tint("accent", 0.15),
                            }}
                          >
                            <Clock size={14} color={colors.accent} />
                            <Text
                              className="text-xs font-medium"
                              style={{ color: colors.accent }}
                            >
                              Submitted — waiting on admin review
                            </Text>
                          </View>
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
        })
      )}

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

function FilterChip({
  testID,
  label,
  active,
  isAll = false,
  onPress,
}: {
  testID: string;
  label: string;
  active: boolean;
  isAll?: boolean;
  onPress: () => void;
}) {
  const { colors, tint } = useThemeTokens();
  const activeBg = isAll ? colors.primary : tint("success", 0.12);
  const activeBorder = isAll ? colors.primary : colors.success;
  const activeTextColor = isAll ? colors["primary-foreground"] : colors.success;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      hitSlop={8}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? activeBorder : colors.border,
        backgroundColor: active ? activeBg : "transparent",
        justifyContent: "center",
      }}
    >
      <Text
        className="text-[11px] font-medium"
        style={{ color: active ? activeTextColor : colors["muted-foreground"] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Chip({ testID, label }: { testID: string; label: string }) {
  const { colors } = useThemeTokens();
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: colors.muted,
      }}
    >
      <Text className="text-[11px] font-medium" style={{ color: colors["muted-foreground"] }}>
        {label}
      </Text>
    </View>
  );
}

export default MyExercises;
