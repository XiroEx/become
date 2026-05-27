import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text } from "react-native";
import { Flame } from "lucide-react-native";
import { resolveToken } from "@/lib/theme/tokens";

export default function HomeScreen() {
  const primary = resolveToken("primary", "dark");
  const foreground = resolveToken("foreground", "dark");

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="home-screen"
    >
      <View
        className="flex-1 items-center justify-center bg-background"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <View testID="probe-icon" accessibilityLabel={`primary-${primary}`}>
          <Flame color={primary} size={48} strokeWidth={1.5} />
        </View>
        <Text
          testID="probe-title"
          className="mt-4 text-2xl font-semibold text-foreground"
          style={{ color: foreground }}
        >
          Become
        </Text>
        <Text
          testID="probe-subtitle"
          className="mt-2 text-sm text-muted-foreground"
          style={{ color: resolveToken("muted-foreground", "dark") }}
        >
          Native scaffold online
        </Text>
      </View>
    </SafeAreaView>
  );
}
