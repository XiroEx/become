/* eslint-disable import/first */
/**
 * IMPORT FROM TEXT 4/4 (NP-244): Import a program on the New program screen
 * opens the program builder pre-filled.
 *
 * `expo/app/(app)/(tabs)/programming/new.tsx` with `importProgramFromText`
 * mocked — no AI run client, no network. Three criteria, each the thing a
 * member actually feels:
 *
 *   • (id: e5ced3ba) choosing Import and submitting opens the builder
 *     pre-filled with the imported name and exercises, before saving.
 *   • (id: e5ced3bb) a stale scratch draft never overrides the import.
 *   • (id: e5ced3bc) at the custom-programs cap the import is not offered,
 *     and the cap sheet (lock/counter) still shows.
 *
 * Plus the sheet's own `consent` rule, replayed at this screen: it leaves
 * the member on the choice screen rather than anywhere else.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { act } from "react";

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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@become/api-client";
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
  PROGRAM_CREATE_DRAFT_KEY,
  serializeProgramDraft,
} from "@/lib/programs/programDraft";
import { emptyProgramBuilderState } from "@/lib/programs/programBuilder";
import type { ImportedProgram } from "@/lib/workout/importWorkoutText";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const NOW_MS = Date.UTC(2026, 9, 5, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function jwtFor(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: Math.floor((NOW_MS + 30 * DAY_MS) / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig-${userId}`;
}

function mockMemberJwt(): string {
  return jwtFor("member-1");
}

const MEMBER_JWT = mockMemberJwt();

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
const UNENFORCED = freePlan(true, 3, false);

let entitlementsBody: unknown = UNENFORCED;

function routeFetch(impl: (path: string, init?: unknown) => unknown) {
  mockApiFetch.mockImplementation(
    async (p: string, _schema: unknown, init?: unknown) => {
      if (p === "/api/me/entitlements") return entitlementsBody;
      return impl(p, init);
    },
  );
}

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockImportProgramFromText.mockReset();
  entitlementsBody = UNENFORCED;
  storage = createMemoryAsyncStorage();
  await AsyncStorage.clear();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(MEMBER_JWT);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  routeFetch((p: string) => {
    throw new Error(`unexpected fetch ${p}`);
  });
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

function importedProgramFixture(): ImportedProgram {
  return {
    name: "Pasted 5-Day Split",
    description: "Copied from a coach's PDF",
    goal: "Build muscle",
    duration_weeks: 6,
    training_days_per_week: 2,
    target_user: "Intermediate",
    phases: [
      {
        phase: "Phase 1",
        weeks: "1-6",
        focus: "Base",
        workouts: [
          {
            day: "Day 1",
            title: "Upper",
            exercises: [
              { name: "Bench Press", sets: 4, reps: "8" },
              { name: "Lat Pulldown", reps: "10-12" },
            ],
          },
          {
            day: "Day 2",
            title: "Lower",
            exercises: [{ name: "Back Squat", sets: 5, reps: "5" }],
          },
        ],
      },
    ],
  };
}

/**
 * NP-281 put the web's chooser in front of the builder and gave the import
 * the web's own two doors, so the paste field is two taps in: "Import a
 * program" → "Paste text".
 */
async function openImportAndSubmit(
  screen: ReturnType<typeof render>,
  text = "Bench Press 4x8\nLat Pulldown 3x10-12",
) {
  fireEvent.press(screen.getByTestId("programming-new-entry-import"));
  await waitFor(() =>
    expect(screen.getByTestId("programming-new-import-paste")).toBeTruthy(),
  );
  fireEvent.press(screen.getByTestId("programming-new-import-paste"));
  await waitFor(() =>
    expect(
      screen.getByTestId("programming-new-import-paste-sheet-text"),
    ).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByTestId("programming-new-import-paste-sheet-text"),
    text,
  );
  await act(async () => {
    fireEvent.press(
      screen.getByTestId("programming-new-import-paste-sheet-submit"),
    );
  });
}

// ───────────────────────────────────────────────────────────────────────────
// (id: e5ced3ba) + (id: e5ced3bb)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e5ced3ba) Importing pasted program text opens the builder pre-filled for review", () => {
  it("calls importProgramFromText once and shows the imported name and exercises, unsaved", async () => {
    mockImportProgramFromText.mockResolvedValue({
      status: "ok",
      program: importedProgramFixture(),
    });

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-import")).toBeTruthy(),
    );

    await openImportAndSubmit(screen);

    expect(mockImportProgramFromText).toHaveBeenCalledTimes(1);
    expect(mockImportProgramFromText.mock.calls[0]![0]).toBe(
      "Bench Press 4x8\nLat Pulldown 3x10-12",
    );

    // The sheet closed itself (an `ok` outcome) and the builder opened
    // pre-filled — nothing has been posted to the server.
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "Pasted 5-Day Split",
      ),
    );
    expect(
      screen.queryByTestId("programming-new-import-paste-sheet-text"),
    ).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/api/programs/custom",
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );

    // The exercises rode along too — not just the headline fields. The
    // sessions are Day tabs (NP-281), so the second one is one tap away.
    fireEvent.press(screen.getByTestId("program-builder-step-phases"));
    expect(
      screen.getByTestId("program-builder-phase-0-workout-0-title").props
        .value,
    ).toBe("Upper");
    fireEvent.press(screen.getByTestId("program-builder-phase-0-day-1"));
    expect(
      screen.getByTestId("program-builder-phase-0-workout-1-title").props
        .value,
    ).toBe("Lower");
  });
});

describe("(id: e5ced3bb) A stale scratch draft never overrides the import", () => {
  it("clears the stale draft and the imported name wins, not the draft's", async () => {
    // A draft left over from a previous, abandoned scratch build.
    await AsyncStorage.setItem(
      PROGRAM_CREATE_DRAFT_KEY,
      serializeProgramDraft(
        emptyProgramBuilderState({ name: "Stale abandoned split", goal: "old" }),
        NOW_MS,
      ),
    );

    mockImportProgramFromText.mockResolvedValue({
      status: "ok",
      program: importedProgramFixture(),
    });

    // THE BASELINE the import has to beat: scratch still restores that
    // draft. Taken on its own render and then thrown away WITHOUT cancelling
    // (Cancel is what discards a draft since NP-281), so the draft is still
    // on disk when the import runs below.
    const baseline = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(baseline.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    fireEvent.press(baseline.getByTestId("programming-new-entry-scratch"));
    await waitFor(() =>
      expect(baseline.getByTestId("program-builder-name").props.value).toBe(
        "Stale abandoned split",
      ),
    );
    baseline.unmount();
    expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).not.toBeNull();

    const screen = render(<NewProgramRoute />);
    await openImportAndSubmit(screen);

    // The import won, not the stale draft, and the stale draft is gone from
    // disk so nothing can resurrect it on a future visit.
    await waitFor(() =>
      expect(screen.getByTestId("program-builder-name").props.value).toBe(
        "Pasted 5-Day Split",
      ),
    );
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(PROGRAM_CREATE_DRAFT_KEY)).toBeNull(),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: e5ced3bc)
// ───────────────────────────────────────────────────────────────────────────

describe("(id: e5ced3bc) At the custom-programs cap the import is not offered", () => {
  it("hides the import entry and still shows the cap sheet (lock/counter)", async () => {
    entitlementsBody = AT_CAP;
    const screen = render(<NewProgramRoute />);

    await waitFor(() =>
      expect(
        screen.getByTestId("programming-new-allowance-counter-count"),
      ).toHaveTextContent("3/3"),
    );
    expect(screen.getByTestId("programming-new-allowance-lock")).toBeTruthy();
    expect(screen.queryByTestId("programming-new-entry-import")).toBeNull();
    // Scratch is still there — the cap blocks saving, not starting.
    expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy();
    expect(mockImportProgramFromText).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// consent leaves the member on the choice screen
// ───────────────────────────────────────────────────────────────────────────

describe("a consent outcome leaves the member on the choice screen", () => {
  it("closes the sheet without navigating or touching the draft", async () => {
    mockImportProgramFromText.mockResolvedValue({ status: "consent" });

    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-import")).toBeTruthy(),
    );

    await openImportAndSubmit(screen);

    expect(mockImportProgramFromText).toHaveBeenCalledTimes(1);
    // The sheet is gone and the member is right back on the import's own two
    // doors (the consent prompt is over the top of them), with nothing saved
    // and nowhere navigated.
    expect(
      screen.queryByTestId("programming-new-import-paste-sheet-text"),
    ).toBeNull();
    expect(screen.getByTestId("programming-new-import-paste")).toBeTruthy();
    expect(screen.getByTestId("programming-new-import-upload")).toBeTruthy();
    expect(screen.queryByTestId("program-builder-name")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
