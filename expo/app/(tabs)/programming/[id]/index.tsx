import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";

export default function ProgramDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  // Placeholder view model — bound to the real /api/programs/[id] endpoint
  // when data wiring lands.
  const program: ProgramDetailViewModel = {
    id,
    name: "Loading…",
    description: "",
    phases: [],
  };

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing program id</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-detail-route"
    >
      <ProgramDetail
        program={program}
        onPhasePress={(phaseIndex) =>
          router.push(`/(tabs)/programming/${id}/phase/${phaseIndex}`)
        }
      />
    </SafeAreaView>
  );
}
