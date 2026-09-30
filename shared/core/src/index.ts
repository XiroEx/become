/**
 * @become/core — Shared pure domain logic for Become.
 *
 * Seed modules:
 *   - bodyUnits: unit conversions (lbs/kg, ft/in/cm) and rounding
 *   - goals/pace: pace calculation, ETA, status, hold/drift confirmation
 *   - goals/status: reached vs at-goal status
 *   - nutrition/tdee: Mifflin-St Jeor TDEE, macro presets, calorie adjustments
 *   - entitlements: tier model, allowances, gate copy and 403 parser
 *   - legal: terms, privacy, health data, support, delete account, constants
 *   - planCopy: plan comparison copy and PLAN_PRICING
 *   - accountDeletion: pure account deletion types, constants and planning
 *   - training: the web's training / streak / dashboard-tile logic, copied
 *     module-for-module from webapp/lib (NP-058). See ./training/index.ts —
 *     the copies are never edited here, and a web-side drift test fails until
 *     a web change is re-copied.
 *   - units: food units, conversion, bridges, formatting
 *   - foodMath: variant-aware nutrition scaling
 *   - mealPlanTimes: default tag times and clock helpers
 *   - mealPlanDates: planned date keys, ISO dates, UTC/local date helpers
 *   - nutrition/servingOptions: serving choices and groups for picker
 *   - nutrition/servingQuantityStep: increment steps for units
 *   - nutrition/dayOrder: day ordering for logs and plans
 *   - nutrition/mealSchedule: windows, tags, and scheduling
 *   - nutrition/logTagMatch: smart-append matching for meal logs
 *   - nutrition/goalLine: summary line under calorie ring
 *   - nutrition/types: pure food model types
 *   - mindXP: chapters, levels, XP maths and the main-session cooldown
 *   - mindContent: the 30-protocol content library and MindState
 *   - ai/sanitize: model-output sanitizers and guided-step validation
 *   - mind: session path, deterministic composer, move builders, speech matcher
 */

export * from './bodyUnits'
export * from './goals/pace'
export * from './goals/status'
export * from './nutrition/tdee'
export * from './entitlements'
export * from './legal/index'
export * from './legal/terms'
export * from './legal/privacy'
export * from './legal/healthData'
export * from './legal/support'
export * from './legal/deleteAccount'
export * from './planCopy'
export * from './accountDeletion'
export * from './training/index'
export * from './units'
export * from './foodMath'
export * from './mealPlanTimes'
export * from './mealPlanDates'
export * from './nutrition/servingOptions'
export * from './nutrition/servingQuantityStep'
export * from './nutrition/dayOrder'
export * from './nutrition/mealSchedule'
export * from './nutrition/logTagMatch'
export { nutritionGoalLine, type GoalLineInput } from './nutrition/goalLine'
export * from './nutrition/types'
export * from './mindXP'
export * from './mindContent'
export * from './ai/sanitize'
export * from './mind/index'
