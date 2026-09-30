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
