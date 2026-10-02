// Background pre-composition of the AI Mind session (NP-102). Runs on APP OPEN
// and foreground (AppState change to active) and as a fallback when the Mind tab opens
// with an empty cache (e.g. after a workout/nutrition log invalidated it). It is:
//   • cooldown-gated — at most one composition per 8h (timestamp stamped the
//     moment we attempt, so a slow/failed run can't re-fire), and
//   • silent — never surfaces in the global activity indicator (no toast), never
//     raises consent prompt or upgrade sheet, and
//   • non-blocking — callers don't await it to render; the deterministic plan
//     shows instantly and the cached AI plan is adopted when ready.

import {
  apiFetch,
  MindProgressResponseSchema,
  MindSessionStateResponseSchema,
  MindStateResponseSchema,
  MindMissionResponseSchema,
  type MindState,
} from "@become/api-client";
import {
  conformSession,
  dayOfYear,
  getPathSession,
  getUnlockedSystems,
  sessionShape,
  type MindSessionPlan,
  type SessionContext,
  type SessionSlot,
} from "@become/core";
import { runAiTask } from "@/lib/ai/runClient";
import { sessionStore } from "@/lib/auth/secureStoreToken";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { tzOffsetMinutes } from "@/lib/time/localDay";
import {
  AI_PLAN_TTL,
  readMindPlanCache,
  stampMindPlan,
} from "./sessionCache";

let inFlight = false;

/**
 * Returns whether a precompose operation is currently running.
 */
export function isPrecomposing(): boolean {
  return inFlight;
}

/**
 * Compose + cache the AI session if the 8h cooldown has lapsed. No-op otherwise.
 * Stamped before dispatch so a slow or failed run cannot re-fire.
 * Never raises consent prompt or upgrade sheet (silent: true).
 *
 * `seedOverride` exists for tests: production callers omit it and get a fresh
 * random seed per composition. Tests pass an explicit seed so the session shape
 * (and therefore the mock's validation) is deterministic.
 */
export async function precomposeMindSession(opts?: {
  force?: boolean;
  seed?: number;
}): Promise<MindSessionPlan | null> {
  if (inFlight) return null;

  if (!opts?.force) {
    const cache = await readMindPlanCache();
    if (cache && Date.now() - cache.ts < AI_PLAN_TTL) {
      // still fresh — skip
      return cache.plan;
    }
  }

  inFlight = true;
  // Start the cooldown immediately so failures/slow runs can't re-fire.
  await stampMindPlan();

  try {
    const token = await sessionStore.get();
    if (!token) return null;

    const tzParam = tzOffsetMinutes();
    const [progressRes, sessionRes, stateRes, missionRes] =
      await Promise.allSettled([
        apiFetch("/api/mind/progress", MindProgressResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token,
          tz: tzParam,
        }),
        apiFetch(
          `/api/mind/session?tz=${tzParam ?? ""}`,
          MindSessionStateResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token,
            tz: tzParam,
          },
        ),
        apiFetch(
          `/api/mind/state?tz=${tzParam ?? ""}`,
          MindStateResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token,
            tz: tzParam,
          },
        ),
        apiFetch("/api/mind/mission", MindMissionResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token,
          tz: tzParam,
        }),
      ]);

    if (progressRes.status !== "fulfilled" || !progressRes.value) {
      return null;
    }
    const p = progressRes.value;

    let recentState: MindState | null = null;
    let recentFeeling: string | null = null;
    let lastBreathAt: number | null = null;
    let recentKinds: string[] = [];
    let missionAction: string | null = null;

    if (sessionRes.status === "fulfilled" && sessionRes.value) {
      const s = sessionRes.value;
      lastBreathAt =
        typeof s.lastBreathAt === "number" ? s.lastBreathAt : null;
      recentKinds = Array.isArray(s.recentKinds) ? s.recentKinds : [];
    }

    if (stateRes.status === "fulfilled" && stateRes.value) {
      const st = stateRes.value;
      const last =
        Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null;
      if (last?.state) recentState = last.state as MindState;
      if (typeof last?.feeling === "string") recentFeeling = last.feeling;
    }

    if (missionRes.status === "fulfilled" && missionRes.value) {
      const m = missionRes.value;
      missionAction = m?.mission?.dailyAction ?? null;
    }

    const now = Date.now();
    const ctx: SessionContext = {
      chapter: p.chapter ?? 1,
      unlockedSystems: p.unlockedSystems ?? getUnlockedSystems(p.chapter ?? 1),
      recentState,
      recentFeeling,
      missionAction,
      identityStatement: p.vision?.identityStatement ?? null,
      recentKinds,
      pathFocus: getPathSession(p.mainSessionCount ?? 0),
      dayOfYear: dayOfYear(new Date(now)),
      seed: opts?.seed ?? Math.floor(Math.random() * 1_000_000),
      now,
      lastBreathAt,
    };

    const shape = sessionShape(ctx);
    const slots: SessionSlot[] = shape.slots;

    const r = await runAiTask(
      "/api/ai/mind/session",
      {
        context: ctx,
        blueprint: {
          id: shape.id,
          opening: {
            id: shape.opening.id,
            title: shape.opening.title,
            subtitle: shape.opening.subtitle,
          },
          focus: shape.focus,
          shape: shape.body.shape,
          dimension: ctx.pathFocus?.dimension ?? null,
          directive: ctx.pathFocus?.directive ?? null,
          feeling: ctx.recentFeeling ?? null,
          slots: slots.map((s) => ({
            kind: s.kind,
            role: s.role,
            brief: s.brief,
          })),
        },
      },
      { silent: true },
    );

    if (!r.ok || !r.result || typeof r.result !== "object") {
      // Silent refusals (consent, gate, cap) only fall back.
      return null;
    }

    const plan = conformSession(r.result, ctx, shape);
    if (plan) {
      await stampMindPlan(plan);
      return plan;
    }
    return null;
  } catch {
    // Best effort; cooldown stamp already set
    return null;
  } finally {
    inFlight = false;
  }
}
