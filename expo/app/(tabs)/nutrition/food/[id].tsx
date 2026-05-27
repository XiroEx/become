import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VariantPicker } from "@/components/nutrition/VariantPicker";
import { ServingPicker } from "@/components/nutrition/ServingPicker";

export default function FoodDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing food id</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Placeholder — real food + variants hydrate from /api/nutrition/foods/[id].
  const placeholderFood = {
    kcalPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="nutrition-food-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="nutrition-food-route-kav"
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          <Text className="text-foreground text-2xl font-bold">Food</Text>
          <VariantPicker
            variants={[]}
            onSubmit={(_variantId) => {
              /* persist variant choice when data wiring lands */
            }}
          />
          <ServingPicker
            food={placeholderFood}
            onSubmit={() => {
              router.back();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
