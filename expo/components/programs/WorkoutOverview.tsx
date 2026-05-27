import { View, Text, ScrollView } from "react-native";
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
  onStartLive?: () => void;
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
      <Button testID={`${testID}-start-live`} onPress={onStartLive ?? (() => {})}>
        Start live workout
      </Button>
    </ScrollView>
  );
}
