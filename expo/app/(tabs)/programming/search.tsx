import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramsSearch,
} from "@/components/programs/ProgramsSearch";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

export default function ProgramsSearchRoute() {
  const router = useRouter();
  const [results, setResults] = useState<ProgramSummary[]>([]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-search-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Search</Text>
        <ProgramsSearch
          onSearch={(q) => {
            // Real search endpoint wiring lands in a follow-up.
            if (!q) setResults([]);
          }}
          results={results}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
