import { useRef, useState } from "react";
import { View, Pressable, type GestureResponderEvent } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { localDateKey } from "@/lib/time/localDay";
import {
  type ScheduledSlot,
  type QuickCalItem,
  type SlotStatus,
  isMakeupWorkout,
} from "@/lib/schedule/slotStatus";

export interface CalendarProps {
  /** YYYY-MM (e.g. "2026-05"). Optional if currentDate is provided. */
  month?: string;
  selectedDate?: string | null;
  todayDate?: string;
  slots?: ScheduledSlot[];
  quickSessions?: QuickCalItem[];
  onSelectDay?: (date: string) => void;
  viewMode?: "month" | "week";
  currentDate?: Date;
  onPrev?: () => void;
  onNext?: () => void;
  onChangeViewMode?: (mode: "month" | "week") => void;
  onGoToToday?: () => void;
  testID?: string;
}

const WEEK_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

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

// Matches the web's hardcoded calendar palette exactly
// (webapp/app/dashboard/calendar/CalendarClient.tsx), not the brand
// semantic tokens (`bg-primary`/`bg-accent`/`bg-destructive`) — those are
// the brand red/amber/red and made Scheduled look like Incomplete and
// Completed look orange (NP-240). The web never themes these per
// light/dark either, so the same literal classes apply in both modes.
const STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-blue-500",
  completed: "bg-green-700",
  makeup: "bg-green-300",
  missed: "bg-red-600",
  skipped: "bg-amber-400",
  rest: "bg-muted",
  planned: "bg-blue-500",
  incomplete: "bg-red-600",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getWeekDays(referenceDate: Date): string[] {
  const d = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  d.setDate(d.getDate() - d.getDay());
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(d);
    wd.setDate(d.getDate() + i);
    days.push(
      `${wd.getFullYear()}-${pad(wd.getMonth() + 1)}-${pad(wd.getDate())}`,
    );
  }
  return days;
}

interface DayMarker {
  key: string;
  status: string;
  colorClass: string;
  isQuick?: boolean;
}

export function Calendar({
  month,
  selectedDate,
  todayDate,
  slots = [],
  quickSessions = [],
  onSelectDay,
  viewMode: controlledViewMode,
  currentDate: controlledCurrentDate,
  onPrev,
  onNext,
  onChangeViewMode,
  onGoToToday,
  testID = "calendar",
}: CalendarProps) {
  const { colors } = useThemeTokens();

  // Support both controlled and uncontrolled viewMode
  const [internalViewMode, setInternalViewMode] = useState<"month" | "week">(
    "month",
  );
  const activeViewMode = controlledViewMode ?? internalViewMode;

  // Support both controlled and uncontrolled currentDate
  const [internalCurrentDate, setInternalCurrentDate] = useState<Date>(() => {
    if (month) {
      const [y, m] = month.split("-").map(Number);
      return new Date(y ?? 2026, (m ?? 1) - 1, 1, 12, 0, 0);
    }
    return new Date();
  });
  const effectiveCurrentDate = controlledCurrentDate ?? internalCurrentDate;

  const effectiveMonth = month
    ? month
    : `${effectiveCurrentDate.getFullYear()}-${pad(effectiveCurrentDate.getMonth() + 1)}`;

  const effectiveTodayDate = todayDate ?? localDateKey(new Date());

  const handlePrev = () => {
    if (onPrev) {
      onPrev();
    } else {
      setInternalCurrentDate((prev) => {
        if (activeViewMode === "month") {
          return new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12, 0, 0);
        }
        const d = new Date(prev);
        d.setDate(d.getDate() - 7);
        return d;
      });
    }
  };

  const handleNext = () => {
    if (onNext) {
      onNext();
    } else {
      setInternalCurrentDate((prev) => {
        if (activeViewMode === "month") {
          return new Date(prev.getFullYear(), prev.getMonth() + 1, 1, 12, 0, 0);
        }
        const d = new Date(prev);
        d.setDate(d.getDate() + 7);
        return d;
      });
    }
  };

  const handleGoToToday = () => {
    if (onGoToToday) {
      onGoToToday();
    } else {
      setInternalCurrentDate(new Date());
      onSelectDay?.(effectiveTodayDate);
    }
  };

  const handleViewModeChange = (mode: "month" | "week") => {
    setInternalViewMode(mode);
    onChangeViewMode?.(mode);
  };

  // Header period label
  const headerText =
    activeViewMode === "month"
      ? (() => {
          const [yStr, mStr] = effectiveMonth.split("-");
          const mIdx = Number(mStr) - 1;
          return `${MONTH_NAMES[mIdx] ?? ""} ${yStr}`;
        })()
      : (() => {
          const week = getWeekDays(effectiveCurrentDate);
          const w0 = week[0] ?? "";
          const w6 = week[6] ?? "";
          const [y1, m1, d1] = w0.split("-").map(Number);
          const [y2, m2, d2] = w6.split("-").map(Number);
          const month1 = m1 ?? 1;
          const month2 = m2 ?? 1;
          const day1 = d1 ?? 1;
          const day2 = d2 ?? 1;
          const year1 = y1 ?? 2026;
          const year2 = y2 ?? 2026;
          if (month1 === month2) {
            return `${MONTH_NAMES[month1 - 1]} ${day1}–${day2}, ${year1}`;
          }
          return `${MONTH_NAMES[month1 - 1]?.slice(0, 3) ?? ""} ${day1} – ${MONTH_NAMES[month2 - 1]?.slice(0, 3) ?? ""} ${day2}, ${year2}`;
        })();

  // Rows and cells. Each cell carries whether it falls outside the active
  // month (web's `!isThisMonth` — Sep 27-30 padding before Nov 1, etc.): the
  // grid always shows a full 7-day week, and those leading/trailing days get
  // their real adjacent-month date (and markers) rather than a blank square
  // (NP-292). The schedule fetch already pads 7 days either side of the
  // month for exactly this reason, so the data for them is on hand.
  let rows: ({ date: string; outside: boolean } | null)[][] = [];
  if (activeViewMode === "month") {
    const [yearStr, monthStr] = effectiveMonth.split("-");
    const year = Number(yearStr);
    const m0 = Number(monthStr) - 1;
    const totalDays = daysInMonth(year, m0);
    const leadingBlanks = new Date(year, m0, 1).getDay();
    const cells: { date: string; outside: boolean }[] = [];
    for (let i = leadingBlanks; i > 0; i--) {
      const d = new Date(year, m0, 1 - i);
      cells.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        outside: true,
      });
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push({ date: `${year}-${pad(m0 + 1)}-${pad(d)}`, outside: false });
    }
    let trailDay = 1;
    while (cells.length % 7 !== 0) {
      const d = new Date(year, m0 + 1, trailDay++);
      cells.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        outside: true,
      });
    }
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  } else {
    rows = [getWeekDays(effectiveCurrentDate).map((date) => ({ date, outside: false }))];
  }

  // Swipe handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent?.pageX ?? null;
    touchStartY.current = e.nativeEvent?.pageY ?? null;
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.nativeEvent?.pageX ?? touchStartX.current;
    const endY = e.nativeEvent?.pageY ?? touchStartY.current;
    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) {
      handleNext();
    } else {
      handlePrev();
    }
  };

  return (
    <View
      testID={testID}
      className="bg-card border border-border rounded-2xl p-3"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Controls Header: View Mode Switcher + Today & Arrows */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        {/* View Toggle */}
        <View
          testID={`${testID}-views-toggle`}
          className="flex-row bg-muted rounded-lg p-0.5"
        >
          <Pressable
            testID={`${testID}-view-month`}
            accessibilityRole="button"
            accessibilityLabel="Month view"
            onPress={() => handleViewModeChange("month")}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 6,
            }}
            className={activeViewMode === "month" ? "bg-card shadow-sm" : ""}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: activeViewMode === "month" ? "600" : "500",
              }}
              className={
                activeViewMode === "month"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              Month
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-view-week`}
            accessibilityRole="button"
            accessibilityLabel="Week view"
            onPress={() => handleViewModeChange("week")}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 6,
            }}
            className={activeViewMode === "week" ? "bg-card shadow-sm" : ""}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: activeViewMode === "week" ? "600" : "500",
              }}
              className={
                activeViewMode === "week"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }
            >
              Week
            </Text>
          </Pressable>
        </View>

        {/* Today + Arrows */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Pressable
            testID={`${testID}-today-button`}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={handleGoToToday}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "600" }}
              className="text-primary"
            >
              Today
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-prev-button`}
            accessibilityRole="button"
            accessibilityLabel={
              activeViewMode === "week" ? "Previous week" : "Previous month"
            }
            onPress={handlePrev}
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>
          <Pressable
            testID={`${testID}-next-button`}
            accessibilityRole="button"
            accessibilityLabel={
              activeViewMode === "week" ? "Next week" : "Next month"
            }
            onPress={handleNext}
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
            }}
          >
            <ChevronRight size={18} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Period Title */}
      <View style={{ marginBottom: 10, alignItems: "center" }}>
        <Text
          testID={`${testID}-header-period`}
          style={{ fontSize: 16, fontWeight: "600" }}
          className="text-foreground"
        >
          {headerText}
        </Text>
      </View>

      {/* Weekday headers */}
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        {WEEK_HEADERS.map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text className="text-muted-foreground text-xs">{h}</Text>
          </View>
        ))}
      </View>

      {/* Grid rows */}
      {rows.map((row, ri) => (
        <View
          key={ri}
          testID={`${testID}-row-${ri}`}
          style={{ flexDirection: "row" }}
        >
          {row.map((cell, ci) => {
            if (!cell) {
              return (
                <View
                  key={ci}
                  testID={`${testID}-blank-${ri}-${ci}`}
                  style={{ flex: 1, height: 40 }}
                />
              );
            }
            const { date, outside } = cell;

            const daySlots = slots.filter((s) => s.date === date);
            const dayQuick = quickSessions.filter((q) => {
              const qDay = localDateKey(new Date(q.date));
              return qDay === date;
            });

            const markers: DayMarker[] = [];
            for (let i = 0; i < daySlots.length; i++) {
              const w = daySlots[i];
              if (!w || w.status === "rest") continue;
              const isMakeup =
                w.status === "completed" &&
                !!w.completedAt &&
                isMakeupWorkout(w.date, w.completedAt);
              const status: SlotStatus | "makeup" = isMakeup
                ? "makeup"
                : w.status;
              const colorClass = STATUS_COLOR[status] ?? "bg-blue-500";
              markers.push({
                key: `w-${w.programId}-${w.workoutIndex}-${i}`,
                status,
                colorClass,
              });
            }

            for (let i = 0; i < dayQuick.length; i++) {
              const q = dayQuick[i];
              if (!q) continue;
              const colorClass = STATUS_COLOR[q.status] ?? "bg-blue-500";
              markers.push({
                key: `q-${q.sessionId ?? i}`,
                status: q.status,
                colorClass,
                isQuick: true,
              });
            }

            const isToday = date === effectiveTodayDate;
            const isSelected = date === selectedDate;
            const markerLimit = activeViewMode === "week" ? 10 : 6;

            return (
              <Pressable
                key={date}
                testID={`${testID}-day-${date}`}
                onPress={() => onSelectDay?.(date)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${date}`}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1,
                  minHeight: activeViewMode === "week" ? 80 : 44,
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingVertical: 3,
                  opacity: outside ? 0.4 : 1,
                }}
              >
                <View
                  className={`w-8 h-8 rounded-full items-center justify-center ${
                    isSelected ? "bg-primary/20 border border-primary" : ""
                  } ${isToday && !isSelected ? "border border-foreground" : ""}`}
                >
                  <Text
                    className={`text-sm ${
                      isSelected
                        ? "text-primary font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {Number(date.slice(8, 10))}
                  </Text>
                </View>

                {markers.length > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 2,
                      marginTop: 2,
                      maxWidth: 36,
                    }}
                  >
                    {markers.slice(0, markerLimit).map((m, mi) => (
                      <View
                        key={m.key}
                        testID={
                          mi === 0
                            ? `${testID}-dot-${date}`
                            : `${testID}-dot-${date}-${mi}`
                        }
                        accessibilityLabel={`status-${m.status}`}
                        style={{ width: 6, height: 6, borderRadius: 3 }}
                        className={`${m.colorClass} ${
                          m.isQuick ? "border border-purple-400" : ""
                        }`}
                      />
                    ))}
                    {markers.length > markerLimit ? (
                      <Text
                        style={{ fontSize: 8, fontWeight: "bold" }}
                        className="text-muted-foreground"
                      >
                        +{markers.length - markerLimit}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {activeViewMode === "week" && daySlots.length > 0 && (
                  <View
                    style={{
                      width: "100%",
                      marginTop: 4,
                      paddingHorizontal: 1,
                      gap: 2,
                    }}
                  >
                    {daySlots.slice(0, 3).map((slot, si) => (
                      <View
                        key={si}
                        testID={`${testID}-pill-${date}-${si}`}
                        className="bg-primary/15 rounded px-0.5 py-0.5"
                      >
                        <Text
                          numberOfLines={1}
                          style={{ fontSize: 9, fontWeight: "500" }}
                          className="text-primary text-center"
                        >
                          {slot.dayLabel || `Day ${slot.workoutIndex + 1}`}
                        </Text>
                      </View>
                    ))}
                    {daySlots.length > 3 && (
                      <Text
                        style={{ fontSize: 8, textAlign: "center" }}
                        className="text-muted-foreground font-semibold"
                      >
                        +{daySlots.length - 3} more
                      </Text>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* Color Legend */}
      <View
        testID={`${testID}-legend`}
        className="flex-row flex-wrap border-t border-border mt-3 pt-2.5"
        style={{
          columnGap: 14,
          rowGap: 6,
        }}
      >
        <View
          testID="legend-completed"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{ width: 8, height: 8, borderRadius: 4 }}
            className="bg-green-700"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Completed
          </Text>
        </View>
        <View
          testID="legend-makeup"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{ width: 8, height: 8, borderRadius: 4 }}
            className="bg-green-300"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Made Up
          </Text>
        </View>
        <View
          testID="legend-scheduled"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{ width: 8, height: 8, borderRadius: 4 }}
            className="bg-blue-500"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Scheduled
          </Text>
        </View>
        <View
          testID="legend-incomplete"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{ width: 8, height: 8, borderRadius: 4 }}
            className="bg-red-600"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Incomplete
          </Text>
        </View>
        <View
          testID="legend-skipped"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{ width: 8, height: 8, borderRadius: 4 }}
            className="bg-amber-400"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Skipped
          </Text>
        </View>
        <View
          testID="legend-quick"
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
            }}
            className="bg-purple-500 border border-purple-300"
          />
          <Text style={{ fontSize: 11 }} className="text-muted-foreground">
            Quick session
          </Text>
        </View>
      </View>
    </View>
  );
}
