"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
// PhaseEditor & WorkoutEditor & ExerciseEditor live in this folder.
import PhaseEditor from "./PhaseEditor";
import {
  TargetUserLevel,
  Exercise,
  Workout,
  Phase,
} from "@/lib/data/programs";

export type ProgramCreatorMode = 'create' | 'edit' | 'user-create' | 'user-edit';

// Equipment options
const EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbells",
  "Kettlebell",
  "Cable Machine",
  "Machines",
  "Resistance Bands",
  "Pull-up Bar",
  "Bench",
  "Squat Rack",
  "Rowing Machine",
  "Bike",
  "Treadmill",
  "Jump Rope",
  "Medicine Ball",
  "Foam Roller",
  "Bodyweight Only",
];

const TARGET_USER_OPTIONS: TargetUserLevel[] = [
  "Beginner",
  "Intermediate", 
  "Advanced",
  "Beginner to Intermediate",
  "Intermediate to Advanced",
];

// Types for the form state
interface ProgramFormData {
  name: string;
  description: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: TargetUserLevel;
  equipment: string[];
  phases: Phase[];
}

export interface ProgramCreatorProps {
  mode?: ProgramCreatorMode;
  programId?: string;                       // required for any edit mode
  initialProgram?: Partial<ProgramFormData>;
}

const DRAFT_KEY_BY_MODE: Record<ProgramCreatorMode, string> = {
  'create': 'become_program_creator_draft',
  'edit': 'become_program_creator_draft_edit',
  'user-create': 'become_user_program_creator_draft',
  'user-edit': 'become_user_program_creator_draft_edit',
};

const createEmptyExercise = (): Exercise => ({
  name: "",
  type: "strength",
  sets: 3,
  reps: "10",
  rest: "60s",
  details: "",
});

const createEmptyWorkout = (dayNumber: number): Workout => ({
  day: `Day ${dayNumber}`,
  title: "",
  exercises: [createEmptyExercise()],
});

const createEmptyPhase = (phaseNumber: number, daysPerWeek: number): Phase => ({
  phase: `Phase ${phaseNumber}`,
  weeks: "",
  focus: "",
  workouts: Array.from({ length: daysPerWeek }, (_, i) => createEmptyWorkout(i + 1)),
});

export default function ProgramCreator({
  mode = 'create',
  programId,
  initialProgram,
}: ProgramCreatorProps = {}) {
  const router = useRouter();
  const isEdit = mode === 'edit' || mode === 'user-edit';
  const isUserMode = mode === 'user-create' || mode === 'user-edit';
  const draftKey = DRAFT_KEY_BY_MODE[mode];
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track unsaved edits so the Save button can signal "you have changes".
  const [isDirty, setIsDirty] = useState(false);
  const firstFormDataPass = useRef(true);

  const [formData, setFormData] = useState<ProgramFormData>({
    name: initialProgram?.name ?? "",
    description: initialProgram?.description ?? "",
    duration_weeks: initialProgram?.duration_weeks ?? 4,
    training_days_per_week: initialProgram?.training_days_per_week ?? 4,
    goal: initialProgram?.goal ?? "",
    target_user: (initialProgram?.target_user as TargetUserLevel) ?? "Intermediate",
    equipment: initialProgram?.equipment ?? [],
    phases:
      initialProgram?.phases && initialProgram.phases.length > 0
        ? initialProgram.phases
        : [createEmptyPhase(1, initialProgram?.training_days_per_week ?? 4)],
  });

  // Restore draft from localStorage on mount — only in create modes (edit modes
  // use initialProgram as the source of truth).
  useEffect(() => {
    if (isEdit) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.phases)) {
          setFormData((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // Ignore malformed draft
    }
  }, [draftKey, isEdit]);

  // Auto-save draft to localStorage whenever formData changes (create modes only)
  useEffect(() => {
    if (isEdit) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(formData));
    } catch {
      // Ignore storage errors (e.g. private browsing quota)
    }
  }, [formData, draftKey, isEdit]);

  // Mark the form dirty on any formData change after the initial mount /
  // initial-program load. Skips the very first render so the indicator
  // doesn't flash on page open.
  useEffect(() => {
    if (firstFormDataPass.current) {
      firstFormDataPass.current = false;
      return;
    }
    setIsDirty(true);
  }, [formData]);

  const steps = [
    { id: "basics", title: "Program Basics", icon: "📋" },
    { id: "phases", title: "Phases & Workouts", icon: "🏋️" },
    { id: "review", title: "Review & Save", icon: "✅" },
  ];

  // Update form data helper
  const updateFormData = <K extends keyof ProgramFormData>(
    key: K,
    value: ProgramFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  // Handle training days change - update workouts in all phases
  const handleTrainingDaysChange = (days: number) => {
    updateFormData("training_days_per_week", days);
    setFormData((prev) => ({
      ...prev,
      training_days_per_week: days,
      phases: prev.phases.map((phase) => {
        const currentWorkouts = phase.workouts;
        if (currentWorkouts.length === days) return phase;
        
        if (currentWorkouts.length < days) {
          // Add more workouts
          const newWorkouts = [...currentWorkouts];
          for (let i = currentWorkouts.length; i < days; i++) {
            newWorkouts.push(createEmptyWorkout(i + 1));
          }
          return { ...phase, workouts: newWorkouts };
        } else {
          // Remove extra workouts
          return { ...phase, workouts: currentWorkouts.slice(0, days) };
        }
      }),
    }));
  };

  // Add a new phase
  const addPhase = () => {
    const newPhaseNumber = formData.phases.length + 1;
    setFormData((prev) => ({
      ...prev,
      phases: [...prev.phases, createEmptyPhase(newPhaseNumber, prev.training_days_per_week)],
    }));
  };

  // Remove a phase
  const removePhase = (index: number) => {
    if (formData.phases.length <= 1) return;
    const target = formData.phases[index];
    const label = target?.phase || `Phase ${index + 1}`;
    const wkCount = target?.workouts?.length ?? 0;
    const detail = wkCount > 0 ? ` and its ${wkCount} workout${wkCount === 1 ? '' : 's'}` : '';
    if (typeof window !== 'undefined' && !window.confirm(`Remove ${label}${detail}?`)) return;
    setFormData((prev) => ({
      ...prev,
      phases: prev.phases.filter((_, i) => i !== index).map((phase, i) => ({
        ...phase,
        phase: `Phase ${i + 1}`,
      })),
    }));
  };

  // Update a phase
  const updatePhase = (index: number, updatedPhase: Phase) => {
    setFormData((prev) => ({
      ...prev,
      phases: prev.phases.map((p, i) => (i === index ? updatedPhase : p)),
    }));
  };

  // Toggle equipment selection
  const toggleEquipment = (item: string) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter((e) => e !== item)
        : [...prev.equipment, item],
    }));
  };

  // Save program (create or update depending on mode)
  const saveProgram = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      let endpoint: string;
      let method: 'POST' | 'PUT';
      switch (mode) {
        case 'user-create':
          endpoint = '/api/programs/custom';
          method = 'POST';
          break;
        case 'user-edit':
          endpoint = `/api/programs/custom/${programId}`;
          method = 'PUT';
          break;
        case 'edit':
          endpoint = `/api/programs/${programId}`;
          method = 'PUT';
          break;
        case 'create':
        default:
          endpoint = '/api/programs';
          method = 'POST';
          break;
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save program");
      }

      const saved = await response.json().catch(() => null);

      if (!isEdit) {
        try { localStorage.removeItem(draftKey); } catch {}
      }
      setIsDirty(false);

      // Where to send the user after save.
      if (isUserMode) {
        const newId = saved?.program_id || programId;
        if (newId) {
          router.push(`/dashboard/workout/${newId}`);
        } else {
          router.push('/dashboard/programs/mine');
        }
      } else {
        router.push("/dashboard/admin/programs");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save program");
    } finally {
      setIsSaving(false);
    }
  };

  // Validation
  const isStep1Valid = 
    formData.name.trim() !== "" &&
    formData.goal.trim() !== "" &&
    formData.duration_weeks > 0 &&
    formData.training_days_per_week > 0;

  const isStep2Valid = formData.phases.every(
    (phase) =>
      phase.weeks.trim() !== "" &&
      phase.focus.trim() !== "" &&
      phase.workouts.every(
        (workout) =>
          workout.title.trim() !== "" &&
          workout.exercises.length > 0 &&
          workout.exercises.every((ex) => ex.name.trim() !== "")
      )
  );

  const canProceed = currentStep === 0 ? isStep1Valid : currentStep === 1 ? isStep2Valid : true;

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl px-2 py-6 sm:px-6">
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Programs
          </button>
          
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
            {isEdit ? "Edit Program" : "Create New Program"}
          </h1>
          
          {/* Progress Steps */}
          <div className="mt-6 flex items-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => {
                    if (index < currentStep || (index === currentStep + 1 && canProceed)) {
                      setCurrentStep(index);
                    }
                  }}
                  disabled={index > currentStep + 1 || (index === currentStep + 1 && !canProceed)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    index === currentStep
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                      : index < currentStep
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                  }`}
                >
                  <span>{step.icon}</span>
                  <span className="hidden sm:inline">{step.title}</span>
                </button>
                {index < steps.length - 1 && (
                  <div className={`mx-2 h-0.5 w-8 ${
                    index < currentStep ? "bg-green-500" : "bg-zinc-200 dark:bg-zinc-700"
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-2 py-8 sm:px-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Program Basics */}
          {currentStep === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Program Name & Description */}
              <div className="sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-6 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Program Details
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Program Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateFormData("name", e.target.value)}
                      placeholder="e.g., 12-Week Strength Builder"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => updateFormData("description", e.target.value)}
                      placeholder="Brief description of the program..."
                      rows={3}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Goal *
                    </label>
                    <input
                      type="text"
                      value={formData.goal}
                      onChange={(e) => updateFormData("goal", e.target.value)}
                      placeholder="e.g., Build strength, lose fat, improve conditioning"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Duration & Frequency */}
              <div className="sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-6 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Duration & Schedule
                </h2>
                
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Duration (weeks) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={formData.duration_weeks}
                      onChange={(e) => updateFormData("duration_weeks", parseInt(e.target.value) || 1)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Training Days/Week *
                    </label>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5, 6, 7].map((days) => (
                        <button
                          key={days}
                          onClick={() => handleTrainingDaysChange(days)}
                          className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-all ${
                            formData.training_days_per_week === days
                              ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {days}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Target User */}
              <div className="sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-6 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Target Audience
                </h2>
                
                <div className="flex flex-wrap gap-2">
                  {TARGET_USER_OPTIONS.map((level) => (
                    <button
                      key={level}
                      onClick={() => updateFormData("target_user", level)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                        formData.target_user === level
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Equipment */}
              <div className="sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-6 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Required Equipment
                </h2>
                
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map((item) => (
                    <button
                      key={item}
                      onClick={() => toggleEquipment(item)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                        formData.equipment.includes(item)
                          ? "bg-green-600 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {formData.equipment.includes(item) && (
                        <span className="mr-1">✓</span>
                      )}
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Phases & Workouts */}
          {currentStep === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Program Phases ({formData.phases.length})
                </h2>
                <button
                  onClick={addPhase}
                  className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Phase
                </button>
              </div>

              {formData.phases.map((phase, index) => (
                <PhaseEditor
                  key={index}
                  phase={phase}
                  phaseIndex={index}
                  totalPhases={formData.phases.length}
                  onUpdate={(updatedPhase) => updatePhase(index, updatedPhase)}
                  onRemove={() => removePhase(index)}
                  daysPerWeek={formData.training_days_per_week}
                />
              ))}
            </motion.div>
          )}

          {/* Step 3: Review */}
          {currentStep === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-6 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                <h2 className="mb-6 text-xl font-bold text-zinc-900 dark:text-white">
                  Program Summary
                </h2>
                
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="sm:rounded-xl sm:bg-zinc-50 sm:p-4 dark:sm:bg-zinc-800">
                    <h3 className="mb-3 font-semibold text-zinc-900 dark:text-white">
                      {formData.name || "Untitled Program"}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formData.description || "No description"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {formData.duration_weeks} weeks
                      </span>
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {formData.training_days_per_week}x/week
                      </span>
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {formData.target_user}
                      </span>
                    </div>
                  </div>

                  {/* Goal */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Goal</h4>
                    <p className="text-zinc-900 dark:text-white">{formData.goal || "Not specified"}</p>
                  </div>

                  {/* Equipment */}
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Equipment</h4>
                    <div className="flex flex-wrap gap-2">
                      {formData.equipment.length > 0 ? (
                        formData.equipment.map((item) => (
                          <span
                            key={item}
                            className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-zinc-500">None selected</span>
                      )}
                    </div>
                  </div>

                  {/* Phases Overview */}
                  <div>
                    <h4 className="mb-3 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Phases ({formData.phases.length})
                    </h4>
                    <div className="space-y-3">
                      {formData.phases.map((phase, index) => (
                        <div
                          key={index}
                          className="border-b border-zinc-200 pb-3 dark:border-zinc-800 sm:rounded-xl sm:border sm:border-zinc-200 sm:p-4 sm:pb-4 dark:sm:border-zinc-700"
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-semibold text-zinc-900 dark:text-white">
                              {phase.phase} (Weeks {phase.weeks})
                            </h5>
                            <span className="text-sm text-zinc-500">
                              {phase.workouts.length} workouts
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            {phase.focus}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {phase.workouts.map((workout, wIndex) => (
                              <span
                                key={wIndex}
                                className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              >
                                {workout.day}: {workout.title || "Untitled"} ({workout.exercises.length} exercises)
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
              currentStep === 0
                ? "cursor-not-allowed bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              disabled={!canProceed}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                canProceed
                  ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-100"
                  : "cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700"
              }`}
            >
              Next
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={saveProgram}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {isEdit ? "Update Program" : "Save Program"}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Floating Save — always reachable so admins don't have to click
          through every step just to save. Visual state:
          - dirty + valid     → green w/ amber pulse dot ("Save changes")
          - clean (no edits)  → gray "Saved" (in edit mode) / "Save" disabled
          - saving            → spinner
          - invalid           → gray disabled
          Sits above the bottom nav. */}
      <button
        type="button"
        onClick={saveProgram}
        disabled={isSaving || !isStep1Valid || (isEdit && !isDirty)}
        aria-label={isEdit ? 'Update program' : 'Save program'}
        className={`fixed right-4 z-30 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-all ${
          isSaving || !isStep1Valid || (isEdit && !isDirty)
            ? 'cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
            : isDirty
            ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
            : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
        }`}
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        {isSaving ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving…
          </>
        ) : (
          <>
            {isDirty && (
              <span
                aria-hidden
                className="relative flex h-2 w-2"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            )}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {isEdit
              ? (isDirty ? 'Save changes' : 'Saved')
              : (isDirty ? 'Save changes' : 'Save')}
          </>
        )}
      </button>
    </PageTransition>
  );
}
