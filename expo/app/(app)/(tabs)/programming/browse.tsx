import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Heart, Search } from "lucide-react-native";
import { ProgramsCatalog } from "@/components/programs/ProgramsCatalog";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export {
  BROWSE_LEVELS,
  buildSearchPath,
} from "@/components/programs/ProgramsCatalog";

/**
 * Unified Programs Browse Route (NP-072).
 *
 * The search/filter/Saved/Recommended/catalog-list sections live in
 * `ProgramsCatalog` (`@/components/programs/ProgramsCatalog`), shared with the
 * Workout tab (NP-277), which embeds the same sections under Continue
 * Training the way the web's single Workout page does.
 */
export default function ProgramsBrowseRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-browse-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Text className="text-foreground text-2xl font-bold">Programs</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              testID="programming-open-search"
              accessibilityRole="button"
              accessibilityLabel="Search programs"
              onPress={() => router.push("/(tabs)/programming/search")}
              className="rounded-xl border border-border p-2"
            >
              <Search
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-saved"
              accessibilityRole="button"
              accessibilityLabel="Saved programs"
              onPress={() => router.push("/(tabs)/programming/saved")}
              className="rounded-xl border border-border p-2"
            >
              <Heart
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-calendar"
              accessibilityRole="button"
              accessibilityLabel="Calendar"
              onPress={() => router.push("/(tabs)/calendar")}
              className="rounded-xl border border-border p-2"
            >
              <CalendarDays
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
          </View>
        </View>

        <ProgramsCatalog catalogTitle="Browse Programs" />
      </ScrollView>
    </SafeAreaView>
  );
}
