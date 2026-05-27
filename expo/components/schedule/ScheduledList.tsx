import { View, Text, Pressable } from "react-native";
import { Card } from "@/components/Card";
import {
  sortSlotsByDate,
  type ScheduledSlot,
  type SlotStatus,
} from "@/lib/schedule/slotStatus";

const STATUS_LABEL: Record<SlotStatus, string> = {
  scheduled: "Scheduled",
  completed: "Done",
  missed: "Missed",
  skipped: "Skipped",
  rest: "Rest",
};

export interface ScheduledListProps {
  slots: ScheduledSlot[];
  onSelectSlot?: (slot: ScheduledSlot) => void;
  testID?: string;
}

export function ScheduledList({
  slots,
  onSelectSlot,
  testID = "scheduled-list",
}: ScheduledListProps) {
  const sorted = sortSlotsByDate(slots);
  if (sorted.length === 0) {
    return (
      <View testID={`${testID}-empty`} className="py-6">
        <Text className="text-muted-foreground text-center">
          No upcoming workouts.
        </Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {sorted.map((slot) => (
        <Pressable
          key={`${slot.date}-${slot.programId}-${slot.phaseIndex}-${slot.workoutIndex}`}
          testID={`${testID}-item-${slot.date}-${slot.workoutIndex}`}
          onPress={() => onSelectSlot?.(slot)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${slot.date} workout`}
        >
          <Card
            title={slot.date}
            subtitle={`Phase ${slot.phaseIndex + 1} · Workout ${slot.workoutIndex + 1}`}
          >
            <Text
              testID={`${testID}-status-${slot.date}-${slot.workoutIndex}`}
              className="text-muted-foreground text-xs"
            >
              {STATUS_LABEL[slot.status]}
            </Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}
