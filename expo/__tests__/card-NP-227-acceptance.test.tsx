/* eslint-disable import/first */
// NP-227 — QUICK SESSIONS 4/5: THE OVERVIEW SCREEN.
//
// Native port of `webapp/app/dashboard/workout/quick-session/page.tsx`: the
// overview at `expo/app/(app)/(tabs)/programming/quick/index.tsx` reads the
// stash (rebuilding via `rebuildQuickSession` when `saved=1` and there is no
// stash), shows the title/kind/focus plus read-only exercises, and offers
// Start/Continue plus the Log-or-plan panel (`expo/lib/quickSession/logPlan.ts`,
// a port of `webapp/lib/quickSession/logPlanDate.ts`).
//
// Fixed clock: Wednesday 2026-10-07 local noon. Past Tuesday is 2026-10-06,
// next Thursday is 2026-10-15. `localDateStr` (device-local fields) reads
// "2026-10-07" under this clock, so past/today/future are unambiguous.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: mockToken,
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
import { ScrollView, StyleSheet } from "react-native";
import { apiFetch } from "@become/api-client";
import { fallbackQuickSessionName } from "@become/core";
import { TAB_BAR_CONTENT_GAP } from "@/lib/navigation/tabBarInset";
import QuickSessionOverviewRoute from "../app/(app)/(tabs)/programming/quick/index";
import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import {
  quickSessionLiveHref,
  quickSessionOverviewHref,
  stashQuickSessionWithId,
} from "@/lib/quickSession/store";
import { writeQuickProgress } from "@/lib/quickSession/progress";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const TODAY = "2026-10-07";
const PAST_TUESDAY = "2026-10-06";
const NEXT_THURSDAY = "2026-10-15";

const EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 3,
    reps: "8-12",
    rest: "90s",
  },
  {
    exerciseSlug: "plank",
    name: "Plank",
    trackingType: "time",
    sets: 2,
    reps: "",
    duration: "45",
  },
];

async function seedNamed(id: string) {
  await stashQuickSessionWithId(
    { title: "Tuesday Pump", focus: "push", exercises: EXERCISES },
    id,
    { needsName: false },
  );
}

async function seedUnnamed(id: string) {
  await stashQuickSessionWithId(
    { title: "Quick Session", exercises: EXERCISES },
    id,
    { needsName: true },
  );
}

function postBodies() {
  return mockApiFetch.mock.calls
    .filter((c) => c[0] === "/api/workouts" && c[2]?.method === "POST")
    .map((c) => c[2].body as Record<string, unknown>);
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockPush.mockReset();
  mockBack.mockReset();
  mockReplace.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({});
  mockParams = {};
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("(id: e5cecfe2) Log or plan offers only the valid action for past, today and future dates", () => {
  it("a past date shows only Log it", async () => {
    await seedNamed("qs-past");
    mockParams = { session: "qs-past", date: PAST_TUESDAY };
    const { getByTestId, queryByTestId } = render(
      <QuickSessionOverviewRoute />,
    );
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });
    // The panel opens automatically when `date` was passed.
    expect(getByTestId("quick-session-overview-log-panel")).toBeTruthy();
    expect(getByTestId("quick-session-overview-log-it")).toBeTruthy();
    expect(queryByTestId("quick-session-overview-plan-it")).toBeNull();
  });

  it("a future date shows only Plan it", async () => {
    await seedNamed("qs-future");
    mockParams = { session: "qs-future", date: NEXT_THURSDAY };
    const { getByTestId, queryByTestId } = render(
      <QuickSessionOverviewRoute />,
    );
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });
    expect(getByTestId("quick-session-overview-plan-it")).toBeTruthy();
    expect(queryByTestId("quick-session-overview-log-it")).toBeNull();
  });

  it("today shows both", async () => {
    await seedNamed("qs-today");
    mockParams = { session: "qs-today", date: TODAY };
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });
    expect(getByTestId("quick-session-overview-log-it")).toBeTruthy();
    expect(getByTestId("quick-session-overview-plan-it")).toBeTruthy();
  });

  it("shows the kind, focus label and read-only exercises (timed work in sec)", async () => {
    await seedNamed("qs-read");
    mockParams = { session: "qs-read" };
    const { getByTestId, getByText } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });
    expect(getByTestId("quick-session-overview-kind").props.children).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Generated session"),
        expect.stringContaining("Push"),
      ]),
    );
    expect(getByText("Tuesday Pump")).toBeTruthy();
    // Timed work renders "45 sec", not "45 reps".
    expect(getByText(/45 sec/)).toBeTruthy();
  });

  it("shows the not-available state when there is nothing to show", async () => {
    mockParams = { session: "qs-missing" };
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(
        getByTestId("quick-session-overview-unavailable"),
      ).toBeTruthy();
    });
  });

  it("rebuilds from the server log when saved=1 and there is no stash", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/workouts/session")) {
        return {
          session: {
            sessionId: "qs-rebuilt",
            title: "Evening Superset",
            needsName: false,
            focus: "push",
            date: "2026-10-01",
            completed: false,
            duration: null,
            exercises: [
              {
                name: "Bench Press",
                exerciseSlug: "bench-press",
                trackingType: "reps_weight",
                sets: [{ setNumber: 1, reps: 8, completed: true }],
                prescription: { sets: 3, reps: "8-12", rest: "90s" },
              },
            ],
          },
        };
      }
      return {};
    });
    mockParams = { session: "qs-rebuilt", saved: "1" };
    const { getByText } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByText("Evening Superset")).toBeTruthy();
    });
  });

  it("Continue appears with a progress snapshot or started=1, else Start", async () => {
    await seedNamed("qs-cont");
    await writeQuickProgress("qs-cont", {
      "bench-press": [{ reps: 8, weight: 135, completed: true }],
    });
    mockParams = { session: "qs-cont" };
    const resumed = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(
        resumed.getByTestId("quick-session-overview-start").props
          .accessibilityLabel,
      ).toBe("Continue workout");
    });
    resumed.unmount();

    await seedNamed("qs-fresh");
    mockParams = { session: "qs-fresh" };
    const fresh = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(
        fresh.getByTestId("quick-session-overview-start").props
          .accessibilityLabel,
      ).toBe("Start workout");
    });
    fireEvent.press(fresh.getByTestId("quick-session-overview-start"));
    expect(mockPush).toHaveBeenCalledWith(
      quickSessionLiveHref("qs-fresh") as never,
    );
    fresh.unmount();

    await seedNamed("qs-started-param");
    mockParams = { session: "qs-started-param", started: "1" };
    const viaParam = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(
        viaParam.getByTestId("quick-session-overview-start").props
          .accessibilityLabel,
      ).toBe("Continue workout");
    });
  });
});

describe("(id: e5cecfe0) A session logged for last Tuesday posts performedAt as that local date with all sets done", () => {
  it("POSTs performedAt = the past Tuesday with completed:true and every set completed", async () => {
    await seedNamed("qs-log");
    mockParams = { session: "qs-log", date: PAST_TUESDAY };
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-log-it")).toBeTruthy();
    });
    fireEvent.press(getByTestId("quick-session-overview-log-it"));
    await waitFor(() => {
      expect(postBodies()).toHaveLength(1);
    });
    const body = postBodies()[0]!;
    expect(body.kind).toBe("quick");
    expect(body.sessionId).toBe("qs-log");
    expect(body.performedAt).toBe(PAST_TUESDAY);
    expect(body.completed).toBe(true);
    expect(body.started).toBe(true);
    expect(body.needsName).toBe(false);
    expect(body.duration).toBe(Math.max(1, Math.round(5 * 1.5)));
    const exercises = body.exercises as {
      sets: { completed: boolean }[];
    }[];
    expect(exercises).toHaveLength(2);
    expect(exercises.flatMap((e) => e.sets)).toHaveLength(5);
    for (const set of exercises.flatMap((e) => e.sets)) {
      expect(set.completed).toBe(true);
    }
    // The stash is cleared and the member lands on the Training Log.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/progress" as never);
    });
  });
});

describe("(id: e5cecfe1) Plan it posts started:false so the plan is not in progress", () => {
  it("planning for next Thursday POSTs started:false, completed:false", async () => {
    await seedNamed("qs-plan");
    mockParams = { session: "qs-plan", date: NEXT_THURSDAY };
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-plan-it")).toBeTruthy();
    });
    fireEvent.press(getByTestId("quick-session-overview-plan-it"));
    await waitFor(() => {
      expect(postBodies()).toHaveLength(1);
    });
    const body = postBodies()[0]!;
    expect(body.kind).toBe("quick");
    expect(body.sessionId).toBe("qs-plan");
    expect(body.performedAt).toBe(NEXT_THURSDAY);
    expect(body.started).toBe(false);
    expect(body.completed).toBe(false);
    expect(body.duration).toBeUndefined();
    const exercises = body.exercises as {
      sets: { completed: boolean }[];
    }[];
    for (const set of exercises.flatMap((e) => e.sets)) {
      expect(set.completed).toBe(false);
    }
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/(tabs)/programming" as never,
      );
    });
  });
});

describe("(id: e5cecfe3) Skipping the name on Log it uses the fallback name for the chosen date", () => {
  it("logging an unnamed session and pressing Skip posts the fallback name for the chosen date, not today", async () => {
    await seedUnnamed("qs-skip");
    mockParams = { session: "qs-skip", date: PAST_TUESDAY };
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-log-it")).toBeTruthy();
    });
    fireEvent.press(getByTestId("quick-session-overview-log-it"));
    // The naming prompt opens first for an unnamed session.
    await waitFor(() => {
      expect(getByTestId("quick-session-name-prompt")).toBeTruthy();
    });
    expect(postBodies()).toHaveLength(0);
    fireEvent.press(getByTestId("quick-session-name-prompt-skip"));
    await waitFor(() => {
      expect(postBodies()).toHaveLength(1);
    });
    const body = postBodies()[0]!;
    expect(body.title).toBe(fallbackQuickSessionName(PAST_TUESDAY));
    expect(body.title).toBe("10/6/26 workout");
    expect(body.performedAt).toBe(PAST_TUESDAY);
    expect(body.completed).toBe(true);
  });
});

describe("resume pill routes a quick session to the overview", () => {
  const quickWorkout = {
    kind: "quick" as const,
    programId: null,
    day: null,
    phase: null,
    sessionId: "qs-1",
    title: "Quick Session",
    exerciseCount: 2,
    startedAt: "2026-10-07T10:00:00.000Z",
  };

  it("an in-progress quick workout routes to the overview with saved + started", () => {
    const { getByTestId } = render(
      <ResumeWorkoutPill
        initialData={{ workout: quickWorkout, planned: null }}
      />,
    );
    fireEvent.press(getByTestId("resume-workout-pill"));
    expect(mockPush).toHaveBeenCalledWith(
      quickSessionOverviewHref("qs-1", {
        saved: true,
        started: true,
      }) as never,
    );
  });

  it("a planned quick session routes to the overview with saved and no started flag", () => {
    const { getByTestId } = render(
      <ResumeWorkoutPill
        initialData={{
          workout: null,
          planned: {
            kind: "quick",
            sessionId: "qs-2",
            title: "Planned session",
            exerciseCount: 2,
          },
        }}
      />,
    );
    fireEvent.press(getByTestId("resume-workout-pill"));
    expect(mockPush).toHaveBeenCalledWith(
      quickSessionOverviewHref("qs-2", { saved: true }) as never,
    );
  });
});

describe("(bug fix) Start/Continue floats just above the tab bar, not over the middle of the list", () => {
  // The CTA wrapper sat at `bottom: tabBarInset + 24`, but this screen is a
  // PUSHED screen of the programming tab and `TabStack` already pads its
  // container by the full tab-bar band — so the button was lifted by a whole
  // tab bar and drawn over the exercises, with one visible below it.
  it("the CTA wrapper clears only the capsule, and the scroll content clears the CTA", async () => {
    await seedNamed("qs-cta-offset");
    mockParams = { session: "qs-cta-offset" };
    const { getByTestId, UNSAFE_getByType } = render(
      <QuickSessionOverviewRoute />,
    );
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });

    const wrapperStyle = StyleSheet.flatten(
      getByTestId("quick-session-overview-cta").props.style,
    );
    expect(wrapperStyle.position).toBe("absolute");
    const ctaBottom = Number(wrapperStyle.bottom);
    // No `tabBarInset` here — just the capsule's breathing room plus 12pt, so
    // the button sits ~12pt above the bar instead of a band above it.
    expect(ctaBottom).toBe(TAB_BAR_CONTENT_GAP + 12);

    const contentStyle = StyleSheet.flatten(
      UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    );
    // The last exercise must scroll fully clear of the CTA: the content
    // padding covers the float plus the ~44pt button plus breathing room.
    expect(Number(contentStyle.paddingBottom) - ctaBottom).toBeGreaterThanOrEqual(
      64,
    );
  });
});

describe("(bug fix) Back lands on the Workout tab, not whatever tab the navigator's history points to", () => {
  // Reproduces the reported bug: ResumeWorkoutPill on Home pushes this screen
  // cross-tab (the test above), which can land here with no local back entry.
  // Plain `router.back()` then fell through to the tab navigator's own
  // `backBehavior="history"`, landing on whichever tab was focused before
  // Home (Mind, in the report) instead of reliably "the workout page".
  it("the header back button pops locally when there is history to pop to", async () => {
    await seedNamed("qs-back-local");
    mockParams = { session: "qs-back-local" };
    mockCanGoBack.mockReturnValue(true);
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });

    fireEvent.press(getByTestId("quick-session-overview-back-btn"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("the header back button lands on the Workout tab when opened cross-tab (no local history)", async () => {
    await seedNamed("qs-back-crosstab");
    mockParams = { session: "qs-back-crosstab" };
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<QuickSessionOverviewRoute />);
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });

    fireEvent.press(getByTestId("quick-session-overview-back-btn"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("Android hardware back follows the same fallback logic as the header button", async () => {
    await seedNamed("qs-back-android");
    mockParams = { session: "qs-back-android" };
    mockCanGoBack.mockReturnValue(false);
    const listeners: (() => boolean)[] = [];
    const fakeBackHandler = {
      addEventListener: (_type: "hardwareBackPress", handler: () => boolean) => {
        listeners.push(handler);
        return {
          remove: () => {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          },
        };
      },
    };

    const { getByTestId } = render(
      <QuickSessionOverviewRoute backHandler={fakeBackHandler} />,
    );
    await waitFor(() => {
      expect(getByTestId("quick-session-overview-title")).toBeTruthy();
    });

    expect(listeners).toHaveLength(1);
    const intercepted = listeners[0]!();

    expect(intercepted).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/programming");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
