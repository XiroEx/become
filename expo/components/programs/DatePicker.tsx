import { useCallback, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
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

function parseDateKey(dateKey: string): Date {
  if (!DATE_RE.test(dateKey)) {
    return new Date();
  }
  const parts = dateKey.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  return new Date(y, m, d, 12, 0, 0);
}

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
 * 3. Platform date picker dialog / modal and formatted display.
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
  const { colors, tint, scrim } = useThemeTokens();
  const [inputError, setInputError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const todayKey = localDateKey(new Date());
  const nextMondayKey = suggestStartDate(null, new Date());

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

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowPicker(false);
      }
      if (event.type === "set" && selectedDate) {
        if (Platform.OS !== "android") {
          setShowPicker(false);
        }
        const nextKey = localDateKey(selectedDate);
        if (minDate && nextKey < minDate) {
          setInputError(`Date cannot be before ${minDate}`);
          return;
        }
        setInputError(null);
        onChange(nextKey);
      } else if (event.type === "dismissed") {
        setShowPicker(false);
      }
    },
    [minDate, onChange],
  );

  const pickerDate = parseDateKey(value);
  const minimumDate = minDate && DATE_RE.test(minDate) ? parseDateKey(minDate) : undefined;

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
            backgroundColor: value === todayKey ? tint("primary", 0.08) : colors.card,
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
            backgroundColor: value === nextMondayKey ? tint("primary", 0.08) : colors.card,
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

        <Pressable
          testID={`${testID}-display-btn`}
          accessibilityRole="button"
          accessibilityLabel={`Selected date: ${formatDateDisplay(value)}. Tap to open calendar`}
          onPress={() => setShowPicker(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 4,
            paddingHorizontal: 8,
          }}
        >
          <Calendar size={16} color={colors.primary} />
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
        </Pressable>

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

      {/* Platform date picker trigger */}
      <Pressable
        testID={`${testID}-picker-btn`}
        accessibilityRole="button"
        accessibilityLabel={`Choose date from calendar. Currently ${formatDateDisplay(value)}`}
        onPress={() => setShowPicker(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Calendar size={16} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "500" }}>
          Choose from calendar
        </Text>
      </Pressable>

      {inputError ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          style={{ fontSize: 12, color: colors.destructive }}
        >
          {inputError}
        </Text>
      ) : null}

      {showPicker &&
        (Platform.OS === "ios" ? (
          <Modal
            transparent
            animationType="fade"
            visible={showPicker}
            onRequestClose={() => setShowPicker(false)}
          >
            <Pressable
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: scrim,
              }}
              onPress={() => setShowPicker(false)}
            >
              <Pressable
                style={{
                  backgroundColor: colors.card,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  padding: 16,
                  gap: 12,
                }}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                  <Pressable
                    testID={`${testID}-picker-done`}
                    accessibilityRole="button"
                    accessibilityLabel="Done"
                    onPress={() => setShowPicker(false)}
                    hitSlop={8}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>
                      Done
                    </Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  testID={`${testID}-native-picker`}
                  value={pickerDate}
                  mode="date"
                  display="spinner"
                  minimumDate={minimumDate}
                  onChange={handlePickerChange}
                />
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            testID={`${testID}-native-picker`}
            value={pickerDate}
            mode="date"
            display="default"
            minimumDate={minimumDate}
            onChange={handlePickerChange}
          />
        ))}
    </View>
  );
}
