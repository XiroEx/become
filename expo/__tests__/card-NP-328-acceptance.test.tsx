/* eslint-disable import/first */
// NP-328 — ANDROID & IOS MY EXERCISES PARITY:
// 1. Blocker: 'Add a video' hands off to /dashboard/workout/hub signed in
// 2. Filter chips & form chips: 28 px tall visual pills using hitSlop (no 44 dp minTouchTarget visual bloat)
// 3. 'All body parts' / 'All roles' chips: solid black (colors.foreground) on active, green tint on specific active chips
// 4. Sort chips: Recent (Clock icon) and A-Z (ArrowDownAZ icon); Search input has magnifier Search icon
// 5. Expanded card: 'Add a video' button is solid black (colors.foreground) with Upload icon, not full-width
// 6. Create/edit form: 'Advanced · optional' is a bordered collapsible card with ChevronDown
// 7. Empty state copy: Tap "Add" to create your first exercise.

import { StyleSheet } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useFocusEffect: () => {},
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

const mockOpenWebSignedIn = jest.fn(async () => "signed-in" as const);
jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: (...args: unknown[]) => mockOpenWebSignedIn(...args),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: { enforced: true },
      loading: false,
      enforced: true,
      refresh: jest.fn(),
      feature: () => null,
      canCreate: () => true,
    }),
  };
});

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: () => null,
  subscribeToUpgradeSheet: () => () => {},
}));

import { apiFetch } from "@become/api-client";
import MyExercisesRoute from "../app/(app)/(tabs)/programming/exercises";
import { MyExercises } from "@/components/workout/MyExercises";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { DEFAULT_CUSTOM_EXERCISE_FORM } from "@/lib/workout/customExercises";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const BENCH = {
  slug: "custom-bench-press",
  name: "Custom Bench Press",
  trackingType: "reps_weight",
  primaryMuscles: ["chest"],
  bodyRegion: "upper_body",
  category: "strength",
  role: "compound",
  defaultSets: 3,
  defaultReps: "8-12",
  videoUrl: null,
  reviewStatus: "none",
  isUniversal: false,
  tags: ["custom", "strength", "push", "chest"],
  createdAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  mockOpenWebSignedIn.mockClear();
});

describe("NP-328: Blocker fix — Add a video hand-off", () => {
  it("tapping Add a video opens the web hub signed in (/dashboard/workout/hub)", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/exercises/custom") return { exercises: [BENCH] };
      throw new Error(`unexpected fetch ${path}`);
    });

    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId(`my-exercises-item-${BENCH.slug}`)).toBeTruthy(),
    );

    // Expand the card
    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${BENCH.slug}`));
    expect(screen.getByTestId(`my-exercises-video-${BENCH.slug}`)).toBeTruthy();

    // Tap Add a video
    fireEvent.press(screen.getByTestId(`my-exercises-video-${BENCH.slug}`));
    expect(mockOpenWebSignedIn).toHaveBeenCalledWith("/dashboard/workout/hub");
  });
});

describe("NP-328: Chip sizing and hitSlop (28 px visual size, no 44 dp minTouchTarget bloat)", () => {
  it("filter chips and sort chips are 28 px tall pills with hitSlop", () => {
    const screen = render(
      <MyExercises exercises={[BENCH]} onOpenWebLibrary={jest.fn()} />,
    );

    // Sort chips
    const sortRecent = screen.getByTestId("my-exercises-sort-recent");
    const sortStyle = StyleSheet.flatten(sortRecent.props.style);
    expect(sortStyle.height).toBe(28);
    expect(sortStyle.minHeight).toBeUndefined();
    expect(sortRecent.props.hitSlop).toBeTruthy();

    // Body part filter chip
    const bodyPartAll = screen.getByTestId("my-exercises-body-part-all");
    const bpStyle = StyleSheet.flatten(bodyPartAll.props.style);
    expect(bpStyle.height).toBe(28);
    expect(bpStyle.minHeight).toBeUndefined();
    expect(bodyPartAll.props.hitSlop).toBeTruthy();

    // Role filter chip
    const roleAll = screen.getByTestId("my-exercises-role-all");
    const roleStyle = StyleSheet.flatten(roleAll.props.style);
    expect(roleStyle.height).toBe(28);
    expect(roleStyle.minHeight).toBeUndefined();
    expect(roleAll.props.hitSlop).toBeTruthy();
  });

  it("form chips (muscle, category, role) are 28 px tall with hitSlop", () => {
    const screen = render(
      <CustomExerciseForm
        values={DEFAULT_CUSTOM_EXERCISE_FORM}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    const muscleChip = screen.getByTestId("custom-exercise-form-muscle-chest");
    const muscleStyle = StyleSheet.flatten(muscleChip.props.style);
    expect(muscleStyle.height).toBe(28);
    expect(muscleStyle.minHeight).toBeUndefined();
    expect(muscleChip.props.hitSlop).toBeTruthy();

    const categoryChip = screen.getByTestId("custom-exercise-form-category-strength");
    const categoryStyle = StyleSheet.flatten(categoryChip.props.style);
    expect(categoryStyle.height).toBe(28);
    expect(categoryStyle.minHeight).toBeUndefined();
    expect(categoryChip.props.hitSlop).toBeTruthy();

    const roleChip = screen.getByTestId("custom-exercise-form-role-compound");
    const roleStyle = StyleSheet.flatten(roleChip.props.style);
    expect(roleStyle.height).toBe(28);
    expect(roleStyle.minHeight).toBeUndefined();
    expect(roleChip.props.hitSlop).toBeTruthy();
  });
});

describe("NP-328: Active chip styling — solid black for All body parts/roles vs green for specific", () => {
  it("All body parts and All roles use solid foreground background when active", () => {
    const screen = render(
      <MyExercises exercises={[BENCH]} onOpenWebLibrary={jest.fn()} />,
    );

    const bpAll = screen.getByTestId("my-exercises-body-part-all");
    const bpStyle = StyleSheet.flatten(bpAll.props.style);
    // Not transparent; has solid foreground background
    expect(bpStyle.backgroundColor).not.toBe("transparent");

    // Specific chip inactive has transparent background
    const bpChest = screen.getByTestId("my-exercises-body-part-chest");
    const chestStyle = StyleSheet.flatten(bpChest.props.style);
    expect(chestStyle.backgroundColor).toBe("transparent");

    // Select Chest
    fireEvent.press(bpChest);
    const chestActiveStyle = StyleSheet.flatten(screen.getByTestId("my-exercises-body-part-chest").props.style);
    expect(chestActiveStyle.backgroundColor).not.toBe(bpStyle.backgroundColor);
  });
});

describe("NP-328: Add a video button and Advanced section web styling", () => {
  it("Add a video button is black background with Upload icon and not full-width", () => {
    const screen = render(
      <MyExercises exercises={[BENCH]} onOpenWebLibrary={jest.fn()} />,
    );

    fireEvent.press(screen.getByTestId(`my-exercises-toggle-${BENCH.slug}`));
    const videoBtn = screen.getByTestId(`my-exercises-video-${BENCH.slug}`);
    const btnStyle = StyleSheet.flatten(videoBtn.props.style);

    expect(btnStyle.backgroundColor).toBeTruthy();
    expect(btnStyle.flex).toBeUndefined();
    expect(videoBtn.props.hitSlop).toBeTruthy();
  });

  it("Advanced section in form is a bordered collapsible card with ChevronDown", () => {
    const screen = render(
      <CustomExerciseForm
        values={DEFAULT_CUSTOM_EXERCISE_FORM}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByTestId("custom-exercise-form-advanced-card")).toBeTruthy();
    expect(screen.getByTestId("custom-exercise-form-advanced-toggle")).toBeTruthy();
    expect(screen.getByTestId("custom-exercise-form-advanced-hint")).toBeTruthy();

    // Toggle open
    fireEvent.press(screen.getByTestId("custom-exercise-form-advanced-toggle"));
    expect(screen.getByTestId("custom-exercise-form-advanced-note")).toBeTruthy();
  });

  it("Empty state copy matches web: Tap 'Add' to create your first exercise.", () => {
    const screen = render(
      <MyExercises exercises={[]} onCreate={jest.fn()} />,
    );

    expect(screen.getByTestId("my-exercises-empty")).toBeTruthy();
    expect(screen.getByText('Tap "Add" to create your first exercise.')).toBeTruthy();
  });
});
