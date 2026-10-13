/* eslint-disable import/first */
/**
 * NP-357 — My Exercises & Custom Exercise Form: Hub tabs & header alignment,
 * empty state CTA button, inline form vs sheet presentation & solid pill chips.
 */

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "member@example.com" },
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

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(async () => "signed-in" as const),
}));

import { apiFetch } from "@become/api-client";
import {
  configureEntitlementsStore,
  resetEntitlementsSnapshot,
  setEntitlementsToken,
} from "@/lib/entitlements";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import MyExercisesRoute from "@/app/(app)/(tabs)/programming/exercises";
import { MyExercises } from "@/components/workout/MyExercises";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import { DEFAULT_CUSTOM_EXERCISE_FORM } from "@/lib/workout/customExercises";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function scriptSuccess(exercises: unknown[] = []) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/exercises/custom") {
      return { exercises };
    }
    if (path === "/api/me/entitlements") {
      return {
        role: "user",
        tier: "pro",
        enforced: false,
        features: {
          "custom-exercises": { allowed: true, canCreate: true },
        },
      };
    }
    throw new Error(`unexpected fetch ${path}`);
  });
}

beforeEach(async () => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  const storage = createMemoryAsyncStorage();
  configureEntitlementsStore({ baseUrl: "https://example.test", storage });
  setEntitlementsToken(mockToken);
  resetEntitlementsSnapshot();
});

describe("NP-357: Hub Chrome & Navigation", () => {
  test("renders 'My Workout' title, circular back button, hub tabs, and pinned Add button", async () => {
    scriptSuccess([]);
    const screen = render(<MyExercisesRoute />);

    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-route")).toBeTruthy(),
    );

    // Title is 'My Workout'
    expect(screen.getByText("My Workout")).toBeTruthy();
    expect(screen.queryByText("My exercises")).toBeNull();

    // Extra subtitle paragraph is removed
    expect(
      screen.queryByText("Exercises you built yourself — use them in any workout or program."),
    ).toBeNull();

    // Circular back button
    const backBtn = screen.getByTestId("my-exercises-back");
    expect(backBtn).toBeTruthy();
    const backStyle = StyleSheet.flatten(backBtn.props.style);
    expect(backStyle.width).toBe(32);
    expect(backStyle.height).toBe(32);
    expect(backStyle.borderRadius).toBe(16);

    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();

    // Hub tabs switcher
    expect(screen.getByTestId("exercises-hub-tabs")).toBeTruthy();
    const exTab = screen.getByTestId("exercises-hub-tab-exercises");
    const sessTab = screen.getByTestId("exercises-hub-tab-sessions");
    const progTab = screen.getByTestId("exercises-hub-tab-programs");

    expect(exTab).toBeTruthy();
    expect(sessTab).toBeTruthy();
    expect(progTab).toBeTruthy();

    expect(exTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(sessTab.props.accessibilityState).toMatchObject({ selected: false });
    expect(progTab.props.accessibilityState).toMatchObject({ selected: false });

    // Active tab does not navigate
    fireEvent.press(exTab);
    expect(mockPush).not.toHaveBeenCalled();

    // Sessions tab navigates to sessions
    fireEvent.press(sessTab);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/sessions");

    // Programs tab navigates to programs
    fireEvent.press(progTab);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/mine");

    // Pinned Add button below tabs
    const addBtn = screen.getByTestId("my-exercises-create");
    expect(addBtn).toBeTruthy();
    expect(screen.getByText("Add")).toBeTruthy();
  });

  test("create bottom sheet includes header trailing close button", async () => {
    scriptSuccess([]);
    const screen = render(<MyExercisesRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-route")).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId("my-exercises-create"));
    await waitFor(() =>
      expect(screen.getByTestId("my-exercises-create-modal")).toBeTruthy(),
    );

    const closeBtn = screen.getByTestId("my-exercises-create-close");
    expect(closeBtn).toBeTruthy();

    fireEvent.press(closeBtn);
    await waitFor(() =>
      expect(screen.queryByTestId("my-exercises-create-modal")).toBeNull(),
    );
  });
});

describe("NP-357: Empty State", () => {
  test("renders circular dumbbell badge, matched copy, and green pill CTA with '+'", () => {
    const onCreate = jest.fn();
    const screen = render(<MyExercises exercises={[]} onCreate={onCreate} />);

    expect(screen.getByTestId("my-exercises-empty")).toBeTruthy();
    expect(screen.getByText("No custom exercises yet")).toBeTruthy();
    expect(screen.getByText('Tap "Add" to create your first exercise.')).toBeTruthy();

    const ctaBtn = screen.getByTestId("my-exercises-create-empty");
    expect(ctaBtn).toBeTruthy();
    const ctaStyle = StyleSheet.flatten(ctaBtn.props.style);
    expect(ctaStyle.borderRadius).toBe(999);
    expect(ctaStyle.flexDirection).toBe("row");

    fireEvent.press(ctaBtn);
    expect(onCreate).toHaveBeenCalled();
  });
});

describe("NP-357: CustomExerciseForm chips and tracking options", () => {
  test("tracking options have compact border radius (rounded-lg = 8px)", () => {
    const onChange = jest.fn();
    const screen = render(
      <CustomExerciseForm
        values={DEFAULT_CUSTOM_EXERCISE_FORM}
        onChange={onChange}
        onSubmit={jest.fn()}
      />,
    );

    const trackingOpt = screen.getByTestId("custom-exercise-form-tracking-reps_weight");
    const style = StyleSheet.flatten(trackingOpt.props.style);
    expect(style.borderRadius).toBe(8);
  });

  test("category chips render selected as solid green pill and unselected as transparent", () => {
    const onChange = jest.fn();
    const screen = render(
      <CustomExerciseForm
        values={{ ...DEFAULT_CUSTOM_EXERCISE_FORM, category: "strength" }}
        onChange={onChange}
        onSubmit={jest.fn()}
      />,
    );

    const selectedChip = screen.getByTestId("custom-exercise-form-category-strength");
    const unselectedChip = screen.getByTestId("custom-exercise-form-category-cardio");

    const selStyle = StyleSheet.flatten(selectedChip.props.style);
    const unselStyle = StyleSheet.flatten(unselectedChip.props.style);

    expect(selStyle.borderRadius).toBe(999);
    expect(selStyle.backgroundColor).not.toBe("transparent");
    expect(unselStyle.backgroundColor).toBe("transparent");
  });

  test("primary muscle chips render selected as solid green pill and unselected as transparent", () => {
    const onChange = jest.fn();
    const screen = render(
      <CustomExerciseForm
        values={{ ...DEFAULT_CUSTOM_EXERCISE_FORM, muscleGroup: "chest" }}
        onChange={onChange}
        onSubmit={jest.fn()}
      />,
    );

    const selectedChip = screen.getByTestId("custom-exercise-form-muscle-chest");
    const unselectedChip = screen.getByTestId("custom-exercise-form-muscle-back");

    const selStyle = StyleSheet.flatten(selectedChip.props.style);
    const unselStyle = StyleSheet.flatten(unselectedChip.props.style);

    expect(selStyle.borderRadius).toBe(999);
    expect(selStyle.backgroundColor).not.toBe("transparent");
    expect(unselStyle.backgroundColor).toBe("transparent");
  });

  test("role chips render selected as solid green pill and unselected as transparent", () => {
    const onChange = jest.fn();
    const screen = render(
      <CustomExerciseForm
        values={{ ...DEFAULT_CUSTOM_EXERCISE_FORM, role: "accessory" }}
        onChange={onChange}
        onSubmit={jest.fn()}
      />,
    );

    const selectedChip = screen.getByTestId("custom-exercise-form-role-accessory");
    const unselectedChip = screen.getByTestId("custom-exercise-form-role-compound");

    const selStyle = StyleSheet.flatten(selectedChip.props.style);
    const unselStyle = StyleSheet.flatten(unselectedChip.props.style);

    expect(selStyle.borderRadius).toBe(999);
    expect(selStyle.backgroundColor).not.toBe("transparent");
    expect(unselStyle.backgroundColor).toBe("transparent");
  });
});
