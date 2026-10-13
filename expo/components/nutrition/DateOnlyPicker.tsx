import { useMemo, useState, useCallback } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { compareDateKeys, todayLocalKey } from "@/lib/nutrition/mealPlanDates";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatDatePillLabel(key: string | null, now: Date = new Date()): string {
  if (!key) return "Now";
  const m = YYYY_MM_DD.exec(key);
  if (!m) return key;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function parseKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const m = YYYY_MM_DD.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateToKey(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const days: Date[] = [];
  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
  }
  return days;
}

function getTodayMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export interface DateOnlyPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  minDate?: string;
  maxDate?: string;
  showTodayChip?: boolean;
  clearLabel?: string;
  onClear?: () => void;
  testID?: string;
}

export function DateOnlyPicker({
  value,
  onChange,
  minDate,
  maxDate,
  showTodayChip = false,
  clearLabel = "Clear",
  onClear,
  testID = "date-only-picker",
}: DateOnlyPickerProps) {
  const { colors, tint } = useThemeTokens();
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const fromValue = parseKey(value);
    if (fromValue) return new Date(fromValue.getFullYear(), fromValue.getMonth(), 1);
    return getTodayMonthStart();
  });

  const todayKey = useMemo(() => todayLocalKey(), []);
  const selectedKey = value ?? null;

  const monthDays = useMemo(
    () => getMonthDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  );

  const goPrevMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goNextMonth = useCallback(() => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const handlePickToday = useCallback(() => {
    setViewMonth(getTodayMonthStart());
    onChange(todayLocalKey());
  }, [onChange]);

  const isDisabled = useCallback(
    (key: string): boolean => {
      if (minDate && compareDateKeys(key, minDate) < 0) return true;
      if (maxDate && compareDateKeys(key, maxDate) > 0) return true;
      return false;
    },
    [minDate, maxDate],
  );

  const viewMonthIdx = viewMonth.getMonth();
  const viewYear = viewMonth.getFullYear();

  return (
    <View
      testID={testID}
      style={{
        width: "100%",
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        gap: 12,
      }}
    >
      {showTodayChip && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable
            testID={`${testID}-today-chip`}
            accessibilityRole="button"
            accessibilityLabel="Jump to today"
            onPress={handlePickToday}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: tint("primary", 0.12),
            }}
          >
            <Text className="text-primary text-xs font-semibold">Today</Text>
          </Pressable>
          {onClear && (
            <Pressable
              testID={`${testID}-clear`}
              accessibilityRole="button"
              accessibilityLabel={clearLabel}
              onPress={onClear}
              style={{ paddingVertical: 4, paddingHorizontal: 8 }}
            >
              <Text className="text-muted-foreground text-xs">{clearLabel}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Month nav */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable
          testID={`${testID}-prev-month`}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={goPrevMonth}
          hitSlop={8}
          style={{ padding: 4 }}
        >
          <ChevronLeft size={18} color={colors.foreground} />
        </Pressable>
        <Text className="text-foreground text-sm font-semibold">
          {MONTH_NAMES[viewMonthIdx]} {viewYear}
        </Text>
        <Pressable
          testID={`${testID}-next-month`}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={goNextMonth}
          hitSlop={8}
          style={{ padding: 4 }}
        >
          <ChevronRight size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {DAY_LABELS.map((label, idx) => (
          <Text
            key={`${label}-${idx}`}
            className="text-muted-foreground text-xs font-medium w-8 text-center"
          >
            {label}
          </Text>
        ))}
      </View>

      {/* Days grid */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around" }}>
        {monthDays.map((day) => {
          const key = dateToKey(day);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          const isCurrentMonth = day.getMonth() === viewMonthIdx;
          const disabled = isDisabled(key);

          return (
            <Pressable
              key={key}
              testID={`${testID}-day-${key}`}
              accessibilityRole="button"
              accessibilityLabel={key}
              accessibilityState={{ selected: isSelected, disabled }}
              disabled={disabled}
              onPress={() => onChange(key)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                marginVertical: 2,
                backgroundColor: isSelected ? colors.primary : "transparent",
                opacity: disabled ? 0.3 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: isSelected || isToday ? "700" : "400",
                  color: isSelected
                    ? colors["primary-foreground"]
                    : isCurrentMonth
                      ? colors.foreground
                      : colors["muted-foreground"],
                }}
              >
                {day.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default DateOnlyPicker;
