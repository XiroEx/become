/* eslint-disable import/first */
// NP-359 — Spacing/type: My Programs & Program Builder - dashed empty state card,
// vertical chooser cards, Step 1 details layout & textarea.
//
// 1. My Programs Empty State:
//    - Dashed rounded-2xl outline card (`rounded-2xl border border-dashed
//      border-zinc-300 dark:border-zinc-700 p-8 text-center`).
//    - Icon circle 48x48 (h-12 w-12), rounded-full, with Plus size 24.
//    - Title `text-sm font-semibold`, subtitle `text-xs mt-1`.
//    - CTA button styled as a green rounded-full pill (`rounded-full bg-green-500
//      px-4 py-2 text-xs font-semibold text-white shadow-sm`).
//
// 2. Create a Program Chooser (new.tsx):
//    - Vertical card layout with centered icon container at top (`h-12 w-12 rounded-xl
//      bg-zinc-800 flex items-center justify-center mb-3`).
//    - Centered title `text-base font-semibold text-center`.
//    - Centered subtitle `text-sm text-center mt-1`.
//    - Card padding 24 (p-6), rounded-2xl (16).
//
// 3. Program Builder Step 1 (Details):
//    - Multi-line textarea for description (`numberOfLines={3}`, `textAlignVertical="top"`,
//      `minHeight: 80`, `placeholder="Brief description of the program..."`).
//    - Drop the extra minus/plus stepper under Training Days/Week chips (simple chips row 2-7).
//    - Remove nested bordered Card wrappers for a flat clean layout.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";

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

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      loading: false,
      enforced: false,
      refresh: jest.fn(async () => {}),
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

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import MyProgramsRoute from "../app/(app)/(tabs)/programming/mine";
import NewProgramRoute from "../app/(app)/(tabs)/programming/new";
import { ProgramBuilder } from "../components/programs/ProgramBuilder";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return [node.props.style]
    .flat(Infinity)
    .filter(Boolean)
    .reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...(s as Record<string, unknown>) }),
      {},
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  setSystemScheme("light");
});

describe("NP-359-1: My Programs empty state dashed card & green rounded-full pill CTA", () => {
  test("encloses empty state in a dashed rounded-2xl card without opaque background", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/programs/custom") {
        return { programs: [] };
      }
      return {};
    });

    const screen = render(<MyProgramsRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-programs-empty")).toBeTruthy(),
    );

    const emptyCard = screen.getByTestId("my-programs-empty");
    const style = flatStyle(emptyCard);
    expect(style.borderStyle).toBe("dashed");
    expect(style.borderWidth).toBe(1);
    expect(style.borderRadius).toBe(16);
    expect(style.padding).toBe(32);
    expect(style.backgroundColor).toBeUndefined();
  });

  test("styles empty state CTA button as a green rounded-full pill", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/programs/custom") {
        return { programs: [] };
      }
      return {};
    });

    const screen = render(<MyProgramsRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("my-programs-create-empty")).toBeTruthy(),
    );

    const cta = screen.getByTestId("my-programs-create-empty");
    const style = flatStyle(cta);
    expect(style.borderRadius).toBe(9999);
    expect(style.paddingHorizontal).toBe(16);
    expect(style.paddingVertical).toBe(8);
    expect(style.gap).toBe(6);
    // Green success token
    expect(style.backgroundColor).toBeDefined();

    const label = screen.getByText("Create Your First Program");
    expect(label.props.className).toContain("text-xs");
    expect(label.props.className).toContain("font-semibold");
  });
});

describe("NP-359-2: Create a Program Chooser vertical card layout", () => {
  test("scratch and import chooser cards use vertical layout with centered icons and centered text", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );

    const scratchCard = screen.getByTestId("programming-new-entry-scratch");
    const scratchStyle = flatStyle(scratchCard);
    expect(scratchStyle.alignItems).toBe("center");
    expect(scratchStyle.padding).toBe(24);
    expect(scratchStyle.borderRadius).toBe(16);

    const scratchTitle = screen.getByText("Start from scratch");
    expect(scratchTitle.props.className).toContain("text-center");
    const scratchSub = screen.getByText("Build it step by step in the editor");
    expect(scratchSub.props.className).toContain("text-center");

    const importCard = screen.getByTestId("programming-new-entry-import");
    const importStyle = flatStyle(importCard);
    expect(importStyle.alignItems).toBe("center");
    expect(importStyle.padding).toBe(24);
    expect(importStyle.borderRadius).toBe(16);

    const importTitle = screen.getByText("Import a program");
    expect(importTitle.props.className).toContain("text-center");
    const importSub = screen.getByText("Paste text, or upload a file");
    expect(importSub.props.className).toContain("text-center");
  });
});

describe("NP-359-3: Program Builder Step 1 details layout, textarea & dropped stepper", () => {
  test("description input is a multi-line textarea with top alignment and minHeight", () => {
    const { getByTestId } = render(
      <ProgramBuilder
        mode="create"
        onSubmit={jest.fn()}
        testID="program-builder"
      />,
    );

    const desc = getByTestId("program-builder-description");
    expect(desc.props.multiline).toBe(true);
    expect(desc.props.numberOfLines).toBe(3);
    expect(desc.props.textAlignVertical).toBe("top");
    expect(desc.props.placeholder).toBe("Brief description of the program...");

    const style = flatStyle(desc);
    expect(style.minHeight).toBe(80);
  });

  test("drops the extra minus/plus stepper under Training Days/Week chips", () => {
    const screen = render(
      <ProgramBuilder
        mode="create"
        onSubmit={jest.fn()}
        testID="program-builder"
      />,
    );

    // Chips 2–7 exist
    for (const d of [2, 3, 4, 5, 6, 7]) {
      expect(screen.getByTestId(`program-builder-days-${d}`)).toBeTruthy();
    }

    // Extra ± stepper and value text are dropped
    expect(screen.queryByTestId("program-builder-days-decrease")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-value")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-increase")).toBeNull();

    // Selecting a chip updates the selected state
    const chip5 = screen.getByTestId("program-builder-days-5");
    fireEvent.press(chip5);
    expect(chip5.props.accessibilityState?.selected).toBe(true);
  });

  test("Step 1 sections are rendered in a flat layout without heavy bordered Card wrappers", () => {
    const { getByTestId } = render(
      <ProgramBuilder
        mode="create"
        onSubmit={jest.fn()}
        testID="program-builder"
      />,
    );

    // The sections exist and have flat layout (no border/background on container)
    const detailsSection = getByTestId("program-builder-details");
    const scheduleSection = getByTestId("program-builder-schedule");
    const audienceSection = getByTestId("program-builder-audience");
    const equipmentSection = getByTestId("program-builder-equipment");

    for (const section of [
      detailsSection,
      scheduleSection,
      audienceSection,
      equipmentSection,
    ]) {
      const style = flatStyle(section);
      // Flat layout: no Card border or background fill
      expect(style.borderWidth).toBeUndefined();
      expect(style.backgroundColor).toBeUndefined();
    }
  });
});
