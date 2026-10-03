import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function NutritionSearchRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{
    tag?: string;
    date?: string;
    barcode?: string;
  }>();

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-search-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="nutrition-search-route-kav"
      >
        <View style={{ flex: 1 }}>
          <FoodSearchSheet
            visible={true}
            onClose={() => router.back()}
            currentTag={params.tag}
            activeDate={params.date}
            initialBarcodeOpen={params.barcode === "1"}
            testID="nutrition-search-sheet"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
