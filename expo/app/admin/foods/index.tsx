import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminFoodList } from "@/components/admin/AdminFoodList";

/**
 * Read-only native admin food list. Edit routes back to the webapp via the
 * 'Edit in browser' Tier-3 deep-link. Role is hard-coded to null in P14
 * scaffolding — useAuth().user.role will populate this when data wiring lands.
 */
export default function AdminFoodsRoute() {
  const role: string | null = null;
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="admin-foods-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Admin · Foods</Text>
        <AdminGate role={role}>
          <AdminFoodList foods={[]} />
        </AdminGate>
      </ScrollView>
    </SafeAreaView>
  );
}
