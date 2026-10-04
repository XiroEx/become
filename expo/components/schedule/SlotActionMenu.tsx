import { Modal, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface SlotActionMenuProps {
  visible: boolean;
  slot: ScheduledSlot | null;
  /** True when the slot's program is paused (shows Resume instead of Pause). */
  programPaused: boolean;
  pending: boolean;
  onClose: () => void;
  onSkip: () => void;
  onMoveNextDay: () => void;
  onRescheduleToDate: () => void;
  onShift: () => void;
  onPause: () => void;
  onResume: () => void;
  testID?: string;
}

/**
 * The Manage sheet for one program slot — the native counterpart of the web
 * calendar's action-menu modal (`CalendarClient.tsx` "Manage Workout").
 *
 * Slot-level rows (skip, move to next day, move to date) act on the slot's own
 * day marker; program-level rows (shift, pause/resume) act on the whole
 * program. The sheet sends nothing itself: every row calls back into the
 * calendar screen, which patches through `useScheduleMutations.patch` (tz is
 * merged by `apiFetch`, never set by a screen). There is deliberately no swap
 * row — the server accepts `swap` but neither app has a screen that sends it.
 */
export function SlotActionMenu({
  visible,
  slot,
  programPaused,
  pending,
  onClose,
  onSkip,
  onMoveNextDay,
  onRescheduleToDate,
  onShift,
  onPause,
  onResume,
  testID = "slot-menu",
}: SlotActionMenuProps) {
  const { scrim, colors } = useThemeTokens();
  const title = slot?.dayLabel ?? "Workout";
  const subtitle = slot ? `${slot.date}` : "";

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
            Manage Workout
          </Text>
          <Text
            testID={`${testID}-subtitle`}
            className="text-muted-foreground text-sm"
          >
            {title}
            {subtitle ? ` · ${subtitle}` : ""}
          </Text>

          <Button
            testID={`${testID}-skip`}
            variant="secondary"
            disabled={pending}
            onPress={onSkip}
          >
            Skip This Workout
          </Button>
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
            onPress={onRescheduleToDate}
          >
            Move to Date
          </Button>
          <Button
            testID={`${testID}-shift`}
            variant="secondary"
            disabled={pending}
            onPress={onShift}
          >
            Delay Entire Schedule
          </Button>
          {programPaused ? (
            <Button
              testID={`${testID}-resume`}
              disabled={pending}
              onPress={onResume}
            >
              Resume Program
            </Button>
          ) : (
            <Button
              testID={`${testID}-pause`}
              variant="secondary"
              disabled={pending}
              onPress={onPause}
            >
              Pause Program
            </Button>
          )}
          <Button
            testID={`${testID}-close`}
            variant="secondary"
            onPress={onClose}
          >
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
