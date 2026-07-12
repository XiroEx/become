/**
 * DOM helpers — target resolution, waiting for elements, viewport math.
 * Everything here is defensive about SSR (no window/document access at import time).
 */

import type { RefLike, TutorialTarget } from './types';

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isRefLike(t: TutorialTarget): t is RefLike {
  return typeof t === 'object' && t !== null && 'current' in t;
}

/** Resolve a step target to a live Element (or null). */
export function resolveTarget(target: TutorialTarget | undefined): Element | null {
  if (!target || !isBrowser()) return null;
  try {
    if (typeof target === 'string') return document.querySelector(target);
    if (typeof target === 'function') return target();
    if (isRefLike(target)) return target.current;
  } catch {
    /* bad selector etc. */
  }
  return null;
}

export interface WaitHandle {
  promise: Promise<Element | null>;
  cancel: () => void;
}

/**
 * Wait for `resolve()` to return an element, using a MutationObserver with a
 * polling fallback, up to `timeoutMs`. Resolves null on timeout or cancel.
 */
export function waitForTarget(
  resolve: () => Element | null,
  timeoutMs: number
): WaitHandle {
  let cancelled = false;
  let cleanup: (() => void) | null = null;

  const promise = new Promise<Element | null>((done) => {
    if (!isBrowser()) return done(null);
    const first = resolve();
    if (first) return done(first);

    let observer: MutationObserver | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (el: Element | null) => {
      cleanup?.();
      done(el);
    };

    cleanup = () => {
      observer?.disconnect();
      if (interval) clearInterval(interval);
      if (timer) clearTimeout(timer);
      observer = null;
      interval = null;
      timer = null;
    };

    const check = () => {
      if (cancelled) return finish(null);
      const el = resolve();
      if (el) finish(el);
    };

    try {
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    } catch {
      /* jsdom edge cases — polling below still covers us */
    }
    interval = setInterval(check, 250);
    timer = setTimeout(() => finish(resolve()), Math.max(0, timeoutMs));
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      cleanup?.();
    },
  };
}

/** Matches a route pattern against a path. String patterns support a trailing '*' wildcard. */
export function routeMatches(pattern: string | RegExp, path: string | null): boolean {
  if (path == null) return false;
  if (pattern instanceof RegExp) return pattern.test(path);
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  // Ignore trailing slashes for exact string matches.
  const norm = (s: string) => (s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s);
  return norm(pattern) === norm(path);
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function getViewport(): { width: number; height: number } {
  if (!isBrowser()) return { width: 0, height: 0 };
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };
}

export function elementRect(el: Element, padding = 0): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

/** Is the element (mostly) inside the viewport already? */
export function isMostlyVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const vp = getViewport();
  const visX = Math.min(r.right, vp.width) - Math.max(r.left, 0);
  const visY = Math.min(r.bottom, vp.height) - Math.max(r.top, 0);
  if (r.width <= 0 || r.height <= 0) return false;
  return visX / r.width > 0.9 && visY / r.height > 0.9;
}

export function scrollTargetIntoView(el: Element): void {
  if (!isBrowser() || isMostlyVisible(el)) return;
  try {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  } catch {
    try {
      el.scrollIntoView();
    } catch {
      /* ignore */
    }
  }
}
