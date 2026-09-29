import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AdminFoodsResponseSchema } from "@become/api-client";
import { AdminGate } from "@/components/admin/AdminGate";
import {
  AdminFoodList,
  type AdminFoodRow,
} from "@/components/admin/AdminFoodList";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";

function narrowSource(s?: string): AdminFoodRow["source"] {
  return s === "usda" || s === "off" ? s : "custom";
}

/**
 * Read-only native admin food list. Gated on user.role === 'admin' and fed by
 * GET /api/admin/foods. Edit routes back to the webapp via AdminFoodList's
 * Edit-in-browser deep link.
 */
export default function AdminFoodsRoute() {
  const { user, token } = useAuth();
  const role = user?.role ?? null;
  const isAdmin = role === "admin";

  const { data } = useFetch("/api/admin/foods", AdminFoodsResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token || !isAdmin,
  });

  const foods: AdminFoodRow[] = (data?.foods ?? []).map((f) => ({
    id: f._id ?? f.id ?? "",
    name: f.name,
    brand: f.brand ?? null,
    source: narrowSource(f.source),
    pendingReview: !!f.needsReview,
  }));

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="admin-foods-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Admin · Foods</Text>
        <AdminGate role={role}>
          <AdminFoodList foods={foods} />
        </AdminGate>
      </ScrollView>
    </SafeAreaView>
  );
}
