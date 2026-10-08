/* eslint-disable import/first */
/**
 * PROGRAM BUILDER REORDER AND GROUPING (NP-172).
 *
 * Native counterpart of the drag reorder (`onDragEnd`) and the Combine flow
 * (`createGroup` / `removeFromGroup` / Ungroup) in
 * `webapp/app/dashboard/admin/programs/_editors/WorkoutEditor.tsx`, inside
 * the NP-168 frame (`components/programs/ProgramBuilder.tsx`) with the NP-171
 * rows (`components/programs/BuilderExerciseRow.tsx`).
 *
 * The two criteria, each tested as the thing a member actually feels:
 *
 *   • (e015ca83) reordering and grouping natively saves the same order and
 *     group fields the web shows — the POST body carries the rows in their
 *     on-screen order with the web's own `groupId`/`groupType`/`groupLabel`/
 *     `groupRest`/`groupRounds` block, parses as `CustomProgramInputSchema`,
 *     and replays the web editor's own reader (consecutive `groupId` runs
 *     render as one block) over it;
 *   • (e015ca84) a grouped block built natively runs as interleaved rounds in
 *     Live — the same `buildWorkoutFlow` the web live view runs interleaves
 *     the saved block (A1 B1 A2 B2 …), and the native Live screen names each
 *     round.
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
import { buildWorkoutFlow } from "@become/core";
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
  BUILDER_GROUP_LABELS,
  builderGroupAt,
  dissolveSplitGroups,
  emptyProgramBuilderState,
  groupBuilderExercises,
  moveBuilderExercise,
  newBuilderGroupId,
  parseBuilderGroupRounds,
  removeBuilderExercise,
  removeBuilderExerciseFromGroup,
  toCustomProgramPayload,
  ungroupBuilderExercises,
  updateBuilderGroup,
} from "@/lib/programs/programBuilder";
import { LiveWorkoutClient } from "@/components/live/LiveWorkoutClient";
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
    slug: "bent-row",
    name: "Bent Row",
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

const CUSTOM_LIST: { slug: string; name: string }[] = [];

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

async function addExerciseBySearch(
  screen: ReturnType<typeof render>,
  query: string,
  resultTestId: string,
  rowIndex: number,
) {
  fireEvent.press(screen.getByTestId(`${WORKOUT}-add`));
  await waitFor(() =>
    expect(screen.getByTestId(`${WORKOUT}-picker-search`)).toBeTruthy(),
  );
  fireEvent.changeText(screen.getByTestId(`${WORKOUT}-picker-search`), query);
  await waitFor(() =>
    expect(screen.getByTestId(resultTestId)).toBeTruthy(),
  );
  fireEvent.press(screen.getByTestId(resultTestId));
  await waitFor(() =>
    expect(screen.getByTestId(`${WORKOUT}-exercise-${rowIndex}-name`)).toBeTruthy(),
  );
}

// ───────────────────────────────────────────────────────────────────────────
// The reorder + grouping state, as pure data.
// ───────────────────────────────────────────────────────────────────────────

describe("NP-172 reorder and grouping state", () => {
  function threeRowState() {
    let state = emptyProgramBuilderState({ name: "x", goal: "y" });
    const { addBuilderExercise } =
      jest.requireActual("@/lib/programs/programBuilder") as typeof import("@/lib/programs/programBuilder");
    state = addBuilderExercise(state, 0, 0, "bench-press", "Bench Press");
    state = addBuilderExercise(state, 0, 0, "bent-row", "Bent Row");
    state = addBuilderExercise(state, 0, 0, "back-squat", "Back Squat");
    return state;
  }

  it("moves a row within its workout", () => {
    const moved = moveBuilderExercise(threeRowState(), 0, 0, 0, 2);
    expect(
      moved.phases[0]?.workouts[0]?.exercises.map((e) => e.exerciseSlug),
    ).toEqual(["bent-row", "back-squat", "bench-press"]);
  });

  it("refuses out-of-range and no-op moves", () => {
    const state = threeRowState();
    expect(moveBuilderExercise(state, 0, 0, 0, 0)).toBe(state);
    expect(moveBuilderExercise(state, 0, 0, -1, 1)).toBe(state);
    expect(moveBuilderExercise(state, 0, 0, 0, 9)).toBe(state);
  });

  it("combines picked rows into a block at the first pick, with the web's fields", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 2], "superset");
    const rows = grouped.phases[0]?.workouts[0]?.exercises ?? [];
    // Moved together at the first pick: bench + squat, then the bent row.
    expect(rows.map((e) => e.exerciseSlug)).toEqual([
      "bench-press",
      "back-squat",
      "bent-row",
    ]);
    expect(rows[0]?.groupId).toBeTruthy();
    expect(rows[0]?.groupId).toBe(rows[1]?.groupId);
    expect(rows[2]?.groupId).toBeUndefined();
    expect(rows[0]).toMatchObject({
      groupType: "superset",
      groupLabel: BUILDER_GROUP_LABELS.superset,
    });
  });

  it("refuses groups of fewer than two and unknown kinds", () => {
    const state = threeRowState();
    expect(groupBuilderExercises(state, 0, 0, [0], "superset")).toBe(state);
    expect(groupBuilderExercises(state, 0, 0, [0, 1], "drop_set")).toBe(state);
  });

  it("mints group ids that cannot collide", () => {
    expect(
      newBuilderGroupId([{ groupId: "group-1" }, {}], 1),
    ).toBe("group-2");
  });

  it("dissolves a block a drag pulls apart, and a block left with one member", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1], "superset");
    const rows = grouped.phases[0]?.workouts[0]?.exercises ?? [];
    const groupId = rows[0]?.groupId as string;
    // An outsider dragged between the two members splits the block.
    const split = dissolveSplitGroups([rows[0]!, rows[2]!, rows[1]!]);
    expect(split.every((e) => e.groupId === undefined)).toBe(true);
    // A block left with one member is not a block either.
    const single = dissolveSplitGroups([rows[0]!]);
    expect(single[0]?.groupId).toBeUndefined();
    expect(groupId).toBeTruthy();
  });

  it("a move that splits a block dissolves the leftovers", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1], "superset");
    // Drag the first member past the outsider: bench, squat, row →
    // squat, row, bench — the two members are no longer neighbours.
    const moved = moveBuilderExercise(grouped, 0, 0, 0, 2);
    const rows = moved.phases[0]?.workouts[0]?.exercises ?? [];
    expect(rows.map((e) => e.exerciseSlug)).toEqual([
      "bent-row",
      "back-squat",
      "bench-press",
    ]);
    expect(rows.every((e) => e.groupId === undefined)).toBe(true);
  });

  it("ungroups a whole block without moving rows; removing one row keeps the block", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1, 2], "circuit");
    const ungrouped = ungroupBuilderExercises(grouped, 0, 0, 1);
    const flat = ungrouped.phases[0]?.workouts[0]?.exercises ?? [];
    expect(flat.map((e) => e.exerciseSlug)).toEqual([
      "bench-press",
      "bent-row",
      "back-squat",
    ]);
    expect(flat.every((e) => e.groupId === undefined)).toBe(true);

    const kept = removeBuilderExerciseFromGroup(grouped, 0, 0, 0);
    const keptRows = kept.phases[0]?.workouts[0]?.exercises ?? [];
    expect(keptRows[0]?.groupId).toBeUndefined();
    expect(keptRows[1]?.groupId).toBe(keptRows[2]?.groupId);
  });

  it("removing the row that would leave one member dissolves the block", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1], "superset");
    const removed = removeBuilderExercise(grouped, 0, 0, 0);
    const rows = removed.phases[0]?.workouts[0]?.exercises ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.every((e) => e.groupId === undefined)).toBe(true);
  });

  it("patches a block's label, rest and rounds on every member", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1], "emom");
    const patched = updateBuilderGroup(grouped, 0, 0, 0, {
      groupLabel: "EMOM 10",
      groupRest: "60s",
      groupRounds: 5,
    });
    const rows = patched.phases[0]?.workouts[0]?.exercises ?? [];
    for (const row of rows.slice(0, 2)) {
      expect(row).toMatchObject({
        groupLabel: "EMOM 10",
        groupRest: "60s",
        groupRounds: 5,
      });
    }
    expect(rows[2]?.groupLabel).toBeUndefined();
  });

  it("refuses invalid rounds and reads the consecutive run", () => {
    const grouped = groupBuilderExercises(threeRowState(), 0, 0, [0, 1], "superset");
    expect(updateBuilderGroup(grouped, 0, 0, 0, { groupRounds: 0 })).toBe(grouped);
    const rows = grouped.phases[0]?.workouts[0]?.exercises ?? [];
    const group = builderGroupAt(rows, 0);
    expect(group?.indexes).toEqual([0, 1]);
    expect(builderGroupAt(rows, 2)).toBeNull();
  });

  it("parses the rounds field at the model's own bounds", () => {
    expect(parseBuilderGroupRounds("")).toEqual({});
    expect(parseBuilderGroupRounds("3")).toEqual({ value: 3 });
    expect(parseBuilderGroupRounds("0")?.error).toBeTruthy();
    expect(parseBuilderGroupRounds("abc")?.error).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca83)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca83) Reordering and grouping natively saves the same order and group fields the web shows", () => {
  it("reorders by drag and combines into a labelled block with rest and rounds", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    await addExerciseBySearch(
      screen,
      "bench",
      `${WORKOUT}-picker-result-bench-press`,
      0,
    );
    await addExerciseBySearch(
      screen,
      "bent",
      `${WORKOUT}-picker-result-bent-row`,
      1,
    );
    await addExerciseBySearch(
      screen,
      "squat",
      `${WORKOUT}-picker-result-back-squat`,
      2,
    );

    // Drag reorder: move Bench Press below Bent Row (move down once).
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-move-down`));
    expect(
      screen.getByTestId(`${WORKOUT}-exercise-0-name`).props.children,
    ).toBe("Bent Row");
    expect(
      screen.getByTestId(`${WORKOUT}-exercise-1-name`).props.children,
    ).toBe("Bench Press");

    // Combine the first two rows into a superset.
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-group-select`));
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-1-group-select`));
    fireEvent.press(screen.getByTestId(`${WORKOUT}-combine`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-group-menu-superset`)).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId(`${WORKOUT}-group-menu-superset`));

    // The block renders with the web's label and member count.
    const groupIds = screen.queryAllByTestId(
      new RegExp(`${WORKOUT}-group-group-.*`),
    );
    expect(groupIds.length).toBeGreaterThan(0);
    const groupTestId = groupIds[0]?.props.testID as string;
    expect(
      screen.getByTestId(`${groupTestId}-label`).props.children,
    ).toBe("Superset");

    // The group editor writes rest and rounds onto every member.
    fireEvent.press(screen.getByTestId(`${groupTestId}-edit`));
    fireEvent.changeText(
      screen.getByTestId(`${groupTestId}-editor-rest`),
      "90s",
    );
    fireEvent.changeText(
      screen.getByTestId(`${groupTestId}-editor-rounds`),
      "3",
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
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();

    const phases = body.phases as {
      workouts: { exercises: Record<string, unknown>[] }[];
    }[];
    const sent = phases[0]?.workouts[0]?.exercises ?? [];
    // Saved in on-screen order: Bent Row, Bench Press, Back Squat.
    expect(sent.map((e) => e.exerciseSlug)).toEqual([
      "bent-row",
      "bench-press",
      "back-squat",
    ]);
    // Every row parses as the program exercise the web editor reads.
    for (const exercise of sent) {
      expect(() => ProgramExerciseSchema.parse(exercise)).not.toThrow();
    }
    // The first two rows carry the web's own block; the third is solo.
    const groupId = sent[0]?.groupId;
    expect(typeof groupId === "string" && groupId.length).toBeGreaterThan(0);
    expect(sent[1]?.groupId).toBe(groupId);
    expect(sent[0]).toMatchObject({
      groupType: "superset",
      groupLabel: "Superset",
      groupRest: "90s",
      groupRounds: 3,
    });
    expect(sent[1]).toMatchObject({
      groupType: "superset",
      groupLabel: "Superset",
      groupRest: "90s",
      groupRounds: 3,
    });
    expect(sent[2]?.groupId).toBeUndefined();

    // The web editor's reader: consecutive rows sharing a groupId render as
    // one block — replay it over the saved rows.
    const runs: string[][] = [];
    let current: string[] = [];
    let currentId: unknown = null;
    for (const row of sent) {
      if (row.groupId && row.groupId === currentId) {
        current.push(row.exerciseSlug as string);
      } else {
        if (current.length > 0) runs.push(current);
        current = row.groupId ? [row.exerciseSlug as string] : [];
        currentId = row.groupId ?? null;
        if (!row.groupId && current.length === 0) {
          currentId = null;
        }
      }
    }
    if (current.length > 0) runs.push(current);
    expect(runs).toEqual([["bent-row", "bench-press"]]);
  });

  it("ungroups natively and saves rows the web shows as solo", async () => {
    routeBuilderFetch((p: string) => {
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123-my-split-m0k1", name: "My Split" };
      }
      throw new Error(`unexpected fetch ${p}`);
    });

    const screen = render(<NewProgramRoute />);
    fillDetails(screen);

    await addExerciseBySearch(
      screen,
      "bench",
      `${WORKOUT}-picker-result-bench-press`,
      0,
    );
    await addExerciseBySearch(
      screen,
      "bent",
      `${WORKOUT}-picker-result-bent-row`,
      1,
    );

    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-0-group-select`));
    fireEvent.press(screen.getByTestId(`${WORKOUT}-exercise-1-group-select`));
    fireEvent.press(screen.getByTestId(`${WORKOUT}-combine`));
    await waitFor(() =>
      expect(screen.getByTestId(`${WORKOUT}-group-menu-circuit`)).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId(`${WORKOUT}-group-menu-circuit`));

    const groupIds = screen.queryAllByTestId(
      new RegExp(`${WORKOUT}-group-group-.*`),
    );
    expect(groupIds.length).toBeGreaterThan(0);
    const groupTestId = groupIds[0]?.props.testID as string;
    fireEvent.press(screen.getByTestId(`${groupTestId}-ungroup`));
    await waitFor(() =>
      expect(
        screen.queryAllByTestId(new RegExp(`${WORKOUT}-group-group-.*`)),
      ).toHaveLength(0),
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
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();
    const phases = body.phases as {
      workouts: { exercises: Record<string, unknown>[] }[];
    }[];
    const sent = phases[0]?.workouts[0]?.exercises ?? [];
    expect(sent.every((e) => e.groupId === undefined)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e015ca84)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e015ca84) A grouped block built natively runs as interleaved rounds in Live", () => {
  it("the saved block interleaves through the same flow the web live view runs", () => {
    // What the builder saved: two grouped rows then a solo row, in order.
    let state = emptyProgramBuilderState({ name: "x", goal: "y" });
    const actual = jest.requireActual(
      "@/lib/programs/programBuilder",
    ) as typeof import("@/lib/programs/programBuilder");
    state = actual.addBuilderExercise(state, 0, 0, "bench-press", "Bench Press");
    state = actual.addBuilderExercise(state, 0, 0, "bent-row", "Bent Row");
    state = actual.addBuilderExercise(state, 0, 0, "back-squat", "Back Squat");
    state = groupBuilderExercises(state, 0, 0, [0, 1], "superset");
    state = updateBuilderGroup(state, 0, 0, 0, { groupRounds: 3 });
    const payload = toCustomProgramPayload(state);
    const saved = payload.phases[0]?.workouts[0]?.exercises ?? [];

    // Live hydrates group fields onto its own shape (useLiveWorkout maps
    // groupId/groupLabel/groupType/groupRounds); the flow runs over them.
    const flow = buildWorkoutFlow(
      saved.map((row) => ({
        name: row.name ?? "",
        exerciseSlug: row.exerciseSlug,
        sets: 3,
        ...(row.groupId ? { groupId: row.groupId } : {}),
        ...(row.groupType ? { groupType: row.groupType } : {}),
        ...(row.groupLabel ? { groupLabel: row.groupLabel } : {}),
        ...(row.groupRounds ? { groupRounds: row.groupRounds } : {}),
      })),
    );
    // A1 B1 A2 B2 A3 B3, then the solo squat straight through.
    expect(
      flow.map((step) => `${step.exerciseIndex}:${step.setIndex}`),
    ).toEqual([
      "0:0",
      "1:0",
      "0:1",
      "1:1",
      "0:2",
      "1:2",
      "2:0",
      "2:1",
      "2:2",
    ]);
    expect(flow.slice(0, 6).every((step) => step.groupId !== null)).toBe(true);
    expect(flow.slice(6).every((step) => step.groupId === null)).toBe(true);
  });

  it("Live names each interleaved round under the block header", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={{
          programId: "p",
          workoutTitle: "Upper Power",
          exercises: [
            {
              slug: "bench-press",
              name: "Bench Press",
              sets: 3,
              groupId: "group-1",
              groupLabel: "Superset",
              groupType: "superset",
              groupRounds: 3,
            },
            {
              slug: "bent-row",
              name: "Bent Row",
              sets: 3,
              groupId: "group-1",
              groupLabel: "Superset",
              groupType: "superset",
              groupRounds: 3,
            },
            { slug: "back-squat", name: "Back Squat", sets: 3 },
          ],
        }}
      />,
    );
    // One header for the block, with the web's member/rest subtitle (NP-332).
    expect(getByTestId("live-workout-group-group-1")).toBeTruthy();
    expect(
      getByTestId("live-workout-group-group-1-subtitle").props.children,
    ).toBe("— 2 exercises, minimal rest between exercises");
    expect(getByTestId("live-workout-group-group-1-round-3")).toBeTruthy();
    // Each grouped set names its round; the solo row names none.
    expect(
      getByTestId("live-workout-bench-press-set-0-round").props.children,
    ).toBe("Round 1");
    expect(
      getByTestId("live-workout-bent-row-set-2-round").props.children,
    ).toBe("Round 3");
    expect(queryByTestId("live-workout-back-squat-set-0-round")).toBeNull();
  });

  it("a removed grouped row keeps the block interleaving its survivors", () => {
    let state = emptyProgramBuilderState({ name: "x", goal: "y" });
    const actual = jest.requireActual(
      "@/lib/programs/programBuilder",
    ) as typeof import("@/lib/programs/programBuilder");
    state = actual.addBuilderExercise(state, 0, 0, "bench-press", "Bench Press");
    state = actual.addBuilderExercise(state, 0, 0, "bent-row", "Bent Row");
    state = actual.addBuilderExercise(state, 0, 0, "back-squat", "Back Squat");
    state = groupBuilderExercises(state, 0, 0, [0, 1, 2], "circuit");
    // Removing one of three keeps a two-member block (web rule: only the
    // last survivor dissolves).
    state = removeBuilderExercise(state, 0, 0, 2);
    const payload = toCustomProgramPayload(state);
    const saved = payload.phases[0]?.workouts[0]?.exercises ?? [];
    expect(saved).toHaveLength(2);
    expect(saved[0]?.groupId).toBe(saved[1]?.groupId);
    const flow = buildWorkoutFlow(
      saved.map((row) => ({
        name: row.name ?? "",
        sets: 2,
        ...(row.groupId ? { groupId: row.groupId } : {}),
      })),
    );
    expect(
      flow.map((step) => `${step.exerciseIndex}:${step.setIndex}`),
    ).toEqual(["0:0", "1:0", "0:1", "1:1"]);
  });
});
