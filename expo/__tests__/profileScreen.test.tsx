import { fireEvent, render, within } from "@testing-library/react-native";
import { Sparkles } from "lucide-react-native";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { apiFetch } from "@become/api-client";
import { lightTokens } from "@/lib/theme/tokens";

const rgb = (triplet: string) => `rgb(${triplet})`;

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockSearchParams: { from?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    token: "test-jwt",
    user: { id: "user-1", name: "Alex Runner", email: "alex@example.com" },
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => ({
    data: { enforced: true, tier: "plus" },
    loading: false,
    enforced: true,
    refresh: jest.fn(),
    feature: jest.fn(),
    canCreate: jest.fn(),
  }),
  tierLabel: (tier: string) => (tier === "plus" ? "Plus" : "Free"),
}));

describe("<ProfileScreen />", () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  const FIXTURE_PROFILE = {
    name: "Alex Runner",
    email: "alex@example.com",
    profileIcon: "summit",
    avatarUrl: null,
    createdAt: "2026-01-15T10:00:00.000Z",
    profile: {
      fitnessGoal: "gain_muscle" as const,
    },
  };

  const FIXTURE_MIND = {
    chapter: 3,
    xp: 450,
    xpProgress: {
      needed: 100,
      current: 50,
      pct: 0.5,
    },
    currentChapter: {
      chapter: 3,
      name: "The Expansion",
      theme: "Stepping into uncharted territory",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/profile") return FIXTURE_PROFILE as never;
      if (path === "/api/mind/progress") return FIXTURE_MIND as never;
      throw new Error(`Unexpected path: ${path}`);
    });
  });

  it("fetches profile and mind progress, rendering identity hero and chips", async () => {
    const { getByTestId, findByTestId, getByText } = render(<ProfileScreen />);

    // Waits for loading to finish
    await findByTestId("profile-identity");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.anything(),
      expect.anything(),
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/mind/progress",
      expect.anything(),
      expect.anything(),
    );

    expect(getByTestId("profile-name").props.children).toBe("Alex Runner");
    expect(getByTestId("profile-email").props.children).toBe("alex@example.com");
    expect(getByText("Gaining muscle")).toBeTruthy();
    expect(getByTestId("profile-since-chip")).toBeTruthy();
  });

  it("The Mind chapter and XP shown natively match the web's profile page for the same member (acceptance criterion e015ca54)", async () => {
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-mind");

    // Must match Chapter 3 · The Expansion and 450 XP exactly like the web
    expect(getByTestId("profile-mind-chapter").props.children).toEqual([
      "Chapter ",
      3,
      " · The Expansion",
    ]);
    expect(getByTestId("profile-mind-xp").props.children).toBe("450 XP");
    expect(getByTestId("profile-mind-theme").props.children).toBe(
      "Stepping into uncharted territory",
    );
    expect(getByTestId("profile-mind-bar")).toBeTruthy();
  });

  it("renders IconPicker and PlanRow", async () => {
    const { findByTestId } = render(<ProfileScreen />);

    expect(await findByTestId("profile-icon-picker")).toBeTruthy();
    expect(await findByTestId("profile-plan-row")).toBeTruthy();
  });

  it("navigates back when header back button is pressed (no origin known)", async () => {
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-identity");
    fireEvent.press(getByTestId("profile-back-button"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("the back arrow returns to Home when Profile was opened from Home (NP-306)", async () => {
    mockSearchParams = { from: "dashboard" };
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-identity");
    fireEvent.press(getByTestId("profile-back-button"));

    // Explicit replace to the origin tab — NOT router.back(), which the tab
    // navigator's history resolves to the Workout tab regardless of where
    // Profile was actually opened from.
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("the back arrow returns to Mind when Profile was opened from Mind (NP-306)", async () => {
    mockSearchParams = { from: "mind" };
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-identity");
    fireEvent.press(getByTestId("profile-back-button"));

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/mind");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("Android hardware back follows the same origin-aware logic as the header arrow (NP-306)", async () => {
    mockSearchParams = { from: "dashboard" };
    const listeners: (() => boolean)[] = [];
    const fakeBackHandler = {
      addEventListener: (
        _type: "hardwareBackPress",
        handler: () => boolean,
      ) => {
        listeners.push(handler);
        return {
          remove: () => {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          },
        };
      },
    };

    const { findByTestId } = render(
      <ProfileScreen backHandler={fakeBackHandler} />,
    );
    await findByTestId("profile-identity");

    expect(listeners).toHaveLength(1);
    const intercepted = listeners[0]!();

    expect(intercepted).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("the Mind chapter sparkle is violet, matching the web (NP-306, was primary/red)", async () => {
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-mind-chapter");

    // Scoped to the Mind card — the icon grid (`icon-preset-spark`) and
    // PlanRow's own "Plan" row icon are unrelated Sparkles on this screen.
    const mindCard = within(getByTestId("profile-mind"));
    // Web: `text-violet-500` on `app/dashboard/profile/page.tsx`'s Sparkles.
    // `mind-violet` is the token for exactly this violet-500 hue (both modes).
    expect(mindCard.UNSAFE_getByType(Sparkles).props.color).toBe(
      rgb(lightTokens["mind-violet"]),
    );
    expect(mindCard.UNSAFE_getByType(Sparkles).props.color).not.toBe(
      rgb(lightTokens.primary),
    );
  });

  it("navigates to settings from header or settings row", async () => {
    const { findByTestId, getByTestId } = render(<ProfileScreen />);

    await findByTestId("profile-identity");

    fireEvent.press(getByTestId("profile-header-settings"));
    expect(mockPush).toHaveBeenCalledWith("/settings");

    fireEvent.press(getByTestId("profile-settings-link"));
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });
});
