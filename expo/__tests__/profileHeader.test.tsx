import { act, fireEvent, render } from "@testing-library/react-native";
import MindRoute from "@/app/(app)/(tabs)/mind/index";
import DashboardRoute from "@/app/(app)/(tabs)/dashboard/index";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "test-jwt",
    user: {
      id: "user-1",
      name: "Alex",
      email: "alex@example.com",
      profileIcon: "summit",
      avatarUrl: null,
    },
    loading: false,
    isAuthed: true,
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn().mockImplementation(async (path: string) => {
      if (path === "/api/mind/state") {
        return {
          currentDay: 1,
          streak: 3,
          level: 1,
          levelXp: 10,
          levelProgress: { current: 10, needed: 100, pct: 0.1 },
          lastMainSessionAt: null,
          mainSessionAvailable: true,
          locked: false,
        };
      }
      if (path === "/api/mind/identity") {
        return {
          profile: { onboardingCompleted: true },
          identityStatements: [],
        };
      }
      if (path.startsWith("/api/mind/session")) {
        return { streak: 3, lastBreathAt: null, mainSessionAvailable: true };
      }
      if (path.startsWith("/api/mind/progress")) {
        return { chapter: 1, xp: 50 };
      }
      if (path === "/api/dashboard/tiles") {
        return { tiles: [], sections: [] };
      }
      if (path === "/api/dashboard") {
        return {
          activePrograms: [],
          streak: { current: 3 },
          todayWorkout: null,
        };
      }
      if (path === "/api/me/consent") {
        return { consentGiven: true };
      }
      return {};
    }),
  };
});

describe("Profile reachability from headers (NP-163)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("Mind screen header includes profile avatar button that opens /(tabs)/profile", async () => {
    const { findByTestId, getByTestId } = render(<MindRoute />);

    const profileButton = await findByTestId("mind-header-profile");
    expect(profileButton).toBeTruthy();
    expect(getByTestId("mind-header-avatar")).toBeTruthy();

    await act(async () => {
      fireEvent.press(profileButton);
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/profile",
      params: { from: "mind" },
    });
  });

  it("Dashboard header includes profile avatar button that opens /(tabs)/profile", async () => {
    const { findByTestId, getByTestId } = render(<DashboardRoute />);

    const profileButton = await findByTestId("dashboard-open-profile");
    expect(profileButton).toBeTruthy();
    expect(getByTestId("dashboard-header-avatar")).toBeTruthy();

    await act(async () => {
      fireEvent.press(profileButton);
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/profile",
      params: { from: "dashboard" },
    });
  });

  it("web path /dashboard/profile resolves to /(tabs)/profile with exact match", () => {
    const target = resolveWebPath("/dashboard/profile");
    expect(target).toEqual({
      kind: "native",
      href: "/(tabs)/profile",
      pathname: "/(tabs)/profile",
      params: {},
      fallback: "exact",
    });
  });
});
