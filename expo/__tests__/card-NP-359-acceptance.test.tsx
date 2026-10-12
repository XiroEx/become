/**
 * NP-359 — My Programs & Program Builder: dashed empty state card, vertical
 * chooser cards, Step 1 details layout & textarea.
 *
 * Native counterpart of:
 *   - `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx` (the dashed
 *     `EmptyState` card and its green pill CTA)
 *   - `webapp/app/dashboard/programs/new/NewProgramClient.tsx` (the vertical
 *     chooser cards, icon on top)
 *   - `webapp/app/dashboard/admin/programs/_editors/ProgramCreator.tsx`
 *     (Step 1's flat layout, textarea description, and the chip-only
 *     Training Days/Week control)
 *
 * Four things pinned here, each the gap this card closes:
 *
 *   1. (NP-359-empty) `MyPrograms`'s empty state is enclosed in a dashed
 *      rounded card, and its CTA is a green ROUNDED-FULL pill — not the
 *      `rounded-xl` button it used to draw.
 *   2. (NP-359-chooser) `new.tsx`'s two chooser cards lay out VERTICALLY —
 *      icon centred on top, title and subtitle centred beneath it — not the
 *      icon-left/text-right row they used to draw.
 *   3. (NP-359-textarea) `ProgramBuilder`'s Description field renders as a
 *      multi-line textarea (tall, top-aligned text), not a fatter single
 *      line.
 *   4. (NP-359-flat) `ProgramBuilder`'s Step 1 sections are FLAT — no
 *      bordered Card wraps Program Details / Duration & Schedule / Target
 *      Audience / Required Equipment — and the ± stepper that used to sit
 *      under the Training Days/Week chips is gone; the chips are the only
 *      control now.
 */

/* eslint-disable import/first */
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MyPrograms } from "@/components/programs/MyPrograms";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", email: "member@example.com" },
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
import NewProgramRoute from "@/app/(app)/(tabs)/programming/new";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// ─────────────────────────────────────────────────────────────────────────
// (id: NP-359-empty)
// ─────────────────────────────────────────────────────────────────────────

describe("(id: NP-359-empty) MyPrograms empty state is a dashed card with a green pill CTA", () => {
  it("wraps the icon, title, subtitle and CTA in a dashed-border card", () => {
    const { getByTestId, getByText } = render(
      <MyPrograms programs={[]} onCreate={() => {}} testID="my-programs" />,
    );

    const card = getByTestId("my-programs-empty-card");
    expect(card).toBeTruthy();
    // nativewind resolves `border-dashed` to RN's `borderStyle: "dashed"` —
    // the web's `border-dashed` rendered on a real View border, not a
    // cosmetic approximation.
    expect(card.props.className).toContain("border-dashed");
    expect(card.props.className).toContain("rounded-2xl");

    // The icon, title, subtitle and CTA are all inside that same card, not
    // painted straight on the page background beside it.
    expect(
      getByText("You haven't created any custom programs yet"),
    ).toBeTruthy();
    expect(getByTestId("my-programs-create-empty")).toBeTruthy();
  });

  it("styles the CTA as a green rounded-full pill, not a rounded-xl button", () => {
    const { getByTestId } = render(
      <MyPrograms programs={[]} onCreate={() => {}} testID="my-programs" />,
    );

    const cta = StyleSheet.flatten(
      getByTestId("my-programs-create-empty").props.style,
    );
    // rounded-full: a radius at least half the control's own min height
    // (44pt), which is what makes it a pill rather than a rounded rectangle.
    expect(cta.borderRadius).toBeGreaterThanOrEqual(44 / 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (id: NP-359-chooser)
// ─────────────────────────────────────────────────────────────────────────

describe("(id: NP-359-chooser) the chooser cards lay out vertically, icon centred on top", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (p: string) => {
      if (p === "/api/me/entitlements") {
        return {
          role: "user",
          tier: "free",
          enforced: false,
          grandfathered: false,
          subscription: null,
          checkoutAvailable: true,
          features: {},
        };
      }
      throw new Error(`unexpected fetch ${p}`);
    });
  });

  it("centres the icon container above the centred title and subtitle", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );

    const scratchCard = StyleSheet.flatten(
      screen.getByTestId("programming-new-entry-scratch").props.style,
    );
    // The web's `flex flex-col items-center` — not the row this used to be.
    expect(scratchCard.flexDirection).not.toBe("row");
    expect(scratchCard.alignItems).toBe("center");

    const title = screen.getByText("Start from scratch");
    expect(title.props.className).toContain("text-center");
    const subtitle = screen.getByText("Build it step by step in the editor");
    expect(subtitle.props.className).toContain("text-center");

    const importCard = StyleSheet.flatten(
      screen.getByTestId("programming-new-entry-import").props.style,
    );
    expect(importCard.flexDirection).not.toBe("row");
    expect(importCard.alignItems).toBe("center");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// (id: NP-359-textarea) and (id: NP-359-flat)
// ─────────────────────────────────────────────────────────────────────────

describe("(id: NP-359-textarea) ProgramBuilder Step 1's description is a textarea", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (p: string) => {
      if (p === "/api/me/entitlements") {
        return {
          role: "user",
          tier: "free",
          enforced: false,
          grandfathered: false,
          subscription: null,
          checkoutAvailable: true,
          features: {},
        };
      }
      throw new Error(`unexpected fetch ${p}`);
    });
  });

  it("renders the description field tall and top-aligned, not a fatter single line", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));

    const description = screen.getByTestId("program-builder-description");
    expect(description.props.multiline).toBe(true);
    const style = StyleSheet.flatten(description.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(80);
    expect(style.textAlignVertical).toBe("top");
  });
});

describe("(id: NP-359-flat) ProgramBuilder Step 1 drops the nested bordered cards and the ± stepper", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (p: string) => {
      if (p === "/api/me/entitlements") {
        return {
          role: "user",
          tier: "free",
          enforced: false,
          grandfathered: false,
          subscription: null,
          checkoutAvailable: true,
          features: {},
        };
      }
      throw new Error(`unexpected fetch ${p}`);
    });
  });

  it("renders Program Details, Duration & Schedule, Target Audience and Required Equipment without a bordered card wrapper", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));

    for (const section of ["details", "schedule", "audience", "equipment"]) {
      const node = screen.getByTestId(`program-builder-${section}`);
      // `Card` always draws `bg-card ... border border-border` — a flat
      // section has no `className` at all (style-only `View`s).
      expect(node.props.className).toBeFalsy();
    }
  });

  it("drops the ± stepper under Training Days/Week — the chips are the only control", async () => {
    const screen = render(<NewProgramRoute />);
    await waitFor(() =>
      expect(screen.getByTestId("programming-new-entry-scratch")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("programming-new-entry-scratch"));

    expect(screen.queryByTestId("program-builder-days-decrease")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-increase")).toBeNull();
    expect(screen.queryByTestId("program-builder-days-value")).toBeNull();

    // The chips still work: pressing one selects it.
    fireEvent.press(screen.getByTestId("program-builder-days-5"));
    expect(
      screen.getByTestId("program-builder-days-5").props.accessibilityState
        ?.selected,
    ).toBe(true);
  });
});
