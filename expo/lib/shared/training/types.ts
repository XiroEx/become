/**
 * Local domain types for @become/core and native parity modules.
 * Decouples shared pure logic from server/web models.
 */

export type FitnessGoal =
  | 'lose_weight'
  | 'gain_muscle'
  | 'maintain'
  | 'improve_performance'
  | 'general_health'

export interface StoredQuickSession {
  sessionId?: string
  title: string
  sourceSessionId?: string | null
  needsName?: boolean
}

export interface DraftExercise {
  exerciseSlug?: string
  name: string
  trackingType?: string
  sets?: number
  reps?: string
  rest?: string
  duration?: string
  primaryMuscles?: string[]
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
  groupId?: string
  groupType?: string
  groupLabel?: string
  groupRest?: string
  groupRounds?: number
  addedAdHoc?: boolean
}
