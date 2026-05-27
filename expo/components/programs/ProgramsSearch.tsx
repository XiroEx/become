import { useEffect, useState } from "react";
import { View } from "react-native";
import { Input } from "@/components/Input";
import { ProgramsList, type ProgramSummary } from "./ProgramsList";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

export interface ProgramsSearchProps {
  /** Fires after debounceMs of inactivity. */
  onSearch: (query: string) => void;
  results: ProgramSummary[];
  debounceMs?: number;
  onItemPress?: (id: string) => void;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  testID?: string;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function ProgramsSearch({
  onSearch,
  results,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onItemPress,
  setTimeoutImpl,
  clearTimeoutImpl,
  testID = "programs-search",
}: ProgramsSearchProps) {
  const [query, setQuery] = useState<string>("");
  const debounced = useDebouncedValue(
    query,
    debounceMs,
    setTimeoutImpl,
    clearTimeoutImpl,
  );

  useEffect(() => {
    onSearch(debounced);
    // onSearch identity is caller-owned; only re-fire when the debounced
    // value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <View testID={testID}>
      <Input
        testID={`${testID}-input`}
        label="Search programs"
        placeholder="Strength, hypertrophy…"
        value={query}
        onChangeText={setQuery}
      />
      <View style={{ height: 12 }} />
      <ProgramsList
        testID={`${testID}-results`}
        programs={results}
        onItemPress={onItemPress}
      />
    </View>
  );
}
