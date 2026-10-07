/* eslint-disable import/first */
// NP-280 — Session builder: chosen rows drop the implement and truncate
// names; group, Finish-this and complement styling differ from web.
//
// `expo/components/workout/SessionBuilder.tsx` against
// `webapp/components/SessionBuilder.tsx`:
//   1. a chosen row's subline carries the implement AND a PURPLE group label
//      (not grey), and the name/sets/group controls stay compact so a
//      grouped row (unlink + grow + trash, the Android report) does not
//      squeeze the name column to nothing;
//   2. the group/unlink icon, the grow icon and the selected "Circuit" chip
//      are purple (`mindset`), not red/neutral — and the trash icon is grey,
//      matching the web's idle state, not red;
//   3. "Finish this for me" is a compact green button inside a green-tinted
//      panel, and its complement chips carry a green (not red) outline;
//   4. "Start session" shows the count as a badge, not `(3)` text; "Log it
//      or plan it instead" carries a calendar icon, not a check; the search
//      field carries a magnifier.

import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { CalendarClock, Check, Plus, Search, Trash2, Unlink } from "lucide-react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { SessionBuilder } from "../components/workout/SessionBuilder";
import { lightTokens } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SEARCH_HITS = [
  { slug: "bench-press", name: "Barbell Bench Press", trackingType: "reps_weight", equipment: ["barbell"] },
  { slug: "overhead-press", name: "Overhead Press", trackingType: "reps_weight" },
  { slug: "barbell-row", name: "Barbell Row", trackingType: "reps_weight" },
];

const SUGGESTED = [
  {
    exercise: { exerciseSlug: "lat-pulldown", name: "Lat Pulldown", trackingType: "reps_weight", sets: 3, reps: "8-12" },
    reason: "Same movement pattern",
  },
];

function routeMock() {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.startsWith("/api/exercises/search")) {
      const q = decodeURIComponent(path.split("q=")[1]?.split("&")[0] ?? "").toLowerCase();
      const hits = SEARCH_HITS.filter((h) => h.name.toLowerCase().includes(q));
      return { exercises: hits };
    }
    if (path === "/api/exercises/custom") return { exercises: [] };
    if (path === "/api/generate/session/complete") return { suggestions: SUGGESTED, seed: 7 };
    throw new Error(`unexpected path ${path}`);
  });
}

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  routeMock();
  setSystemScheme("light");
});

async function searchAndAdd(
  getByTestId: ReturnType<typeof render>["getByTestId"],
  term: string,
  slug: string,
  testID = "session-builder",
) {
  fireEvent.changeText(getByTestId(`${testID}-search`), term);
  await waitFor(() => {
    expect(getByTestId(`${testID}-result-${slug}`)).toBeTruthy();
  });
  fireEvent.press(getByTestId(`${testID}-result-${slug}`));
}

describe("(id: NP-280-row) a chosen row carries the implement and a purple group label, and stays compact when grouped", () => {
  it("the subline reads 'Barbell · 8-12 reps · Superset' with the group label in the mindset purple, not grey", async () => {
    const { getByTestId, toJSON } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    await searchAndAdd(getByTestId, "overhead", "overhead-press");

    // Superset the two rows — the gesture that attaches a group label.
    fireEvent.press(getByTestId("session-builder-group-bench-press"));

    const tree = JSON.stringify(toJSON());
    // The implement leads the subline — dropped entirely before this card.
    expect(tree).toContain("Barbell");
    expect(tree).toContain("8-12 reps");
    expect(tree).toContain("Superset");
    // The group label is the mindset purple token, not the plain
    // muted-foreground grey the rest of the subline uses.
    expect(tree).toContain(`rgb(${lightTokens.mindset})`);
  });

  it("the row's icon controls are compact (not 44pt-wide) so the name column survives a grouped (3-icon) row", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    await searchAndAdd(getByTestId, "overhead", "overhead-press");
    await searchAndAdd(getByTestId, "barbell row", "barbell-row");

    fireEvent.press(getByTestId("session-builder-group-bench-press"));
    // overhead-press is now the group's tail (next row, barbell-row, is
    // outside it) so it carries unlink + grow + trash — the Android report's
    // three-icon row.
    const growButton = getByTestId("session-builder-group-grow-overhead-press");
    const unlinkButton = getByTestId("session-builder-group-overhead-press");
    const removeButton = getByTestId("session-builder-remove-overhead-press");
    for (const button of [growButton, unlinkButton, removeButton]) {
      const style = [button.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
      // Compact — a fixed 28pt box, not the old `minWidth: 44` that squeezed
      // the name column to a single character on a narrow (Android) screen.
      expect(style.width).toBeLessThanOrEqual(28);
      expect(style.minWidth).toBeUndefined();
      // Still a legal 44pt touch target — via hitSlop, not the view's size.
      expect(button.props.hitSlop).toBeTruthy();
    }
  });
});

describe("(id: NP-280-group) the group/unlink icon, the grow icon and the selected Circuit chip are purple; the trash icon is grey", () => {
  async function buildGroupedThree(getByTestId: ReturnType<typeof render>["getByTestId"]) {
    await searchAndAdd(getByTestId, "bench", "bench-press");
    await searchAndAdd(getByTestId, "overhead", "overhead-press");
    await searchAndAdd(getByTestId, "barbell row", "barbell-row");
    fireEvent.press(getByTestId("session-builder-group-bench-press"));
  }

  it("the unlink icon is mindset purple, not the old neutral/red", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await buildGroupedThree(getByTestId);
    const toggle = getByTestId("session-builder-group-bench-press");
    const icon = within(toggle).UNSAFE_getByType(Unlink);
    expect(icon.props.color).toBe(`rgb(${lightTokens.mindset})`);
  });

  it("the grow icon is mindset purple", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await buildGroupedThree(getByTestId);
    const grow = getByTestId("session-builder-group-grow-overhead-press");
    const icon = within(grow).UNSAFE_getByType(Plus);
    expect(icon.props.color).toBe(`rgb(${lightTokens.mindset})`);
  });

  it("the trash icon stays grey (muted-foreground), matching the web's idle state", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    const remove = getByTestId("session-builder-remove-bench-press");
    const icon = within(remove).UNSAFE_getByType(Trash2);
    expect(icon.props.color).toBe(`rgb(${lightTokens["muted-foreground"]})`);
    expect(icon.props.color).not.toBe(`rgb(${lightTokens.destructive}`);
  });

  it("the selected Circuit chip is purple with white text in both light and dark mode", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await buildGroupedThree(getByTestId);
    fireEvent.press(getByTestId("session-builder-group-kind-circuit-bench-press"));
    const circuitChip = getByTestId("session-builder-group-kind-circuit-bench-press");
    const style = [circuitChip.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.backgroundColor).toBe(`rgb(${lightTokens.mindset})`);

    setSystemScheme("dark");
    const { getByTestId: getByTestIdDark } = render(<SessionBuilder testID="session-builder-2" />);
    await searchAndAdd(getByTestIdDark, "bench", "bench-press", "session-builder-2");
    await searchAndAdd(getByTestIdDark, "overhead", "overhead-press", "session-builder-2");
    fireEvent.press(getByTestIdDark("session-builder-2-group-bench-press"));
    fireEvent.press(getByTestIdDark("session-builder-2-group-kind-circuit-bench-press"));
    const chip = getByTestIdDark("session-builder-2-group-kind-circuit-bench-press");
    // `brand-foreground` is white in BOTH modes — `primary-foreground` would
    // have flipped to dark ink here and gone invisible on the purple chip.
    const label = within(chip).getByText("Circuit");
    const textStyle = [label.props.style].flat(Infinity);
    const color = textStyle.find((s) => s?.color)?.color;
    expect(color).toBe(`rgb(${lightTokens["brand-foreground"]})`);
  });
});

describe("(id: NP-280-finish) Finish this for me is a compact green button in a green panel, with green (not red) complement chips", () => {
  it("the Finish button is green and the panel around it is green-tinted, not the neutral card", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");

    const finishButton = getByTestId("session-builder-finish");
    const buttonStyle = [finishButton.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(buttonStyle.backgroundColor).toBe(`rgb(${lightTokens.success})`);
    // Compact, not a full-width bar.
    expect(buttonStyle.alignSelf).toBe("flex-start");

    const panel = getByTestId("session-builder-complete");
    const panelStyle = [panel.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(panelStyle.backgroundColor).not.toBe(`rgb(${lightTokens.card})`);
    expect(String(panelStyle.backgroundColor)).toMatch(/^rgba\(22, 163, 74,/);
  });

  it("a complement chip carries a green outline, not the old red one", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    await waitFor(() => {
      expect(getByTestId("session-builder-suggestion-lat-pulldown")).toBeTruthy();
    });
    const chip = getByTestId("session-builder-suggestion-lat-pulldown");
    const style = [chip.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.borderColor).toBe(`rgb(${lightTokens.success})`);
    expect(style.justifyContent).toBe("center");
    expect(style.alignItems).toBe("center");
  });
});

describe("(id: NP-280-start) Start session carries a count badge (not '(3)' text); Log it or plan it carries a calendar icon; search carries a magnifier", () => {
  it("'Start session' renders plain, with the count in its own badge", async () => {
    const { getByTestId, getByText, queryByText } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");

    expect(getByText("Start session")).toBeTruthy();
    expect(queryByText(/Start session\s*\(\d+\)/)).toBeNull();
    const badge = getByTestId("session-builder-start-badge");
    expect(within(badge).getByText("1")).toBeTruthy();
  });

  it("'Log it or plan it instead' carries a calendar icon, not a check", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    const toggle = getByTestId("session-builder-log-toggle");
    expect(within(toggle).UNSAFE_getByType(CalendarClock)).toBeTruthy();
    expect(within(toggle).UNSAFE_queryAllByType(Check).length).toBe(0);
  });

  it("the search field carries a magnifier", () => {
    const { UNSAFE_getByType } = render(<SessionBuilder testID="session-builder" />);
    expect(UNSAFE_getByType(Search)).toBeTruthy();
  });
});
