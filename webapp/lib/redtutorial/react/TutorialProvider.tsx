'use client'

/**
 * <TutorialProvider> — owns a TutorialEngine, registers the declarative
 * tutorial registry, reports route changes, and renders the default overlay
 * (unless you go headless with ui={false} or supply renderStep).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { TutorialEngine } from '../engine';
import type {
  ActiveTutorialSnapshot,
  EngineSnapshot,
  StartOptions,
  TutorialDefinition,
  TutorialEngineOptions,
  TutorialProgressEntry,
  TutorialStorageAdapter,
} from '../types';
import { TutorialOverlay } from './TutorialOverlay';

export interface TutorialContextValue {
  engine: TutorialEngine;
  snapshot: EngineSnapshot;
  /** Start a tutorial (or a segment of it) explicitly. */
  start: (id: string, options?: StartOptions) => boolean;
  next: () => void;
  back: () => void;
  skip: () => void;
  pause: () => void;
  /** Global on/off (persisted through the storage adapter). */
  setEnabled: (enabled: boolean) => void;
  enabled: boolean;
  ready: boolean;
  active: ActiveTutorialSnapshot | null;
  isCompleted: (id: string) => boolean;
  getStatus: (id: string) => TutorialProgressEntry | null;
  reset: (id: string) => void;
  resetAll: () => void;
  /** App → tutorial event bus (event triggers + advanceOn.emitted). */
  emit: (name: string) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export interface TutorialProviderProps {
  children?: ReactNode;
  /** Declarative registry — every tutorial this app can run. */
  tutorials?: TutorialDefinition[];
  /**
   * Persistence adapter. Defaults to nothing (in-memory for the session);
   * pass createLocalStorageAdapter() or an API-backed adapter for real apps.
   */
  storage?: TutorialStorageAdapter;
  /**
   * Current route/pathname. Pass e.g. Next's usePathname() value; route
   * triggers, waitFor.route and advanceOn.route key off it.
   */
  path?: string | null;
  /** Render the built-in overlay UI. Default true. */
  ui?: boolean;
  /** Replace the step card entirely (spotlight/shields still handled for you when using the default overlay; here you take over everything). */
  renderStep?: (ctx: { active: ActiveTutorialSnapshot; engine: TutorialEngine }) => ReactNode;
  /** Overrides the default overlay z-index (CSS var --rtut-z). */
  zIndex?: number;
  /** Clicking the dim outside the spotlight dismisses the tour. Default false. */
  dismissOnOutsideClick?: boolean;
  /** Engine tuning (resume, enabledByDefault, timeouts, debug...). */
  options?: Omit<TutorialEngineOptions, 'storage'>;
}

export function TutorialProvider({
  children,
  tutorials,
  storage,
  path,
  ui = true,
  renderStep,
  zIndex,
  dismissOnOutsideClick,
  options,
}: TutorialProviderProps) {
  // One engine per provider mount. Recreated only if storage identity changes.
  const [engine, setEngine] = useState(() => new TutorialEngine({ ...options, storage }));
  const storageRef = useRef(storage);
  useEffect(() => {
    if (storageRef.current !== storage) {
      storageRef.current = storage;
      engine.destroy();
      setEngine(new TutorialEngine({ ...options, storage }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  useEffect(() => () => engine.destroy(), [engine]);

  // Registry sync.
  useEffect(() => {
    const defs = tutorials ?? [];
    for (const def of defs) engine.register(def);
    return () => {
      for (const def of defs) engine.unregister(def.id);
    };
  }, [engine, tutorials]);

  // Route reporting.
  useEffect(() => {
    if (path != null) engine.notifyRoute(path);
  }, [engine, path]);

  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot
  );

  const value = useMemo<TutorialContextValue>(
    () => ({
      engine,
      snapshot,
      start: (id, opts) => engine.start(id, opts),
      next: () => engine.next(),
      back: () => engine.back(),
      skip: () => engine.skip(),
      pause: () => engine.pause(),
      setEnabled: (v) => engine.setEnabled(v),
      enabled: snapshot.enabled,
      ready: snapshot.ready,
      active: snapshot.active,
      isCompleted: (id) => engine.isCompleted(id),
      getStatus: (id) => engine.getStatus(id),
      reset: (id) => engine.reset(id),
      resetAll: () => engine.resetAll(),
      emit: (name) => engine.emit(name),
    }),
    [engine, snapshot]
  );

  const active = snapshot.active;

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {active &&
        (renderStep
          ? renderStep({ active, engine })
          : ui && (
              <TutorialOverlay
                engine={engine}
                active={active}
                zIndex={zIndex}
                dismissOnOutsideClick={dismissOnOutsideClick}
              />
            ))}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial() must be used inside <TutorialProvider>');
  return ctx;
}

/** Non-throwing variant for optional integration points. */
export function useTutorialMaybe(): TutorialContextValue | null {
  return useContext(TutorialContext);
}
