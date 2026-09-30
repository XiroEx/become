import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DatePicker } from "@/components/programs/DatePicker";
import {
  suggestTrainingDays,
  generateSchedulePreview,
  suggestStartDate,
} from "@/lib/programs/enrollment";
import { DAY_LABELS } from "@/lib/schedule/scheduleSettings";
import { localDateKey } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ScheduleDoc } from "@become/api-client";
import { Calendar, Check, Dumbbell } from "lucide-react-native";

export interface ScheduleSetupProps {
  programId: string;
  programName: string;
  trainingDaysPerWeek?: number;
  durationWeeks?: number;
  initialStartDate?: string;
  existingSchedule?: ScheduleDoc | null;
  onConfirm: (settings: {
    trainingDays: number[];
    startDate: string;
  }) => Promise<void> | void;
  onSkip: () => void;
  onRecreate?: () => void;
  loading?: boolean;
  submitting?: boolean;
  error?: string | null;
  testID?: string;
}

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

/**
 * Schedule Setup component for configuring program training days and calendar.
 *
 * Mode 1 (view): Summarizes active schedule if one exists, offering "Recreate".
 * Mode 2 (create): 3-step wizard (Training Days -> Start Date -> Preview & Confirm).
 *
 * Rules:
 * - Start date is local YYYY-MM-DD, stored as 00:00Z markers on the server.
 * - Skippable at any step, returning to program detail.
 */
export function ScheduleSetup({
  programId: _programId,
  programName,
  trainingDaysPerWeek = 4,
  durationWeeks = 4,
  initialStartDate,
  existingSchedule = null,
  onConfirm,
  onSkip,
  onRecreate,
  loading = false,
  submitting = false,
  error = null,
  testID = "schedule-setup",
}: ScheduleSetupProps) {
  const { colors } = useThemeTokens();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isRecreating, setIsRecreating] = useState(false);

  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    if (existingSchedule?.settings?.trainingDays) {
      return [...existingSchedule.settings.trainingDays];
    }
    return suggestTrainingDays(trainingDaysPerWeek);
  });

  const [startDate, setStartDate] = useState<string>(() => {
    if (existingSchedule?.settings?.startDate) {
      return existingSchedule.settings.startDate.split("T")[0]!;
    }
    return initialStartDate ?? suggestStartDate(null, new Date());
  });

  const toggleDay = useCallback((day: number) => {
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }, []);

  const previewWorkouts = generateSchedulePreview(startDate, selectedDays, 14);

  if (loading) {
    return (
      <View
        testID={`${testID}-loading`}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 60,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // VIEW MODE: Active schedule already exists
  if (existingSchedule && !isRecreating) {
    const scheduledWorkouts = existingSchedule.scheduledWorkouts ?? [];
    const todayKey = localDateKey(new Date());
    const upcomingCount = scheduledWorkouts.filter(
      (w) =>
        (typeof w.date === "string" ? w.date.slice(0, 10) : "") >= todayKey &&
        w.status === "scheduled",
    ).length;
    const completedCount = scheduledWorkouts.filter(
      (w) => w.status === "completed",
    ).length;
    const daysList = (existingSchedule.settings?.trainingDays ?? [])
      .map((d) => DAY_LABELS[d] ?? `Day ${d}`)
      .join(", ");

    return (
      <ScrollView
        testID={`${testID}-view-mode`}
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        <View style={{ gap: 4 }}>
          <Text className="text-muted text-xs uppercase font-bold tracking-wider">
            Active Schedule
          </Text>
          <Text className="text-foreground text-2xl font-bold">
            {programName}
          </Text>
        </View>

        <Card>
          <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Calendar size={20} color={colors.primary} />
            <Text className="text-foreground text-base font-semibold">
              Schedule Overview
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text className="text-muted text-sm">Training Days</Text>
              <Text className="text-foreground text-sm font-medium">
                {daysList || "None"}
              </Text>
            </View>

            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text className="text-muted text-sm">Upcoming Sessions</Text>
              <Text className="text-foreground text-sm font-medium">
                {upcomingCount}
              </Text>
            </View>

            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text className="text-muted text-sm">Completed</Text>
              <Text className="text-foreground text-sm font-medium">
                {completedCount}
              </Text>
            </View>
          </View>
        </View>
        </Card>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button
            testID="recreate-schedule-btn"
            variant="secondary"
            onPress={() => {
              setIsRecreating(true);
              setStep(1);
              onRecreate?.();
            }}
          >
            Recreate Schedule
          </Button>

          <Button
            testID="back-to-program-btn"
            variant="ghost"
            onPress={onSkip}
          >
            Back to Program
          </Button>
        </View>
      </ScrollView>
    );
  }

  // CREATE / SETUP WIZARD
  return (
    <ScrollView
      testID={`${testID}-wizard`}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      {/* Header & Step progress */}
      <View style={{ gap: 6 }}>
        <Text className="text-muted text-xs uppercase font-bold tracking-wider">
          Step {step} of 3
        </Text>
        <Text className="text-foreground text-2xl font-bold">
          {step === 1 && "Which days will you train?"}
          {step === 2 && "When do you want to start?"}
          {step === 3 && "Preview your schedule"}
        </Text>
        <Text className="text-muted text-sm">
          {step === 1 &&
            `Choose ${trainingDaysPerWeek} training days per week for ${programName}.`}
          {step === 2 &&
            `Pick your start date for this ${durationWeeks}-week program.`}
          {step === 3 && "First 2 weeks of your custom training plan."}
        </Text>
      </View>

      {error ? (
        <View
          testID={`${testID}-error`}
          style={{
            padding: 12,
            backgroundColor: colors.destructive + "15",
            borderRadius: 8,
          }}
        >
          <Text style={{ color: colors.destructive, fontSize: 13 }}>
            {error}
          </Text>
        </View>
      ) : null}

      {/* STEP 1: Training Days Selection */}
      {step === 1 && (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDays.includes(day);
              const label = DAY_LABELS[day] ?? `${day}`;
              return (
                <Pressable
                  key={day}
                  testID={`training-day-${day}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => toggleDay(day)}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    maxWidth: 48,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected
                      ? colors.primary
                      : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isSelected
                        ? colors["primary-foreground"]
                        : colors.foreground,
                      fontWeight: isSelected ? "bold" : "500",
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selectedDays.length === 0 ? (
            <Text className="text-destructive text-xs">
              Please select at least one training day.
            </Text>
          ) : (
            <Text className="text-muted text-xs">
              {selectedDays.length} day{selectedDays.length === 1 ? "" : "s"} selected
            </Text>
          )}

          <View style={{ gap: 10, marginTop: 8 }}>
            <Button
              testID="schedule-step1-next"
              onPress={() => setStep(2)}
              disabled={selectedDays.length === 0 || loading}
            >
              Next: Start Date
            </Button>
            <Button
              testID="schedule-skip-btn"
              variant="secondary"
              onPress={onSkip}
            >
              Skip for now
            </Button>
          </View>
        </View>
      )}

      {/* STEP 2: Start Date */}
      {step === 2 && (
        <View style={{ gap: 16 }}>
          <DatePicker
            value={startDate}
            onChange={setStartDate}
            minDate={localDateKey(new Date())}
            testID={`${testID}-date-picker`}
          />

          <View style={{ gap: 10, marginTop: 8 }}>
            <Button
              testID="schedule-step2-next"
              onPress={() => setStep(3)}
              disabled={!startDate || loading}
            >
              Next: Preview
            </Button>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID="schedule-step2-back"
                  variant="secondary"
                  onPress={() => setStep(1)}
                >
                  Back
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID="schedule-skip-btn"
                  variant="ghost"
                  onPress={onSkip}
                >
                  Skip
                </Button>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* STEP 3: Preview & Confirm */}
      {step === 3 && (
        <View style={{ gap: 16 }}>
          <Card>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Dumbbell size={18} color={colors.primary} />
              <Text className="text-foreground text-sm font-semibold">
                First 2 Weeks Preview
              </Text>
            </View>

            {previewWorkouts.length === 0 ? (
              <Text className="text-muted text-xs">
                No workouts scheduled. Check your training days.
              </Text>
            ) : (
              <View style={{ gap: 6 }}>
                {previewWorkouts.map((pw, idx) => (
                  <View
                    key={`${pw.date}-${idx}`}
                    testID={`preview-day-${idx}`}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 6,
                      borderBottomWidth: idx < previewWorkouts.length - 1 ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: colors.primary + "20",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={12} color={colors.primary} />
                      </View>
                      <Text className="text-foreground text-sm font-medium">
                        {pw.dayLabel}
                      </Text>
                    </View>
                    <Text className="text-muted text-xs">{pw.date}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          </Card>

          <View style={{ gap: 10, marginTop: 8 }}>
            <Button
              testID="schedule-confirm-btn"
              onPress={() =>
                onConfirm({ trainingDays: selectedDays, startDate })
              }
              disabled={submitting || selectedDays.length === 0}
            >
              {submitting ? "Creating schedule..." : "Confirm Schedule"}
            </Button>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID="schedule-step3-back"
                  variant="secondary"
                  onPress={() => setStep(2)}
                  disabled={submitting}
                >
                  Back
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID="schedule-skip-btn"
                  variant="ghost"
                  onPress={onSkip}
                  disabled={submitting}
                >
                  Skip
                </Button>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
