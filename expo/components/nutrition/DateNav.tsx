import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { localDateKey } from "@/lib/time/localDay";

export interface DateNavProps {
  dateKey: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  onSelectDate?: (dateKey: string) => void;
  testID?: string;
}

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
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
  onSelectDate,
  testID = "nutrition-date-nav",
}: DateNavProps) {
  const { colors, scrim } = useThemeTokens();
  const [pickerOpen, setPickerOpen] = useState(false);

  const parts = dateKey.split("-").map(Number);
  const curY = parts[0] ?? 2026;
  const curM = (parts[1] ?? 1) - 1;

  const [viewYear, setViewYear] = useState(curY);
  const [viewMonth, setViewMonth] = useState(curM);

  const openPicker = () => {
    setViewYear(curY);
    setViewMonth(curM);
    setPickerOpen(true);
  };

  const changeMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    } else if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const todayKey = localDateKey(new Date());

  const daysElements = [];
  for (let i = 0; i < firstDay; i++) {
    daysElements.push(
      <View key={`empty-${i}`} style={{ width: "14.28%", height: 36 }} />,
    );
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, "0");
    const mStr = String(viewMonth + 1).padStart(2, "0");
    const cellKey = `${viewYear}-${mStr}-${dStr}`;
    const isSelected = cellKey === dateKey;
    const isCurrentDay = cellKey === todayKey;

    daysElements.push(
      <Pressable
        key={cellKey}
        testID={`date-picker-day-${cellKey}`}
        accessibilityRole="button"
        accessibilityLabel={`Select ${cellKey}`}
        onPress={() => {
          onSelectDate?.(cellKey);
          setPickerOpen(false);
        }}
        style={{
          width: "14.28%",
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isSelected
              ? colors.primary
              : isCurrentDay
              ? colors.primary + "20"
              : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: isSelected || isCurrentDay ? "600" : "400",
              color: isSelected
                ? colors["primary-foreground"]
                : isCurrentDay
                ? colors.primary
                : colors.foreground,
            }}
          >
            {d}
          </Text>
        </View>
      </Pressable>,
    );
  }

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
        accessibilityLabel="Pick a date"
        accessibilityRole="button"
        onPress={openPicker}
        style={{ alignItems: "center" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            testID="nutrition-current-date"
            className="text-foreground text-base font-semibold"
          >
            {formatDateDisplay(dateKey)}
          </Text>
          <ChevronDown size={16} color={colors["muted-foreground"]} />
        </View>
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

      {/* Date Picker Dropdown Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close date picker backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            testID="nutrition-date-picker-dropdown"
            accessibilityRole="none"
            style={{
              width: "100%",
              maxWidth: 340,
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              gap: 12,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header: Month Year + Prev/Next buttons */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Pressable
                testID="date-picker-prev-month"
                accessibilityLabel="Previous month"
                accessibilityRole="button"
                onPress={() => changeMonth(-1)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <ChevronLeft size={20} color={colors.foreground} />
              </Pressable>
              <Text className="text-foreground text-sm font-semibold">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </Text>
              <Pressable
                testID="date-picker-next-month"
                accessibilityLabel="Next month"
                accessibilityRole="button"
                onPress={() => changeMonth(1)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <ChevronRight size={20} color={colors.foreground} />
              </Pressable>
            </View>

            {/* Day of Week Headers */}
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              {WEEKDAYS.map((day) => (
                <Text
                  key={day}
                  className="text-muted-foreground text-xs font-medium w-8 text-center"
                >
                  {day}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {daysElements}
            </View>

            {/* Footer: Today button & Close */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 8,
              }}
            >
              <Pressable
                testID="date-picker-today-btn"
                accessibilityRole="button"
                accessibilityLabel="Jump to today"
                onPress={() => {
                  onSelectDate?.(todayKey);
                  onToday?.();
                  setPickerOpen(false);
                }}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: colors.primary + "15",
                }}
              >
                <Text className="text-primary text-xs font-semibold">
                  Today
                </Text>
              </Pressable>
              <Pressable
                testID="date-picker-close-btn"
                accessibilityRole="button"
                accessibilityLabel="Close date picker"
                onPress={() => setPickerOpen(false)}
                style={{ padding: 6 }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  Close
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
