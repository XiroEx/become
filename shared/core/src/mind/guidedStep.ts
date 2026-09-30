// The one type the copied Mind modules needed from a component.
//
// `sanitize.ts` and `introFlows.ts` import ONLY the `GuidedStep` type from
// webapp/components/mind/system/GuidedFlow.tsx — no DOM, no React. The type moves
// with them, verbatim: webapp/tests/unit/mindDrift.test.ts compares the interface
// below against the one in the component and fails when they diverge.

export interface GuidedStep {
  title: string
  body?: string
  /** Type-an-answer step. */
  inputPrompt?: string
  /** Per-step textarea placeholder (defaults to a generic starter). */
  placeholder?: string
  /** Pick-one step — tapping a choice records it and advances (no typing). */
  choices?: string[]
  /** 1–5 (or custom) scale step — tap a number to record + advance. */
  scale?: { min: number; max: number; minLabel: string; maxLabel: string }
}
