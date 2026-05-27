import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminExerciseList } from "@/components/admin/AdminExerciseList";

export default function AdminExercisesRoute() {
  const role: string | null = null;
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="admin-exercises-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">
          Admin · Exercises
        </Text>
        <AdminGate role={role}>
          <AdminExerciseList exercises={[]} />
        </AdminGate>
      </ScrollView>
    </SafeAreaView>
  );
}
