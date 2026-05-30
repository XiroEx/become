import { View, Text, Pressable, ScrollView } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { resolveToken } from "@/lib/theme/tokens";
import {
  defaultBrowserLauncher,
  openProgramEditInBrowser,
  programEditUrl,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";

export interface ProgramWorkoutOutline {
  workoutIndex: number;
  title: string;
  exerciseCount: number;
}

export interface ProgramPhaseOutline {
  phaseIndex: number;
  name: string;
  weekStart: number;
  weekEnd: number;
  workouts: ProgramWorkoutOutline[];
}

export interface ProgramDetailViewModel {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  targetUser?: "Beginner" | "Intermediate" | "Advanced";
  phases: ProgramPhaseOutline[];
}

export interface ProgramDetailProps {
  program: ProgramDetailViewModel;
  onPhasePress?: (phaseIndex: number) => void;
  onStart?: () => void;
  /** Enroll in this program. When provided, drives the primary action button. */
  onEnroll?: () => void;
  /** Adjust the enrolled start date. Button renders only when provided. */
  onSetStartDate?: () => void;
  /** Abandon the program. Button renders only when provided. */
  onAbandon?: () => void;
  /** Disables the action buttons while a mutation is in flight. */
  actionPending?: boolean;
  /** Tier-3 'Edit in browser' launcher — defaults to expo-web-browser. */
  browserLauncher?: BrowserLauncher;
  testID?: string;
}

export function ProgramDetail({
  program,
  onPhasePress,
  onStart,
  onEnroll,
  onSetStartDate,
  onAbandon,
  actionPending = false,
  browserLauncher = defaultBrowserLauncher,
  testID = "program-detail",
}: ProgramDetailProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} testID={testID}>
      <View>
        <Text testID={`${testID}-name`} className="text-foreground text-2xl font-bold mb-1">
          {program.name}
        </Text>
        <Text testID={`${testID}-description`} className="text-muted-foreground text-sm">
          {program.description}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {program.targetUser ? (
            <Text className="text-muted-foreground text-xs">{program.targetUser}</Text>
          ) : null}
          {program.durationWeeks ? (
            <Text className="text-muted-foreground text-xs">
              {program.durationWeeks} weeks
            </Text>
          ) : null}
          {program.trainingDaysPerWeek ? (
            <Text className="text-muted-foreground text-xs">
              {program.trainingDaysPerWeek}d / week
            </Text>
          ) : null}
        </View>
      </View>

      <Button
        testID={`${testID}-start`}
        onPress={onEnroll ?? onStart ?? (() => {})}
        disabled={actionPending}
      >
        {onEnroll ? "Enroll in program" : "Start program"}
      </Button>

      {onSetStartDate ? (
        <Button
          testID={`${testID}-set-start-date`}
          variant="secondary"
          onPress={onSetStartDate}
          disabled={actionPending}
        >
          Change start date
        </Button>
      ) : null}

      {onAbandon ? (
        <Button
          testID={`${testID}-abandon`}
          variant="secondary"
          onPress={onAbandon}
          disabled={actionPending}
        >
          Abandon program
        </Button>
      ) : null}

      <View style={{ gap: 12 }}>
        {program.phases.map((phase) => (
          <Pressable
            key={phase.phaseIndex}
            testID={`${testID}-phase-${phase.phaseIndex}`}
            onPress={() => onPhasePress?.(phase.phaseIndex)}
            accessibilityRole="button"
            accessibilityLabel={`Open phase ${phase.name}`}
          >
            <Card
              title={phase.name}
              subtitle={`Weeks ${phase.weekStart}-${phase.weekEnd} · ${phase.workouts.length} workouts`}
            >
              <Text className="text-muted-foreground text-xs">
                {phase.workouts.map((w) => w.title).join(" · ")}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <Pressable
        testID={`${testID}-edit-in-browser`}
        onPress={() => {
          void openProgramEditInBrowser(program.id, browserLauncher);
        }}
        accessibilityRole="button"
        accessibilityLabel="Edit this program in the browser"
        accessibilityHint={programEditUrl(program.id)}
        className="flex-row items-center justify-center gap-2 py-3 mt-4 border border-border rounded-xl"
      >
        <ExternalLink
          color={resolveToken("muted-foreground", "dark")}
          size={16}
          strokeWidth={1.5}
        />
        <Text className="text-muted-foreground text-sm">Edit in browser</Text>
      </Pressable>
    </ScrollView>
  );
}
