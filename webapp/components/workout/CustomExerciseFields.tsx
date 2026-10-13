'use client'

import { useId, useState } from 'react'
import { setUnitLabel } from '@/lib/workout/tracking'
import {
  VALID_CUSTOM_DIFFICULTIES,
  VALID_CUSTOM_EQUIPMENT,
  VALID_CUSTOM_LATERALITY,
  VALID_CUSTOM_MECHANICS,
  VALID_CUSTOM_MOVEMENT_PATTERNS,
  VALID_CUSTOM_MUSCLES,
} from '@/lib/customExerciseFields'

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
  primaryMuscles: string[]
  secondaryMuscles: string[]
  stabilizers: string[]
  equipment: string[]
  mechanics: string
  movementPatterns: string[]
  laterality: string
  difficulty: string
}

export const DEFAULT_CUSTOM_EXERCISE_VALUES: CustomExerciseValues = {
  name: '',
  trackingType: 'reps_weight',
  muscleGroup: 'chest',
  category: 'strength',
  role: 'accessory',
  defaultSets: '3',
  defaultReps: '8-12',
  primaryMuscles: [],
  secondaryMuscles: [],
  stabilizers: [],
  equipment: [],
  mechanics: 'n/a',
  movementPatterns: [],
  laterality: 'bilateral',
  difficulty: 'intermediate',
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

const ADVANCED_CATEGORY_OPTIONS = [
  ...CUSTOM_EXERCISE_CATEGORY_OPTIONS,
  { value: 'power', label: 'Power' },
  { value: 'plyometric', label: 'Plyometric' },
  { value: 'olympic', label: 'Olympic lifting' },
  { value: 'strongman', label: 'Strongman' },
  { value: 'flexibility', label: 'Flexibility' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'cooldown', label: 'Cool-down' },
  { value: 'protocol', label: 'Protocol (AMRAP / EMOM)' },
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

function optionLabel(value: string): string {
  const named: Record<string, string> = {
    'n/a': 'Not specified',
    ez_bar: 'EZ bar',
    safety_squat_bar: 'Safety squat bar',
    e1rm: 'Estimated 1RM',
  }
  return named[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function MultiValueField({
  label,
  hint,
  value,
  options,
  onChange,
  dark,
}: {
  label: string
  hint?: string
  value: string[]
  options: readonly string[]
  onChange: (value: string[]) => void
  dark: boolean
}) {
  const remaining = options.filter((option) => !value.includes(option))
  const selectClass = dark
    ? 'w-full rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-green-500'
    : 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white'
  const pillClass = dark
    ? 'border-white/10 bg-white/5 text-white/80 hover:border-red-400/50 hover:text-red-300'
    : 'border-zinc-200 bg-white text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className={dark ? 'text-[11px] font-semibold uppercase tracking-wide text-white/50' : 'text-xs font-medium text-zinc-500 dark:text-zinc-400'}>{label}</label>
        {hint ? <span className={dark ? 'text-[10px] text-white/35' : 'text-[10px] text-zinc-400'}>{hint}</span> : null}
      </div>
      <select
        aria-label={`Add ${label.toLowerCase()}`}
        value=""
        onChange={(event) => {
          if (event.target.value) onChange([...value, event.target.value])
        }}
        className={selectClass}
      >
        <option value="">Add {label.toLowerCase()}…</option>
        {remaining.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
      </select>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Remove ${optionLabel(item)}`}
              onClick={() => onChange(value.filter((entry) => entry !== item))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${pillClass}`}
            >
              {optionLabel(item)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const advancedId = useId()
  const [advancedOpen, setAdvancedOpen] = useState(false)
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

  const exactPrimary = values.primaryMuscles ?? []
  const secondaryMuscles = values.secondaryMuscles ?? []
  const stabilizers = values.stabilizers ?? []
  const equipment = values.equipment ?? []
  const movementPatterns = values.movementPatterns ?? []
  const advancedCount =
    exactPrimary.length + secondaryMuscles.length + stabilizers.length +
    equipment.filter((item) => item !== 'none').length +
    movementPatterns.filter((item) => item !== 'n/a').length +
    (values.mechanics !== 'n/a' ? 1 : 0) +
    (values.laterality !== 'bilateral' ? 1 : 0) +
    (values.difficulty !== 'intermediate' ? 1 : 0) +
    (CUSTOM_EXERCISE_CATEGORY_OPTIONS.some((option) => option.value === values.category) ? 0 : 1)

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
              onClick={() => onChange({ ...values, muscleGroup: opt.value, primaryMuscles: [] })}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                values.muscleGroup === opt.value ? chipActive : chipIdle
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {exactPrimary.length > 0 && (
          <p className={dark ? 'mt-1.5 text-[11px] text-green-300/80' : 'mt-1.5 text-[11px] text-green-700 dark:text-green-300'}>
            Exact targets from Advanced override this broad group.
          </p>
        )}
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

      {/* Optional anatomical/programming detail. The common path stays short;
          members who know the specifics can add catalog-grade metadata here. */}
      <div className={dark ? 'overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]' : 'overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-800/40'}>
        <button
          type="button"
          aria-expanded={advancedOpen}
          aria-controls={advancedId}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        >
          <span>
            <span className={dark ? 'block text-sm font-semibold text-white' : 'block text-sm font-semibold text-zinc-800 dark:text-white'}>Advanced <span className={dark ? 'font-normal text-white/45' : 'font-normal text-zinc-400'}>· optional</span></span>
            <span className={dark ? 'block text-[11px] text-white/40' : 'block text-[11px] text-zinc-500 dark:text-zinc-400'}>
              {advancedCount > 0 ? `${advancedCount} details set` : 'Exact muscles, equipment & movement'}
            </span>
          </span>
          <svg aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? 'rotate-180' : ''} ${dark ? 'text-white/45' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {advancedOpen && (
          <div id={advancedId} className={dark ? 'space-y-4 border-t border-white/10 px-3 pb-4 pt-3' : 'space-y-4 border-t border-zinc-200 px-3 pb-4 pt-3 dark:border-zinc-700'}>
            <div className={dark ? 'rounded-lg bg-green-500/10 px-3 py-2 text-[11px] leading-relaxed text-green-200' : 'rounded-lg bg-green-50 px-3 py-2 text-[11px] leading-relaxed text-green-800 dark:bg-green-950/30 dark:text-green-200'}>
              Add only what you know. Exact primary muscles replace the broad group above; every other field is optional.
            </div>

            <MultiValueField
              label="Exact primary muscles"
              hint="replaces broad group"
              value={exactPrimary}
              options={VALID_CUSTOM_MUSCLES}
              onChange={(next) => set('primaryMuscles', next)}
              dark={dark}
            />
            <MultiValueField
              label="Secondary muscles"
              value={secondaryMuscles}
              options={VALID_CUSTOM_MUSCLES}
              onChange={(next) => set('secondaryMuscles', next)}
              dark={dark}
            />
            <MultiValueField
              label="Stabilizers"
              value={stabilizers}
              options={VALID_CUSTOM_MUSCLES}
              onChange={(next) => set('stabilizers', next)}
              dark={dark}
            />
            <MultiValueField
              label="Equipment"
              value={equipment}
              options={VALID_CUSTOM_EQUIPMENT}
              onChange={(next) => set('equipment', next)}
              dark={dark}
            />
            <MultiValueField
              label="Movement patterns"
              value={movementPatterns}
              options={VALID_CUSTOM_MOVEMENT_PATTERNS}
              onChange={(next) => set('movementPatterns', next)}
              dark={dark}
            />

            <div>
              <label className={label}>Detailed Category</label>
              <select aria-label="Detailed category" value={values.category} onChange={(event) => set('category', event.target.value)} className={input}>
                {ADVANCED_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={label}>Mechanics</label>
                <select aria-label="Mechanics" value={values.mechanics} onChange={(event) => set('mechanics', event.target.value)} className={input}>
                  {VALID_CUSTOM_MECHANICS.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Laterality</label>
                <select aria-label="Laterality" value={values.laterality} onChange={(event) => set('laterality', event.target.value)} className={input}>
                  {VALID_CUSTOM_LATERALITY.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Difficulty</label>
                <select aria-label="Difficulty" value={values.difficulty} onChange={(event) => set('difficulty', event.target.value)} className={input}>
                  {VALID_CUSTOM_DIFFICULTIES.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
