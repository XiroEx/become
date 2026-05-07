"use client";

import { Workout, Exercise, ExerciseGroupType } from "@/lib/data/programs";
import ExerciseEditor from "./ExerciseEditor";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useState } from "react";

interface WorkoutEditorProps {
  workout: Workout;
  onUpdate: (workout: Workout) => void;
}

const createEmptyExercise = (): Exercise => ({
  name: "",
  type: "strength",
  sets: 3,
  reps: "10",
  rest: "60s",
  details: "",
});

// Generate a unique group ID
let groupCounter = 0;
const generateGroupId = (): string => {
  groupCounter++;
  return `group-${Date.now()}-${groupCounter}`;
};

const GROUP_TYPE_OPTIONS: { value: ExerciseGroupType; label: string; description: string; color: string }[] = [
  { value: "superset", label: "Superset", description: "2 exercises back-to-back", color: "bg-purple-500" },
  { value: "triset", label: "Triset", description: "3 exercises back-to-back", color: "bg-indigo-500" },
  { value: "circuit", label: "Circuit", description: "Multiple exercises in a loop", color: "bg-orange-500" },
  { value: "giant_set", label: "Giant Set", description: "4+ exercises back-to-back", color: "bg-rose-500" },
  { value: "emom", label: "EMOM", description: "Every minute on the minute", color: "bg-teal-500" },
  { value: "amrap", label: "AMRAP", description: "As many rounds as possible", color: "bg-amber-500" },
];

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

  // Exercise grouping state
  const [selectedForGroup, setSelectedForGroup] = useState<number[]>([]);
  const [showGroupMenu, setShowGroupMenu] = useState(false);

  const toggleSelectForGroup = (index: number) => {
    setSelectedForGroup((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const createGroup = (groupType: ExerciseGroupType) => {
    if (selectedForGroup.length < 2) return;

    const groupId = generateGroupId();
    const labelMap: Record<ExerciseGroupType, string> = {
      superset: "Superset",
      triset: "Triset",
      circuit: "Circuit",
      giant_set: "Giant Set",
      emom: "EMOM",
      amrap: "AMRAP",
    };

    const newExercises = workout.exercises.map((ex, i) => {
      if (selectedForGroup.includes(i)) {
        return {
          ...ex,
          groupId,
          groupType,
          groupLabel: labelMap[groupType],
        };
      }
      return ex;
    });

    // Sort so grouped exercises are consecutive
    const grouped = newExercises.filter((ex) => ex.groupId === groupId);
    const ungroupedBefore = newExercises.filter(
      (ex, i) => ex.groupId !== groupId && i < Math.min(...selectedForGroup)
    );
    const ungroupedAfter = newExercises.filter(
      (ex, i) => ex.groupId !== groupId && i >= Math.min(...selectedForGroup)
    );

    onUpdate({ ...workout, exercises: [...ungroupedBefore, ...grouped, ...ungroupedAfter] });
    setSelectedForGroup([]);
    setShowGroupMenu(false);
  };

  const removeFromGroup = (index: number) => {
    const newExercises = [...workout.exercises];
    const ex = { ...newExercises[index] };
    delete ex.groupId;
    delete ex.groupType;
    delete ex.groupLabel;
    delete ex.groupRest;
    delete ex.groupRounds;
    newExercises[index] = ex;

    // If only 1 exercise remains in the group, ungroup it too
    const oldGroupId = workout.exercises[index].groupId;
    if (oldGroupId) {
      const remainingInGroup = newExercises.filter((e) => e.groupId === oldGroupId);
      if (remainingInGroup.length === 1) {
        const lastIdx = newExercises.findIndex((e) => e.groupId === oldGroupId);
        const lastEx = { ...newExercises[lastIdx] };
        delete lastEx.groupId;
        delete lastEx.groupType;
        delete lastEx.groupLabel;
        delete lastEx.groupRest;
        delete lastEx.groupRounds;
        newExercises[lastIdx] = lastEx;
      }
    }

    onUpdate({ ...workout, exercises: newExercises });
  };

  // Get unique group IDs for visual indicators
  const getGroupColor = (groupType?: string): string => {
    const colors: Record<string, string> = {
      superset: "border-purple-400 bg-purple-50 dark:bg-purple-950/30",
      circuit: "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
      triset: "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30",
      giant_set: "border-rose-400 bg-rose-50 dark:bg-rose-950/30",
      emom: "border-teal-400 bg-teal-50 dark:bg-teal-950/30",
      amrap: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
    };
    return colors[groupType || "superset"] || colors.superset;
  };

  // Quick add common exercises
  const quickAddExercises = [
    { name: "Bench Press", type: "strength", sets: 4, reps: "8-10", rest: "90s" },
    { name: "Squat", type: "strength", sets: 4, reps: "6-8", rest: "120s" },
    { name: "Deadlift", type: "strength", sets: 3, reps: "5", rest: "180s" },
    { name: "Pull-ups", type: "strength", sets: 3, reps: "max", rest: "90s" },
    { name: "Warm-up", type: "warmup", details: "5-10 min light cardio + dynamic stretching" },
    { name: "HIIT Finisher", type: "conditioning", details: "10 rounds: 20s work / 40s rest" },
    { name: "Ab Circuit", type: "abs", sets: 3, reps: "15 each", rest: "30s" },
    { name: "Cool Down", type: "cooldown", details: "5 min stretching" },
  ] as const;

  const addQuickExercise = (exercise: Partial<Exercise> & { name: string }) => {
    onUpdate({
      ...workout,
      exercises: [...workout.exercises, { ...createEmptyExercise(), ...exercise }],
    });
  };

  return (
    <div className="border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-zinc-50 sm:p-4 sm:pb-4 dark:sm:border-zinc-700 dark:sm:bg-zinc-800/50">
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
          <div className="flex items-center gap-2">
            {/* Group selected exercises button */}
            {selectedForGroup.length >= 2 && (
              <div className="relative">
                <button
                  onClick={() => setShowGroupMenu(!showGroupMenu)}
                  className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-purple-700"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Group ({selectedForGroup.length})
                </button>
                {showGroupMenu && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
                    {GROUP_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => createGroup(opt.value)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${opt.color}`} />
                        <div>
                          <div className="font-medium text-zinc-900 dark:text-white">{opt.label}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">{opt.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedForGroup.length > 0 && (
              <button
                onClick={() => setSelectedForGroup([])}
                className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            )}
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
        </div>

        {/* Group selection hint */}
        {selectedForGroup.length > 0 && selectedForGroup.length < 2 && (
          <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-700 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-300">
            Select at least one more exercise to create a group (superset, circuit, etc.)
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="exercises">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-3"
              >
                {(() => {
                  // Group consecutive exercises that share the same groupId for visual rendering
                  const elements: React.ReactNode[] = [];
                  let i = 0;
                  while (i < workout.exercises.length) {
                    const exercise = workout.exercises[i];
                    if (exercise.groupId) {
                      // Collect consecutive exercises in the same group
                      const groupId = exercise.groupId;
                      const groupStart = i;
                      const groupExercises: { exercise: Exercise; index: number }[] = [];
                      while (i < workout.exercises.length && workout.exercises[i].groupId === groupId) {
                        groupExercises.push({ exercise: workout.exercises[i], index: i });
                        i++;
                      }
                      const groupColor = getGroupColor(exercise.groupType);
                      
                      elements.push(
                        <div
                          key={`group-${groupId}`}
                          className={`rounded-xl border-2 ${groupColor} p-3`}
                        >
                          {/* Group header */}
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                                {exercise.groupLabel || exercise.groupType || "Group"}
                              </span>
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {groupExercises.length} exercises
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                // Ungroup all exercises in this group
                                const newExercises = workout.exercises.map((ex) => {
                                  if (ex.groupId === groupId) {
                                    const { groupId: _gid, groupType: _gt, groupLabel: _gl, groupRest: _gr, groupRounds: _gro, ...rest } = ex;
                                    return rest as Exercise;
                                  }
                                  return ex;
                                });
                                onUpdate({ ...workout, exercises: newExercises });
                              }}
                              className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-white/60 hover:text-red-500 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                            >
                              Ungroup
                            </button>
                          </div>

                          {/* Grouped exercises */}
                          <div className="space-y-2">
                            {groupExercises.map(({ exercise: groupEx, index: idx }) => (
                              <Draggable
                                key={`exercise-${idx}`}
                                draggableId={`exercise-${idx}`}
                                index={idx}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`${snapshot.isDragging ? "opacity-70" : ""}`}
                                  >
                                    <ExerciseEditor
                                      exercise={groupEx}
                                      index={idx}
                                      onUpdate={(ex: Exercise) => updateExercise(idx, ex)}
                                      onRemove={() => removeExercise(idx)}
                                      onDuplicate={() => duplicateExercise(idx)}
                                      canRemove={workout.exercises.length > 1}
                                      dragHandleProps={provided.dragHandleProps}
                                      isInGroup={true}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))}
                          </div>
                        </div>
                      );
                    } else {
                      // Ungrouped exercise with selection checkbox for group creation
                      const idx = i;
                      elements.push(
                        <Draggable
                          key={`exercise-${idx}`}
                          draggableId={`exercise-${idx}`}
                          index={idx}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`relative ${snapshot.isDragging ? "opacity-70" : ""} ${
                                selectedForGroup.includes(idx) ? "ring-2 ring-purple-400 rounded-xl" : ""
                              }`}
                            >
                              {/* Selection checkbox overlay */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectForGroup(idx);
                                }}
                                className={`absolute -left-2 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                                  selectedForGroup.includes(idx)
                                    ? "border-purple-500 bg-purple-500 text-white"
                                    : "border-zinc-300 bg-white hover:border-purple-400 dark:border-zinc-600 dark:bg-zinc-800"
                                }`}
                                title="Select to group"
                              >
                                {selectedForGroup.includes(idx) && (
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                              <ExerciseEditor
                                exercise={workout.exercises[idx]}
                                index={idx}
                                onUpdate={(ex: Exercise) => updateExercise(idx, ex)}
                                onRemove={() => removeExercise(idx)}
                                onDuplicate={() => duplicateExercise(idx)}
                                canRemove={workout.exercises.length > 1}
                                dragHandleProps={provided.dragHandleProps}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                      i++;
                    }
                  }
                  return elements;
                })()}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  );
}
