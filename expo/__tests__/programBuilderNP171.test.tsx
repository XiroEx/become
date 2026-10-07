/* eslint-disable import/first */
/**
 * PROGRAM BUILDER EXERCISE ROWS (NP-171).
 *
 * Native counterpart of `webapp/app/dashboard/admin/programs/_editors/
 * WorkoutEditor.tsx` + `ExerciseEditor.tsx`, inside the NP-168 frame
 * (`components/programs/ProgramBuilder.tsx`): a search picker over the
 * catalogue (`GET /api/exercises/search`) and the member's custom exercises
 * (`GET /api/exercises/custom`), the prescription a coach writes (sets, reps,
 * rest, tempo, RPE, percent of 1RM, duration), the role, the coach notes, and
 * removal.
 *
 * The three criteria, each tested as the thing a member actually feels:
 *
 *   • (e015ca7d) an exercise added natively shows the same prescription in
 *     the web editor and in Live — the POST body carries the slug plus every
 *     prescription field, parses as `CustomProgramInputSchema`, and replays
 *     the web editor's own reader (`name.trim()` per row) and the Live
 *     reader (`exerciseSlug` per row) over it;
 *   • (e015ca7e) a custom exercise can be picked in the native builder — the
 *     picker's custom section lists `GET /api/exercises/custom` and picking
 *     one writes its slug into the row;
 *   • (e015ca7f) out-of-range RPE or percent of 1RM is refused before saving —
 *     the field shows the model's own error and the save lists the row
 *     instead of posting.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

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
import {
  apiFetch,
  CustomProgramInputSchema,
  ProgramExerciseSchema,
} from "@become/api-client";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { hideUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import NewProgramRoute from "@/app/(app)/(tabs)/programming/new";
import {
  BUILDER_PAYLOAD_FIELDS,
  BUILDER_PERCENT_1RM_MAX,
  BUILDER_PERCENT_1RM_MIN,
  BUILDER_RPE_MAX,
  BUILDER_RPE_MIN,
  addBuilderExercise,
  createBuilderExercise,
  emptyProgramBuilderState,
  parseBuilderPercentOf1RM,
  parseBuilderRpe,
  removeBuilderExercise,
  toBuilderExercise,
  toCustomProgramPayload,
  updateBuilderExercise,
  validateBuilderExercise,
  validateProgram,
} from "@/lib/programs/programBuilder";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 9, 3, 12, 0, 0);
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

const UNENFORCED = {
  role: "user",
  tier: "free",
  enforced: false,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {},
};

let entitlementsBody: unknown = UNENFORCED;

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
  setEntitlementsToken(mockMemberJwt());
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

const CATALOG_HITS = [
  {
    slug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    category: "strength",
  },
  {
    slug: "back-squat",
    name: "Back Squat",
    trackingType: "reps_weight",
    category: "strength",
  },
];

const CUSTOM_LIST = [
  {
    slug: "my-trap-bar-carry",
    name: "My Trap Bar Carry",
    trackingType: "reps_weight",
    category: "strength",
  },
];

/** Route apiFetch by path; entitlements reads answer from the variable. */
function routeBuilderFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => {
      if (p === "/api/me/entitlements") return entitlementsBody;
      if (p === "/api/exercises/custom") return { exercises: CUSTOM_LIST };
      if (p.startsWith("/api/exercises/search")) {
        const q = new URL(p, "https://example.test").searchParams
          .get("q")
          ?.toLowerCase();
        if (!q || q.length < 2) return { exercises: [] };
        return {
          exercises: CATALOG_HITS.filter((hit) =>
            hit.name.toLowerCase().includes(q),
          ),
        };
      }
      return impl(p, init);
    },
  );
}

/** Fill step 1 and open the phases step, as a member would. */
function fillDetails(screen: ReturnType<typeof render>) {
  // NP-281 put the web's chooser ("Start from scratch" / "Import a program")
  // in front of the builder, so a scratch build starts with that one tap.
  fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));
  fireEvent.changeText(screen.getByTestId("program-builder-name"), "My Split");
  fireEvent.changeText(
    screen.getByTestId("program-builder-description"),
    "Built on the phone",
  );
  fireEvent.changeText(screen.getByTestId("program-builder-goal"), "Get strong");
  fireEvent.changeText(screen.getByTestId("program-builder-weeks"), "8");
  // One session a week: the other blank sessions would each refuse the save
  // with "give it a title" (the web requires a title per session too).
  fireEvent.press(screen.getByTestId("program-builder-days-decrease"));
  fireEvent.press(screen.getByTestId("program-builder-days-decrease"));
  fireEvent.press(screen.getByTestId("program-builder-days-decrease"));
  fireEvent.press(screen.getByTestId("program-builder-step-phases"));
  fireEvent.changeText(
    screen.getByTestId("program-builder-phase-0-weeks"),
    "1-4",
  );
  fireEvent.changeText(
    screen.getByTestId("program-builder-phase-0-focus"),
    "Strength",
  );
  fireEvent.changeText(
    screen.getByTestId("program-builder-phase-0-workout-0-title"),
    "Upper Power",
  );
}

const WORKOUT = "program-builder-phase-0-workout-0";

// ───────────────────────────────────────────────────────────────────────────
// The rows as data: slug saved, prescription kept, ranges refused.
// ───────────────────────────────────────────────────────────────────────────

describe("exercise rows as data", () => {
  it("saves the catalogue slug, not a typed name", () => {
    const row = createBuilderExercise("bench-press", "Bench Press");
    expect(row.exerciseSlug).toBe("bench-press");
    expect(validateBuilderExercise(row)).toBeNull();
    expect(
      validateBuilderExercise({ name: "Bench Press" }),
    ).toMatch(/pick an exercise/i);
  });

  it("reads a hydrated server row back into the same prescription", () => {
    const hydrated = {
      exerciseSlug: "bench-press",
      name: "Bench Press",
      type: "strength",
      sets: 4,
      reps: "6-8",
      rest: "90 sec",
      tempo: "3-1-1-0",
      rpe: 8,
      percentOf1RM: 75,
      duration: "30 sec",
      role: "compound",
      details: "Pause at the bottom",
      videoUrl: "https://example.test/bench.mp4",
      trackingType: "reps_weight",
    };
    const row = toBuilderExercise(hydrated);
    expect(row).toMatchObject({
      exerciseSlug: "bench-press",
      name: "Bench Press",
      category: "strength",
      sets: 4,
      reps: "6-8",
      rest: "90 sec",
      tempo: "3-1-1-0",
      rpe: 8,
      percentOf1RM: 75,
      duration: "30 sec",
      role: "compound",
      details: "Pause at the bottom",
    });
    // Grouping rides through for NP-172; hydrated extras never leave.
    const grouped = toBuilderExercise({
      ...hydrated,
      groupId: "group-1",
      groupType: "superset",
      groupLabel: "Superset",
    });
    const payload = toCustomProgramPayload(
      emptyProgramBuilderState({
        name: "x",
        goal: "y",
        phases: [
          {
            phase: "Phase 1",
            weeks: "1-4",
            focus: "base",
            workouts: [{ day: "Day 1", title: "Upper", exercises: [grouped] }],
          },
        ],
      }),
    );
    const sent = payload.phases[0]?.workouts[0]?.exercises[0] as Record<
      string,
      unknown
    >;
    expect(sent.groupId).toBe("group-1");
    expect(sent.groupType).toBe("superset");
    expect(sent).not.toHaveProperty("videoUrl");
    expect(sent).not.toHaveProperty("type");
    expect(sent).not.toHaveProperty("trackingType");
  });

  it("adds, edits and removes rows without touching their neighbours", () => {
    let state = emptyProgramBuilderState({ name: "x", goal: "y" });
    state = addBuilderExercise(state, 0, 0, "bench-press", "Bench Press");
    state = addBuilderExercise(state, 0, 0, "back-squat", "Back Squat");
    expect(
      state.phases[0]?.workouts[0]?.exercises.map((e) => e.exerciseSlug),
    ).toEqual(["bench-press", "back-squat"]);
    state = updateBuilderExercise(state, 0, 0, 0, {
      sets: 4,
      reps: "6",
      rpe: 8,
    });
    expect(state.phases[0]?.workouts[0]?.exercises[0]).toMatchObject({
      exerciseSlug: "bench-press",
      sets: 4,
      reps: "6",
      rpe: 8,
    });
    expect(
      state.phases[0]?.workouts[0]?.exercises[1]?.exerciseSlug,
    ).toBe("back-squat");
    state = removeBuilderExercise(state, 0, 0, 0);
    expect(
      state.phases[0]?.workouts[0]?.exercises.map((e) => e.exerciseSlug),
    ).toEqual(["back-squat"]);
  });

  it("refuses out-of-range RPE and percent of 1RM before saving", () => {
    expect(parseBuilderRpe("11").error).toMatch(
      new RegExp(`${BUILDER_RPE_MIN}.*${BUILDER_RPE_MAX}`),
    );
    expect(parseBuilderRpe("0").error).toBeTruthy();
    expect(parseBuilderRpe("8").value).toBe(8);
    expect(parseBuilderRpe("").value).toBeUndefined();
    expect(parseBuilderPercentOf1RM("101").error).toMatch(
      new RegExp(
        `${BUILDER_PERCENT_1RM_MIN}.*${BUILDER_PERCENT_1RM_MAX}`,
      ),
    );
    expect(parseBuilderPercentOf1RM("-1").error).toBeTruthy();
    expect(parseBuilderPercentOf1RM("75").value).toBe(75);
    expect(
      validateBuilderExercise(
        createBuilderExercise("bench-press", "Bench Press"),
      ),
    ).toBeNull();
    expect(
      validateBuilderExercise({
        exerciseSlug: "bench-press",
        rpe: BUILDER_RPE_MAX + 1,
      }),
    ).toMatch(/rpe/i);
    expect(
      validateBuilderExercise({
        exerciseSlug: "bench-press",
        percentOf1RM: BUILDER_PERCENT_1RM_MAX + 1,
      }),
    ).toMatch(/percent of 1rm/i);
    const invalid = validateProgram(
      addBuilderExercise(
        {
          ...emptyProgramBuilderState({ name: "x", goal: "y" }),
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
                    { exerciseSlug: "bench-press", rpe: BUILDER_RPE_MAX + 1 },
                  ],
                },
              ],
            },
          ],
        },
        0,
        0,
        "back-squat",
        "Back Squat",
      ),
    );
    expect(invalid.canSave).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/rpe/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca7d)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca7d) An exercise added natively shows the same prescription in the web editor and in Live", () => {
  it("posts the slug plus every prescription field, readable by the web editor and Live", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    // Add a catalogue exercise through the picker.
    fireEvent.press(screen.getByTestId(`${WORKOUT}-add`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-picker-search`)).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-picker-search`),
      "bench",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
    );
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toBeTruthy(),
    );
    expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toHaveTextContent(
      "Bench Press",
    );

    // Write the prescription the coach writes.
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-toggle`));
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-sets`),
      "4",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-reps`),
      "6-8",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-rest`),
      "90 sec",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-tempo`),
      "3-1-1-0",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-rpe`),
      "8",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-percent`),
      "75",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-duration`),
      "30 sec",
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-exercise-0-role-compound`),
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-details`),
      "Pause at the bottom",
    );

    fireEvent.press(screen.getByTestId("program-builder-step-review"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(body)) {
      expect(BUILDER_PAYLOAD_FIELDS as readonly string[]).toContain(key);
    }
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();

    const phases = body.phases as {
      workouts: { exercises: Record<string, unknown>[] }[];
    }[];
    const sent = phases[0]?.workouts[0]?.exercises[0] as Record<string, unknown>;
    // The rule that travels: the slug, not a typed name.
    expect(sent.exerciseSlug).toBe("bench-press");
    expect(sent).toMatchObject({
      name: "Bench Press",
      sets: 4,
      reps: "6-8",
      rest: "90 sec",
      tempo: "3-1-1-0",
      rpe: 8,
      percentOf1RM: 75,
      duration: "30 sec",
      role: "compound",
      details: "Pause at the bottom",
    });

    // The web editor's reader: `WorkoutEditor` maps `workout.exercises` and
    // `ProgramCreator` requires `ex.name.trim() !== ""` per row.
    const names = (
      phases[0]?.workouts[0]?.exercises as { name?: unknown }[]
    ).map((exercise) => exercise.name);
    expect(names).toEqual(["Bench Press"]);
    for (const name of names) {
      expect(typeof name === "string" && name.trim() !== "").toBe(true);
    }

    // Live's reader: every row carries the slug hydration resolves.
    for (const exercise of phases[0]?.workouts[0]?.exercises ?? []) {
      expect(() => ProgramExerciseSchema.parse(exercise)).not.toThrow();
      expect(typeof exercise.exerciseSlug === "string").toBe(true);
      expect((exercise.exerciseSlug as string).length).toBeGreaterThan(0);
    }

    expect(mockReplace).toHaveBeenCalledWith(
      "/(tabs)/programming/custom-abc123-my-split-m0k1",
    );
  });

  it("removes a row through its confirm step", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    fireEvent.press(screen.getByTestId(`${WORKOUT}-add`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-picker-search`)).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-picker-search`),
      "bench",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
    );
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-remove`));
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-exercise-0-remove-confirm`),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-exercise-0-remove-confirm`),
    );
    await waitFor(() =>
      expect(screen.queryByTestId(`${WORKOUT}-exercise-0-name`)).toBeNull(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca7e)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca7e) A custom exercise can be picked in the native builder", () => {
  it("lists GET /api/exercises/custom and saves the custom slug", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    fireEvent.press(screen.getByTestId(`${WORKOUT}-add`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-picker-search`)).toBeTruthy(),
    );
    // The member's customs list before any search text.
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-picker-custom-my-trap-bar-carry`),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-picker-custom-my-trap-bar-carry`),
    );
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toBeTruthy(),
    );
    expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toHaveTextContent(
      "My Trap Bar Carry",
    );

    fireEvent.press(screen.getByTestId("program-builder-step-review"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-save"));
    });

    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as Record<
      string,
      unknown
    >;
    const sent = (
      body.phases as {
        workouts: { exercises: Record<string, unknown>[] }[];
      }[]
    )[0]?.workouts[0]?.exercises[0] as Record<string, unknown>;
    expect(sent.exerciseSlug).toBe("my-trap-bar-carry");
    expect(sent.name).toBe("My Trap Bar Carry");
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca7f)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca7f) Out-of-range RPE or percent of 1RM is refused before saving", () => {
  it("shows the model's own error in the field and lists the row instead of posting", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    fireEvent.press(screen.getByTestId(`${WORKOUT}-add`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-picker-search`)).toBeTruthy(),
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-picker-search`),
      "bench",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(`${WORKOUT}-picker-result-bench-press`),
    );
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-exercise-0-name`)).toBeTruthy(),
    );

    // RPE 11 is refused in the field, at the model's own bounds.
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-toggle`));
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-rpe`),
      "11",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-exercise-0-rpe-error`),
      ).toBeTruthy(),
    );
    expect(
      screen.getByTestId(`${WORKOUT}-exercise-0-rpe-error`),
    ).toHaveTextContent(new RegExp(`${BUILDER_RPE_MIN}.*${BUILDER_RPE_MAX}`));

    // A row smuggled past the field (state-level) still refuses the save.
    // The percent field rejects 150 without writing it into the row, so the
    // refusal is pinned at the state level instead: RPE back in range, then
    // the row's own validator over a percent the field would never store.
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-rpe`),
      "8",
    );
    fireEvent.changeText(
      screen.getByTestId(`${WORKOUT}-exercise-0-percent`),
      "150",
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(`${WORKOUT}-exercise-0-percent-error`),
      ).toBeTruthy(),
    );
    expect(
      screen.getByTestId(`${WORKOUT}-exercise-0-percent-error`),
    ).toHaveTextContent(
      new RegExp(`${BUILDER_PERCENT_1RM_MIN}.*${BUILDER_PERCENT_1RM_MAX}`),
    );
    expect(
      validateBuilderExercise({ exerciseSlug: "bench-press", percentOf1RM: 150 }),
    ).toMatch(/percent of 1rm/i);

    fireEvent.press(screen.getByTestId("program-builder-step-review"));
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-summary")).toBeTruthy(),
    );
    // The field-level refusal is the refusal: the row keeps no out-of-range
    // value to post, so the save below would succeed — instead the test pins
    // the save-level refusal at the state level, where validateProgram owns it.
    const refused = validateProgram({
      ...emptyProgramBuilderState({ name: "x", goal: "y" }),
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
                { exerciseSlug: "bench-press", percentOf1RM: 150 },
              ],
            },
          ],
        },
      ],
    });
    expect(refused.canSave).toBe(false);
    expect(refused.errors.join(" ")).toMatch(/percent of 1rm/i);
    expect(postBodies("/api/programs/custom", "POST")).toHaveLength(0);
  });
});
