/**
 * Default-UI styles, injected once. Entirely CSS-var driven so host apps can
 * retheme with a few `--rtut-*` overrides; works out of the box in light and
 * dark (prefers-color-scheme plus `.dark` / `[data-theme="dark"]` hooks).
 */

export const STYLE_ELEMENT_ID = 'redtutorial-styles';

export const CSS = `
:root {
  --rtut-z: 2147482000;
  --rtut-overlay: rgba(9, 11, 17, 0.62);
  --rtut-card-bg: #ffffff;
  --rtut-card-fg: #171b26;
  --rtut-muted-fg: #626a7c;
  --rtut-accent: #e5484d;
  --rtut-accent-fg: #ffffff;
  --rtut-border: rgba(23, 27, 38, 0.10);
  --rtut-radius: 14px;
  --rtut-shadow: 0 12px 40px rgba(9, 11, 17, 0.28), 0 2px 8px rgba(9, 11, 17, 0.14);
  /* Safe modern default; set --rtut-font: inherit to adopt the app's body font. */
  --rtut-font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --rtut-ring: 0 0 0 2px rgba(229, 72, 77, 0.35);
  --rtut-dot: rgba(98, 106, 124, 0.35);
}
@media (prefers-color-scheme: dark) {
  :root {
    --rtut-overlay: rgba(2, 3, 6, 0.7);
    --rtut-card-bg: #191d27;
    --rtut-card-fg: #f2f4f8;
    --rtut-muted-fg: #9aa3b5;
    --rtut-border: rgba(242, 244, 248, 0.12);
    --rtut-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4);
    --rtut-dot: rgba(154, 163, 181, 0.35);
  }
}
.dark, [data-theme="dark"] {
  --rtut-overlay: rgba(2, 3, 6, 0.7);
  --rtut-card-bg: #191d27;
  --rtut-card-fg: #f2f4f8;
  --rtut-muted-fg: #9aa3b5;
  --rtut-border: rgba(242, 244, 248, 0.12);
  --rtut-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4);
  --rtut-dot: rgba(154, 163, 181, 0.35);
}
.light, [data-theme="light"] {
  --rtut-overlay: rgba(9, 11, 17, 0.62);
  --rtut-card-bg: #ffffff;
  --rtut-card-fg: #171b26;
  --rtut-muted-fg: #626a7c;
  --rtut-border: rgba(23, 27, 38, 0.10);
  --rtut-shadow: 0 12px 40px rgba(9, 11, 17, 0.28), 0 2px 8px rgba(9, 11, 17, 0.14);
  --rtut-dot: rgba(98, 106, 124, 0.35);
}

.rtut-root {
  position: fixed;
  inset: 0;
  z-index: var(--rtut-z);
  pointer-events: none;
  font-family: var(--rtut-font);
}

/* Spotlight: a positioned hole whose giant box-shadow dims everything else.
   top/left/width/height transition -> the hole glides between targets. */
.rtut-spotlight {
  position: fixed;
  box-shadow: 0 0 0 200vmax var(--rtut-overlay);
  border-radius: 8px;
  pointer-events: none;
  transition: top 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              left 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              height 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              border-radius 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.rtut-spotlight--full {
  border-radius: 0;
  box-shadow: none;
  background: var(--rtut-overlay);
  inset: 0;
  width: auto;
  height: auto;
}

/* Click shields around (and optionally over) the hole. Invisible. */
.rtut-shield {
  position: fixed;
  pointer-events: auto;
}

.rtut-card {
  position: fixed;
  pointer-events: auto;
  box-sizing: border-box;
  width: max-content;
  max-width: min(340px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  background: var(--rtut-card-bg);
  color: var(--rtut-card-fg);
  border: 1px solid var(--rtut-border);
  border-radius: var(--rtut-radius);
  box-shadow: var(--rtut-shadow);
  padding: 16px 18px 14px;
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  transition: top 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              left 0.28s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.22s ease,
              transform 0.22s ease;
}
.rtut-card--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.rtut-card:focus { outline: none; }

.rtut-arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--rtut-card-bg);
  border: 1px solid var(--rtut-border);
  transform: rotate(45deg);
}
.rtut-arrow--top    { bottom: -7px; border-top: none; border-left: none; }
.rtut-arrow--bottom { top: -7px;    border-bottom: none; border-right: none; }
.rtut-arrow--left   { right: -7px;  border-bottom: none; border-left: none; }
.rtut-arrow--right  { left: -7px;   border-top: none; border-right: none; }

.rtut-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
}
.rtut-body {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--rtut-muted-fg);
  white-space: pre-line;
}

.rtut-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}
.rtut-dots {
  display: flex;
  gap: 5px;
  align-items: center;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}
.rtut-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--rtut-dot);
  transition: background 0.2s ease, transform 0.2s ease;
  flex: none;
}
.rtut-dot--active {
  background: var(--rtut-accent);
  transform: scale(1.25);
}
.rtut-count {
  font-size: 11.5px;
  color: var(--rtut-muted-fg);
  flex: 1;
}

.rtut-btn {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 9px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
  cursor: pointer;
  background: transparent;
  color: var(--rtut-muted-fg);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  flex: none;
}
.rtut-btn:hover { color: var(--rtut-card-fg); }
.rtut-btn:focus-visible { box-shadow: var(--rtut-ring); outline: none; }
.rtut-btn--primary {
  background: var(--rtut-accent);
  color: var(--rtut-accent-fg);
}
.rtut-btn--primary:hover { color: var(--rtut-accent-fg); filter: brightness(1.08); }
.rtut-btn--ghost { border-color: var(--rtut-border); color: var(--rtut-card-fg); }

.rtut-skip {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 14px;
}

@media (max-width: 480px) {
  .rtut-card { max-width: calc(100vw - 16px); padding: 14px 14px 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .rtut-spotlight, .rtut-card, .rtut-dot { transition: none; }
}
`;

/** Inject the stylesheet once per document. No-op on the server. */
export function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ELEMENT_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
