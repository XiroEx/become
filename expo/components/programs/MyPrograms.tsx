import { useState } from "react";
import { Pressable, View } from "react-native";
import { Pencil, Play, Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  canEditCustomProgram,
  type CustomProgramSummary,
} from "@/lib/programs/customPrograms";

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
  const { colors } = useThemeTokens();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const confirmTarget = confirmId
    ? (programs.find((p) => p.id === confirmId) ?? null)
    : null;

  const closeConfirm = () => setConfirmId(null);

  const confirmDelete = () => {
    const id = confirmId;
    setConfirmId(null);
    if (id) void onDelete?.(id);
  };

  if (programs.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16, gap: 12 }}>
        <Text className="text-muted-foreground text-center text-sm">
          You haven&apos;t created any custom programs yet. Build your own
          training program tailored to your goals.
        </Text>
        {onCreate ? (
          <Button
            testID={`${testID}-create-empty`}
            onPress={() => void onCreate()}
            accessibilityLabel="Create your first program"
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Plus size={16} color={colors["primary-foreground"]} />
              <Text className="text-primary-foreground text-sm font-semibold">
                Create your first program
              </Text>
            </View>
          </Button>
        ) : null}
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
                    backgroundColor: colors.primary,
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
