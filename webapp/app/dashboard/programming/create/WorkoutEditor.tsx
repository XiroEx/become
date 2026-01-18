"use client";

import { Workout, Exercise, ExerciseType } from "@/lib/data/programs";
import ExerciseEditor from "./ExerciseEditor";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface WorkoutEditorProps {
  workout: Workout;
  onUpdate: (workout: Workout) => void;
}

const createEmptyExercise = (): Exercise => ({
  name: "",
  type: "strength" as ExerciseType,
  sets: 3,
  reps: "10",
  rest: "60s",
  details: "",
});

export default function WorkoutEditor({ workout, onUpdate }: WorkoutEditorProps) {
  const updateTitle = (title: string) => {
    onUpdate({ ...workout, title });
  };

  const addExercise = () => {
    onUpdate({
      ...workout,
      exercises: [...workout.exercises, createEmptyExercise()],
    });
  };

  const updateExercise = (index: number, exercise: Exercise) => {
    const newExercises = [...workout.exercises];
    newExercises[index] = exercise;
    onUpdate({ ...workout, exercises: newExercises });
  };

  const removeExercise = (index: number) => {
    if (workout.exercises.length <= 1) return;
    onUpdate({
      ...workout,
      exercises: workout.exercises.filter((_, i) => i !== index),
    });
  };

  const duplicateExercise = (index: number) => {
    const exerciseToDuplicate = workout.exercises[index];
    const newExercises = [...workout.exercises];
    newExercises.splice(index + 1, 0, { ...exerciseToDuplicate });
    onUpdate({ ...workout, exercises: newExercises });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(workout.exercises);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    onUpdate({ ...workout, exercises: items });
  };

  // Quick add common exercises
  const quickAddExercises = [
    { name: "Bench Press", type: "strength" as ExerciseType, sets: 4, reps: "8-10", rest: "90s" },
    { name: "Squat", type: "strength" as ExerciseType, sets: 4, reps: "6-8", rest: "120s" },
    { name: "Deadlift", type: "strength" as ExerciseType, sets: 3, reps: "5", rest: "180s" },
    { name: "Pull-ups", type: "strength" as ExerciseType, sets: 3, reps: "max", rest: "90s" },
    { name: "Warm-up", type: "warmup" as ExerciseType, details: "5-10 min light cardio + dynamic stretching" },
    { name: "HIIT Finisher", type: "conditioning" as ExerciseType, details: "10 rounds: 20s work / 40s rest" },
    { name: "Ab Circuit", type: "abs" as ExerciseType, sets: 3, reps: "15 each", rest: "30s" },
    { name: "Cool Down", type: "cooldown" as ExerciseType, details: "5 min stretching" },
  ];

  const addQuickExercise = (exercise: Partial<Exercise>) => {
    onUpdate({
      ...workout,
      exercises: [...workout.exercises, { ...createEmptyExercise(), ...exercise }],
    });
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Workout Title */}
      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Workout Title *
        </label>
        <input
          type="text"
          value={workout.title}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="e.g., Upper Body Strength"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

      {/* Quick Add Section */}
      <div className="mb-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Quick Add
        </p>
        <div className="flex flex-wrap gap-1.5">
          {quickAddExercises.map((exercise, index) => (
            <button
              key={index}
              onClick={() => addQuickExercise(exercise)}
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-all hover:bg-zinc-100 hover:shadow dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
            >
              + {exercise.name}
            </button>
          ))}
        </div>
      </div>

      {/* Exercises List */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Exercises ({workout.exercises.length})
          </p>
          <button
            onClick={addExercise}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Exercise
          </button>
        </div>

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="exercises">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-3"
              >
                {workout.exercises.map((exercise, index) => (
                  <Draggable
                    key={`exercise-${index}`}
                    draggableId={`exercise-${index}`}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`${snapshot.isDragging ? "opacity-70" : ""}`}
                      >
                        <ExerciseEditor
                          exercise={exercise}
                          index={index}
                          onUpdate={(ex: Exercise) => updateExercise(index, ex)}
                          onRemove={() => removeExercise(index)}
                          onDuplicate={() => duplicateExercise(index)}
                          canRemove={workout.exercises.length > 1}
                          dragHandleProps={provided.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  );
}
