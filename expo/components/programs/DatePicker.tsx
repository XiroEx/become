import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { localDateKey } from "@/lib/time/localDay";
import { suggestStartDate } from "@/lib/programs/enrollment";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string;
  testID?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function stepDay(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m, d, 12, 0, 0);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

function formatDateDisplay(dateKey: string): string {
  if (!DATE_RE.test(dateKey)) return dateKey;
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m, d, 12, 0, 0);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Native date picker tailored for program start dates.
 *
 * Provides:
 * 1. Quick presets: "Today", "Next Monday".
 * 2. Day stepper (-1 day / +1 day).
 * 3. Formatted display and direct YYYY-MM-DD input.
 *
 * Rules:
 * - Dates are ALWAYS device-local calendar dates (YYYY-MM-DD), never `toISOString()`.
 * - Choosing 'Today' at 22:00 Pacific evaluates to today's date, not tomorrow.
 */
export function DatePicker({
  value,
  onChange,
  minDate,
  testID = "date-picker",
}: DatePickerProps) {
  const { colors } = useThemeTokens();
  const [inputError, setInputError] = useState<string | null>(null);

  const todayKey = localDateKey(new Date());
  const nextMondayKey = suggestStartDate(null, new Date());

  const handleTextChange = useCallback(
    (text: string) => {
      onChange(text);
      if (text.length === 10) {
        if (!DATE_RE.test(text)) {
          setInputError("Format must be YYYY-MM-DD");
        } else if (minDate && text < minDate) {
          setInputError(`Date cannot be before ${minDate}`);
        } else {
          setInputError(null);
        }
      } else {
        setInputError(null);
      }
    },
    [onChange, minDate],
  );

  const handleStep = useCallback(
    (delta: number) => {
      if (!DATE_RE.test(value)) return;
      const nextDate = stepDay(value, delta);
      if (minDate && nextDate < minDate) return;
      setInputError(null);
      onChange(nextDate);
    },
    [value, minDate, onChange],
  );

  return (
    <View testID={testID} style={{ gap: 12 }}>
      {/* Quick selection chips */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          testID={`${testID}-today-btn`}
          accessibilityRole="button"
          accessibilityLabel="Set start date to today"
          onPress={() => {
            setInputError(null);
            onChange(todayKey);
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: value === todayKey ? colors.primary : colors.border,
            backgroundColor: value === todayKey ? colors.primary + "15" : colors.card,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: value === todayKey ? colors.primary : colors.foreground,
              fontWeight: value === todayKey ? "600" : "400",
              fontSize: 13,
            }}
          >
            Today
          </Text>
        </Pressable>

        <Pressable
          testID={`${testID}-next-monday-btn`}
          accessibilityRole="button"
          accessibilityLabel="Set start date to next Monday"
          onPress={() => {
            setInputError(null);
            onChange(nextMondayKey);
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: value === nextMondayKey ? colors.primary : colors.border,
            backgroundColor: value === nextMondayKey ? colors.primary + "15" : colors.card,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: value === nextMondayKey ? colors.primary : colors.foreground,
              fontWeight: value === nextMondayKey ? "600" : "400",
              fontSize: 13,
            }}
          >
            Next Monday
          </Text>
        </Pressable>
      </View>

      {/* Stepper & Display */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 6,
        }}
      >
        <Pressable
          testID={`${testID}-prev-day`}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => handleStep(-1)}
          disabled={Boolean(minDate && value <= minDate)}
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            opacity: minDate && value <= minDate ? 0.3 : 1,
          }}
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>

        <View style={{ alignItems: "center" }}>
          <Text
            testID={`${testID}-display`}
            style={{
              color: colors.foreground,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {formatDateDisplay(value)}
          </Text>
        </View>

        <Pressable
          testID={`${testID}-next-day`}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          onPress={() => handleStep(1)}
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

      {/* Direct YYYY-MM-DD Input */}
      <Input
        testID={`${testID}-input`}
        label="Calendar Date (YYYY-MM-DD)"
        value={value}
        onChangeText={handleTextChange}
        placeholder="YYYY-MM-DD"
        error={inputError ?? undefined}
      />
    </View>
  );
}
