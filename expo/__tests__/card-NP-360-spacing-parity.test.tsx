/* eslint-disable import/first */
/**
 * NP-360 — WORKOUT HISTORY SPACING & TYPOGRAPHY PARITY
 *
 * Web vs native parity pass for History screen:
 * 1. Circular back button: h-8 w-8 rounded-full border border-zinc-200 dark:border-zinc-800
 *    with hitSlop satisfying the 44pt touch target rule.
 * 2. Filter chip count badges: active has bg-white/25 and white text; inactive has
 *    bg-zinc-200 dark:bg-zinc-700 and dark muted text.
 * 3. Workout card rows: left accent stripe w-1.5 rounded-l-2xl (clipped to card corners),
 *    h-10 w-10 rounded-xl icon badge with green/purple tint, and rounded-full px-1.5 py-0.5
 *    text-[10px] type badge.
 */

import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import type { WorkoutHistoryEntry } from "@become/api-client";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
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

import HistoryRoute from "../app/(app)/(tabs)/programming/history";
import { MIN_TOUCH_TARGET } from "../lib/a11y/touchTarget";
import { Calendar, ChevronLeft, Clock, Dumbbell, History, Sparkles } from "lucide-react-native";

const MOCK_LOGS: WorkoutHistoryEntry[] = [
  {
    kind: "program",
    title: "Hypertrophy · Day 2",
    programId: "prog-1",
    programName: "Hypertrophy",
    day: "Day 2",
    phase: 1,
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-07T08:00:00",
    duration: 45,
    exerciseCount: 5,
    completedSets: 15,
  },
  {
    kind: "quick",
    title: "Tuesday Pump",
    focus: "push",
    sessionId: "qs-1",
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-06T18:00:00",
    duration: 30,
    exerciseCount: 3,
    completedSets: 9,
  },
];

describe("NP-360 Workout History Spacing, Typography & Layout Parity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Header & Chrome", () => {
    it("1. renders circular h-8 w-8 (32x32) rounded-full back button with border", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-list")).toBeTruthy());

      const backButton = getByTestId("history-back-button");
      expect(backButton).toBeTruthy();

      const className = String(backButton.props.className ?? "");
      expect(className).toContain("h-8");
      expect(className).toContain("w-8");
      expect(className).toContain("rounded-full");
      expect(className).toContain("border");

      const style = Array.isArray(backButton.props.style)
        ? Object.assign({}, ...backButton.props.style)
        : backButton.props.style;
      expect(style.width).toBe(32);
      expect(style.height).toBe(32);
      expect(style.borderRadius).toBe(16);
      expect(style.borderWidth).toBe(1);
    });

    it("2. circular back button maintains 44pt minimum touch target via hitSlop", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-list")).toBeTruthy());

      const backButton = getByTestId("history-back-button");
      const slop = backButton.props.hitSlop;
      expect(slop).toBeDefined();

      const top = typeof slop === "number" ? slop : (slop?.top ?? 0);
      const bottom = typeof slop === "number" ? slop : (slop?.bottom ?? 0);
      const left = typeof slop === "number" ? slop : (slop?.left ?? 0);
      const right = typeof slop === "number" ? slop : (slop?.right ?? 0);

      expect(32 + top + bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(32 + left + right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    });

    it("3. circular back button contains ChevronLeft with size 16", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-list")).toBeTruthy());

      const backButton = getByTestId("history-back-button");
      const chevron = within(backButton).UNSAFE_getByType(ChevronLeft);
      expect(chevron).toBeTruthy();
      expect(chevron.props.size).toBe(16);
    });

    it("4. renders History header with size 24 icon and font-extrabold title", async () => {
      const { getByText, UNSAFE_getAllByType } = render(
        <HistoryRoute initialLogs={MOCK_LOGS} />,
      );
      await waitFor(() => expect(getByText("History")).toBeTruthy());

      const title = getByText("History");
      expect(title.props.accessibilityRole).toBe("header");
      expect(String(title.props.className)).toContain("font-extrabold");

      const historyIcons = UNSAFE_getAllByType(History);
      expect(historyIcons.length).toBeGreaterThan(0);
      expect(historyIcons[0].props.size).toBe(24);
    });
  });

  describe("Filter Chip Badges", () => {
    it("5. renders all three filter chips: All, Programs, Quick", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

      expect(getByTestId("history-filter-all")).toBeTruthy();
      expect(getByTestId("history-filter-program")).toBeTruthy();
      expect(getByTestId("history-filter-quick")).toBeTruthy();
    });

    it("6. active filter chip badge has bg-white/25 styling and white text", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

      // 'all' is active by default
      const badge = getByTestId("history-filter-all-badge");
      expect(String(badge.props.className)).toContain("bg-white/25");

      const countText = getByTestId("history-filter-all-count");
      expect(String(countText.props.className)).toContain("text-white");
      expect(countText.props.children).toBe(2);
    });

    it("7. inactive filter chip badge has dark muted styling (bg-zinc-200 dark:bg-zinc-700)", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

      const programBadge = getByTestId("history-filter-program-badge");
      expect(String(programBadge.props.className)).toContain("bg-zinc-200");
      expect(String(programBadge.props.className)).toContain("dark:bg-zinc-700");

      const quickBadge = getByTestId("history-filter-quick-badge");
      expect(String(quickBadge.props.className)).toContain("bg-zinc-200");
      expect(String(quickBadge.props.className)).toContain("dark:bg-zinc-700");
    });

    it("8. switching to Programs updates active badge to bg-white/25 and All to inactive", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

      fireEvent.press(getByTestId("history-filter-program"));

      const programBadge = getByTestId("history-filter-program-badge");
      expect(String(programBadge.props.className)).toContain("bg-white/25");

      const allBadge = getByTestId("history-filter-all-badge");
      expect(String(allBadge.props.className)).toContain("bg-zinc-200");
      expect(String(allBadge.props.className)).toContain("dark:bg-zinc-700");
    });

    it("9. switching to Quick updates active badge to bg-white/25", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-filters")).toBeTruthy());

      fireEvent.press(getByTestId("history-filter-quick"));

      const quickBadge = getByTestId("history-filter-quick-badge");
      expect(String(quickBadge.props.className)).toContain("bg-white/25");
      const quickCount = getByTestId("history-filter-quick-count");
      expect(String(quickCount.props.className)).toContain("text-white");
    });
  });

  describe("Workout Card Rows", () => {
    it("10. left accent stripe matches w-1.5 rounded-l-2xl styling", async () => {
      const { getAllByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getAllByTestId("history-row-accent").length).toBe(2));

      const accents = getAllByTestId("history-row-accent");
      const firstAccent = accents[0];

      expect(String(firstAccent.props.className)).toContain("w-1.5");
      expect(String(firstAccent.props.className)).toContain("rounded-l-2xl");

      const style = firstAccent.props.style;
      expect(style.width).toBe(6);
      expect(style.borderTopLeftRadius).toBe(16);
      expect(style.borderBottomLeftRadius).toBe(16);
    });

    it("11. program row has emerald left accent stripe", async () => {
      const { getAllByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getAllByTestId("history-row-accent").length).toBe(2));

      const accents = getAllByTestId("history-row-accent");
      const programAccent = accents[0];
      expect(String(programAccent.props.className)).toContain("bg-emerald-500");
    });

    it("12. quick row has blue left accent stripe", async () => {
      const { getAllByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getAllByTestId("history-row-accent").length).toBe(2));

      const accents = getAllByTestId("history-row-accent");
      const quickAccent = accents[1];
      expect(String(quickAccent.props.className)).toContain("bg-blue-500");
    });

    it("13. icon badge has h-10 w-10 rounded-xl with green for program and purple for quick", async () => {
      const { getAllByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getAllByTestId("history-row-icon-badge").length).toBe(2));

      const badges = getAllByTestId("history-row-icon-badge");
      const programIconBadge = badges[0];
      const quickIconBadge = badges[1];

      expect(String(programIconBadge.props.className)).toContain("h-10");
      expect(String(programIconBadge.props.className)).toContain("w-10");
      expect(String(programIconBadge.props.className)).toContain("rounded-xl");
      expect(String(programIconBadge.props.className)).toContain("bg-green-100");
      expect(String(programIconBadge.props.className)).toContain("dark:bg-green-900/30");
      expect(within(programIconBadge).UNSAFE_getByType(Dumbbell)).toBeTruthy();

      expect(String(quickIconBadge.props.className)).toContain("bg-purple-100");
      expect(String(quickIconBadge.props.className)).toContain("dark:bg-purple-900/30");
      expect(within(quickIconBadge).UNSAFE_getByType(Sparkles)).toBeTruthy();
    });

    it("14. type badge has rounded-full px-1.5 py-0.5 with green for program and purple for quick", async () => {
      const { getAllByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getAllByTestId("history-row-type-badge").length).toBe(2));

      const badges = getAllByTestId("history-row-type-badge");
      const programTypeBadge = badges[0];
      const quickTypeBadge = badges[1];

      expect(String(programTypeBadge.props.className)).toContain("rounded-full");
      expect(String(programTypeBadge.props.className)).toContain("px-1.5");
      expect(String(programTypeBadge.props.className)).toContain("py-0.5");
      expect(String(programTypeBadge.props.className)).toContain("bg-green-100");
      expect(String(programTypeBadge.props.className)).toContain("dark:bg-green-900/30");
      expect(within(programTypeBadge).getByText("Program")).toBeTruthy();

      expect(String(quickTypeBadge.props.className)).toContain("bg-purple-100");
      expect(String(quickTypeBadge.props.className)).toContain("dark:bg-purple-900/30");
      expect(within(quickTypeBadge).getByText("Quick")).toBeTruthy();
    });

    it("15. workout title is clamped with numberOfLines=1 and truncate", async () => {
      const { getByText } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByText("Hypertrophy · Day 2")).toBeTruthy());

      const title = getByText("Hypertrophy · Day 2");
      expect(title.props.numberOfLines).toBe(1);
      expect(String(title.props.className)).toContain("truncate");
      expect(String(title.props.className)).toContain("text-sm");
      expect(String(title.props.className)).toContain("font-semibold");
    });

    it("16. meta line displays calendar date, exercise count, and duration", async () => {
      const { getByTestId } = render(<HistoryRoute initialLogs={MOCK_LOGS} />);
      await waitFor(() => expect(getByTestId("history-list")).toBeTruthy());

      const programRow = getByTestId(
        "history-row-program-2026-10-07T08:00:00-0",
      );
      expect(within(programRow).UNSAFE_getByType(Calendar)).toBeTruthy();
      expect(within(programRow).getByText("5 exercises")).toBeTruthy();
      expect(within(programRow).UNSAFE_getByType(Clock)).toBeTruthy();
      expect(within(programRow).getByText("45 min")).toBeTruthy();
    });
  });
});
