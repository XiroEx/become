import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScheduleApiResponseSchema } from "@become/api-client";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/schedule/Calendar";
import { ScheduledList } from "@/components/schedule/ScheduledList";
import { RescheduleModal } from "@/components/schedule/RescheduleModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toScheduledSlots } from "@/lib/schedule/scheduleSlots";
import { useScheduleMutations } from "@/lib/schedule/useScheduleMutations";
import {
  slotForDate,
  slotKey,
  type ScheduledSlot,
} from "@/lib/schedule/slotStatus";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Calendar lives under (tabs) but is not exposed in the tab bar — it's
 * accessible from the dashboard / programs flows. Shows the active program's
 * schedule slots colored by status; tapping a future scheduled slot opens the
 * corresponding workout.
 */
export default function CalendarIndexRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayDate = today.toISOString().slice(0, 10);

  const { data, error, refetch } = useFetch(
    "/api/schedule",
    ScheduleApiResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const slots = useMemo(() => toScheduledSlots(data), [data]);

  const mutations = useScheduleMutations({
    getToken: () => token ?? undefined,
    onSuccess: () => {
      void refetch();
    },
  });
  const [rescheduleSlot, setRescheduleSlot] = useState<ScheduledSlot | null>(
    null,
  );
  const onConfirmReschedule = useCallback(
    (slot: ScheduledSlot, newDate: string) => {
      void mutations.reschedule({
        programId: slot.programId,
        workoutDate: slot.date,
        newDate,
      });
      setRescheduleSlot(null);
    },
    [mutations],
  );

  const openSlot = useCallback(
    (slot: ScheduledSlot) => {
      // Only future, still-scheduled slots are actionable.
      if (slot.status !== "scheduled" || slot.date < todayDate) return;
      router.push(
        `/(tabs)/programming/${slot.programId}/workout/${slot.workoutIndex}?phase=${slot.phaseIndex}`,
      );
    },
    [router, todayDate],
  );

  const onSelectDay = useCallback(
    (date: string) => {
      setSelectedDate(date);
      const slot = slotForDate(slots, date);
      if (slot) openSlot(slot);
    },
    [slots, openSlot],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="calendar-index-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Calendar</Text>
        {error ? (
          <Text testID="calendar-error" className="text-destructive">
            Couldn&apos;t load your schedule.
          </Text>
        ) : null}
        <Calendar
          month={month}
          selectedDate={selectedDate}
          todayDate={todayDate}
          slots={slots}
          onSelectDay={onSelectDay}
        />
        <Button
          testID="calendar-open-settings"
          variant="secondary"
          onPress={() => router.push("/(tabs)/calendar/settings")}
        >
          Schedule settings
        </Button>
        <View>
          <Text className="text-foreground font-semibold mb-2">Upcoming</Text>
          <ScheduledList
            slots={slots}
            onSelectSlot={openSlot}
            onReschedule={setRescheduleSlot}
          />
        </View>
      </ScrollView>
      {/*
        Keyed on the slot: the modal seeds its date field from `slot` with
        useState and has no re-seeding effect, so a different slot has to be a
        different element for the form to show that slot's date. Drop the key
        and rescheduling a second workout opens the first one's date.
      */}
      <RescheduleModal
        key={rescheduleSlot ? slotKey(rescheduleSlot) : "no-slot"}
        visible={rescheduleSlot !== null}
        slot={rescheduleSlot}
        onConfirm={onConfirmReschedule}
        onClose={() => setRescheduleSlot(null)}
      />
    </SafeAreaView>
  );
}
