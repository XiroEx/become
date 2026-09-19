'use client'

// "This is being logged as a Dumbbell."
//
// ── Card 1 (why this exists at all) ────────────────────────────────────────
// A Workout Now session on "Rear Delt Fly" asked for "Weight per DB (lbs)"
// and reported "= 95 lbs total". The catalog entry is the dumbbell one, so the
// number was right for a dumbbell and wrong for the rear delt machine — and
// nothing on screen said which the app had picked. So the live screen says
// which implement it is applying, and only when the exercise's own name does
// not already state it (lib/workout/equipmentVariant.ts). "Dumbbell Bench
// Press" gets nothing; "Rear Delt Fly" gets a Dumbbell chip.
//
// ── Card 2 (why the chips next to it are gone) ─────────────────────────────
// "I do not like all of those tabs on the live screen. For example I am doing
// a goblet squats why am I getting machine, barbell or any of the names. It
// should just be a dumbbell... I think u should have tabs that are appropriate
// for that particular exercise only when your adding a new workout."
//
// This row used to follow the disclosure with one chip per "same movement,
// other equipment" sibling. For a Goblet Squat — a movement that is a dumbbell
// by definition — the sibling rule (shared muscle + the `squat` head noun, see
// lib/exerciseMovementFamily.ts) offered Barbell Back Squat, Front Squat, Hack
// Squat, Belt Squat and Bodyweight Squat. Five equipment names on the screen
// of somebody mid-set on a dumbbell, none of them a goblet squat.
//
// The judgement call in the card is the right one: a set is not the moment to
// browse equipment. So this row now DISCLOSES and nothing else. Changing what
// you are doing still has two deliberate homes — "Swap Exercise" on this same
// screen, and the variation picker in "Add an exercise" / the builders
// (components/ExerciseVariationPicker.tsx), which is the "adding a new
// workout" surface the card asks for.
//
// Pure render off metadata the caller already holds: no fetch, nothing to fail.

import { Dumbbell } from 'lucide-react'
import { equipmentAssumption } from '@/lib/workout/equipmentVariant'

export interface EquipmentAssumptionRowProps {
  /** Display name, as shown to the member — an alias never counts as disclosure. */
  name?: string
  equipment?: string[]
  /** Live workout renders on video; the hub and builders render on paper. */
  dark?: boolean
  className?: string
}

export default function EquipmentAssumptionRow({
  name,
  equipment,
  dark = false,
  className = '',
}: EquipmentAssumptionRowProps) {
  const assumption = equipmentAssumption({ name, equipment })

  if (!assumption.assumed || !assumption.label) return null

  const chip = dark
    ? 'bg-white/10 text-white/70'
    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'

  return (
    <div data-testid="equipment-assumption-row" className={`mt-1.5 ${className}`}>
      <span
        data-testid="equipment-assumption-chip"
        title={`Logged as ${assumption.label}. This exercise's name doesn't say which equipment it uses, so the catalog default is being used.`}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${chip}`}
      >
        <Dumbbell className="h-3 w-3" aria-hidden />
        Logging as {assumption.label}
      </span>
    </div>
  )
}
