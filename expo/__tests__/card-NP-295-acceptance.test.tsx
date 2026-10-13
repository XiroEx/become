/* eslint-disable import/first */
// NP-295 — GENERATE SHEET: THE WEB'S PURPLE THEME, SLIDERS, AND START
// SESSION OPENS LIVE.
//
// `webapp/components/GenerateModal.tsx` draws this sheet in purple
// (`purple-600`/`purple-400`, the app's existing `mindset` token) with a
// wand-icon header badge, a ✕ close button, Dumbbell/Calendar tab icons and
// `<input type="range">` sliders for Exercises / Days per week / Weeks /
// Exercises per day — the native sheet (NP-133) had none of those and
// `Start session` opened the quick-session OVERVIEW rather than Live. This
// pins the gap closed:
//   • (id: a1) the header shows a purple wand badge and a ✕ that closes;
//   • (id: a2) the Session/Program tabs carry icons;
//   • (id: a3) the selected focus chip, equipment chip and difficulty use
//     the `mindset` purple, not the neutral `primary`;
//   • (id: a4) Exercises / Days per week / Weeks / Exercises per day are
//     sliders (VoiceOver `adjustable`, min/max/now, increment/decrement
//     actions) with the value drawn in purple, not +/- steppers;
//   • (id: a5) Generate / Start session / Save program are the `mindset`
//     purple Button variant, not the neutral `primary`;
//   • (id: a6) `Start session` pushes `quickSessionLiveHref`, never
//     `quickSessionOverviewHref` (NP-295's actual bug).

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
    token: "test-jwt",
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

jest.mock("@/lib/quickSession/store", () => {
  const actual = jest.requireActual("@/lib/quickSession/store");
  return { __esModule: true, ...actual, stashQuickSession: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { quickSessionLiveHref, stashQuickSession } from "@/lib/quickSession/store";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockStash = stashQuickSession as unknown as jest.Mock;

const SESSION_RESPONSE = {
  session: {
    title: "Full Body Session",
    focus: "full_body",
    exercises: [
      { exerciseSlug: "squat", name: "Squat", trackingType: "reps_weight", sets: 4, reps: "6-8", rest: "90s" },
    ],
  },
};

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockStash.mockReset();
  mockStash.mockResolvedValue("qs-123");
});

describe("(id: a1) the header carries the web's wand badge and ✕", () => {
  it("renders the header icon and closes on the ✕", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(<GenerateSheet visible onClose={onClose} />);
    expect(getByTestId("generate-sheet-header-icon")).toBeTruthy();
    fireEvent.press(getByTestId("generate-sheet-close-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("(id: a2) the Session/Program tabs carry icons", () => {
  it("renders an icon element ahead of each tab's label text", () => {
    const { getByTestId, getByText } = render(<GenerateSheet visible onClose={() => {}} />);
    const sessionTab = getByTestId("generate-sheet-tab-session");
    const programTab = getByTestId("generate-sheet-tab-program");
    // Each tab has two children: the icon, then the <Text> label — a bare
    // label (the pre-NP-295 shape) would have exactly one.
    expect(sessionTab.props.children.length).toBe(2);
    expect(programTab.props.children.length).toBe(2);
    expect(getByText("Session")).toBeTruthy();
    expect(getByText("Program")).toBeTruthy();
  });
});

describe("(id: a3) selected chips and difficulty draw the mindset purple", () => {
  it("the selected focus chip's fill differs from an unselected chip's", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const chip = getByTestId("generate-sheet-focus-full_body");
    expect(chip.props.accessibilityState?.selected).toBe(true);
    const flatStyle = Array.isArray(chip.props.style) ? Object.assign({}, ...chip.props.style) : chip.props.style;
    const unselectedChip = getByTestId("generate-sheet-focus-push");
    const unselectedStyle = Array.isArray(unselectedChip.props.style)
      ? Object.assign({}, ...unselectedChip.props.style)
      : unselectedChip.props.style;
    expect(flatStyle.backgroundColor).not.toBe(unselectedStyle.backgroundColor);
  });

  it("the selected difficulty uses the same purple as the selected chip", () => {
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    const chip = getByTestId("generate-sheet-focus-full_body");
    const chipStyle = Array.isArray(chip.props.style) ? Object.assign({}, ...chip.props.style) : chip.props.style;
    const difficulty = getByTestId("generate-sheet-difficulty-intermediate");
    const difficultyStyle = Array.isArray(difficulty.props.style)
      ? Object.assign({}, ...difficulty.props.style)
      : difficulty.props.style;
    expect(difficultyStyle.backgroundColor).toBe(chipStyle.backgroundColor);
  });
});

describe("(id: a4) Exercises / Days per week / Weeks / Exercises per day are sliders", () => {
  it("the session tab's Exercises control is an adjustable slider, not a stepper", () => {
    const { getByTestId, queryByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    expect(queryByTestId("generate-sheet-exercise-count-increment")).toBeNull();
    expect(queryByTestId("generate-sheet-exercise-count-decrement")).toBeNull();
    const track = getByTestId("generate-sheet-exercise-count-track");
    expect(track.props.accessibilityRole).toBe("adjustable");
    expect(track.props.accessibilityValue).toEqual({ min: 3, max: 10, now: 5 });
    expect(getByTestId("generate-sheet-exercise-count-value").props.children).toBe(5);

    fireEvent(track, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(getByTestId("generate-sheet-exercise-count-value").props.children).toBe(6);

    fireEvent(track, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    fireEvent(track, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(getByTestId("generate-sheet-exercise-count-value").props.children).toBe(4);
  });

  it("the program tab's three controls are sliders bounded like the web's", () => {
    const { getByTestId, queryByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-tab-program"));

    expect(queryByTestId("generate-sheet-weeks-increment")).toBeNull();

    const days = getByTestId("generate-sheet-days-per-week-track");
    expect(days.props.accessibilityValue).toEqual({ min: 2, max: 6, now: 3 });

    const weeks = getByTestId("generate-sheet-weeks-track");
    expect(weeks.props.accessibilityValue).toEqual({ min: 2, max: 12, now: 4 });
    fireEvent(weeks, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(getByTestId("generate-sheet-weeks-value").props.children).toBe(5);

    const perDay = getByTestId("generate-sheet-exercises-per-day-track");
    expect(perDay.props.accessibilityValue).toEqual({ min: 3, max: 8, now: 5 });

    // A slider cannot walk past its own bound, same as the web's <input min/max>.
    for (let i = 0; i < 10; i++) {
      fireEvent(days, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    }
    expect(getByTestId("generate-sheet-days-per-week-value").props.children).toBe(6);
  });
});

describe("(id: a5) Generate / Start session / Save program draw the mindset purple Button variant", () => {
  it("Generate session is variant=mindset, not the neutral default", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    expect(getByTestId("generate-sheet-generate-session").props.className).toContain("bg-mindset");

    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    expect(getByTestId("generate-sheet-session-start").props.className).toContain("bg-mindset");
    // Regenerate stays neutral (ghost), matching the web's zinc Regenerate button.
    expect(getByTestId("generate-sheet-session-regenerate").props.className).not.toContain("bg-mindset");
  });

  it("Save program is variant=mindset", async () => {
    mockApiFetch.mockResolvedValueOnce({
      program: {
        name: "Full Body 3-Day Program",
        description: "d",
        focus: "full_body",
        daysPerWeek: 3,
        weeks: 4,
        days: [],
      },
    });
    const { getByTestId } = render(<GenerateSheet visible onClose={() => {}} />);
    fireEvent.press(getByTestId("generate-sheet-tab-program"));
    fireEvent.press(getByTestId("generate-sheet-generate-program"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-program-preview")).toBeTruthy();
    });
    expect(getByTestId("generate-sheet-program-save").props.className).toContain("bg-mindset");
  });
});

describe("(id: a6) Start session opens Live, never the overview", () => {
  it("pushes quickSessionLiveHref, not quickSessionOverviewHref", async () => {
    mockApiFetch.mockResolvedValue(SESSION_RESPONSE);
    const onClose = jest.fn();
    const { getByTestId } = render(<GenerateSheet visible onClose={onClose} />);
    fireEvent.press(getByTestId("generate-sheet-generate-session"));
    await waitFor(() => {
      expect(getByTestId("generate-sheet-session-preview")).toBeTruthy();
    });
    fireEvent.press(getByTestId("generate-sheet-session-start"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(quickSessionLiveHref("qs-123"));
    });
    expect(mockPush).not.toHaveBeenCalledWith(
      expect.stringContaining("/programming/quick?session="),
    );
  });
});
