/* eslint-disable import/first */
/**
 * THE NATIVE PROGRAM BUILDER — the frame (NP-168).
 *
 * Native counterpart of `webapp/app/dashboard/admin/programs/_editors/
 * ProgramCreator.tsx` + `PhaseEditor.tsx`, which members reach at
 * `/dashboard/programs/new` and `/dashboard/programs/[programId]/edit`.
 *
 * The three criteria, each tested as the thing a member actually feels:
 *
 *   • (e015ca6c) a program with two phases and three workouts each, built
 *     natively, opens IDENTICALLY in the web editor. Pinned twice: the body
 *     carries only the fields `webapp/lib/programFields.ts` allows (read from
 *     that file, not retyped) and parses as `CustomProgramInputSchema`; and
 *     the web editor's own reader — `initialProgram` seeding plus the
 *     `.trim()` expressions `ProgramCreator` evaluates DURING RENDER — is
 *     replayed over the saved program, which is where a missing `focus` would
 *     throw rather than merely look empty.
 *   • (e015ca6d) a free member at the cap sees the upgrade sheet on Create —
 *     before the request (the snapshot says so) and after one (a 403 says so),
 *     with their draft still on the device either way.
 *   • (e015ca6e) a half-built program survives the app being KILLED: the
 *     draft lives in AsyncStorage, so the test unmounts the screen, throws the
 *     module state away and re-reads the same storage.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";
import * as fs from "fs";
import * as path from "path";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", email: "member@example.com" },
    token: mockMemberJwt(),
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, CustomProgramInputSchema } from "@become/api-client";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import NewProgramRoute from "@/app/(app)/(tabs)/programming/new";
import EditProgramRoute from "@/app/(app)/(tabs)/programming/[id]/edit";
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import {
  BUILDER_PAYLOAD_FIELDS,
  BUILDER_TARGET_USER_OPTIONS,
  addWorkout,
  duplicateDayLabels,
  emptyProgramBuilderState,
  fromCustomProgram,
  nextDayLabel,
  removeWorkout,
  toCustomProgramPayload,
  validateProgram,
  withTrainingDays,
} from "@/lib/programs/programBuilder";
import {
  PROGRAM_CREATE_DRAFT_KEY,
  createProgramDraftStore,
  parseProgramDraft,
  serializeProgramDraft,
} from "@/lib/programs/programDraft";
import {
  NATIVE_BUILDER_HAS_EXERCISE_ROWS,
  programCreateDestination,
  programEditDestination,
} from "@/lib/programs/customPrograms";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 9, 2, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

/** Prefixed `mock` so the `useAuth` factory above may reach it (jest rule). */
function mockMemberJwt(): string {
  return jwtFor("member-1");
}

const MEMBER_JWT = mockMemberJwt();

const WEBAPP_DIR = path.resolve(__dirname, "..", "..", "webapp");

function webSource(...segments: string[]): string {
  return fs.readFileSync(path.join(WEBAPP_DIR, ...segments), "utf8");
}

const PROGRAM_FIELDS_SRC = webSource("lib", "programFields.ts");
const PROGRAM_CREATOR_SRC = webSource(
  "app",
  "dashboard",
  "admin",
  "programs",
  "_editors",
  "ProgramCreator.tsx",
);
const NEW_PROGRAM_CLIENT_SRC = webSource(
  "app",
  "dashboard",
  "programs",
  "new",
  "NewProgramClient.tsx",
);

/** `CUSTOM_PROGRAM_INPUT_FIELDS` as the webapp declares it. */
function webAllowedProgramFields(): string[] {
  const block = PROGRAM_FIELDS_SRC.match(
    /export const CUSTOM_PROGRAM_INPUT_FIELDS = \[([\s\S]*?)\] as const/,
  );
  expect(block).toBeTruthy();
  return [...(block?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

/** `TARGET_USER_OPTIONS` as the web builder declares it. */
function webTargetUserOptions(): string[] {
  const block = PROGRAM_CREATOR_SRC.match(
    /const TARGET_USER_OPTIONS: TargetUserLevel\[\] = \[([\s\S]*?)\];/,
  );
  expect(block).toBeTruthy();
  return [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

/**
 * THE WEB EDITOR'S READER, replayed.
 *
 * `ProgramCreator` seeds its form with `initialProgram?.x ?? default` and then,
 * during RENDER, computes
 *
 *     isStep2Valid = formData.phases.every((phase) =>
 *       phase.weeks.trim() !== "" && phase.focus.trim() !== "" &&
 *       phase.workouts.every((workout) => workout.title.trim() !== "" && …))
 *
 * so a phase saved WITHOUT `focus` is not a cosmetic gap — it is a TypeError
 * the moment the member opens that program on the web. This function makes the
 * same calls, and the assertions below check the real file still makes them.
 */
function openInWebEditor(program: Record<string, unknown>): {
  name: string;
  step1Valid: boolean;
  phasesReadable: boolean;
  workoutTabs: string[];
} {
  const name = (program.name as string) ?? "";
  const goal = (program.goal as string) ?? "";
  const durationWeeks = (program.duration_weeks as number) ?? 4;
  const trainingDays = (program.training_days_per_week as number) ?? 4;
  const phases = (program.phases ?? []) as {
    phase: string;
    weeks: string;
    focus: string;
    workouts: { day: string; title: string; exercises: unknown[] }[];
  }[];

  const workoutTabs: string[] = [];
  const phasesReadable = phases.every((phase) => {
    // The exact expressions the web evaluates while rendering.
    const weeksOk = phase.weeks.trim() !== "";
    const focusOk = phase.focus.trim() !== "";
    // PhaseEditor renders `{phase.workouts.length} workouts` and a tab per
    // workout showing `workout.day`; WorkoutEditor maps `workout.exercises`.
    const workoutsOk = phase.workouts.every((workout) => {
      workoutTabs.push(workout.day);
      return (
        workout.title.trim() !== "" &&
        Array.isArray(workout.exercises) &&
        workout.exercises.map((e) => e).length === workout.exercises.length
      );
    });
    return weeksOk && focusOk && workoutsOk;
  });

  return {
    name,
    step1Valid:
      name.trim() !== "" &&
      goal.trim() !== "" &&
      durationWeeks > 0 &&
      trainingDays > 0,
    phasesReadable,
    workoutTabs,
  };
}

function freePlan(canCreate: boolean, remaining: number, enforced = true) {
  return {
    role: "user",
    tier: "free",
    enforced,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-programs": {
        allowed: true,
        canCreate,
        requiresTier: "plus",
        limit: 3,
        used: 3 - remaining,
        remaining,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

const AT_CAP = freePlan(false, 0);
const ROOM_LEFT = freePlan(true, 2);
const UNENFORCED = freePlan(true, 3, false);

/** The entitlements answer this test is currently scripting. */
let entitlementsBody: unknown = UNENFORCED;

/** Route `apiFetch` by path; entitlements reads answer from the variable. */
function routeFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => {
      if (p === "/api/me/entitlements") return entitlementsBody;
      return impl(p, init);
    },
  );
}

function postBodies(pathname: string, method: string): Record<string, unknown>[] {
  return mockApiFetch.mock.calls
    .filter(([p, , init]) => {
      const i = (init ?? {}) as { method?: string };
      return p === pathname && i.method === method;
    })
    .map(([, , init]) => (init as { body: Record<string, unknown> }).body);
}

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockParams = {};
  entitlementsBody = UNENFORCED;
  storage = createMemoryAsyncStorage();
  await AsyncStorage.clear();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(MEMBER_JWT);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  jest.spyOn(Date, "now").mockImplementation(() => NOW_MS);
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
  await AsyncStorage.clear();
});

// ───────────────────────────────────────────────────────────────────────────
// The model: what leaves the phone, and what a day label means.
// ───────────────────────────────────────────────────────────────────────────

describe("the payload the builder sends", () => {
  it("carries exactly the fields webapp/lib/programFields.ts allows", () => {
    // Read from the webapp, never retyped: `createStrict` throws on a
    // top-level key that is not a Program schema path, so a drift here is a
    // 500 on every save rather than a dropped field.
    expect([...BUILDER_PAYLOAD_FIELDS].sort()).toEqual(
      webAllowedProgramFields().sort(),
    );

    const payload = toCustomProgramPayload(
      emptyProgramBuilderState({ name: "My Split", goal: "strength" }),
    );
    for (const key of Object.keys(payload)) {
      expect(BUILDER_PAYLOAD_FIELDS as readonly string[]).toContain(key);
    }
    // And none of the server-controlled ones, however the state was built.
    for (const forbidden of [
      "program_id",
      "isCustom",
      "createdBy",
      "sharedWith",
      "coverImage",
      "_id",
    ]) {
      expect(payload as unknown as Record<string, unknown>).not.toHaveProperty(
        forbidden,
      );
    }
    expect(() => CustomProgramInputSchema.parse(payload)).not.toThrow();
  });

  it("offers the same target_user options the web builder does", () => {
    expect([...BUILDER_TARGET_USER_OPTIONS]).toEqual(webTargetUserOptions());
  });

  it("keeps a day label unique inside a phase, because logs are keyed on it", () => {
    let state = emptyProgramBuilderState({ training_days_per_week: 3 });
    expect(state.phases[0]?.workouts.map((w) => w.day)).toEqual([
      "Day 1",
      "Day 2",
      "Day 3",
    ]);

    // Delete the middle session and add one: the freed label comes back
    // rather than a second "Day 3".
    state = removeWorkout(state, 0, 1);
    state = addWorkout(state, 0);
    expect(state.phases[0]?.workouts.map((w) => w.day)).toEqual([
      "Day 1",
      "Day 3",
      "Day 2",
    ]);
    expect(nextDayLabel(state.phases[0]?.workouts ?? [])).toBe("Day 4");

    // A collision the member typed is reported, and refuses the save.
    const collided = {
      ...(state.phases[0] as NonNullable<(typeof state.phases)[0]>),
      workouts: [
        { day: "Day 1", title: "A", exercises: [] },
        { day: "day 1", title: "B", exercises: [] },
      ],
    };
    expect(duplicateDayLabels(collided)).toEqual(["Day 1"]);
    const invalid = validateProgram({
      ...state,
      name: "x",
      goal: "y",
      phases: [{ ...collided, weeks: "1-4", focus: "base" }],
    });
    expect(invalid.canSave).toBe(false);
    expect(invalid.duplicateDays[0]).toEqual(["Day 1"]);
    expect(invalid.errors.join(" ")).toContain("used twice");
  });

  it("never deletes a session with anything in it when the week count drops", () => {
    let state = emptyProgramBuilderState({ training_days_per_week: 4 });
    state = {
      ...state,
      phases: [
        {
          ...(state.phases[0] as NonNullable<(typeof state.phases)[0]>),
          workouts: [
            { day: "Day 1", title: "Push", exercises: [] },
            { day: "Day 2", title: "Pull", exercises: [] },
            { day: "Day 3", title: "Legs", exercises: [{ name: "Squat" }] },
            { day: "Day 4", title: "", exercises: [] },
          ],
        },
      ],
    };
    // 4 → 2: the blank trailing session goes, the one with an exercise stays.
    const next = withTrainingDays(state, 2);
    expect(next.training_days_per_week).toBe(2);
    expect(next.phases[0]?.workouts.map((w) => w.day)).toEqual([
      "Day 1",
      "Day 2",
      "Day 3",
    ]);
  });

  it("keeps the exercises a web-built program already has", () => {
    const fromServer = {
      name: "Coach plan",
      goal: "strength",
      duration_weeks: 8,
      training_days_per_week: 2,
      phases: [
        {
          phase: "Phase 1",
          weeks: "1-4",
          focus: "base",
          workouts: [
            {
              day: "Day 1",
              title: "Upper",
              exercises: [
                { exerciseSlug: "bench-press", name: "Bench Press", sets: 4, reps: "6" },
              ],
            },
            { day: "Day 2", title: "Lower", exercises: [] },
          ],
        },
      ],
    };
    const payload = toCustomProgramPayload(fromCustomProgram(fromServer));
    expect(payload.phases[0]?.workouts[0]?.exercises).toEqual(
      fromServer.phases[0]?.workouts[0]?.exercises,
    );
  });
});

describe("where Create and Edit go (NP-135's link, NP-171's condition)", () => {
  it("goes native now that a build has the exercise rows, and stays on the web without them", () => {
    // NP-168 shipped the frame with the switch off; NP-171 lands the rows and
    // flips it, so the member-facing link leaves the web on this build — one
    // switch, both call sites.
    expect(NATIVE_BUILDER_HAS_EXERCISE_ROWS).toBe(true);
    expect(programCreateDestination()).toEqual({
      surface: "native",
      route: "/(tabs)/programming/new",
    });
    expect(programEditDestination("custom-abc")).toEqual({
      surface: "native",
      route: "/(tabs)/programming/custom-abc/edit",
    });

    expect(programCreateDestination(false)).toEqual({
      surface: "web",
      path: "/dashboard/programs/new",
    });
    expect(programEditDestination("custom-abc", false)).toEqual({
      surface: "web",
      path: "/dashboard/programs/custom-abc/edit",
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca6c)
// ───────────────────────────────────────────────────────────────────────────

/**
 * NP-281 put the WEB'S CHOOSER in front of the builder ("Create a program —
 * start from a blank program, or import one you already wrote"), so every
 * scratch build now starts with that one tap.
 */
function openScratchBuilder(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));
}

/** Build "2 phases × 3 workouts" through the screen, as a member would. */
async function buildTwoPhasesOfThree(screen: ReturnType<typeof render>) {
  openScratchBuilder(screen);
  // Step 1: the program.
  fireEvent.changeText(screen.getByTestId("program-builder-name"), "My Split");
  fireEvent.changeText(
    screen.getByTestId("program-builder-description"),
    "Built on the phone",
  );
  fireEvent.changeText(screen.getByTestId("program-builder-goal"), "Get strong");
  fireEvent.changeText(screen.getByTestId("program-builder-weeks"), "8");
  // 4 → 3 sessions a week (the trailing blank session goes with it).
  fireEvent.press(screen.getByTestId("program-builder-days-decrease"));
  fireEvent.press(screen.getByTestId("program-builder-target-advanced"));

  // Step 2: phases and sessions.
  fireEvent.press(screen.getByTestId("program-builder-step-phases"));
  fireEvent.press(screen.getByTestId("program-builder-add-phase"));

  const titles = [
    ["Upper Power", "Lower Power", "Full Body"],
    ["Upper Hypertrophy", "Lower Hypertrophy", "Conditioning"],
  ];
  for (let phase = 0; phase < 2; phase += 1) {
    fireEvent.changeText(
      screen.getByTestId(`program-builder-phase-${phase}-weeks`),
      phase === 0 ? "1-4" : "5-8",
    );
    fireEvent.changeText(
      screen.getByTestId(`program-builder-phase-${phase}-focus`),
      phase === 0 ? "Strength" : "Volume",
    );
    for (let workout = 0; workout < 3; workout += 1) {
      // NP-281: the sessions are Day TABS now (the web's layout), so one is
      // open at a time and the tab is how you reach the next one.
      fireEvent.press(
        screen.getByTestId(`program-builder-phase-${phase}-day-${workout}`),
      );
      fireEvent.changeText(
        screen.getByTestId(
          `program-builder-phase-${phase}-workout-${workout}-title`,
        ),
        titles[phase]?.[workout] as string,
      );
    }
  }

  fireEvent.press(screen.getByTestId("program-builder-step-review"));
}

describe("(id: e015ca6c) A program with two phases and three workouts each, built natively, opens identically in the web editor", () => {
  it("posts the web editor's own shape to /api/programs/custom and reads back identically", async () => {
    routeFetch((p: string) => {
      if (p === "/api/programs/custom") {
        // The route answers with the program document; the id is minted
        // server-side (`custom-<user>-<slug>-<ts>`).
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    await buildTwoPhasesOfThree(screen);

    expect(screen.getByTestId("program-builder-summary")).toHaveTextContent(
      /2 phases, 6 workouts/,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    await waitFor(() => expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1));
    const body = postBodies("/api/programs/custom", "POST")[0] as Record<
      string,
      unknown
    >;

    // 1. Only schema fields, and it parses as the wire contract.
    for (const key of Object.keys(body)) {
      expect(BUILDER_PAYLOAD_FIELDS as readonly string[]).toContain(key);
    }
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();

    // 2. Two phases, three sessions each, labels unique inside each phase.
    const phases = body.phases as {
      phase: string;
      weeks: string;
      focus: string;
      workouts: { day: string; title: string; exercises: unknown[] }[];
    }[];
    expect(phases).toHaveLength(2);
    expect(phases.map((p) => p.phase)).toEqual(["Phase 1", "Phase 2"]);
    expect(phases.map((p) => p.weeks)).toEqual(["1-4", "5-8"]);
    expect(phases.map((p) => p.focus)).toEqual(["Strength", "Volume"]);
    for (const phase of phases) {
      expect(phase.workouts).toHaveLength(3);
      expect(phase.workouts.map((w) => w.day)).toEqual([
        "Day 1",
        "Day 2",
        "Day 3",
      ]);
      expect(new Set(phase.workouts.map((w) => w.day)).size).toBe(3);
    }
    expect(phases[0]?.workouts.map((w) => w.title)).toEqual([
      "Upper Power",
      "Lower Power",
      "Full Body",
    ]);
    expect(body.name).toBe("My Split");
    expect(body.goal).toBe("Get strong");
    expect(body.duration_weeks).toBe(8);
    expect(body.training_days_per_week).toBe(3);
    expect(body.target_user).toBe("Advanced");

    // 3. The WEB EDITOR'S reader, replayed over what was saved. This is the
    //    criterion: `ProgramCreator` calls `.trim()` on weeks, focus and
    //    title during render, so a missing one throws rather than looks empty.
    const opened = openInWebEditor(body);
    expect(opened.name).toBe("My Split");
    expect(opened.step1Valid).toBe(true);
    expect(opened.phasesReadable).toBe(true);
    expect(opened.workoutTabs).toEqual([
      "Day 1",
      "Day 2",
      "Day 3",
      "Day 1",
      "Day 2",
      "Day 3",
    ]);

    // …and the real web file still makes those calls, so the replay above
    // cannot drift away from it unnoticed.
    expect(PROGRAM_CREATOR_SRC).toContain('phase.weeks.trim() !== ""');
    expect(PROGRAM_CREATOR_SRC).toContain('phase.focus.trim() !== ""');
    expect(PROGRAM_CREATOR_SRC).toContain('workout.title.trim() !== ""');

    // 4. Reading the saved program back into the builder and saving it again
    //    changes nothing — "opens identically", both directions.
    expect(toCustomProgramPayload(fromCustomProgram(body))).toEqual(body);

    // The draft is gone (the program exists now) and the member lands on it.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).toBeNull(),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      "/(tabs)/programming/custom-abc123-my-split-m0k1",
    );
  });

  it("edits one through PUT /api/programs/custom/[programId], exercises intact", async () => {
    mockParams = { id: "custom-abc" };
    const existing = {
      program_id: "custom-abc",
      name: "My Split",
      description: "Built on the web",
      goal: "strength",
      duration_weeks: 8,
      training_days_per_week: 2,
      target_user: "Intermediate",
      equipment: ["Barbell"],
      tags: ["strength"],
      isCustom: true,
      isOwner: true,
      phases: [
        {
          phase: "Phase 1",
          weeks: "1-4",
          focus: "base",
          workouts: [
            {
              day: "Day 1",
              title: "Upper",
              exercises: [
                { exerciseSlug: "bench-press", name: "Bench Press", sets: 4, reps: "6" },
              ],
            },
            { day: "Day 2", title: "Lower", exercises: [] },
          ],
        },
      ],
    };
    routeFetch((p: string) => {
      if (p === "/api/programs/custom/custom-abc") return existing;
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<EditProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "My Split",
      ),
    );

    fireEvent.changeText(
      screen.getByTestId("program-builder-name"),
      "My Split v2",
    );
    fireEvent.press(screen.getByTestId("program-builder-step-review"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    await waitFor(() =>
      expect(postBodies("/api/programs/custom/custom-abc", "PUT")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom/custom-abc", "PUT")[0] as Record<
      string,
      unknown
    >;
    expect(body.name).toBe("My Split v2");
    // Equipment and tags the phone does not edit are preserved, not blanked.
    expect(body.equipment).toEqual(["Barbell"]);
    expect(body.tags).toEqual(["strength"]);
    // The prescription inside the session is untouched (rows are NP-171).
    const phases = body.phases as {
      workouts: { exercises: unknown[] }[];
    }[];
    expect(phases[0]?.workouts[0]?.exercises).toEqual(
      existing.phases[0]?.workouts[0]?.exercises,
    );
    for (const key of Object.keys(body)) {
      expect(BUILDER_PAYLOAD_FIELDS as readonly string[]).toContain(key);
    }
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming/custom-abc");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca6d)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca6d) A free member at the cap sees the upgrade sheet on Create", () => {
  it("raises the sheet instead of posting, and keeps the draft", async () => {
    entitlementsBody = AT_CAP;
    routeFetch((p: string) => {
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);

    // The lock and the counter explain the cap before anything is typed.
    await waitFor(() =>
      expect(
        screen.getByTestId("programming-new-allowance-counter-count"),
      ).toHaveTextContent("3/3"),
    );
    expect(screen.getByTestId("programming-new-allowance-lock")).toBeTruthy();

    openScratchBuilder(screen);
    fireEvent.changeText(
      screen.getByTestId("program-builder-name"),
      "One more split",
    );
    fireEvent.press(screen.getByTestId("program-builder-step-review"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    // The sheet is up, it names the feature, and NOTHING was posted.
    const gate = getUpgradeSheetGate();
    expect(gate).not.toBeNull();
    expect(gate?.feature).toBe("custom-programs");
    expect(gate?.requiresTier).toBe("plus");
    expect(postBodies("/api/programs/custom", "POST")).toHaveLength(0);

    // Their work is still on the device: upgrading and coming back finds it.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull(),
    );
    const draft = parseProgramDraft(
      await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY),
    );
    expect(draft?.state.name).toBe("One more split");
  });

  it("raises it from the server's own words when a 403 lands anyway", async () => {
    // The snapshot says there is room (it is 60s-cached); the SERVER is the
    // gate, and `classifyApiError` turns its 403 into the same sheet.
    entitlementsBody = ROOM_LEFT;
    const { ApiError } = jest.requireActual("@become/api-client");
    routeFetch((p: string) => {
      if (p === "/api/programs/custom") {
        throw new ApiError(403, {
          error: "You've used all 3 of your custom programs.",
          feature: "custom-programs",
          requiresTier: "plus",
          limit: 3,
          remaining: 0,
        }, "Forbidden");
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    await buildTwoPhasesOfThree(screen);
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    await waitFor(() => expect(getUpgradeSheetGate()).not.toBeNull());
    const gate = getUpgradeSheetGate();
    // Verbatim: the server owns the wording.
    expect(gate?.error).toBe("You've used all 3 of your custom programs.");
    expect(gate?.feature).toBe("custom-programs");
    // A gate is never ALSO an inline error, and the draft survived.
    expect(screen.queryByTestId("program-builder-error")).toBeNull();
    expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull();
  });

  it("draws no lock, no counter and no sheet while enforcement is off", async () => {
    entitlementsBody = UNENFORCED;
    routeFetch((p: string) => {
      if (p === "/api/programs/custom") return { program_id: "custom-xyz", name: "x" };
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratchBuilder(screen);
    expect(screen.getByTestId("program-builder-name")).toBeTruthy();
    expect(screen.queryByTestId("programming-new-allowance-lock")).toBeNull();
    expect(screen.queryByTestId("programming-new-allowance-counter")).toBeNull();
    expect(getUpgradeSheetGate()).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca6e)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca6e) A half-built program survives the app being killed", () => {
  it("writes the draft to storage and restores it into a brand-new screen", async () => {
    const disk = createMemoryAsyncStorage();
    const onSubmit = jest.fn();

    // A member part-way through: a name, a goal and a renamed session.
    const first = render(
      <ProgramBuilder
        mode="create"
        draft={createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY, disk)}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(
      first.getByTestId("program-builder-name"),
      "Half-built split",
    );
    fireEvent.changeText(first.getByTestId("program-builder-goal"), "Get strong");
    fireEvent.press(first.getByTestId("program-builder-step-phases"));
    fireEvent.changeText(
      first.getByTestId("program-builder-phase-0-weeks"),
      "1-4",
    );
    fireEvent.changeText(
      first.getByTestId("program-builder-phase-0-workout-0-title"),
      "Upper Power",
    );

    await waitFor(async () =>
      expect(await disk.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull(),
    );

    // THE KILL. Not a navigation: the screen is gone, every module that held
    // React state is gone, and the only thing left is what reached storage.
    first.unmount();

    const second = render(
      <ProgramBuilder
        mode="create"
        draft={createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY, disk)}
        onSubmit={onSubmit}
      />,
    );
    await waitFor(() =>
      expect(second.getByTestId("program-builder-name").props.value).toBe(
        "Half-built split",
      ),
    );
    expect(second.getByTestId("program-builder-goal").props.value).toBe(
      "Get strong",
    );
    expect(second.getByTestId("program-builder-draft-restored")).toBeTruthy();
    fireEvent.press(second.getByTestId("program-builder-step-phases"));
    expect(
      second.getByTestId("program-builder-phase-0-weeks").props.value,
    ).toBe("1-4");
    expect(
      second.getByTestId("program-builder-phase-0-workout-0-title").props.value,
    ).toBe("Upper Power");
  });

  it("never deletes the draft it is about to restore, however slow the read is", async () => {
    // Both draft effects fire on the same mount and the write is not ordered
    // against the read, so a blank first render used to be able to erase the
    // draft it was restoring. On a real device the read is the slow one.
    const map = new Map<string, string>();
    const ctl: { release: (() => void) | null } = { release: null };
    const slowDisk: AsyncStorageLike = {
      async getItem(key: string) {
        await new Promise<void>((resolve) => {
          ctl.release = resolve;
        });
        return map.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        map.set(key, value);
      },
      async removeItem(key: string) {
        map.delete(key);
      },
    };
    map.set(
      PROGRAM_CREATE_DRAFT_KEY,
      serializeProgramDraft(
        emptyProgramBuilderState({
          name: "Slow disk split",
          goal: "Get strong",
        }),
        NOW_MS,
      ),
    );

    const screen = render(
      <ProgramBuilder
        mode="create"
        draft={createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY, slowDisk)}
        onSubmit={jest.fn()}
      />,
    );
    // The write effect has had every chance to run; the read has not finished.
    await act(async () => {});
    expect(map.has(PROGRAM_CREATE_DRAFT_KEY)).toBe(true);
    expect(screen.getByTestId("program-builder-name").props.value).toBe("");

    await act(async () => {
      ctl.release?.();
    });
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "Slow disk split",
      ),
    );
    expect(map.has(PROGRAM_CREATE_DRAFT_KEY)).toBe(true);
  });

  it("treats a clear as final, so a straggler autosave cannot resurrect it", async () => {
    // The create route clears the draft once the program exists on the
    // server. An autosave queued before the response landed must not write it
    // back, or the next visit restores a copy of a program they already have.
    const disk = createMemoryAsyncStorage();
    const store = createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY, disk);
    const half = emptyProgramBuilderState({
      name: "Saved to the server",
      goal: "Get strong",
    });
    await store.save(half);
    expect(await disk.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull();
    await store.clear();
    await store.save(half);
    expect(await disk.getItem(PROGRAM_CREATE_DRAFT_KEY)).toBeNull();
  });

  it("uses the web builder's own draft key, and ignores a draft it cannot read", async () => {
    // One concept, one name on both clients.
    expect(PROGRAM_CREATE_DRAFT_KEY).toBe("become_user_program_creator_draft");
    expect(NEW_PROGRAM_CLIENT_SRC).toContain(
      '"become_user_program_creator_draft"',
    );
    expect(PROGRAM_CREATOR_SRC).toContain(
      "'user-create': 'become_user_program_creator_draft'",
    );

    // Fail-soft: garbage, a half-written file and an older version all read
    // as "no draft" rather than breaking the screen.
    expect(parseProgramDraft(null)).toBeNull();
    expect(parseProgramDraft("{not json")).toBeNull();
    expect(parseProgramDraft('{"v":99,"savedAt":1,"state":{}}')).toBeNull();

    const disk = createMemoryAsyncStorage();
    await disk.setItem(PROGRAM_CREATE_DRAFT_KEY, "{not json");
    const screen = render(
      <ProgramBuilder
        mode="create"
        draft={createProgramDraftStore(PROGRAM_CREATE_DRAFT_KEY, disk)}
        onSubmit={jest.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name")).toBeTruthy(),
    );
    expect(screen.getByTestId("program-builder-name").props.value).toBe("");
    expect(screen.queryByTestId("program-builder-draft-restored")).toBeNull();
  });

  it("does not restore a draft over the server's copy when editing", async () => {
    // The web builder makes the same split: on an edit the server's copy is
    // the truth, and a stale local one would revert another device's change.
    const disk = createMemoryAsyncStorage();
    const screen = render(
      <ProgramBuilder
        mode="edit"
        initialState={fromCustomProgram({
          name: "Server copy",
          goal: "strength",
          phases: [
            {
              phase: "Phase 1",
              weeks: "1-4",
              focus: "base",
              workouts: [{ day: "Day 1", title: "Upper", exercises: [] }],
            },
          ],
        })}
        onSubmit={jest.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "Server copy",
      ),
    );
    expect(await disk.getItem(PROGRAM_CREATE_DRAFT_KEY)).toBeNull();
  });
});
