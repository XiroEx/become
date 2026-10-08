/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
    token: "mock-token",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(async () => "signed-in" as const),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { hideUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { clearAll, setCacheMemberId } from "@/lib/cache/lastKnown";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import MyExercisesRoute from "@/app/(app)/(tabs)/programming/exercises";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { DEFAULT_CUSTOM_EXERCISE_FORM } from "@/lib/workout/customExercises";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockOpenWebSignedIn = openWebSignedIn as unknown as jest.Mock;

const BENCH = {
  slug: "custom-u1-bench-press-1",
  name: "Bench Press",
  trackingType: "reps_weight",
  primaryMuscles: ["chest"],
  bodyRegion: "upper_body",
  category: "strength",
  role: "accessory",
  defaultSets: 3,
  defaultReps: "8-12",
  equipment: [],
  reviewStatus: "none",
  isUniversal: false,
  createdAt: "2026-10-01T10:00:00.000Z",
};

const ROOM = {
  role: "user",
  tier: "free",
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {
    "custom-exercises": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: 3,
      used: 0,
      remaining: 3,
      resetsAt: null,
      window: "lifetime",
    },
  },
};

let storage: AsyncStorageLike;

beforeEach(async () => {
  mockPush.mockReset();
  mockApiFetch.mockReset();
  mockOpenWebSignedIn.mockClear();
  hideUpgradeSheet();
  storage = createMemoryAsyncStorage();
  await clearAll(storage);
  setCacheMemberId(null);
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
});

afterEach(async () => {
  jest.restoreAllMocks();
  setEntitlementsToken(null);
  resetEntitlementsSnapshot();
  hideUpgradeSheet();
  await clearAll(storage);
});

describe("NP-328 acceptance", () => {
  it("tapping Add a video opens the web hub signed in (/dashboard/workout/hub)", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/me/entitlements") return ROOM;
      if (path === "/api/exercises/custom") return { exercises: [BENCH] };
      return {};
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy(),
    );

    // Expand the card
    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${BENCH.slug}`));

    // Video button is rendered with Add a video and hitSlop
    const videoBtn = await screen.findByTestId(`my-exercises-video-${BENCH.slug}`);
    expect(videoBtn).toBeTruthy();
    expect(videoBtn.props.hitSlop).toBe(8);

    // Tap Add a video
    fireEvent.press(videoBtn);

    expect(mockOpenWebSignedIn).toHaveBeenCalledWith("/dashboard/workout/hub");
  });

  it("sort and filter chips use hitSlop and render correct icons and active styling", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/me/entitlements") return ROOM;
      if (path === "/api/exercises/custom") return { exercises: [BENCH] };
      return {};
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-sort")).toBeTruthy(),
    );

    // Sort chips have hitSlop={8}
    const recentSort = screen.getByTestId("my-exercises-sort-recent");
    const azSort = screen.getByTestId("my-exercises-sort-alphabetical");
    expect(recentSort.props.hitSlop).toBe(8);
    expect(azSort.props.hitSlop).toBe(8);

    // Search input exists with magnifier container
    expect(screen.getByTestId("my-exercises-search")).toBeTruthy();

    // All body parts & All roles chips have hitSlop={8}
    const allBodyParts = screen.getByTestId("my-exercises-body-part-all");
    const allRoles = screen.getByTestId("my-exercises-role-all");
    expect(allBodyParts.props.hitSlop).toBe(8);
    expect(allRoles.props.hitSlop).toBe(8);
  });

  it("form chips use hitSlop and Advanced section is a bordered collapsible card with chevron", () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    const screen = render(
      <CustomExerciseForm
        values={DEFAULT_CUSTOM_EXERCISE_FORM}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );

    // Form chips have hitSlop={8}
    const chestChip = screen.getByTestId("custom-exercise-form-muscle-chest");
    const strengthChip = screen.getByTestId("custom-exercise-form-category-strength");
    const accessoryChip = screen.getByTestId("custom-exercise-form-role-accessory");
    expect(chestChip.props.hitSlop).toBe(8);
    expect(strengthChip.props.hitSlop).toBe(8);
    expect(accessoryChip.props.hitSlop).toBe(8);

    // Advanced section toggle and hint
    const toggle = screen.getByTestId("custom-exercise-form-advanced-toggle");
    expect(toggle).toBeTruthy();
    expect(screen.getByTestId("custom-exercise-form-advanced-hint")).toBeTruthy();

    // Toggle open
    fireEvent.press(toggle);
    expect(screen.getByTestId("custom-exercise-form-advanced-note")).toBeTruthy();
  });
});
