/* eslint-disable import/first */
/**
 * NP-359 — Spacing/type: My Programs & Program Builder - dashed empty state card,
 * vertical chooser cards, Step 1 details layout & textarea.
 */

import { render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import React from "react";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const R = jest.requireActual("react");
    R.useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "member-1", email: "member@example.com" },
    token: "mock-token",
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

import { MyPrograms } from "@/components/programs/MyPrograms";
import NewProgramRoute from "@/app/(app)/(tabs)/programming/new";
import { ProgramBuilder } from "@/components/programs/ProgramBuilder";
import { Input } from "@/components/Input";
import { lightTokens } from "@/lib/theme/tokens";

describe("NP-359 acceptance: My Programs & Program Builder spacing/type parity", () => {
  describe("1. My Programs Empty State (dashed card & pill CTA button)", () => {
    it("renders empty state enclosed in a dashed rounded-2xl card with 48x48 icon circle and rounded-full pill CTA", () => {
      const onCreate = jest.fn();
      const screen = render(
        <MyPrograms programs={[]} onCreate={onCreate} testID="test-my-programs" />,
      );

      const emptyContainer = screen.getByTestId("test-my-programs-empty");
      // First child of empty container is the dashed card
      const dashedCard = emptyContainer.children[0] as {
        props?: { style?: Record<string, unknown> };
      };
      const cardStyle = StyleSheet.flatten(dashedCard.props?.style) as Record<string, any>;
      expect(cardStyle.borderRadius).toBe(16);
      expect(cardStyle.borderStyle).toBe("dashed");
      expect(cardStyle.borderWidth).toBe(1);
      expect(cardStyle.padding).toBe(32);
      expect(cardStyle.alignItems).toBe("center");

      // CTA button is rounded-full pill
      const cta = screen.getByTestId("test-my-programs-create-empty");
      const ctaStyle = StyleSheet.flatten(cta.props.style);
      expect(ctaStyle.borderRadius).toBe(999);
      expect(ctaStyle.backgroundColor).toBe(`rgb(${lightTokens.success})`);

      // Title and subtitle typography
      const title = screen.getByText(
        "You haven't created any custom programs yet",
      );
      expect(title.props.className).toContain("text-sm");
      expect(title.props.className).toContain("font-semibold");
      expect(title.props.className).toContain("text-center");

      const subtitle = screen.getByText(
        "Build your own training program tailored to your goals.",
      );
      expect(subtitle.props.className).toContain("text-xs");
      expect(subtitle.props.className).toContain("text-center");
    });
  });

  describe("2. Create a Program Chooser (vertical card layout in new.tsx)", () => {
    it("renders vertical cards with centered icon container at top and centered title/subtitle", async () => {
      const screen = render(<NewProgramRoute />);
      await waitFor(() =>
        expect(
          screen.getByTestId("programming-new-entry-scratch"),
        ).toBeTruthy(),
      );

      const scratchCard = screen.getByTestId("programming-new-entry-scratch");
      const scratchStyle = StyleSheet.flatten(scratchCard.props.style);
      expect(scratchStyle.alignItems).toBe("center");
      expect(scratchStyle.padding).toBe(24);
      expect(scratchStyle.borderRadius).toBe(16);

      const importCard = screen.getByTestId("programming-new-entry-import");
      const importStyle = StyleSheet.flatten(importCard.props.style);
      expect(importStyle.alignItems).toBe("center");
      expect(importStyle.padding).toBe(24);
      expect(importStyle.borderRadius).toBe(16);

      const scratchTitle = screen.getByText("Start from scratch");
      expect(scratchTitle.props.className).toContain("text-center");

      const importTitle = screen.getByText("Import a program");
      expect(importTitle.props.className).toContain("text-center");
    });
  });

  describe("3. Program Builder Step 1 (flat layout, textarea description, dropped stepper)", () => {
    it("renders flat layout without bordered Card wrappers around sections", () => {
      const screen = render(
        <ProgramBuilder
          mode="create"
          onSubmit={jest.fn()}
          testID="test-builder"
        />,
      );

      // Section views exist with flat layout
      const details = screen.getByTestId("test-builder-details");
      expect(details).toBeTruthy();
      const detailsStyle = StyleSheet.flatten(details.props.style);
      // Not a bordered card
      expect(detailsStyle?.borderWidth).toBeUndefined();

      const schedule = screen.getByTestId("test-builder-schedule");
      expect(schedule).toBeTruthy();
      const scheduleStyle = StyleSheet.flatten(schedule.props.style);
      expect(scheduleStyle?.borderWidth).toBeUndefined();

      const audience = screen.getByTestId("test-builder-audience");
      expect(audience).toBeTruthy();

      const equipment = screen.getByTestId("test-builder-equipment");
      expect(equipment).toBeTruthy();
    });

    it("uses a multi-line textarea with minHeight: 80 and top vertical alignment for description", () => {
      const screen = render(
        <ProgramBuilder
          mode="create"
          onSubmit={jest.fn()}
          testID="test-builder"
        />,
      );

      const description = screen.getByTestId("test-builder-description");
      expect(description.props.multiline).toBe(true);
      expect(description.props.numberOfLines).toBe(3);

      const style = StyleSheet.flatten(description.props.style);
      expect(style.minHeight).toBe(80);
      expect(style.textAlignVertical).toBe("top");
    });

    it("has dropped the extra minus/plus stepper under Training Days/Week chips", () => {
      const screen = render(
        <ProgramBuilder
          mode="create"
          onSubmit={jest.fn()}
          testID="test-builder"
        />,
      );

      // Stepper controls no longer exist
      expect(
        screen.queryByTestId("test-builder-days-decrease"),
      ).toBeNull();
      expect(
        screen.queryByTestId("test-builder-days-increase"),
      ).toBeNull();
      expect(screen.queryByTestId("test-builder-days-value")).toBeNull();

      // But chips 2-7 exist
      for (let day = 2; day <= 7; day += 1) {
        expect(
          screen.getByTestId(`test-builder-days-${day}`),
        ).toBeTruthy();
      }
    });
  });

  describe("4. Input component style prop and multiline handling", () => {
    it("composes style array with .filter(Boolean) without null or undefined entries", () => {
      const screen = render(
        <Input testID="test-input" placeholder="Test placeholder" />,
      );
      const input = screen.getByTestId("test-input");
      expect(Array.isArray(input.props.style)).toBe(true);
      for (const entry of input.props.style as unknown[]) {
        expect(entry).toBeTruthy();
      }
    });

    it("applies textAlignVertical: top when multiline is true", () => {
      const screen = render(
        <Input testID="test-multiline-input" multiline />,
      );
      const input = screen.getByTestId("test-multiline-input");
      const style = StyleSheet.flatten(input.props.style);
      expect(style.textAlignVertical).toBe("top");
    });
  });
});
