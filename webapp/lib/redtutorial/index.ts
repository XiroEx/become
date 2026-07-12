/**
 * @redbtn/redtutorial — scripted, contextual product tours & coachmarks
 * for the redbtn ecosystem (and any React app).
 *
 * - Headless TutorialEngine (framework-free state machine)
 * - <TutorialProvider> + useTutorial() + themeable default overlay
 * - Spotlight coachmarks, step scripting, triggers, segments, branching
 * - Pluggable per-user persistence (localStorage / fetch / bring-your-own)
 */

export { TutorialEngine } from './engine';
export {
  TutorialProvider,
  useTutorial,
  useTutorialMaybe,
} from './react/TutorialProvider';
export type { TutorialContextValue, TutorialProviderProps } from './react/TutorialProvider';
export { TutorialOverlay } from './react/TutorialOverlay';
export type { TutorialOverlayProps } from './react/TutorialOverlay';
export { injectStyles, CSS as tutorialCss } from './react/styles';

export {
  createFetchAdapter,
  createLocalStorageAdapter,
  createMemoryAdapter,
  emptyProgressState,
  parseProgressState,
} from './storage';
export type { FetchAdapterOptions } from './storage';

export { computePosition, centerPosition } from './position';
export type { ComputedPosition, Size } from './position';
export { routeMatches } from './dom';
export type { Rect } from './dom';

export type {
  ActiveTutorialSnapshot,
  AdvanceOn,
  EngineSnapshot,
  MissingTargetBehavior,
  RefLike,
  StartOptions,
  StepWaitFor,
  TutorialDefinition,
  TutorialEngineOptions,
  TutorialPlacement,
  TutorialProgressEntry,
  TutorialProgressState,
  TutorialSegment,
  TutorialStatus,
  TutorialStep,
  TutorialStepContext,
  TutorialStorageAdapter,
  TutorialTarget,
  TutorialTrigger,
} from './types';
