import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Friendly label for a date pill. `null` → "Now". Today → "Today". Yesterday/
 * tomorrow → relative. Else → "Oct 6, 2026" via toLocaleDateString.
 */
export function formatDatePillLabel(
  key: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!key) return "Now";
  const m = YYYY_MM_DD.exec(key);
  if (!m) return key;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  return target.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

interface MonthDay {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
}

function getMonthDays(year: number, month: number): MonthDay[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const days: MonthDay[] = [];

  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push({ date: d, key: dateToKey(d), isCurrentMonth: false });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, key: dateToKey(d), isCurrentMonth: true });
  }
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ date: d, key: dateToKey(d), isCurrentMonth: false });
    }
  }
  return days;
}

export interface DateOnlyPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  testID?: string;
}

export function DateOnlyPicker({
  value,
  onChange,
  minDate,
  maxDate,
  testID = "date-only-picker",
}: DateOnlyPickerProps) {
  const { colors } = useThemeTokens();
  const initialDate = useMemo(() => parseKey(value) ?? new Date(), [value]);
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  const days = useMemo(
    () => getMonthDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const goPrev = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, []);

  const goNext = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, []);

  return (
    <View
      testID={testID}
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
      }}
    >
      {/* Month & year navigation */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text className="text-foreground text-sm font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable
            testID={`${testID}-prev`}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={goPrev}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={16} color={colors.foreground} />
          </Pressable>
          <Pressable
            testID={`${testID}-next`}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={goNext}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronRight size={16} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Weekday headers */}
      <View
        style={{
          flexDirection: "row",
          marginBottom: 6,
        }}
      >
        {DAY_LABELS.map((label, idx) => (
          <View
            key={idx}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text className="text-muted-foreground text-[10px] font-semibold">
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Days grid */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
        }}
      >
        {days.map((item) => {
          const isSelected = item.key === value;
          const isDisabled =
            (minDate && item.key < minDate) || (maxDate && item.key > maxDate);

          return (
            <View
              key={item.key}
              style={{
                width: "14.285%",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 3,
              }}
            >
              <Pressable
                testID={`date-picker-day-${item.key}`}
                accessibilityRole="button"
                accessibilityLabel={formatDatePillLabel(item.key)}
                accessibilityState={{ selected: isSelected, disabled: !!isDisabled }}
                disabled={!!isDisabled}
                onPress={() => onChange(item.key)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? colors.primary : "transparent",
                  opacity: isDisabled ? 0.3 : item.isCurrentMonth ? 1 : 0.4,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isSelected ? "bold" : "500",
                    color: isSelected
                      ? colors["primary-foreground"]
                      : colors.foreground,
                  }}
                >
                  {item.date.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
