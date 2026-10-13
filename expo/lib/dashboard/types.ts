import type { StreaksLite } from "@become/core/training/streaks/tile";
import type { DashboardSuggestion } from "@become/api-client";

export interface DashboardStatData {
  streakDays: number;
  longestStreak?: number;
  nextMilestone?: number | null;
  activityToday?: boolean;
  streaksLite?: StreaksLite | null;
  todaysMood?: number | null;
  recentMoods?: number[];
  thisWeekWorkouts: number;
  weeklyTarget?: number | null;
  fitnessGoal?: string | null;
  nutritionDirection?: string | null;
  targetWeightKg?: number | null;
  startWeightKg?: number | null;
  latestWeight?: number | null;
  earliestWeight?: number | null;
  weightUnit?: "lbs" | "kg";
  pace?: { status: string; eta: string; behindByKg: number } | null;
  programProgress?: {
    name: string;
    completedWorkouts?: number | null;
    totalWorkouts?: number | null;
    currentWeek: number;
    totalWeeks: number;
    programId: string;
  } | null;
  caloriesConsumed?: number;
  caloriesGoal?: number;
  waterCurrent?: number;
  waterGoal?: number;
  totalWorkouts?: number;
  weightEntries?: { date: string; value: number }[];
}

export interface UpcomingWorkoutSummary {
  dateLabel: string;
  workoutTitle: string;
  programName: string;
  programId?: string;
  dayLabel?: string;
  date?: string;
  phase?: number;
  workoutIndex?: number;
}

export type { DashboardSuggestion };
