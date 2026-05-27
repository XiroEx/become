import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramsList } from "@/components/programs/ProgramsList";

/**
 * Browse-all programs route. Real data wiring lands in a follow-up when the
 * programs list endpoint is bound. P8 ships the read-flow scaffolds with an
 * empty list so the route compiles and tests cover the presentational layer.
 */
export default function ProgrammingIndexRoute() {
  const router = useRouter();
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-index-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Programs</Text>
        <ProgramsList
          programs={[]}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
