import { Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExercisesListResponseSchema } from "@become/api-client";
import { AdminGate } from "@/components/admin/AdminGate";
import {
  AdminExerciseList,
  type AdminExerciseRow,
} from "@/components/admin/AdminExerciseList";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";

/**
 * Read-only native admin exercise list. Gated on user.role === 'admin'. There
 * is no /api/admin/exercises route, so the canonical GET /api/exercises list is
 * used; edits route back to the webapp via AdminExerciseList's Edit-in-browser.
 */
export default function AdminExercisesRoute() {
  const { user, token } = useAuth();
  const role = user?.role ?? null;
  const isAdmin = role === "admin";

  const { data } = useFetch("/api/exercises", ExercisesListResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token || !isAdmin,
  });

  const exercises: AdminExerciseRow[] = (data?.exercises ?? []).map((e) => ({
    slug: e.slug ?? "",
    name: e.name,
    ...(e.category ? { category: e.category } : {}),
    hasVideo: !!e.videoUrl,
  }));

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
          <AdminExerciseList exercises={exercises} />
        </AdminGate>
      </ScrollView>
    </SafeAreaView>
  );
}
