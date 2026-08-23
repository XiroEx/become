'use client'

import { setUnitLabel } from '@/lib/workout/tracking'

// The one "create/edit a custom exercise" field set.
//
// This used to be four near-identical copies (ExerciseSwapModal's "Create
// Custom Exercise" panel, ExerciseLibraryClient's "New Custom Exercise" form,
// and two stripped-down versions in SessionBuilder and AddExerciseSheet that
// only offered a tracking-type picker — no muscle group, no category, no
// default sets/reps). A custom exercise made from Quick Session came out
// permanently less detailed than one made from a program, with no way to add
// the missing detail short of deleting and recreating it from the library.
// Every surface now renders these same fields, so "custom exercise" means the
// same thing everywhere it is made.

export interface CustomExerciseValues {
  name: string
  trackingType: string
  muscleGroup: string
  category: string
  role: string
  defaultSets: string
  defaultReps: string
}

export const DEFAULT_CUSTOM_EXERCISE_VALUES: CustomExerciseValues = {
  name: '',
  trackingType: 'reps_weight',
  muscleGroup: 'chest',
  category: 'strength',
  role: 'accessory',
  defaultSets: '3',
  defaultReps: '8-12',
}

export const CUSTOM_EXERCISE_TRACKING_TYPE_OPTIONS = [
  { value: 'reps_weight', label: 'Sets × Reps + Weight', hint: 'e.g. Bench Press' },
  { value: 'reps_bodyweight', label: 'Sets × Reps (bodyweight)', hint: 'e.g. Push-Ups' },
  { value: 'reps_only', label: 'Reps Only', hint: 'e.g. Jumps' },
  { value: 'time', label: 'Time / Duration', hint: 'e.g. Plank' },
  { value: 'time_distance', label: 'Time + Distance', hint: 'e.g. Run, Row' },
  { value: 'intervals', label: 'Intervals', hint: 'e.g. HIIT, EMOM' },
  { value: 'none', label: 'No Tracking', hint: 'e.g. Rest, Cool-down' },
]

export const CUSTOM_EXERCISE_MUSCLE_GROUP_OPTIONS = [
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'core', label: 'Core' },
  { value: 'legs', label: 'Legs' },
  { value: 'full_body', label: 'Full Body' },
]

export const CUSTOM_EXERCISE_CATEGORY_OPTIONS = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'conditioning', label: 'Conditioning' },
]

// Mirrors Exercise.role — see models/Exercise.ts for the full rationale.
// Compound = the main lift that drives the session. Secondary = a supporting
// compound that reinforces the same pattern. Accessory = isolation/detail
// work. This also feeds the "filter by compound/secondary/accessory" tabs on
// the custom exercise library.
export const CUSTOM_EXERCISE_ROLE_OPTIONS = [
  { value: 'compound', label: 'Compound', hint: 'Main lift' },
  { value: 'secondary', label: 'Secondary', hint: 'Supporting compound' },
  { value: 'accessory', label: 'Accessory', hint: 'Isolation / detail' },
]

const TIME_BASED_TRACKING_TYPES = new Set(['time', 'time_distance', 'intervals'])

export interface CustomExerciseFieldsProps {
  values: CustomExerciseValues
  onChange: (values: CustomExerciseValues) => void
  /** Autofocus the name input — useful when the form opens as its own step. */
  nameAutoFocus?: boolean
  namePlaceholder?: string
  /** Force the "always-dark" chrome used by the immersive live workout view. */
  dark?: boolean
}

export default function CustomExerciseFields({
  values,
  onChange,
  nameAutoFocus,
  namePlaceholder = 'e.g. Cable Face Pull',
  dark = false,
}: CustomExerciseFieldsProps) {
  const set = <K extends keyof CustomExerciseValues>(key: K, value: CustomExerciseValues[K]) =>
    onChange({ ...values, [key]: value })

  const isTimeBased = TIME_BASED_TRACKING_TYPES.has(values.trackingType)

  const label = dark ? 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/50' : 'mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400'
  const input = dark
    ? 'w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 ring-1 ring-white/10 focus:outline-none focus:ring-green-500'
    : 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500'
  const chipIdle = dark
    ? 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
  const chipActive = dark
    ? 'border-green-500 bg-green-500/10 text-green-300'
    : 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-300'

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className={label}>Name</label>
        <input
          type="text"
          autoFocus={nameAutoFocus}
          placeholder={namePlaceholder}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          className={input}
        />
      </div>

      {/* Tracking Type */}
      <div>
        <label className={label}>Tracking Type</label>
        <div className="grid grid-cols-1 gap-1.5">
          {CUSTOM_EXERCISE_TRACKING_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('trackingType', opt.value)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                values.trackingType === opt.value ? chipActive : chipIdle
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span className={dark ? 'text-white/40' : 'text-zinc-400 dark:text-zinc-500'}>{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Primary Muscles */}
      <div>
        <label className={label}>Primary Muscles</label>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_EXERCISE_MUSCLE_GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('muscleGroup', opt.value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                values.muscleGroup === opt.value ? chipActive : chipIdle
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className={label}>Category</label>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_EXERCISE_CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('category', opt.value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                values.category === opt.value ? chipActive : chipIdle
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Role */}
      <div>
        <label className={label}>Role</label>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_EXERCISE_ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set('role', opt.value)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                values.role === opt.value ? chipActive : chipIdle
              }`}
            >
              {opt.label}
              <span className={dark ? 'text-white/40' : 'text-zinc-400 dark:text-zinc-500'}>{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Default Sets + Reps/Duration */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Default {setUnitLabel(values.trackingType, 2)}</label>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            value={values.defaultSets}
            onChange={(e) => set('defaultSets', e.target.value)}
            className={`${input} text-center`}
          />
        </div>
        <div>
          <label className={label}>{isTimeBased ? 'Duration (e.g. 30s)' : 'Reps (e.g. 8-12)'}</label>
          <input
            type="text"
            placeholder={isTimeBased ? '30s' : '8-12'}
            value={values.defaultReps}
            onChange={(e) => set('defaultReps', e.target.value)}
            className={`${input} text-center`}
          />
        </div>
      </div>
    </div>
  )
}
