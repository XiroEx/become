'use client'

/**
 * Default tutorial UI: spotlight + dim + anchored card with title, body,
 * progress dots and next/back/skip. Fully replaceable — pass `renderStep`
 * to TutorialProvider (or `ui={false}` and build your own from useTutorial()).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { elementRect, getViewport } from '../dom';
import type { Rect } from '../dom';
import { centerPosition, computePosition } from '../position';
import type { ComputedPosition } from '../position';
import type { ActiveTutorialSnapshot } from '../types';
import type { TutorialEngine } from '../engine';
import { injectStyles } from './styles';

export interface TutorialOverlayProps {
  engine: TutorialEngine;
  active: ActiveTutorialSnapshot;
  zIndex?: number;
  /** Clicking the dim area outside the spotlight dismisses the tour. Default false. */
  dismissOnOutsideClick?: boolean;
}

interface Layout {
  spot: Rect | null;
  pos: (ComputedPosition & { centered?: boolean }) | null;
  visible: boolean;
}

const approx = (a: number, b: number) => Math.abs(a - b) < 0.5;
const rectsEqual = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    approx(a.top, b.top) &&
    approx(a.left, b.left) &&
    approx(a.width, b.width) &&
    approx(a.height, b.height));

export function TutorialOverlay({
  engine,
  active,
  zIndex,
  dismissOnOutsideClick = false,
}: TutorialOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>({ spot: null, pos: null, visible: false });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const { step } = active;
  const padding = step.spotlightPadding ?? 6;
  const radius = step.spotlightRadius ?? 8;
  const canSkip = active.tutorial.canSkip ?? true;

  useEffect(() => {
    injectStyles();
    setMounted(true);
  }, []);

  // Hide instantly on step change so the card fades back in at the new spot.
  useLayoutEffect(() => {
    setLayout((l) => ({ ...l, visible: false }));
  }, [step.id]);

  // Continuous measure loop while the overlay is up: tracks scroll, resize,
  // animation and layout shifts without needing per-source listeners.
  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    let settleFrames = 0;
    const tick = () => {
      const el = active.element && active.element.isConnected ? active.element : null;
      const viewport = getViewport();
      const spot = el ? elementRect(el, padding) : null;
      const card = cardRef.current;
      let pos: Layout['pos'] = null;
      if (card) {
        const size = { width: card.offsetWidth, height: card.offsetHeight };
        if (size.width > 0) {
          if (spot) {
            pos = computePosition(spot, size, viewport, step.placement ?? 'auto');
          } else {
            const c = centerPosition(size, viewport);
            pos = { ...c, placement: 'bottom', arrowTop: 0, arrowLeft: 0, centered: true };
          }
        }
      }
      const prev = layoutRef.current;
      const posEqual =
        prev.pos === pos ||
        (!!prev.pos &&
          !!pos &&
          approx(prev.pos.top, pos.top) &&
          approx(prev.pos.left, pos.left) &&
          prev.pos.placement === pos.placement &&
          approx(prev.pos.arrowLeft, pos.arrowLeft) &&
          approx(prev.pos.arrowTop, pos.arrowTop));
      // Let a couple of frames settle before fading the card in.
      settleFrames = posEqual ? settleFrames + 1 : 0;
      const visible = !!pos && (prev.visible || settleFrames >= 2);
      if (!rectsEqual(prev.spot, spot) || !posEqual || prev.visible !== visible) {
        setLayout({ spot, pos, visible });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted, active.element, step.id, step.placement, padding]);

  // Keyboard: Esc dismisses, arrows navigate.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canSkip) {
        e.stopPropagation();
        engine.skip();
      } else if (e.key === 'ArrowRight' && !step.hideNext) {
        engine.next();
      } else if (e.key === 'ArrowLeft') {
        engine.back();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mounted, engine, canSkip, step.hideNext]);

  // Move focus to the card when the step changes.
  useEffect(() => {
    if (mounted && layout.visible) cardRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, step.id, layout.visible]);

  const onShieldClick = useCallback(() => {
    if (dismissOnOutsideClick && canSkip) engine.skip();
  }, [dismissOnOutsideClick, canSkip, engine]);

  const shields = useMemo(() => {
    const vp = typeof window !== 'undefined' ? getViewport() : { width: 0, height: 0 };
    const s = layout.spot;
    if (!s) {
      return [{ key: 'full', style: { top: 0, left: 0, width: '100vw', height: '100vh' } as const }];
    }
    const top = Math.max(0, s.top);
    const bottom = Math.max(0, Math.min(vp.height, s.top + s.height));
    const left = Math.max(0, s.left);
    const right = Math.max(0, Math.min(vp.width, s.left + s.width));
    const rects: Array<{ key: string; style: React.CSSProperties }> = [
      { key: 'n', style: { top: 0, left: 0, width: '100vw', height: top } },
      { key: 's', style: { top: bottom, left: 0, width: '100vw', height: Math.max(0, vp.height - bottom) } },
      { key: 'w', style: { top, left: 0, width: left, height: Math.max(0, bottom - top) } },
      { key: 'e', style: { top, left: right, width: Math.max(0, vp.width - right), height: Math.max(0, bottom - top) } },
    ];
    if (!step.allowInteraction) {
      rects.push({
        key: 'hole',
        style: { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
      });
    }
    return rects;
  }, [layout.spot, step.allowInteraction]);

  if (!mounted || typeof document === 'undefined' || active.waiting) return null;

  const { spot, pos } = layout;
  const arrowClass = pos && !pos.centered ? `rtut-arrow rtut-arrow--${pos.placement}` : null;
  const arrowStyle: React.CSSProperties | undefined =
    pos && !pos.centered
      ? pos.placement === 'top' || pos.placement === 'bottom'
        ? { left: pos.arrowLeft - 6 }
        : { top: pos.arrowTop - 6 }
      : undefined;

  const nextLabel =
    step.nextLabel ?? (active.isLast ? active.tutorial.doneLabel ?? 'Done' : 'Next');

  return createPortal(
    <div
      className="rtut-root"
      style={zIndex != null ? { zIndex } : undefined}
      data-rtut-tutorial={active.tutorial.id}
      data-rtut-step={step.id}
    >
      {/* Dim + spotlight hole */}
      {spot ? (
        <div
          className="rtut-spotlight"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: radius,
          }}
        />
      ) : (
        <div className="rtut-spotlight rtut-spotlight--full" />
      )}

      {/* Click shields */}
      {shields.map((sh) => (
        <div key={sh.key} className="rtut-shield" style={sh.style} onClick={onShieldClick} />
      ))}

      {/* Card */}
      <div
        ref={cardRef}
        className={`rtut-card${layout.visible ? ' rtut-card--visible' : ''}`}
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
        role="dialog"
        aria-modal="true"
        aria-label={step.title ?? active.tutorial.title ?? 'Tutorial'}
        tabIndex={-1}
      >
        {arrowClass && <div className={arrowClass} style={arrowStyle} />}
        {canSkip && (
          <button
            type="button"
            className="rtut-btn rtut-skip"
            aria-label={active.tutorial.skipLabel ?? 'Skip tour'}
            title={active.tutorial.skipLabel ?? 'Skip tour'}
            onClick={() => engine.skip()}
          >
            ×
          </button>
        )}
        {step.title && <h3 className="rtut-title">{step.title}</h3>}
        {step.body && <p className="rtut-body">{step.body}</p>}
        <div className="rtut-footer">
          {active.stepCount > 1 &&
            (active.stepCount <= 10 ? (
              <div className="rtut-dots" aria-hidden="true">
                {Array.from({ length: active.stepCount }, (_, i) => (
                  <span
                    key={i}
                    className={`rtut-dot${i === active.stepIndex ? ' rtut-dot--active' : ''}`}
                  />
                ))}
              </div>
            ) : (
              <span className="rtut-count">
                {active.stepIndex + 1} / {active.stepCount}
              </span>
            ))}
          {active.stepCount <= 1 && <span className="rtut-count" />}
          {!active.isFirst && (step.canBack ?? true) && (
            <button type="button" className="rtut-btn" onClick={() => engine.back()}>
              {step.backLabel ?? 'Back'}
            </button>
          )}
          {!step.hideNext && (
            <button
              type="button"
              className="rtut-btn rtut-btn--primary"
              onClick={() => engine.next()}
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
