import { useLocalSearchParams } from "expo-router";
import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DayTotals } from "@/components/nutrition/DayTotals";

export default function DayLogRoute() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date =
    typeof params.date === "string"
      ? params.date
      : new Date().toISOString().slice(0, 10);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="nutrition-log-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">{date}</Text>
        <DayTotals date={date} entries={[]} />
      </ScrollView>
    </SafeAreaView>
  );
}
