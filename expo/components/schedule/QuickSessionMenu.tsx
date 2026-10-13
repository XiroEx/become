import { useState } from "react";
import { Modal, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import type { QuickCalItem } from "@/lib/schedule/slotStatus";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface QuickSessionMenuProps {
  visible: boolean;
  session: QuickCalItem | null;
  pending: boolean;
  datePickerOpen: boolean;
  onToggleDatePicker: () => void;
  onMoveNextDay: () => void;
  onMoveToDate: (date: string) => void;
  onSkip: () => void;
  onUnskip: () => void;
  onDelete: () => void;
  onClose: () => void;
  testID?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Manage sheet for one quick session — the native counterpart of the
 * web calendar's quick-session Manage sheet (`CalendarClient.tsx`
 * "Manage Session"): move to next day, move to an arbitrary date, skip /
 * un-skip (completed sessions never show the skip row), delete.
 *
 * The sheet sends nothing itself: every row calls back into the calendar
 * screen, which writes through `@/lib/schedule/quickSessionDay` (tz is
 * merged by `apiFetch`, never set by a screen). The skip and delete CONFIRM
 * gates live on the screen (`SlotConfirmDialog`) — `Alert.alert` renders
 * nothing in jest, so a modal is what the calendar screen uses.
 */
export function QuickSessionMenu({
  visible,
  session,
  pending,
  datePickerOpen,
  onToggleDatePicker,
  onMoveNextDay,
  onMoveToDate,
  onSkip,
  onUnskip,
  onDelete,
  onClose,
  testID = "quick-menu",
}: QuickSessionMenuProps) {
  const { scrim, colors } = useThemeTokens();
  const [date, setDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const title = session?.title ?? "Session";
  const subtitle = session ? `${session.date.slice(0, 10)}` : "";
  const skipped = session?.status === "skipped";
  const completed = session?.status === "completed";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: scrim }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            padding: 16,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            gap: 8,
          }}
        >
          <Text className="text-foreground text-lg font-bold">
            Manage Session
          </Text>
          <Text
            testID={`${testID}-subtitle`}
            className="text-muted-foreground text-sm"
          >
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </Text>

          <Button
            testID={`${testID}-next-day`}
            variant="secondary"
            disabled={pending}
            onPress={onMoveNextDay}
          >
            Move to Next Day
          </Button>
          <Button
            testID={`${testID}-to-date`}
            variant="secondary"
            disabled={pending}
            onPress={onToggleDatePicker}
          >
            Move to Date
          </Button>
          {datePickerOpen ? (
            <View style={{ gap: 8 }}>
              <Input
                testID={`${testID}-date`}
                label="New date (YYYY-MM-DD)"
                value={date}
                onChangeText={setDate}
                placeholder="2026-06-01"
                error={error ?? undefined}
              />
              <Button
                testID={`${testID}-date-confirm`}
                disabled={pending}
                onPress={() => {
                  if (!DATE_RE.test(date)) {
                    setError("Enter a valid date");
                    return;
                  }
                  setError(null);
                  onMoveToDate(date);
                }}
              >
                Move Session
              </Button>
            </View>
          ) : null}
          {!completed ? (
            skipped ? (
              <Button
                testID={`${testID}-unskip`}
                variant="secondary"
                disabled={pending}
                onPress={onUnskip}
              >
                Un-skip Session
              </Button>
            ) : (
              <Button
                testID={`${testID}-skip`}
                variant="secondary"
                disabled={pending}
                onPress={onSkip}
              >
                Skip Session
              </Button>
            )
          ) : null}
          <Button
            testID={`${testID}-delete`}
            variant="destructive"
            disabled={pending}
            onPress={onDelete}
          >
            Delete Session
          </Button>
          <Button
            testID={`${testID}-close`}
            variant="secondary"
            disabled={pending}
            onPress={onClose}
          >
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
