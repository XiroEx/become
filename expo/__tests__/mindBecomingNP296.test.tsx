/* eslint-disable import/first */
// NP-296: The Becoming link, the dark session card, the violet level
// bar/chapter path, the one-line cooldown header and the `Type it` chip
// label — native parity with `webapp/components/mind/MindJourney.tsx`.
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

import { apiFetch } from "@become/api-client";
import MindRoute from "../app/(app)/(tabs)/mind/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function baseMock(overrides: {
  mainSessionAvailable?: boolean;
  nextMainSessionAt?: number | null;
  moves?: { id: string; kind: string; title: string; xp: number }[];
}) {
  const available = overrides.mainSessionAvailable ?? true;
  return (path: string, _s: unknown, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    const cleanPath = path.split("?")[0]!;

    if (cleanPath === "/api/progress" && method === "GET") {
      return Promise.resolve({ moodData: [] });
    }
    if (cleanPath === "/api/mind/identity" && method === "GET") {
      return Promise.resolve({ profile: { onboardingCompleted: true } });
    }
    if (cleanPath === "/api/mind/progress" && method === "GET") {
      return Promise.resolve({
        chapter: 2,
        xp: 35,
        level: 7,
        mainSessionCount: 11,
        mainSessionAvailable: available,
        nextMainSessionAt: overrides.nextMainSessionAt ?? null,
        unlockedSystems: ["state", "breath"],
        levelProgress: {
          level: 7,
          intoLevel: 20,
          span: 100,
          pct: 20,
          xpToNext: 80,
        },
        sessionsIntoChapter: { done: 1, needed: 10, toNext: 9 },
      });
    }
    if (cleanPath === "/api/mind/session" && method === "GET") {
      return Promise.resolve({
        dateKey: "2026-10-06",
        completedToday: false,
        streak: 0,
        mainSessionAvailable: available,
        nextMainSessionAt: overrides.nextMainSessionAt ?? null,
        locked: false,
        sessionsUsed: 11,
        resume: overrides.moves
          ? {
              seed: 1,
              plan: {
                intro: { title: "Reset", subtitle: "Ground yourself" },
                moves: overrides.moves,
                rewardXp: 10,
              },
            }
          : undefined,
      });
    }
    if (cleanPath === "/api/mind/state" && method === "GET") {
      return Promise.resolve({ logs: [], todayMood: null });
    }
    if (cleanPath === "/api/mind/mission" && method === "GET") {
      return Promise.resolve({ mission: null });
    }
    return Promise.resolve({});
  };
}

describe("Mind home (NP-296): The Becoming, dark session card, violet header", () => {
  beforeEach(() => {
    mockParams = {};
    mockPush.mockReset();
    mockApiFetch.mockReset();
  });

  it("shows 'Mindset' as the header title (web parity, not 'Mind')", async () => {
    mockApiFetch.mockImplementation(
      baseMock({
        mainSessionAvailable: true,
        moves: [{ id: "m1", kind: "breath", title: "Breathe", xp: 10 }],
      }),
    );
    const { getByText, queryByText } = render(<MindRoute />);
    await waitFor(() => {
      expect(getByText("Mindset")).toBeTruthy();
    });
    expect(queryByText("Daily mindset & focus")).toBeNull();
  });

  it("renders The Becoming row with the web's copy and routes to /becoming when the session is available", async () => {
    mockApiFetch.mockImplementation(
      baseMock({
        mainSessionAvailable: true,
        moves: [{ id: "m1", kind: "breath", title: "Breathe", xp: 10 }],
      }),
    );
    const { getByTestId, getByText } = render(<MindRoute />);

    await waitFor(() => {
      expect(getByTestId("mind-becoming-link")).toBeTruthy();
    });
    expect(
      getByText("Where you started, where you are, what's next"),
    ).toBeTruthy();

    fireEvent.press(getByTestId("mind-becoming-link"));
    expect(mockPush).toHaveBeenCalledWith("/becoming");
  });

  it("still renders The Becoming row in the cooldown state", async () => {
    mockApiFetch.mockImplementation(
      baseMock({
        mainSessionAvailable: false,
        nextMainSessionAt: Date.now() + 3_600_000,
      }),
    );
    const { getByTestId } = render(<MindRoute />);

    await waitFor(() => {
      expect(getByTestId("mind-cooldown-card")).toBeTruthy();
      expect(getByTestId("mind-becoming-link")).toBeTruthy();
    });
  });

  it("collapses the level bar and chapter onto one line in the cooldown state ('Lv 7 … Ch.2 · Foundation')", async () => {
    mockApiFetch.mockImplementation(
      baseMock({
        mainSessionAvailable: false,
        nextMainSessionAt: Date.now() + 3_600_000,
      }),
    );
    const { getByTestId, queryByTestId, getByText } = render(<MindRoute />);

    await waitFor(() => {
      expect(getByTestId("mind-level-bar")).toBeTruthy();
    });
    // The collapsed chapter label lives INSIDE the level bar row, not as a
    // separate visual chapter path with chapter circles.
    expect(getByTestId("mind-chapter-path")).toBeTruthy();
    expect(getByText(/Ch\.2 · Foundation/)).toBeTruthy();
    expect(queryByTestId("mind-system-tile-state")).toBeNull();
  });

  it("renders the session card dark with a white Begin, and the 'type' move chip reads 'Type it'", async () => {
    mockApiFetch.mockImplementation(
      baseMock({
        mainSessionAvailable: true,
        moves: [
          { id: "m1", kind: "breath", title: "Breathe", xp: 10 },
          { id: "m2", kind: "type", title: "Type it out", xp: 10 },
        ],
      }),
    );
    const { getByTestId, getByText } = render(<MindRoute />);

    await waitFor(() => {
      expect(getByTestId("mind-session-card")).toBeTruthy();
    });
    expect(getByTestId("mind-session-begin")).toBeTruthy();
    expect(getByTestId("mind-move-chip-type")).toBeTruthy();
    expect(getByText("Type it")).toBeTruthy();
  });
});
