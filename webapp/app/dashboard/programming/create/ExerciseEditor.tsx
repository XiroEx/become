"use client";

import { useState } from "react";
import { Exercise, ExerciseType } from "@/lib/data/programs";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";

interface ExerciseEditorProps {
  exercise: Exercise;
  index: number;
  onUpdate: (exercise: Exercise) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  canRemove: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

const EXERCISE_TYPES: { value: ExerciseType; label: string; color: string }[] = [
  { value: "strength", label: "Strength", color: "bg-blue-500" },
  { value: "conditioning", label: "Conditioning", color: "bg-orange-500" },
  { value: "warmup", label: "Warm-up", color: "bg-green-500" },
  { value: "abs", label: "Abs", color: "bg-purple-500" },
  { value: "cooldown", label: "Cool Down", color: "bg-cyan-500" },
];

// Common exercise suggestions by type
const EXERCISE_SUGGESTIONS: Record<ExerciseType, string[]> = {
  strength: [
    "Bench Press", "Incline Bench Press", "Dumbbell Press", "Push-ups",
    "Squat", "Front Squat", "Goblet Squat", "Leg Press",
    "Deadlift", "Romanian Deadlift", "Sumo Deadlift",
    "Pull-ups", "Lat Pulldown", "Rows", "Cable Row",
    "Shoulder Press", "Lateral Raise", "Face Pulls",
    "Bicep Curls", "Tricep Extensions", "Hammer Curls",
    "Lunges", "Step-ups", "Hip Thrust", "Leg Curl",
  ],
  conditioning: [
    "Assault Bike Intervals", "Rowing Sprints", "Battle Ropes",
    "Box Jumps", "Burpees", "Mountain Climbers", "Jump Rope",
    "Sled Push", "Kettlebell Swings", "Farmer Carries",
    "Treadmill Intervals", "Stair Climber", "Swimming",
  ],
  warmup: [
    "Jumping Jacks", "Arm Circles", "Leg Swings",
    "Hip Circles", "Cat-Cow Stretch", "World's Greatest Stretch",
    "Light Jog", "Dynamic Stretching", "Foam Rolling",
  ],
  abs: [
    "Plank", "Side Plank", "Dead Bug", "Bird Dog",
    "Crunches", "Leg Raises", "Russian Twists",
    "Cable Woodchop", "Ab Wheel Rollout", "Hanging Leg Raises",
  ],
  cooldown: [
    "Static Stretching", "Foam Rolling", "Light Walking",
    "Yoga Flow", "Deep Breathing", "Mobility Work",
  ],
};

export default function ExerciseEditor({
  exercise,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
  canRemove,
  dragHandleProps,
}: ExerciseEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const updateField = <K extends keyof Exercise>(key: K, value: Exercise[K]) => {
    onUpdate({ ...exercise, [key]: value });
  };

  const typeConfig = EXERCISE_TYPES.find((t) => t.value === exercise.type) || EXERCISE_TYPES[0];
  const suggestions = EXERCISE_SUGGESTIONS[exercise.type] || [];
  
  // Filter suggestions based on current input
  const filteredSuggestions = suggestions.filter(
    (s) => s.toLowerCase().includes(exercise.name.toLowerCase()) && s.toLowerCase() !== exercise.name.toLowerCase()
  );

  const showSetsReps = exercise.type === "strength" || exercise.type === "abs";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Exercise Header */}
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        {/* Drag Handle */}
        <div
          {...dragHandleProps}
          className="cursor-grab rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>

        {/* Exercise Number & Type Badge */}
        <span className="text-sm font-semibold text-zinc-400">#{index + 1}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${typeConfig.color}`}>
          {typeConfig.label}
        </span>

        {/* Exercise Name Preview */}
        <span className="flex-1 truncate text-sm font-medium text-zinc-900 dark:text-white">
          {exercise.name || "New Exercise"}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onDuplicate}
            className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            title="Duplicate"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          {canRemove && (
            <button
              onClick={onRemove}
              className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              title="Remove"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-4 p-4">
          {/* Row 1: Name & Type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="relative">
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Exercise Name *
              </label>
              <input
                type="text"
                value={exercise.name}
                onChange={(e) => updateField("name", e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="e.g., Bench Press"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
              
              {/* Autocomplete Suggestions */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  {filteredSuggestions.slice(0, 5).map((suggestion, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        updateField("name", suggestion);
                        setShowSuggestions(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Type
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXERCISE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => updateField("type", type.value)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                      exercise.type === type.value
                        ? `${type.color} text-white`
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Sets, Reps, Rest (for strength/abs) */}
          {showSetsReps && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Sets
                </label>
                <input
                  type="number"
                  min={1}
                  value={exercise.sets || ""}
                  onChange={(e) => updateField("sets", parseInt(e.target.value) || undefined)}
                  placeholder="3"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Reps
                </label>
                <input
                  type="text"
                  value={exercise.reps || ""}
                  onChange={(e) => updateField("reps", e.target.value)}
                  placeholder="8-10"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Rest
                </label>
                <input
                  type="text"
                  value={exercise.rest || ""}
                  onChange={(e) => updateField("rest", e.target.value)}
                  placeholder="60s"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Row 3: Details/Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {showSetsReps ? "Additional Notes" : "Details *"}
            </label>
            <input
              type="text"
              value={exercise.details || ""}
              onChange={(e) => updateField("details", e.target.value)}
              placeholder={
                showSetsReps
                  ? "e.g., Tempo 3-1-2, superset with next exercise"
                  : "e.g., 10 rounds: 20s work / 40s rest"
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
