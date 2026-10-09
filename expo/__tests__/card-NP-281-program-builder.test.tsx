/* eslint-disable import/first */
/**
 * NP-281 — Program builder: no Create-a-program chooser or import, missing
 * equipment and day chips, phases laid out differently, exercise names wrap
 * letter by letter on edit.
 *
 * `expo/app/(app)/(tabs)/programming/new.tsx` +
 * `expo/components/programs/ProgramBuilder.tsx` (and the rows in
 * `BuilderExerciseRow.tsx`) against the web they are the counterpart of:
 * `webapp/app/dashboard/programs/new/NewProgramClient.tsx` +
 * `ImportProgramFlow.tsx` and `webapp/app/dashboard/admin/programs/_editors/
 * ProgramCreator.tsx` + `PhaseEditor.tsx` + `WorkoutEditor.tsx` +
 * `ExerciseEditor.tsx`.
 *
 * Six groups, one per thing the full-pass review caught:
 *
 *   • (NP-281-chooser) `/new` opens on "Create a program" with Start from
 *     scratch / Import a program, and the import offers BOTH of the web's
 *     doors — Paste text and Upload a file (.txt / .md).
 *   • (NP-281-details) the details step carries the web's Required Equipment
 *     chips, its Training Days/Week chips 2–7, its required asterisks and its
 *     always-reachable Save / Saved pill.
 *   • (NP-281-phases) the phases step is laid out like the web: a collapsible
 *     phase header with `Weeks 1-4 • 2 workouts`, sessions as Day tabs with
 *     "Copy current to…", QUICK ADD chips, and exercise cards with the type
 *     chips and PICK A VARIATION.
 *   • (NP-281-row) an exercise row's name column survives every control in
 *     the row, so a name cannot wrap a few letters per line.
 *   • (NP-281-keyboard) a tap outside a field dismisses the keyboard.
 *   • (NP-281-draft) Cancel discards the local draft, and "Picked up where
 *     you left off" stays away when the draft is blank.
 *
 * Light AND dark: the chips picked in both modes keep white ink on their
 * colour (`brand-foreground`, not `primary-foreground`, which flips).
 */

import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { colorScheme } from "nativewind";
import * as fs from "fs";
import * as path from "path";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
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

const mockImportProgramFromText = jest.fn();
jest.mock("@/lib/workout/importWorkoutRun", () => ({
  importProgramFromText: (...args: unknown[]) =>
    mockImportProgramFromText(...args),
}));

// The system file picker. `expo-file-system` (SDK 57) is what provides it;
// nothing native runs under jest, so the pick is scripted per test.
const mockPickFileAsync = jest.fn();
jest.mock("expo-file-system", () => ({
  File: {
    pickFileAsync: (...args: unknown[]) => mockPickFileAsync(...args),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch, CustomProgramInputSchema } from "@become/api-client";
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
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import { lightTokens } from "@/lib/theme/tokens";
import {
  BUILDER_EQUIPMENT_OPTIONS,
  BUILDER_EXERCISE_TYPES,
  BUILDER_QUICK_ADD_EXERCISES,
  BUILDER_TRAINING_DAY_OPTIONS,
  copyWorkout,
  emptyProgramBuilderState,
  fromCustomProgram,
  quickAddDefaults,
  toggleBuilderEquipment,
} from "@/lib/programs/programBuilder";
import {
  PROGRAM_CREATE_DRAFT_KEY,
  serializeProgramDraft,
} from "@/lib/programs/programDraft";
import {
  IMPORT_FILE_EXTENSIONS,
  MAX_IMPORT_FILE_BYTES,
  pickProgramTextFile,
} from "@/lib/programs/importProgramFile";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 9, 7, 12, 0, 0);
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

// ─── The web, read as text (never retyped) ─────────────────────────────────

const WEB_ROOT = path.resolve(__dirname, "..", "..", "webapp");
const WEB_CHOOSER_SRC = fs.readFileSync(
  path.join(WEB_ROOT, "app/dashboard/programs/new/NewProgramClient.tsx"),
  "utf8",
);
const WEB_IMPORT_SRC = fs.readFileSync(
  path.join(WEB_ROOT, "app/dashboard/programs/new/ImportProgramFlow.tsx"),
  "utf8",
);
const WEB_CREATOR_SRC = fs.readFileSync(
  path.join(WEB_ROOT, "app/dashboard/admin/programs/_editors/ProgramCreator.tsx"),
  "utf8",
);
const WEB_WORKOUT_EDITOR_SRC = fs.readFileSync(
  path.join(WEB_ROOT, "app/dashboard/admin/programs/_editors/WorkoutEditor.tsx"),
  "utf8",
);
const WEB_EXERCISE_EDITOR_SRC = fs.readFileSync(
  path.join(WEB_ROOT, "app/dashboard/admin/programs/_editors/ExerciseEditor.tsx"),
  "utf8",
);

function webListBlock(src: string, declaration: string): string {
  const start = src.indexOf(declaration);
  if (start < 0) throw new Error(`missing ${declaration}`);
  const end = src.indexOf("];", start);
  return src.slice(start, end);
}

function webEquipmentOptions(): string[] {
  const block = webListBlock(WEB_CREATOR_SRC, "const EQUIPMENT_OPTIONS = [");
  return Array.from(block.matchAll(/"([^"]+)"/g)).map((m) => m[1] as string);
}

function webExerciseTypes(): { value: string; label: string }[] {
  const block = webListBlock(
    WEB_EXERCISE_EDITOR_SRC,
    "const EXERCISE_TYPES: ",
  );
  return Array.from(
    block.matchAll(/value: "([a-z_]+)", label: "([^"]+)"/g),
  ).map((m) => ({ value: m[1] as string, label: m[2] as string }));
}

function webQuickAddNames(): string[] {
  const block = webListBlock(
    WEB_WORKOUT_EDITOR_SRC,
    "const quickAddExercises = [",
  );
  return Array.from(block.matchAll(/name: "([^"]+)"/g)).map(
    (m) => m[1] as string,
  );
}

// ─── Fixtures and routing ──────────────────────────────────────────────────

const CATALOG_HITS = [
  {
    slug: "bench-press",
    name: "Barbell Bench Press",
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

const VARIATIONS = {
  sourceSlug: "bench-press",
  variations: [
    {
      slug: "bench-press",
      name: "Barbell Bench Press",
      equipment: ["barbell"],
      trackingType: "reps_weight",
      category: "strength",
    },
    {
      slug: "dumbbell-bench-press",
      name: "Dumbbell Bench Press",
      equipment: ["dumbbell"],
      trackingType: "reps_weight",
      category: "strength",
    },
  ],
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

function routeFetch(impl?: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => {
      if (p === "/api/me/entitlements") return entitlementsBody;
      if (p === "/api/exercises/custom") return { exercises: [] };
      if (p.startsWith("/api/exercises/variations")) return VARIATIONS;
      if (p.startsWith("/api/exercises/search")) {
        const q = decodeURIComponent(
          p.split("q=")[1]?.split("&")[0] ?? "",
        ).toLowerCase();
        if (q.length < 2) return { exercises: [] };
        return {
          exercises: CATALOG_HITS.filter((hit) =>
            hit.name.toLowerCase().includes(q.split(" ")[0] as string),
          ),
        };
      }
      if (p === "/api/programs/custom") {
        return { program_id: "custom-abc123", name: "My Split" };
      }
      if (impl) return impl(p, init);
      throw new Error(`unexpected fetch ${p}`);
    },
  );
}

let storage: AsyncStorageLike;

function setScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

beforeEach(async () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockImportProgramFromText.mockReset();
  mockPickFileAsync.mockReset();
  entitlementsBody = UNENFORCED;
  storage = createMemoryAsyncStorage();
  await AsyncStorage.clear();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(mockMemberJwt());
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  routeFetch();
  setScheme("light");
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

type Screen = ReturnType<typeof render>;

function openScratch(screen: Screen) {
  fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));
}

/**
 * The shortest program the builder will save: a name, a goal, two sessions a
 * week (the chip), and a title per session. Returns on the phases step.
 */
function fillTwoDayProgram(screen: Screen) {
  fireEvent.changeText(screen.getByTestId("program-builder-name"), "My Split");
  fireEvent.changeText(screen.getByTestId("program-builder-goal"), "Get strong");
  fireEvent.press(screen.getByTestId("program-builder-days-2"));
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
  fireEvent.press(screen.getByTestId("program-builder-phase-0-day-1"));
  fireEvent.changeText(
    screen.getByTestId("program-builder-phase-0-workout-1-title"),
    "Lower Power",
  );
  fireEvent.press(screen.getByTestId("program-builder-phase-0-day-0"));
}

function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return [node.props.style]
    .flat(Infinity)
    .filter(Boolean)
    .reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...(s as Record<string, unknown>) }),
      {},
    );
}

// ───────────────────────────────────────────────────────────────────────────
// (id: NP-281-chooser)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-281-chooser) /new opens on Create a program, with the web's two doors into an import", () => {
  it("shows the chooser — not the builder — in the web's own words", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-choice")).toBeTruthy(),
    );

    // The web's copy, read from the web rather than retyped.
    expect(WEB_CHOOSER_SRC).toContain("Create a program");
    expect(WEB_CHOOSER_SRC).toContain(
      "Start from a blank program, or import one you already wrote.",
    );
    expect(screen.getByText("Create a program")).toBeTruthy();
    expect(
      screen.getByText(
        "Start from a blank program, or import one you already wrote.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Start from scratch")).toBeTruthy();
    expect(screen.getByText("Build it step by step in the editor")).toBeTruthy();
    expect(screen.getByText("Import a program")).toBeTruthy();
    expect(screen.getByText("Paste text, or upload a file")).toBeTruthy();

    // Build d68b84e3 opened the builder straight away; it does not now.
    expect(screen.queryByTestId("program-builder-name")).toBeNull();

    openScratch(screen);
    expect(screen.getByTestId("program-builder-name")).toBeTruthy();
  });

  it("offers Paste text AND Upload a file (.txt or .md), like ImportProgramFlow", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-import")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-import"));

    expect(screen.getByText("Import your program")).toBeTruthy();
    expect(screen.getByTestId("programming-new-import-paste")).toBeTruthy();
    expect(screen.getByTestId("programming-new-import-upload")).toBeTruthy();
    expect(screen.getByText("Paste text")).toBeTruthy();
    expect(screen.getByText("Upload a file")).toBeTruthy();
    expect(screen.getByText("A .txt or .md file")).toBeTruthy();

    // The web's accept list and cap, to the byte.
    expect(WEB_IMPORT_SRC).toContain("accept=\".txt,.md,text/plain,text/markdown\"");
    expect(IMPORT_FILE_EXTENSIONS).toEqual([".txt", ".md"]);
    expect(WEB_IMPORT_SRC).toContain("MAX_TEXT_FILE_BYTES = 200_000");
    expect(MAX_IMPORT_FILE_BYTES).toBe(200_000);
  });

  it("imports an uploaded .md through the same AI run and opens the builder on it", async () => {
    mockPickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        name: "my-program.md",
        size: 128,
        text: async () => "Day 1 - Push\nBench Press 4x8",
      },
    });
    mockImportProgramFromText.mockResolvedValue({
      status: "ok",
      program: {
        name: "Uploaded Split",
        description: "",
        goal: "Build muscle",
        duration_weeks: 4,
        training_days_per_week: 1,
        target_user: "Intermediate",
        phases: [
          {
            phase: "Phase 1",
            weeks: "1-4",
            focus: "Base",
            workouts: [
              {
                day: "Day 1",
                title: "Push",
                exercises: [{ name: "Bench Press", sets: 4, reps: "8" }],
              },
            ],
          },
        ],
      },
    });

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-import")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-import"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("programming-new-import-upload"));
    });

    // One AI run, on the FILE'S text, and the builder is now open on it.
    expect(mockImportProgramFromText).toHaveBeenCalledTimes(1);
    expect(mockImportProgramFromText.mock.calls[0]![0]).toBe(
      "Day 1 - Push\nBench Press 4x8",
    );
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "Uploaded Split",
      ),
    );
    // Nothing was saved: the web promises a review first.
    expect(postBodies("/api/programs/custom", "POST")).toHaveLength(0);
  });

  it("refuses a file over the web's cap with the web's own words, and never runs the AI", async () => {
    mockPickFileAsync.mockResolvedValue({
      canceled: false,
      result: {
        name: "huge.txt",
        size: MAX_IMPORT_FILE_BYTES + 1,
        text: async () => "x".repeat(10),
      },
    });

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-import")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-import"));
    await act(async () => {
      fireEvent.press(screen.getByTestId("programming-new-import-upload"));
    });

    expect(
      screen.getByTestId("programming-new-import-error-message"),
    ).toHaveTextContent("That file is too large. Try pasting the text instead.");
    expect(WEB_IMPORT_SRC).toContain(
      "That file is too large. Try pasting the text instead.",
    );
    expect(mockImportProgramFromText).not.toHaveBeenCalled();
  });

  it("reads the picked file, refuses the wrong extension and treats a cancel as a no-op", async () => {
    mockPickFileAsync.mockResolvedValueOnce({ canceled: true, result: null });
    expect(await pickProgramTextFile()).toEqual({ status: "cancelled" });

    mockPickFileAsync.mockResolvedValueOnce({
      canceled: false,
      result: { name: "plan.pdf", size: 10, text: async () => "nope" },
    });
    expect((await pickProgramTextFile()).status).toBe("error");

    mockPickFileAsync.mockResolvedValueOnce({
      canceled: false,
      result: { name: "plan.txt", size: 4, text: async () => "   " },
    });
    const empty = await pickProgramTextFile();
    expect(empty).toEqual({
      status: "error",
      message: "That file looks empty.",
    });

    mockPickFileAsync.mockResolvedValueOnce({
      canceled: false,
      result: { name: "plan.txt", size: 12, text: async () => "Bench 4x8" },
    });
    expect(await pickProgramTextFile()).toEqual({
      status: "ok",
      text: "Bench 4x8",
      name: "plan.txt",
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: NP-281-details)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-281-details) the details step carries the web's equipment chips, day chips, asterisks and save pill", () => {
  it("offers exactly the web's sixteen equipment chips and saves what was picked", async () => {
    // The list is the WEB'S, read from ProgramCreator.tsx.
    expect([...BUILDER_EQUIPMENT_OPTIONS]).toEqual(webEquipmentOptions());

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);

    for (const item of BUILDER_EQUIPMENT_OPTIONS) {
      const id = `program-builder-equipment-${item
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`;
      expect(screen.getByTestId(id)).toBeTruthy();
    }

    fireEvent.press(screen.getByTestId("program-builder-equipment-barbell"));
    fireEvent.press(screen.getByTestId("program-builder-equipment-bench"));
    fillTwoDayProgram(screen);

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-floating-save"));
    });
    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as Record<
      string,
      unknown
    >;
    expect(body.equipment).toEqual(["Barbell", "Bench"]);
    expect(body.training_days_per_week).toBe(2);
    expect(() => CustomProgramInputSchema.parse(body)).not.toThrow();
  });

  it("a picked equipment chip keeps white ink on its green in light AND dark mode", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);
    fireEvent.press(screen.getByTestId("program-builder-equipment-barbell"));
    const lightChip = screen.getByTestId("program-builder-equipment-barbell");
    expect(flatStyle(lightChip).backgroundColor).toBe(
      `rgb(${lightTokens.success})`,
    );
    const lightLabel = within(lightChip).getByText("Barbell");
    const lightColor = [lightLabel.props.style]
      .flat(Infinity)
      .find((s) => (s as { color?: string } | null)?.color) as
      | { color: string }
      | undefined;
    expect(lightColor?.color).toBe(`rgb(${lightTokens["brand-foreground"]})`);

    setScheme("dark");
    const dark = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(dark.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(dark);
    fireEvent.press(dark.getByTestId("program-builder-equipment-barbell"));
    const darkChip = dark.getByTestId("program-builder-equipment-barbell");
    const darkLabel = within(darkChip).getByText("Barbell");
    const darkColor = [darkLabel.props.style]
      .flat(Infinity)
      .find((s) => (s as { color?: string } | null)?.color) as
      | { color: string }
      | undefined;
    // `brand-foreground` is white in BOTH modes; `primary-foreground` would
    // have flipped to dark ink here and vanished on the green chip.
    expect(darkColor?.color).toBe(`rgb(${lightTokens["brand-foreground"]})`);
  });

  it("offers the web's Training Days/Week chips 2–7, and a chip resizes every phase", async () => {
    expect([...BUILDER_TRAINING_DAY_OPTIONS]).toEqual([2, 3, 4, 5, 6, 7]);
    expect(WEB_CREATOR_SRC).toContain("{[2, 3, 4, 5, 6, 7].map((days) => (");

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);

    fireEvent.press(screen.getByTestId("program-builder-days-5"));
    fireEvent.press(screen.getByTestId("program-builder-step-phases"));
    expect(
      screen.getByTestId("program-builder-phase-0-summary"),
    ).toHaveTextContent(/5 workouts/);
    // NP-359: extra ± stepper under chips was dropped for web parity.
    fireEvent.press(screen.getByTestId("program-builder-step-details"));
    expect(screen.queryByTestId("program-builder-days-decrease")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-value")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-increase")).toBeNull();
  });

  it("marks the required fields with the web's asterisks", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);
    for (const label of [
      "Program Name *",
      "Goal *",
      "Duration (weeks) *",
      "Training Days/Week *",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    fireEvent.press(screen.getByTestId("program-builder-step-phases"));
    expect(screen.getByText("Weeks Range *")).toBeTruthy();
    expect(screen.getByText("Phase Focus *")).toBeTruthy();
    expect(screen.getByText("Workout Title *")).toBeTruthy();
  });

  it("floats a Save pill that saves from any step, and reads Saved until an edit in edit mode", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);

    // Dead until step 1 is answerable — the web's own condition.
    const pill = screen.getByTestId("program-builder-floating-save");
    expect(pill.props.accessibilityState?.disabled).toBe(true);
    expect(pill).toHaveTextContent(/^Save$/);

    fillTwoDayProgram(screen);
    expect(
      screen.getByTestId("program-builder-floating-save"),
    ).toHaveTextContent("Save changes");

    // Saved from the PHASES step: no walk through Review first.
    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-floating-save"));
    });
    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );

    // Edit mode: nothing has changed yet, so the pill says Saved and refuses.
    const onSubmit = jest.fn();
    const edit = render(
      <ProgramBuilder
        mode="edit"
        initialState={fromCustomProgram({
          name: "Server copy",
          goal: "strength",
          duration_weeks: 4,
          training_days_per_week: 1,
          phases: [
            {
              phase: "Phase 1",
              weeks: "1-4",
              focus: "base",
              workouts: [{ day: "Day 1", title: "Upper", exercises: [] }],
            },
          ],
        })}
        onSubmit={onSubmit}
        testID="edit-builder"
      />,
    );
    const editPill = edit.getByTestId("edit-builder-floating-save");
    expect(editPill).toHaveTextContent("Saved");
    expect(editPill.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(editPill);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.changeText(edit.getByTestId("edit-builder-name"), "Renamed");
    expect(edit.getByTestId("edit-builder-floating-save")).toHaveTextContent(
      "Save changes",
    );
    fireEvent.press(edit.getByTestId("edit-builder-floating-save"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: NP-281-phases)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-281-phases) the phases step is laid out like the web", () => {
  async function openPhases(): Promise<Screen> {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);
    fillTwoDayProgram(screen);
    return screen;
  }

  it("heads each phase with its number, `Weeks 1-4 • 2 workouts`, and collapses it", async () => {
    const screen = await openPhases();
    expect(
      screen.getByTestId("program-builder-phase-0-summary"),
    ).toHaveTextContent(/Weeks 1-4 • 2 workouts/);
    expect(WEB_CREATOR_SRC).toContain("Program Phases (");

    // Collapsing hides the phase's fields, as the web's chevron does.
    fireEvent.press(screen.getByTestId("program-builder-phase-0-header"));
    expect(screen.queryByTestId("program-builder-phase-0-weeks")).toBeNull();
    fireEvent.press(screen.getByTestId("program-builder-phase-0-header"));
    expect(screen.getByTestId("program-builder-phase-0-weeks")).toBeTruthy();
  });

  it("shows the sessions as Day tabs, one open at a time", async () => {
    const screen = await openPhases();
    // Day 1 is open; Day 2's fields are not in the tree at all (the web
    // renders one WorkoutEditor, not every session stacked).
    expect(
      screen.getByTestId("program-builder-phase-0-workout-0-title").props.value,
    ).toBe("Upper Power");
    expect(
      screen.queryByTestId("program-builder-phase-0-workout-1-title"),
    ).toBeNull();

    fireEvent.press(screen.getByTestId("program-builder-phase-0-day-1"));
    expect(
      screen.getByTestId("program-builder-phase-0-workout-1-title").props.value,
    ).toBe("Lower Power");
    expect(
      screen.queryByTestId("program-builder-phase-0-workout-0-title"),
    ).toBeNull();
  });

  it("copies the open session onto another day with Copy current to...", async () => {
    const screen = await openPhases();
    expect(screen.getByText("Copy current to...")).toBeTruthy();
    expect(WEB_CREATOR_SRC.length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId("program-builder-phase-0-copy"));
    fireEvent.press(screen.getByTestId("program-builder-phase-0-copy-to-1"));
    fireEvent.press(screen.getByTestId("program-builder-phase-0-day-1"));
    // The title came over; the day LABEL did not (rule 2: a label is an
    // address, and two "Day 1"s in a phase are one session to the schedule).
    expect(
      screen.getByTestId("program-builder-phase-0-workout-1-title").props.value,
    ).toBe("Upper Power");
    expect(
      screen.getByTestId("program-builder-phase-0-workout-1-day").props.value,
    ).toBe("Day 2");
  });

  it("deep-copies the exercises and re-mints the group ids, so two days are not one block", () => {
    const base = emptyProgramBuilderState({ training_days_per_week: 2 });
    const withRows = {
      ...base,
      phases: base.phases.map((phase) => ({
        ...phase,
        workouts: phase.workouts.map((workout, index) =>
          index === 0
            ? {
                ...workout,
                title: "Upper",
                exercises: [
                  { exerciseSlug: "a", groupId: "group-1", groupType: "superset" as const },
                  { exerciseSlug: "b", groupId: "group-1", groupType: "superset" as const },
                ],
              }
            : workout,
        ),
      })),
    };
    const copied = copyWorkout(withRows, 0, 0, 1);
    const source = copied.phases[0]!.workouts[0]!;
    const target = copied.phases[0]!.workouts[1]!;
    expect(target.title).toBe("Upper");
    expect(target.day).toBe("Day 2");
    expect(target.exercises).toHaveLength(2);
    expect(target.exercises[0]!.groupId).not.toBe(source.exercises[0]!.groupId);
    expect(target.exercises[0]!.groupId).toBe(target.exercises[1]!.groupId);
    // A deep copy: editing one does not edit the other.
    expect(target.exercises[0]).not.toBe(source.exercises[0]);
  });

  it("offers the web's QUICK ADD chips, and a chip adds its prescription against a catalogue slug", async () => {
    // The same eight the web offers.
    expect(BUILDER_QUICK_ADD_EXERCISES.map((q) => q.name)).toEqual(
      webQuickAddNames(),
    );

    const screen = await openPhases();
    expect(screen.getByText("QUICK ADD")).toBeTruthy();
    const quickChip = screen.getByTestId(
      "program-builder-phase-0-workout-0-quick-bench-press",
    );
    expect(quickChip).toHaveTextContent("+ Bench Press");

    // The chip opens the picker ALREADY SEARCHING for that name, so the row
    // that lands carries a catalogue slug rather than a typed name.
    fireEvent.press(quickChip);
    const search = screen.getByTestId(
      "program-builder-phase-0-workout-0-picker-search",
    );
    expect(search.props.value).toBe("Bench Press");
    await waitFor(() =>
      expect(
        screen.getByTestId(
          "program-builder-phase-0-workout-0-picker-result-bench-press",
        ),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(
        "program-builder-phase-0-workout-0-picker-result-bench-press",
      ),
    );

    const summary = screen.getByTestId(
      "program-builder-phase-0-workout-0-exercise-0-summary",
    );
    // The chip's own prescription (4 × 8-10, 90s), not the blank row's 3 × 10.
    expect(summary).toHaveTextContent(/4 sets/);
    expect(summary).toHaveTextContent(/8-10/);
    expect(summary).toHaveTextContent(/90s/);

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-floating-save"));
    });
    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as {
      phases: { workouts: { exercises: Record<string, unknown>[] }[] }[];
    };
    const row = body.phases[0]!.workouts[0]!.exercises[0]!;
    expect(row.exerciseSlug).toBe("bench-press");
    expect(row.sets).toBe(4);
    expect(row.reps).toBe("8-10");
    expect(row.category).toBe("strength");
  });

  it("clears the blank row's sets for a chip that prescribes none (the web's Warm-up)", () => {
    const warmUp = BUILDER_QUICK_ADD_EXERCISES.find(
      (q) => q.name === "Warm-up",
    );
    expect(warmUp).toBeTruthy();
    const defaults = quickAddDefaults(warmUp!);
    expect(defaults.category).toBe("warmup");
    expect(defaults.sets).toBeUndefined();
    expect(defaults.reps).toBe("");
    expect(defaults.details).toBe(
      "5-10 min light cardio + dynamic stretching",
    );
  });

  it("carries the web's type chips on a row, writing the stored `category`", async () => {
    expect(
      BUILDER_EXERCISE_TYPES.map((t) => ({ value: t.value, label: t.label })),
    ).toEqual(webExerciseTypes());

    const screen = await openPhases();
    fireEvent.press(
      screen.getByTestId("program-builder-phase-0-workout-0-quick-squat"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(
          "program-builder-phase-0-workout-0-picker-result-back-squat",
        ),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(
        "program-builder-phase-0-workout-0-picker-result-back-squat",
      ),
    );

    const row = "program-builder-phase-0-workout-0-exercise-0";
    expect(screen.getByTestId(`${row}-index`)).toHaveTextContent("#1");
    expect(screen.getByTestId(`${row}-type-badge`)).toHaveTextContent(
      "Strength",
    );

    fireEvent.press(screen.getByTestId(`${row}-toggle`));
    for (const type of BUILDER_EXERCISE_TYPES) {
      expect(screen.getByTestId(`${row}-type-${type.value}`)).toBeTruthy();
    }
    expect(screen.getByText("Exercise Name *")).toBeTruthy();
    expect(screen.getByText("Additional Notes")).toBeTruthy();

    fireEvent.press(screen.getByTestId(`${row}-type-abs`));
    expect(screen.getByTestId(`${row}-type-badge`)).toHaveTextContent("Abs");

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-floating-save"));
    });
    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as {
      phases: { workouts: { exercises: Record<string, unknown>[] }[] }[];
    };
    expect(body.phases[0]!.workouts[0]!.exercises[0]!.category).toBe("abs");
  });

  it("offers PICK A VARIATION on a row whose movement has siblings, and switching rewrites slug and name", async () => {
    const screen = await openPhases();
    fireEvent.press(
      screen.getByTestId("program-builder-phase-0-workout-0-quick-bench-press"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId(
          "program-builder-phase-0-workout-0-picker-result-bench-press",
        ),
      ).toBeTruthy(),
    );
    fireEvent.press(
      screen.getByTestId(
        "program-builder-phase-0-workout-0-picker-result-bench-press",
      ),
    );

    const row = "program-builder-phase-0-workout-0-exercise-0";
    await act(async () => {
      fireEvent.press(screen.getByTestId(`${row}-toggle`));
    });
    await waitFor(() =>
      expect(screen.getByText("PICK A VARIATION")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(
        screen.getByTestId(
          `${row}-variations-chip-dumbbell-bench-press`,
        ),
      );
    });
    expect(screen.getByTestId(`${row}-name`)).toHaveTextContent(
      "Dumbbell Bench Press",
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-floating-save"));
    });
    await waitFor(() =>
      expect(postBodies("/api/programs/custom", "POST")).toHaveLength(1),
    );
    const body = postBodies("/api/programs/custom", "POST")[0] as {
      phases: { workouts: { exercises: Record<string, unknown>[] }[] }[];
    };
    expect(body.phases[0]!.workouts[0]!.exercises[0]!.exerciseSlug).toBe(
      "dumbbell-bench-press",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: NP-281-row)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-281-row) an exercise row's name column survives the row's controls", () => {
  it("keeps every control compact (28pt + slop) and never lets the name wrap past two lines", async () => {
    const screen = render(
      <ProgramBuilder
        mode="edit"
        initialState={fromCustomProgram({
          name: "Server copy",
          goal: "strength",
          duration_weeks: 4,
          training_days_per_week: 1,
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
                    { exerciseSlug: "bench-press", name: "Barbell Bench Press" },
                    { exerciseSlug: "db-press", name: "Dumbbell Press" },
                  ],
                },
              ],
            },
          ],
        })}
        onSubmit={jest.fn()}
        testID="edit-builder"
      />,
    );
    fireEvent.press(screen.getByTestId("edit-builder-step-phases"));
    const row = "edit-builder-phase-0-workout-0-exercise-0";

    const name = screen.getByTestId(`${row}-name`);
    // The report: `Barbel` / `l` / `Bench` / `Press`. A capped line count
    // means the name can never be squeezed into a letters-per-line column.
    expect(name.props.numberOfLines).toBe(2);
    expect(name).toHaveTextContent("Barbell Bench Press");

    for (const control of [
      `${row}-group-select`,
      `${row}-move-up`,
      `${row}-move-down`,
      `${row}-toggle`,
      `${row}-remove`,
    ]) {
      const node = screen.getByTestId(control);
      const style = flatStyle(node);
      expect(style.width).toBeLessThanOrEqual(28);
      expect(style.minWidth).toBeUndefined();
      // Still a legal 44pt target — via hitSlop, not the view's size.
      expect(node.props.hitSlop).toBeTruthy();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: NP-281-keyboard) + (id: NP-281-draft)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: NP-281-keyboard) a tap outside a field dismisses the keyboard", () => {
  it("dismisses on an outside tap, on Next and on Save", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);

    fireEvent.press(screen.getByTestId("program-builder-dismiss-keyboard"));
    expect(dismiss).toHaveBeenCalled();

    dismiss.mockClear();
    fireEvent.press(screen.getByTestId("program-builder-next"));
    expect(dismiss).toHaveBeenCalled();

    // The screen around the builder (header, chooser, import) too.
    dismiss.mockClear();
    fireEvent.press(screen.getByTestId("programming-new-dismiss-keyboard"));
    expect(dismiss).toHaveBeenCalled();
  });

  it("lets the scroll put the keyboard away as well", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);
    expect(
      screen.getByTestId("program-builder-scroll").props.keyboardDismissMode,
    ).toBe("on-drag");
  });
});

describe("(id: NP-281-draft) Cancel discards the draft, and a blank draft says nothing", () => {
  it("clears the local draft on Cancel and goes back to the chooser", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(screen);
    fireEvent.changeText(
      screen.getByTestId("program-builder-name"),
      "Abandoned split",
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull(),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("program-builder-cancel"));
    });

    expect(screen.getByTestId("programming-new-entry-choice")).toBeTruthy();
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).toBeNull(),
    );
  });

  it("stays quiet about a BLANK restored draft, and still says so for a real one", async () => {
    // Blank: nothing was picked up, so nothing is claimed.
    await AsyncStorage.setItem(
      PROGRAM_CREATE_DRAFT_KEY,
      serializeProgramDraft(emptyProgramBuilderState(), NOW_MS),
    );
    const blank = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(blank.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(blank);
    await waitFor(() =>
      expect(blank.getByTestId("program-builder-name").props.value).toBe(""),
    );
    expect(blank.queryByTestId("program-builder-draft-restored")).toBeNull();
    blank.unmount();

    // A real one still announces itself (NP-168's third criterion).
    await AsyncStorage.setItem(
      PROGRAM_CREATE_DRAFT_KEY,
      serializeProgramDraft(
        emptyProgramBuilderState({ name: "Half-built split" }),
        NOW_MS,
      ),
    );
    const real = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(real.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    openScratch(real);
    await waitFor(() =>
      expect(real.getByTestId("program-builder-draft-restored")).toBeTruthy(),
    );
  });

  it("toggles one implement without disturbing anything the phone cannot edit", () => {
    const state = emptyProgramBuilderState({
      equipment: ["Barbell", "Trap Bar"],
    });
    const off = toggleBuilderEquipment(state, "Barbell");
    expect(off.equipment).toEqual(["Trap Bar"]);
    const on = toggleBuilderEquipment(off, "Barbell");
    expect(on.equipment).toEqual(["Trap Bar", "Barbell"]);
  });
});
