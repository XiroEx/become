import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MindRoute() {
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="mind-route"
    >
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-foreground text-2xl font-bold mb-1">Mind</Text>
        <Text className="text-muted-foreground text-sm text-center">
          Mood, wins, discipline, identity. The differentiator.
        </Text>
      </View>
    </SafeAreaView>
  );
}
