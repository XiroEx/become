/**
 * NP-298 — Mind tools: intro flows, guided protocols and the breath player
 * render as a full-screen DARK MODAL over the section, coloured with the
 * tool's own accent, instead of light and inline with the header/tab bar
 * still visible and one shared colour (amber) for every tool.
 *
 * `GuidedFlow` used to be a plain `SafeAreaView` painted with the device's
 * theme tokens (`bg-background`/`bg-foreground`, flipping with light/dark),
 * and every dashboard handed it `colors.accent` / `colors.primary` /
 * `colors.success` — none of which are per-tool, so State Shift, Self-Image,
 * Mission, Vision, Social, Discipline and Anti-Sabotage all drew the SAME
 * progress colour. The breath player (`StateShiftDashboard`'s
 * `BreathSession`) was a plain inline circle with no progress indicator at
 * all. This file pins the fix: a real `Modal`, per-tool accents that mirror
 * the web's `ACCENTS` map (`webapp/components/mind/ToolIntroGate.tsx`), and a
 * drawn breath progress ring.
 */

/* eslint-disable import/first */
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
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

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

jest.mock("@/lib/feedback/haptics", () => ({
  lightHaptic: jest.fn(),
  celebrationHaptic: jest.fn(),
  successHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

import * as React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
import { MIND_ACCENT_TOKEN, mindAccentColor } from "@/lib/mind/accents";
import { getTokens } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

/**
 * react-native-svg normalises a `stroke`/`fill` into `{ type, payload }`,
 * where payload is the processed ARGB int — so a token is compared as that
 * int rather than as the `rgb(r g b)` string it was written as. Mirrors
 * `dashboardSmartTilesNP156.test.tsx`'s own copy of this helper.
 */
function svgColorInt(value: unknown): number | unknown {
  if (value && typeof value === "object" && "payload" in value) {
    return (value as { payload: number }).payload;
  }
  return value;
}

/** `"6 182 212"` → the packed ARGB int react-native-svg stores it as. */
function tokenArgb(triplet: string): number {
  const [r = 0, g = 0, b = 0] = triplet.split(" ").map(Number);
  return (((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0) as number;
}

describe("NP-298: GuidedFlow is a full-screen dark modal, not an inline light page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders inside a real Modal rather than a SafeAreaView", () => {
    const { getByTestId } = render(
      <GuidedFlow
        title="Reset"
        steps={[{ title: "Step one", body: "Body" }]}
        accentColor="rgb(6 182 212)"
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    const modal = getByTestId("guided-flow-screen");
    // A bare `Modal` floats above EVERYTHING on its own native window — the
    // header and tab bar behind it are not part of this tree at all, which is
    // how "no header/tab bar visible" is satisfied structurally rather than
    // by a style that could regress silently.
    expect(modal.type).toBe("Modal");
    expect(modal.props.visible).toBe(true);
  });

  it("paints the progress bar in the accent the caller passes, not a fixed colour", () => {
    const { getByTestId } = render(
      <GuidedFlow
        title="Reset"
        steps={[{ title: "A" }, { title: "B" }]}
        accentColor="rgb(236 72 153)"
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    expect(getByTestId("guided-flow-progress-0-fill").props.style).toEqual(
      expect.objectContaining({ backgroundColor: "rgb(236 72 153)" }),
    );
  });

  it("honours doneText on the completion screen", async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <GuidedFlow
        title="Reset"
        steps={[{ title: "Only step" }]}
        doneText="Enter"
        onComplete={onComplete}
        onExit={jest.fn()}
      />,
    );
    fireEvent.press(getByTestId("guided-flow-next"));
    await waitFor(() => {
      expect(getByTestId("guided-flow-done-text").props.children).toBe(
        "Enter",
      );
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});

describe("NP-298: mindAccentColor mirrors the web's per-tool ACCENTS map", () => {
  it("resolves a distinct colour for every Mind system, against the dark palette", () => {
    const dark = getTokens("dark");
    const expected: Record<string, string> = {
      "state-shift": `rgb(${dark["mind-cyan"]})`,
      "self-image": `rgb(${dark["mind-violet"]})`,
      mission: `rgb(${dark["mind-blue"]})`,
      vision: `rgb(${dark["mind-emerald"]})`,
      social: `rgb(${dark["mind-pink"]})`,
      discipline: `rgb(${dark.brand})`,
      "anti-sabotage": `rgb(${dark.orange})`,
    };
    for (const system of Object.keys(MIND_ACCENT_TOKEN)) {
      expect(mindAccentColor(system)).toBe(expected[system]);
    }
    // Not one shared colour for every tool — the exact bug the card names.
    const values = new Set(
      Object.keys(MIND_ACCENT_TOKEN).map((s) => mindAccentColor(s)),
    );
    expect(values.size).toBe(Object.keys(MIND_ACCENT_TOKEN).length);
  });

  it("falls back to self-image's violet for an unrecognised system, like the web's `?? '#8b5cf6'`", () => {
    expect(mindAccentColor("not-a-real-system")).toBe(
      mindAccentColor("self-image"),
    );
  });
});

describe("NP-298: the tool intro gate hands GuidedFlow the TOOL's accent, not one shared colour", () => {
  beforeEach(() => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/progress") {
        return {
          chapter: 1,
          unlockedSystems: ["state-shift", "self-image", "mission"],
          introducedSystems: [],
        };
      }
      return {};
    });
  });

  it("state-shift's intro progress bar is cyan, self-image's is violet — not both the generic amber accent", async () => {
    const cyan = render(
      <ToolIntroGate system="state-shift">
        <></>
      </ToolIntroGate>,
    );
    await waitFor(() =>
      expect(cyan.getByTestId("guided-flow-screen")).toBeTruthy(),
    );
    const cyanFill = cyan.getByTestId("guided-flow-progress-0-fill").props
      .style.backgroundColor;
    cyan.unmount();

    const violet = render(
      <ToolIntroGate system="self-image">
        <></>
      </ToolIntroGate>,
    );
    await waitFor(() =>
      expect(violet.getByTestId("guided-flow-screen")).toBeTruthy(),
    );
    const violetFill = violet.getByTestId("guided-flow-progress-0-fill").props
      .style.backgroundColor;

    expect(cyanFill).toBe(mindAccentColor("state-shift"));
    expect(violetFill).toBe(mindAccentColor("self-image"));
    expect(cyanFill).not.toBe(violetFill);
    // Neither is the old generic amber `colors.accent`.
    const amber = `rgb(${getTokens("dark").accent})`;
    expect(cyanFill).not.toBe(amber);
    expect(violetFill).not.toBe(amber);
  });
});

describe("NP-298: the breath player is a full-screen dark modal with a drawn progress ring", () => {
  beforeEach(() => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/progress") {
        return {
          chapter: 1,
          unlockedSystems: ["state-shift", "self-image", "mission"],
          introducedSystems: ["state-shift"],
        };
      }
      return {};
    });
  });

  it("opens the Physiological Sigh reset as a Modal with a cyan progress ring, not an inline plain circle", async () => {
    const { getByTestId } = render(<StateShiftDashboard />);

    await waitFor(() => {
      expect(getByTestId("state-shift-dashboard")).toBeTruthy();
    });

    fireEvent.press(getByTestId("mind-state-tile-stressed"));

    await waitFor(() => {
      expect(getByTestId("breath-session-screen")).toBeTruthy();
    });

    const modal = getByTestId("breath-session-screen");
    expect(modal.type).toBe("Modal");
    expect(modal.props.visible).toBe(true);

    const ring = getByTestId("breath-session-ring");
    expect(svgColorInt(ring.props.stroke)).toBe(
      tokenArgb(getTokens("dark")["mind-cyan"]),
    );
    // A ring draws an arc, not a static full circle — the dash array/offset
    // are the thing that makes it a PROGRESS ring rather than a plain border.
    expect(ring.props.strokeDasharray[0]).toBeGreaterThan(0);
    expect(typeof ring.props.strokeDashoffset).toBe("number");
  });
});
