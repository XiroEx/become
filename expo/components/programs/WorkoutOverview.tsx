import { View, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export interface WorkoutOverviewExercise {
  slug: string;
  name: string;
  sets: number;
  repsLabel: string;
  notes?: string;
}

export interface WorkoutOverviewViewModel {
  programId: string;
  phaseIndex: number;
  workoutIndex: number;
  title: string;
  exercises: WorkoutOverviewExercise[];
}

export interface WorkoutOverviewProps {
  workout: WorkoutOverviewViewModel;
  /**
   * Opens the live workout. REQUIRED, and deliberately not defaulted: it
   * shipped as `onStartLive ?? (() => {})` and the route that renders this
   * screen never passed one, so the only button on the screen did nothing.
   * A required prop is what makes `tsc` fail the next time one is forgotten.
   */
  onStartLive: () => void;
  testID?: string;
}

export function WorkoutOverview({
  workout,
  onStartLive,
  testID = "workout-overview",
}: WorkoutOverviewProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} testID={testID}>
      <View>
        <Text testID={`${testID}-title`} className="text-foreground text-2xl font-bold mb-1">
          {workout.title}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}
        </Text>
      </View>
      {workout.exercises.map((ex) => (
        <Card
          key={ex.slug}
          testID={`${testID}-exercise-${ex.slug}`}
          title={ex.name}
          subtitle={`${ex.sets}×${ex.repsLabel}`}
        >
          {ex.notes ? (
            <Text className="text-muted-foreground text-xs">{ex.notes}</Text>
          ) : null}
        </Card>
      ))}
      <Button testID={`${testID}-start-live`} onPress={onStartLive}>
        Start live workout
      </Button>
    </ScrollView>
  );
}
