import type { StreaksLite } from "./streakTile";

export interface MetricData {
  date: string;
  value: number;
}

export interface UserProgressData {
  weightData: MetricData[];
  bmiData: MetricData[];
  moodData: MetricData[];
  currentProgram?: {
    programId: string;
    name: string;
    currentPhase: number;
    currentWeek: number;
    totalWeeks: number;
    completedWorkouts?: number | null;
    totalWorkouts?: number | null;
    nextWorkout?: string;
  } | null;
  stats: {
    totalWorkouts: number;
    thisWeekWorkouts: number;
    thisMonthWorkouts?: number;
    currentStreak?: number;
    longestStreak?: number;
  };
  goal?: {
    fitnessGoal?: string | null;
    nutritionDirection?: string | null;
    targetWeightKg?: number | null;
    startWeightKg?: number | null;
    weightUnit?: "lbs" | "kg";
    pace?: { status: string; eta: string; behindByKg: number } | null;
    weeklyAvailability?: number | null;
  } | null;
}

export interface DashboardStreakData {
  streakDays: number;
  longestStreak: number;
  nextMilestone: number | null;
  activityToday: boolean;
  streakFreezes: number;
}

export interface DashboardNutritionData {
  calories: {
    consumed: number;
    goal: number;
  } | null;
  protein?: {
    consumed: number;
    goal: number;
  } | null;
  water?: {
    consumed: number;
    goal: number;
  } | null;
}

export interface DashboardTileContext {
  data: UserProgressData;
  streakData: DashboardStreakData | null;
  nutritionData: DashboardNutritionData | null;
  streaks?: StreaksLite | null;
  weeklyAvailability: number | null;
  weightUnit: "lbs" | "kg";
  todaysMood: number | null;
  isMoodUpdating?: boolean;
  onMoodChange?: (mood: number) => void;
  onOpenCheckIn?: () => void;
  loading?: boolean;
}

export interface BecomingWidgetData {
  mindLevel: number;
  mindChapter: number;
  mindChapterName?: string | null;
  nutritionPace?: string;
  nutritionTargetWeight?: number | null;
  nutritionUnit?: string;
  trainingDone: number;
  trainingTarget: number;
  averagePacePct: number;
}

export interface SuggestionAction {
  label: string;
  href: string;
}

export interface SuggestionItem {
  id: string;
  severity: "info" | "nudge" | "warning" | "celebration";
  title: string;
  body: string;
  primaryAction?: SuggestionAction;
  dismissible: boolean;
}
