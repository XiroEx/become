import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { DayTotals } from "@/components/nutrition/DayTotals";

export default function NutritionIndexRoute() {
  const router = useRouter();
  // Placeholder date — bound to today's local date via tz-aware route once
  // data wiring lands.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="nutrition-index-route"
    >
      <View style={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Nutrition</Text>
        <DayTotals date={today} entries={[]} />
        <Button
          testID="nutrition-find-food"
          onPress={() => router.push("/(tabs)/nutrition/search")}
        >
          Find a food
        </Button>
        <Button
          testID="nutrition-view-day"
          variant="secondary"
          onPress={() => router.push(`/(tabs)/nutrition/log/${today}`)}
        >
          Open today&apos;s log
        </Button>
      </View>
    </SafeAreaView>
  );
}
