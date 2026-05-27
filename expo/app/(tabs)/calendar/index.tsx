import { useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/schedule/Calendar";
import { ScheduledList } from "@/components/schedule/ScheduledList";

/**
 * Calendar lives under (tabs) but is not exposed in the tab bar — it's
 * accessible from the dashboard / programs flows. We declare it in the route
 * tree without a tab-bar entry to keep TAB_ROUTES at the 5 canonical tabs.
 */
export default function CalendarIndexRoute() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = new Date();
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayDate = today.toISOString().slice(0, 10);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="calendar-index-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Calendar</Text>
        <Calendar
          month={month}
          selectedDate={selectedDate}
          todayDate={todayDate}
          slots={[]}
          onSelectDay={setSelectedDate}
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
          <ScheduledList slots={[]} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
