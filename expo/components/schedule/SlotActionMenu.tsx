import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { ShiftScheduleModal } from "@/components/programs/ShiftScheduleModal";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";

export interface SlotActionMenuProps {
  /** The slot the sheet manages. Null hides the sheet. */
  slot: ScheduledSlot | null;
  /** True while any PATCH is in flight. */
  loading?: boolean;
  onClose: () => void;
  onSkip: (slot: ScheduledSlot) => void;
  onUnskip: (slot: ScheduledSlot) => void;
  onMoveNextDay: (slot: ScheduledSlot) => void;
  onRescheduleToDate: (slot: ScheduledSlot) => void;
  onShift: (slot: ScheduledSlot, days: number) => void;
  onPause: (slot: ScheduledSlot) => void;
  onResume: (slot: ScheduledSlot) => void;
  testID?: string;
}

/**
 * The native Manage sheet for one program slot — the port of the web
 * calendar's action menu (`webapp/app/dashboard/calendar/CalendarClient.tsx`).
 *
 * Slot-level rows (skip / move-to-next-day / move-to-date) act on the slot's
 * own marker date; program-level rows (shift / pause / resume) act on the
 * slot's program. Destructive or history-touching rows (skip, pause) ask
 * first with a two-tap in-sheet confirm — the native shape of the web's
 * `window.confirm` — because `Alert.alert` renders nothing in jest and has
 * no web equivalent in this codebase (see `components/programs/MyPrograms`).
 *
 * Un-complete and un-skip live on the day sheet itself (next to the status
 * they undo), not in this menu — the web renders them inline on completed /
 * skipped cards. The server's `swap` action has no web caller, so this menu
 * deliberately has no swap row.
 */
export function SlotActionMenu({
  slot,
  loading = false,
  onClose,
  onSkip,
  onUnskip,
  onMoveNextDay,
  onRescheduleToDate,
  onShift,
  onPause,
  onResume,
  testID = "slot-action-menu",
}: SlotActionMenuProps) {
  const [confirmKind, setConfirmKind] = useState<"skip" | "pause" | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);

  const close = () => {
    setConfirmKind(null);
    setShiftOpen(false);
    onClose();
  };

  const isPaused = slot?.programStatus === "paused";
  const isSkipped = slot?.status === "skipped";

  return (
    <Modal
      visible={slot !== null}
      onClose={close}
      title="Manage Workout"
      testID={testID}
    >
      {slot ? (
        <View style={{ gap: 8 }}>
          <Text
            testID={`${testID}-subtitle`}
            className="text-muted-foreground text-sm mb-1"
          >
            {slot.dayLabel || `Day ${slot.workoutIndex + 1}`} · {slot.date}
          </Text>

          {isSkipped ? (
            <Button
              testID={`${testID}-unskip`}
              variant="secondary"
              onPress={() => onUnskip(slot)}
              disabled={loading}
              loading={loading}
            >
              Un-skip workout
            </Button>
          ) : (
            <Button
              testID={`${testID}-skip`}
              variant="secondary"
              onPress={() => setConfirmKind("skip")}
              disabled={loading}
            >
              Skip this workout
            </Button>
          )}

          <Button
            testID={`${testID}-next-day`}
            variant="secondary"
            onPress={() => onMoveNextDay(slot)}
            disabled={loading}
          >
            Move to next day
          </Button>

          <Button
            testID={`${testID}-pick-date`}
            variant="secondary"
            onPress={() => onRescheduleToDate(slot)}
            disabled={loading}
          >
            Move to date…
          </Button>

          <Text className="text-muted-foreground text-xs font-semibold uppercase mt-2">
            Entire program{slot.programName ? `: ${slot.programName}` : ""}
          </Text>

          <Button
            testID={`${testID}-shift`}
            variant="secondary"
            onPress={() => setShiftOpen(true)}
            disabled={loading}
          >
            Delay entire schedule…
          </Button>

          {isPaused ? (
            <Button
              testID={`${testID}-resume`}
              onPress={() => onResume(slot)}
              disabled={loading}
              loading={loading}
            >
              Resume program
            </Button>
          ) : (
            <Button
              testID={`${testID}-pause`}
              variant="secondary"
              onPress={() => setConfirmKind("pause")}
              disabled={loading}
            >
              Pause program
            </Button>
          )}

          {confirmKind === "skip" ? (
            <View
              testID={`${testID}-confirm-skip`}
              style={{ gap: 8, marginTop: 4 }}
            >
              <Text className="text-foreground text-sm">
                Skip this workout? It’ll be marked skipped and won’t count as
                completed.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-confirm-skip-yes`}
                    variant="destructive"
                    onPress={() => {
                      setConfirmKind(null);
                      onSkip(slot);
                    }}
                    disabled={loading}
                    loading={loading}
                  >
                    Yes, skip it
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-confirm-skip-no`}
                    variant="secondary"
                    onPress={() => setConfirmKind(null)}
                    disabled={loading}
                  >
                    Keep it
                  </Button>
                </View>
              </View>
            </View>
          ) : null}

          {confirmKind === "pause" ? (
            <View
              testID={`${testID}-confirm-pause`}
              style={{ gap: 8, marginTop: 4 }}
            >
              <Text className="text-foreground text-sm">
                Pause this program? All its workouts are frozen until you
                resume.
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-confirm-pause-yes`}
                    variant="destructive"
                    onPress={() => {
                      setConfirmKind(null);
                      onPause(slot);
                    }}
                    disabled={loading}
                    loading={loading}
                  >
                    Yes, pause it
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    testID={`${testID}-confirm-pause-no`}
                    variant="secondary"
                    onPress={() => setConfirmKind(null)}
                    disabled={loading}
                  >
                    Keep going
                  </Button>
                </View>
              </View>
            </View>
          ) : null}

          <Button
            testID={`${testID}-close`}
            variant="ghost"
            onPress={close}
            disabled={loading}
          >
            Cancel
          </Button>

          <ShiftScheduleModal
            visible={shiftOpen}
            initialDays={7}
            loading={loading}
            onClose={() => setShiftOpen(false)}
            onConfirm={(days) => {
              setShiftOpen(false);
              onShift(slot, days);
            }}
          />
        </View>
      ) : null}
    </Modal>
  );
}
