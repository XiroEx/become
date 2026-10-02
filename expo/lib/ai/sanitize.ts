export interface GuidedStep {
  title: string;
  body?: string;
  inputPrompt?: string;
  placeholder?: string;
  choices?: string[];
  scale?: { min: number; max: number; minLabel: string; maxLabel: string };
}

/** Drop surrounding quotes a model sometimes wraps a single line in. */
export function stripQuotes(text: string): string {
  return text.trim().replace(/^["“'']+|["”'']+$/g, "").trim();
}

function clampTextLen(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

/** Does this line actually pose a question? */
function isQuestion(s: string): boolean {
  return /\?["'”’)\\]]*\s*$/.test(s.trim());
}

/**
 * Pull the trailing question out of a paragraph, e.g.
 * "You said you'd lead. What does that cost you today?" → the second sentence.
 */
export function trailingQuestion(body: string): string | null {
  const m = body.trim().match(/([^.!?]+\?)["'”’)\\]*\s*$/);
  if (!m) return null;
  const q = m[1]!.trim();
  return q.split(/\s+/).length >= 3 ? q : null;
}

/**
 * A typed-answer step has to ASK the member something.
 */
export function ensureStepAsks(step: GuidedStep): GuidedStep {
  if (!step.inputPrompt) return step;

  if (!isQuestion(step.inputPrompt)) {
    const fromBody = step.body ? trailingQuestion(step.body) : null;
    if (fromBody) step.inputPrompt = fromBody;
  }

  if (isQuestion(step.inputPrompt) && step.body) {
    const dupe = trailingQuestion(step.body);
    if (dupe) {
      const setup = step.body.slice(0, step.body.lastIndexOf(dupe)).trim();
      if (setup) step.body = setup;
      else delete step.body;
    }
  }

  return step;
}

/**
 * Validate + clean an AI-generated guided flow. Returns usable steps, or null if
 * the shape is too broken to render (caller falls back to its static flow).
 */
export function validateGuidedSteps(raw: unknown): GuidedStep[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GuidedStep[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;

    const step: GuidedStep = { title: clampTextLen(title, 120) };
    if (typeof o.body === "string" && o.body.trim()) {
      step.body = clampTextLen(o.body.trim(), 400);
    }
    if (typeof o.inputPrompt === "string" && o.inputPrompt.trim()) {
      step.inputPrompt = clampTextLen(o.inputPrompt.trim(), 160);
    }
    if (typeof o.placeholder === "string" && o.placeholder.trim()) {
      step.placeholder = clampTextLen(o.placeholder.trim(), 120);
    }

    if (Array.isArray(o.choices)) {
      const choices = o.choices
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => clampTextLen(c.trim(), 80))
        .slice(0, 4);
      if (choices.length >= 2) step.choices = choices;
    }

    if (o.scale && typeof o.scale === "object") {
      const sc = o.scale as Record<string, unknown>;
      if (
        typeof sc.min === "number" &&
        typeof sc.max === "number" &&
        sc.max > sc.min &&
        typeof sc.minLabel === "string" &&
        typeof sc.maxLabel === "string"
      ) {
        step.scale = {
          min: sc.min,
          max: sc.max,
          minLabel: sc.minLabel.trim(),
          maxLabel: sc.maxLabel.trim(),
        };
      }
    }

    ensureStepAsks(step);
    out.push(step);
  }

  return out.length >= 2 ? out.slice(0, 8) : null;
}
