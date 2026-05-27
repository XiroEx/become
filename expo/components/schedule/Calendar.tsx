import { View, Text, Pressable } from "react-native";
import {
  type ScheduledSlot,
  statusForDate,
  type SlotStatus,
} from "@/lib/schedule/slotStatus";

export interface CalendarProps {
  /** YYYY-MM (e.g. "2026-05"). */
  month: string;
  selectedDate?: string | null;
  todayDate?: string;
  slots?: ScheduledSlot[];
  onSelectDay?: (date: string) => void;
  testID?: string;
}

const WEEK_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_COLOR: Record<SlotStatus, string> = {
  scheduled: "bg-primary",
  completed: "bg-accent",
  missed: "bg-destructive",
  skipped: "bg-muted",
  rest: "bg-muted",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function Calendar({
  month,
  selectedDate,
  todayDate,
  slots = [],
  onSelectDay,
  testID = "calendar",
}: CalendarProps) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const m0 = Number(monthStr) - 1; // 0-based month
  const totalDays = daysInMonth(year, m0);
  const leadingBlanks = new Date(year, m0, 1).getDay(); // 0..6
  const cells: (string | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) {
    cells.push(`${year}-${pad(m0 + 1)}-${pad(d)}`);
  }
  // Pad trailing to multiple of 7 for clean grid
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View testID={testID} className="bg-card border border-border rounded-2xl p-3">
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        {WEEK_HEADERS.map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text className="text-muted-foreground text-xs">{h}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={ri}
          testID={`${testID}-row-${ri}`}
          style={{ flexDirection: "row" }}
        >
          {row.map((date, ci) => {
            if (!date) {
              return (
                <View
                  key={ci}
                  testID={`${testID}-blank-${ri}-${ci}`}
                  style={{ flex: 1, height: 40 }}
                />
              );
            }
            const status = statusForDate(slots, date);
            const isToday = date === todayDate;
            const isSelected = date === selectedDate;
            return (
              <Pressable
                key={date}
                testID={`${testID}-day-${date}`}
                onPress={() => onSelectDay?.(date)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${date}`}
                accessibilityState={{ selected: isSelected }}
                style={{ flex: 1, height: 40, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    isSelected ? "bg-primary/20 border border-primary" : ""
                  } ${isToday && !isSelected ? "border border-foreground" : ""}`}
                >
                  <Text
                    className={`text-sm ${
                      isSelected ? "text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>
                {status !== "none" ? (
                  <View
                    testID={`${testID}-dot-${date}`}
                    accessibilityLabel={`status-${status}`}
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${STATUS_COLOR[status]}`}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
