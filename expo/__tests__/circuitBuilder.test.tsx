/* eslint-disable import/first */
// CIRCUITS FROM THE PRE-WORKOUT BUILDER — and one set count for the block.
//
// Card: "There is no way to make a circuit from the pre workout builder screen
// right here. Right now there is no way to group workouts together to make an
// actual circuit workout. Also if you make a circuit every exercise after the
// first one should agree on sets as the first. The way we have it now is that
// u have to manually choose the sets when u add a new exercise."
//
// Reported with a 3-set goblet squat dropped into a 5-set jump rope: the
// grouping gesture on both builder surfaces hardcoded `"superset"` and offered
// nothing else, so a circuit could only ever be assembled mid-session, and the
// set counts were left to disagree.
//
// The pure rules live in `@become/core` (webapp/lib/workout/buildAsYouGo.ts,
// copied to shared/core) and are driven over fixtures by
// webapp/tests/unit/buildAsYouGo.test.ts. This is the native wiring, on
// `expo/components/workout/SessionEditor.tsx` — the Edit panel on a quick
// session's overview, i.e. the screen the card points at.

import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

// The editor loads the member's custom exercises on mount. Nothing here cares
// about that list, and letting it resolve would land a setState outside act()
// for no benefit — so the request simply never settles.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn(() => new Promise(() => {})) };
});

import fs from "node:fs";
import path from "node:path";
import type { DraftExercise } from "@become/core";
import { SessionEditor } from "../components/workout/SessionEditor";
/* eslint-enable import/first */

const readSource = (rel: string) =>
  fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const GID = "adhoc-1";

const draft = (name: string, sets: number, extra: Partial<DraftExercise> = {}): DraftExercise => ({
  exerciseSlug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  trackingType: "reps_weight",
  sets,
  reps: "8-12",
  ...extra,
});

// The reported pair: 5 sets of jump rope, 3 of goblet squat, grouped.
const SUPERSET_PAIR: DraftExercise[] = [
  draft("Jump Rope", 5, { groupId: GID, groupType: "superset", groupLabel: "Superset" }),
  draft("Goblet Squat", 3, { groupId: GID, groupType: "superset", groupLabel: "Superset" }),
  draft("Curl", 2),
];
const CIRCUIT_PAIR: DraftExercise[] = SUPERSET_PAIR.map((ex, i) =>
  i < 2 ? { ...ex, groupType: "circuit", groupLabel: "Circuit", sets: 5, groupRounds: 5 } : ex,
);
// The same circuit as it exists in a session SAVED before the agreement rule
// was written — or generated, imported, or authored by a coach in the program
// editor: badged a circuit, members still disagreeing. 5 and 3.
const DISAGREEING_CIRCUIT: DraftExercise[] = SUPERSET_PAIR.map((ex, i) =>
  i < 2 ? { ...ex, groupType: "circuit", groupLabel: "Circuit" } : ex,
);

function renderEditor(exercises: DraftExercise[]) {
  const onSave = jest.fn();
  const utils = render(
    <SessionEditor title="Leg day" exercises={exercises} onSave={onSave} onCancel={jest.fn()} />,
  );
  const saved = () => {
    fireEvent.press(utils.getByTestId("session-editor-save"));
    return onSave.mock.calls.at(-1)?.[0] as { title: string; exercises: DraftExercise[] };
  };
  return { ...utils, onSave, saved };
}

describe("the pre-workout builder can make a circuit", () => {
  it("offers Superset AND Circuit, once, on the group's first member", () => {
    const { getByTestId, queryByTestId } = renderEditor(SUPERSET_PAIR);
    expect(getByTestId("session-editor-group-kind-superset-0")).toBeTruthy();
    expect(getByTestId("session-editor-group-kind-circuit-0")).toBeTruthy();
    // Not repeated down the group, and not offered to an ungrouped exercise.
    expect(queryByTestId("session-editor-group-kind-circuit-1")).toBeNull();
    expect(queryByTestId("session-editor-group-kind-circuit-2")).toBeNull();
  });

  it("declaring the group a circuit brings every member onto the first one's rounds", () => {
    const { getByTestId, saved } = renderEditor(SUPERSET_PAIR);
    fireEvent.press(getByTestId("session-editor-group-kind-circuit-0"));
    const next = saved();
    expect(next.exercises.map((e) => e.groupType)).toEqual(["circuit", "circuit", undefined]);
    expect(next.exercises.map((e) => e.groupLabel)).toEqual(["Circuit", "Circuit", undefined]);
    // The 3-set goblet squat follows the 5-set jump rope it is circuiting with.
    expect(next.exercises.map((e) => e.sets)).toEqual([5, 5, 2]);
    expect(next.exercises.map((e) => e.groupRounds)).toEqual([5, 5, undefined]);
  });

  it("a superset is left to disagree — only a circuit implies one count", () => {
    const { saved } = renderEditor(SUPERSET_PAIR);
    const next = saved();
    expect(next.exercises.map((e) => e.sets)).toEqual([5, 3, 2]);
  });

  it("the exercise below a circuit can be pulled into it, so it can pass two", () => {
    const { getByTestId, queryByTestId, saved } = renderEditor(CIRCUIT_PAIR);
    // Offered on the group's LAST member — the one the newcomer sits behind.
    expect(queryByTestId("session-editor-group-grow-0")).toBeNull();
    fireEvent.press(getByTestId("session-editor-group-grow-1"));
    const next = saved();
    expect(next.exercises.map((e) => e.groupId)).toEqual([GID, GID, GID]);
    expect(next.exercises.map((e) => e.sets)).toEqual([5, 5, 5]);
  });

  it("editing any member of a circuit edits the circuit", () => {
    const { getByTestId, saved } = renderEditor(CIRCUIT_PAIR);
    fireEvent.changeText(getByTestId("session-editor-sets-1"), "3");
    const next = saved();
    expect(next.exercises.map((e) => e.sets)).toEqual([3, 3, 2]);
    expect(next.exercises.map((e) => e.groupRounds)).toEqual([3, 3, undefined]);
  });

  it("outside a circuit, a set-count edit still moves one row only", () => {
    const { getByTestId, saved } = renderEditor(SUPERSET_PAIR);
    fireEvent.changeText(getByTestId("session-editor-sets-0"), "4");
    const next = saved();
    expect(next.exercises.map((e) => e.sets)).toEqual([4, 3, 2]);
  });

  it("says, on a circuit only, that the rounds are one number for the block", () => {
    const circuit = renderEditor(CIRCUIT_PAIR);
    expect(circuit.getByTestId("session-editor-circuit-note-0")).toBeTruthy();
    circuit.unmount();
    const superset = renderEditor(SUPERSET_PAIR);
    expect(superset.queryByTestId("session-editor-circuit-note-0")).toBeNull();
  });
});

// The rule used to be applied only by the two gestures that MAKE a circuit, so
// a circuit that arrived from anywhere else still disagreed: the editor opened
// a 5 and a 3 underneath its own note saying every exercise runs the same
// number of rounds, and Live ran five rounds with the goblet squat missing
// from two of them — the shape in the report.
describe("a circuit that already disagrees agrees the moment it is shown", () => {
  it("the editor opens it on the first member's count, and saves it that way", () => {
    const { getByTestId, saved } = renderEditor(DISAGREEING_CIRCUIT);
    // The goblet squat's row reads 5, not the 3 it was stored with.
    expect(getByTestId("session-editor-sets-1").props.value).toBe("5");
    const next = saved();
    expect(next.exercises.map((e) => e.sets)).toEqual([5, 5, 2]);
    expect(next.exercises.map((e) => e.groupRounds)).toEqual([5, 5, undefined]);
  });

  it("a superset that disagrees is still left exactly as it was", () => {
    const { getByTestId, saved } = renderEditor(SUPERSET_PAIR);
    expect(getByTestId("session-editor-sets-1").props.value).toBe("3");
    expect(saved().exercises.map((e) => e.sets)).toEqual([5, 3, 2]);
  });

  it("the builder and both live loaders hold a loaded circuit to the rule", () => {
    // Where the list is produced is the only place that can do this once for
    // the flow, the set grid, the group header and the save all at once.
    for (const file of [
      "components/workout/SessionEditor.tsx",
      "components/workout/SessionBuilder.tsx",
      "lib/live/useLiveWorkout.ts",
      "lib/quickSession/useQuickLiveWorkout.ts",
    ]) {
      expect(readSource(file)).toMatch(/alignCircuitSets\(/);
    }
  });

  it("\"Finish this for me\" seeds what it appends from the session", () => {
    const src = readSource("components/workout/SessionBuilder.tsx");
    // Not the generator's own count — the same `defaultSetsFor` rule the
    // search result and the suggestion pill already go through.
    expect(src).toMatch(/const seeded = defaultSetsFor\(current\)/);
    expect(src).toMatch(/sets: seeded,/);
  });
});
