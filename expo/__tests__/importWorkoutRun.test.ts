/* eslint-disable import/first */
// NP-242 — IMPORT FROM TEXT 2/4: RUN THE AI ONCE, MATCH NAMES TO THE LIBRARY.
//
// expo/lib/workout/importWorkoutRun.ts — `importSessionFromText` /
// `importProgramFromText`, on top of NP-241's pure parsers
// (expo/lib/workout/importWorkoutText.ts), through the AI run client
// (NP-038) and the consent prompt (NP-046). Mirrors the web's
// ImportSessionFlow.tsx (`runImport` + `buildLibraryIndex`) and
// ImportProgramFlow.tsx (`runImport` + `flagAgainstLibrary`).
//
// Pinned here:
//   • (id: e5ced3ae) the AI import is posted exactly once per import and
//     never retried, whatever the outcome;
//   • (id: e5ced3af) an `ai_consent` refusal raises the consent prompt ONLY
//     — never the upgrade sheet, no outage line — and returns `consent`;
//   • (id: e5ced3b0) session names resolve through custom + search exercises;
//     program names flag through POST /api/exercises/match, falling back to
//     the unflagged program when that call fails.

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/ai/aiConsentPrompt", () => ({
  raiseAiConsentPrompt: jest.fn(),
}));

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import { raiseAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { importProgramFromText, importSessionFromText } from "@/lib/workout/importWorkoutRun";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockRaiseConsent = raiseAiConsentPrompt as unknown as jest.Mock;
const mockShowUpgrade = showUpgradeSheet as unknown as jest.Mock;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockRaiseConsent.mockReset();
  mockShowUpgrade.mockReset();
});

function singleWorkoutResult(exercises: { name: string; sets?: number; reps?: string }[]) {
  return {
    phases: [
      {
        phase: "Single",
        weeks: "1",
        focus: "General",
        workouts: [{ day: "Day 1", title: "Push", exercises }],
      },
    ],
  };
}

describe("(id: e5ced3ae) the AI import is posted exactly once and never retried", () => {
  it("session import posts /api/ai/workout/import once, even on failure", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "unavailable" });
    const outcome = await importSessionFromText("some text", { runTask: runTask as never });
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(runTask.mock.calls[0]![0]).toBe("/api/ai/workout/import");
    expect(runTask.mock.calls[0]![1]).toEqual({ text: "some text" });
    expect(outcome.status).toBe("error");
  });

  it("program import posts /api/ai/workout/import once, even on an empty answer", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: { phases: [] } });
    const outcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("empty");
  });

  it("a successful session import still posts the AI exactly once", async () => {
    mockApiFetch.mockResolvedValue({ exercises: [] });
    const runTask = jest
      .fn()
      .mockResolvedValue({ ok: true, result: singleWorkoutResult([{ name: "Bench Press", sets: 4, reps: "8-10" }]) });
    await importSessionFromText("text", { runTask: runTask as never });
    expect(runTask).toHaveBeenCalledTimes(1);
  });
});

describe("(id: e5ced3af) a consent refusal raises the consent prompt only", () => {
  it("session: returns consent, raises the consent prompt, never the upgrade sheet, no AI result handling", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "ai_consent" });
    const outcome = await importSessionFromText("text", { runTask: runTask as never });
    expect(outcome).toEqual({ status: "consent" });
    expect(mockRaiseConsent).toHaveBeenCalledTimes(1);
    expect(mockShowUpgrade).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("program: returns consent, raises the consent prompt, never the upgrade sheet", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "ai_consent" });
    const outcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(outcome).toEqual({ status: "consent" });
    expect(mockRaiseConsent).toHaveBeenCalledTimes(1);
    expect(mockShowUpgrade).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("an entitlement refusal returns a gate, not consent, and does not raise the consent prompt", async () => {
    const gate = { error: "Upgrade to Plus for AI import", feature: "ai-import", requiresTier: "plus" };
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "entitlement", gate });
    const outcome = await importSessionFromText("text", { runTask: runTask as never });
    expect(outcome).toEqual({ status: "gate", gate });
    expect(mockRaiseConsent).not.toHaveBeenCalled();
  });

  it("a 429 returns rate_limited with no consent prompt and no upgrade sheet", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "rate_limited" });
    const outcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(outcome).toEqual({ status: "rate_limited" });
    expect(mockRaiseConsent).not.toHaveBeenCalled();
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });

  it("an unusable AI answer returns empty with the web's copy, for both flows", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: { phases: [] } });
    const sessionOutcome = await importSessionFromText("text", { runTask: runTask as never });
    expect(sessionOutcome).toEqual({
      status: "empty",
      message: "Couldn't find a workout in that. Try pasting the full text instead.",
    });

    const programOutcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(programOutcome).toEqual({
      status: "empty",
      message: "Couldn't find a program in that. Try pasting the full text instead.",
    });
  });
});

describe("(id: e5ced3b0) session resolves through custom + search; program flags through match", () => {
  it("session: resolves matches from custom exercises and search, lists the rest as unresolved", async () => {
    const runTask = jest.fn().mockResolvedValue({
      ok: true,
      result: singleWorkoutResult([
        { name: "Bench Press", sets: 4, reps: "8-10" },
        { name: "Face Pull", sets: 3, reps: "15" },
      ]),
    });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/exercises/custom") {
        return { exercises: [{ slug: "bench-press", name: "Bench Press", trackingType: "reps_weight" }] };
      }
      if (path.startsWith("/api/exercises/search")) {
        return { exercises: [] }; // neither search lookup finds a real match
      }
      return {};
    });

    const outcome = await importSessionFromText("text", { runTask: runTask as never });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.session.exercises.map((e) => e.exerciseSlug)).toEqual(["bench-press"]);
    expect(outcome.session.unresolved).toEqual(["Face Pull"]);

    // one /api/exercises/custom call plus one /api/exercises/search call per parsed name
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/exercises/custom",
      expect.anything(),
      expect.anything(),
    );
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it("session: a name resolves through search when it is not one of the member's custom exercises", async () => {
    const runTask = jest.fn().mockResolvedValue({
      ok: true,
      result: singleWorkoutResult([{ name: "Lat Pulldown", sets: 3, reps: "12" }]),
    });
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [] };
      if (path.startsWith("/api/exercises/search")) {
        return { exercises: [{ slug: "lat-pulldown", name: "Lat Pulldown", trackingType: "reps_weight" }] };
      }
      return {};
    });

    const outcome = await importSessionFromText("text", { runTask: runTask as never });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.session.exercises.map((e) => e.exerciseSlug)).toEqual(["lat-pulldown"]);
    expect(outcome.session.unresolved).toEqual([]);
  });

  it("program: flags exercises against POST /api/exercises/match", async () => {
    const result = singleWorkoutResult([
      { name: "Bench Press", sets: 4, reps: "8-10" },
      { name: "Zercher Carry", sets: 3, reps: "10" },
    ]);
    const runTask = jest.fn().mockResolvedValue({ ok: true, result });
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
      expect(path).toBe("/api/exercises/match");
      expect(init?.method).toBe("POST");
      expect(init?.body).toEqual({ names: ["Bench Press", "Zercher Carry"] });
      return { known: ["bench press"] };
    });

    const outcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok");
    const [bench, zercher] = outcome.program.phases[0]!.workouts[0]!.exercises;
    expect(bench!.importFlags).toBeUndefined();
    expect(zercher!.importFlags).toContain("new");
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it("program: falls back to the unflagged program when the match lookup fails", async () => {
    const result = singleWorkoutResult([{ name: "Bench Press", sets: 4, reps: "8-10" }]);
    const runTask = jest.fn().mockResolvedValue({ ok: true, result });
    mockApiFetch.mockRejectedValue(new Error("network down"));

    const outcome = await importProgramFromText("text", { runTask: runTask as never });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") throw new Error("expected ok");
    expect(outcome.program.phases[0]!.workouts[0]!.exercises[0]!.importFlags).toBeUndefined();
    expect(outcome.program.name).toBe("Imported Program");
  });
});
