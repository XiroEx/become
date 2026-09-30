// Coach-curated "Glutes" quick session.
//
// The algorithmic generator (see ./generate.ts) picked from whatever scored
// highest in the exercise catalog, which meant it kept surfacing quad-dominant
// compounds (trap bar deadlift, deadlift) for a session named "Glutes". The
// coach asked for this fixed replacement instead — see the "Change our glute
// quick workout" card. Bypasses generation entirely for this one focus; every
// other focus is still algorithmic.

import type { DraftExercise, DraftSession } from './types'

const SUPERSET_GROUP_ID = 'glutes-quick-superset'

export function curatedGlutesSession(): DraftSession {
  const exercises: DraftExercise[] = [
    {
      exerciseSlug: 'belt-squat',
      name: 'Belt Squat',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '10',
      primaryMuscles: ['quads', 'glutes'],
      movementPatterns: ['squat'],
    },
    {
      exerciseSlug: 'hip-thrust',
      name: 'Hip Thrust',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '12',
      primaryMuscles: ['glutes'],
      movementPatterns: ['hinge'],
    },
    {
      exerciseSlug: 'b-stance-rdl',
      name: 'B-Stance RDL',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '8 per side',
      laterality: 'unilateral',
      primaryMuscles: ['hamstrings', 'glutes'],
      movementPatterns: ['hinge'],
      equipment: ['dumbbell'],
      groupId: SUPERSET_GROUP_ID,
      groupType: 'superset',
      groupLabel: 'Superset',
    },
    {
      exerciseSlug: 'step-up',
      name: 'Step-Up',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '8 per side',
      laterality: 'unilateral',
      primaryMuscles: ['quads', 'glutes'],
      movementPatterns: ['lunge'],
      equipment: ['box'],
      groupId: SUPERSET_GROUP_ID,
      groupType: 'superset',
      groupLabel: 'Superset',
    },
    {
      exerciseSlug: 'hyperextension',
      name: 'Hyperextension',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '12',
      primaryMuscles: ['glutes', 'hamstrings'],
      movementPatterns: ['hip_extension'],
    },
    {
      exerciseSlug: 'hip-abduction-machine',
      name: 'Hip Abduction Machine',
      trackingType: 'reps_weight',
      sets: 3,
      reps: '8 (fwd / upright / back)',
      primaryMuscles: ['abductors', 'glutes'],
      equipment: ['hip_abduction_machine'],
    },
  ]

  return {
    title: 'Glutes Session',
    focus: 'glutes',
    exercises,
  }
}
