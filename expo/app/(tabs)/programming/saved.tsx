import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SavedPrograms } from "@/components/programs/SavedPrograms";

export default function SavedProgramsRoute() {
  const router = useRouter();
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-saved-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Saved</Text>
        <SavedPrograms
          programs={[]}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
