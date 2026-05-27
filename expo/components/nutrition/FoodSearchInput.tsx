import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Input } from "@/components/Input";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

export type FoodSource = "custom" | "usda" | "off";

export interface FoodSearchResult {
  id: string;
  name: string;
  brand?: string | null;
  source: FoodSource;
  kcalPer100g: number;
}

const SOURCE_LABEL: Record<FoodSource, string> = {
  custom: "Custom",
  usda: "USDA",
  off: "OFF",
};

export interface FoodSearchInputProps {
  results: FoodSearchResult[];
  onSearch: (query: string) => void;
  onPickResult?: (result: FoodSearchResult) => void;
  debounceMs?: number;
  /** Inject for tests using fake timers. */
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  testID?: string;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function FoodSearchInput({
  results,
  onSearch,
  onPickResult,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  setTimeoutImpl,
  clearTimeoutImpl,
  testID = "food-search",
}: FoodSearchInputProps) {
  const [query, setQuery] = useState<string>("");
  const debounced = useDebouncedValue(
    query,
    debounceMs,
    setTimeoutImpl,
    clearTimeoutImpl,
  );

  useEffect(() => {
    onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <View testID={testID}>
      <Input
        testID={`${testID}-input`}
        label="Find a food"
        placeholder="Apple, chicken breast…"
        autoCapitalize="none"
        value={query}
        onChangeText={setQuery}
      />
      <View style={{ marginTop: 12, gap: 8 }}>
        {results.map((r) => (
          <Pressable
            key={r.id}
            testID={`${testID}-result-${r.id}`}
            onPress={() => onPickResult?.(r)}
            accessibilityRole="button"
            accessibilityLabel={`Pick ${r.name}`}
            className="bg-card border border-border rounded-xl p-3 flex-row items-center justify-between"
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text className="text-foreground font-semibold">{r.name}</Text>
              {r.brand ? (
                <Text className="text-muted-foreground text-xs">{r.brand}</Text>
              ) : null}
            </View>
            <View
              testID={`${testID}-result-${r.id}-source`}
              className={`rounded-full px-2 py-0.5 ${
                r.source === "custom"
                  ? "bg-primary"
                  : r.source === "usda"
                    ? "bg-muted"
                    : "bg-accent"
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${
                  r.source === "custom"
                    ? "text-primary-foreground"
                    : r.source === "usda"
                      ? "text-foreground"
                      : "text-accent-foreground"
                }`}
              >
                {SOURCE_LABEL[r.source]}
              </Text>
            </View>
          </Pressable>
        ))}
        {results.length === 0 ? (
          <Text
            testID={`${testID}-empty`}
            className="text-muted-foreground text-center mt-2"
          >
            No results yet.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
