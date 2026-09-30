import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface DateNavProps {
  dateKey: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  testID?: string;
}

function formatDateDisplay(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DateNav({
  dateKey,
  isToday,
  onPrev,
  onNext,
  onToday,
  testID = "nutrition-date-nav",
}: DateNavProps) {
  const { colors } = useThemeTokens();

  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 4,
      }}
    >
      <Pressable
        testID="nutrition-prev-day"
        accessibilityLabel="Previous day"
        accessibilityRole="button"
        onPress={onPrev}
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronLeft size={20} color={colors.foreground} />
      </Pressable>

      <Pressable
        testID="nutrition-current-date-btn"
        accessibilityLabel="Current date"
        accessibilityRole="button"
        onPress={onToday}
        style={{ alignItems: "center" }}
      >
        <Text
          testID="nutrition-current-date"
          className="text-foreground text-base font-semibold"
        >
          {formatDateDisplay(dateKey)}
        </Text>
        {isToday ? (
          <View
            testID="nutrition-today-badge"
            className="bg-emerald-500/10 px-2 py-0.5 rounded-full mt-0.5"
          >
            <Text className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              Today
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable
        testID="nutrition-next-day"
        accessibilityLabel="Next day"
        accessibilityRole="button"
        onPress={onNext}
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronRight size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}
