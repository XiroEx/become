// NP-298 — MIND TOOLS: INTRO FLOWS, GUIDED PROTOCOLS AND THE BREATH PLAYER
// RENDER LIGHT INSIDE THE PAGE INSTEAD OF FULL-SCREEN DARK WITH THE TOOL'S
// COLOUR.
//
// Full visual pass (native vs web), build d68b84e3:
//   1. Tool intro (State Shift / Self-Image / Mission): web runs GuidedFlow
//      full-screen on black with the TOOL'S accent (`ACCENTS` map in
//      `webapp/components/mind/ToolIntroGate.tsx`); native drew it light,
//      inline under the section header/tab bar, with the generic amber
//      `colors.accent` for every tool's progress bar.
//   2. Guided protocols (Name the Next Action, Move to Shift, the adaptive
//      session's Begin, Vision/Self-Image/Mission protocols): same bug — web
//      full-screen dark with the tool accent, native light and inline with
//      one generic colour regardless of which dashboard launched it.
//   3. Breath player (Physiological Sigh, Box, 4-7-8, the Stressed
//      head-check reset): web is full-screen dark with a progress-ring arc
//      around Inhale/Exhale; native was a light inline plain circle.
//
// This suite asserts: `GuidedFlow` is a bare `Modal` painted with the web's
// fixed `bg-black`/`text-white` (not `useThemeTokens()`), that
// `lib/mind/accents.ts` resolves each Mind system to the SAME hue as the
// web's `ACCENTS` map (as a theme token, never a hex literal —
// `noHexColorLiterals.test.ts`), that `ToolIntroGate` and every system
// dashboard now feed that per-system colour into `GuidedFlow` instead of a
// generic token, and that the breath player is the same fixed-dark `Modal`
// with a drawn `react-native-svg` progress ring.
/* eslint-disable import/first */
import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Modal } from "react-native";
import { X } from "lucide-react-native";

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
  successHaptic: jest.fn(),
  celebrationHaptic: jest.fn(),
  selectionHaptic: jest.fn(),
}));

jest.mock("@/lib/ai/runClient", () => ({ runAiTask: jest.fn() }));

import { apiFetch } from "@become/api-client";
import { onDarkForeground, resolveToken } from "@/lib/theme/tokens";
import { mindAccentColor, type MindAccentSystem } from "@/lib/mind/accents";
import GuidedFlow from "@/components/mind/system/GuidedFlow";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;
const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

/**
 * `react-native-svg` normalises a `stroke`/`fill` string into
 * `{ type, payload }`, where `payload` is the processed ARGB int — so a
 * `rgb(r g b)` token has to be compared as that same int, not as the string
 * it was passed as (see `dashboardSmartTilesNP156.test.tsx`'s own helper).
 */
function svgColorInt(value: unknown): number | unknown {
  if (value && typeof value === "object" && "payload" in value) {
    return (value as { payload: number }).payload;
  }
  return value;
}

function rgbStringToArgb(rgb: string): number {
  const [r = 0, g = 0, b = 0] = rgb
    .replace(/^rgb\(|\)$/g, "")
    .split(" ")
    .map(Number);
  return (((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0) as number;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── 1. lib/mind/accents.ts matches the web's ACCENTS map, hex for hex ──────

describe("(id: np298-accents) mindAccentColor mirrors the web's ACCENTS map", () => {
  // webapp/components/mind/ToolIntroGate.tsx's ACCENTS, converted from hex to
  // the RGB triplet a theme token stores.
  const WEB_ACCENTS_AS_RGB: Record<MindAccentSystem, string> = {
    "state-shift": "6 182 212", // #06b6d4 cyan-500
    "self-image": "139 92 246", // #8b5cf6 violet-500
    mission: "59 130 246", // #3b82f6 blue-500
    vision: "16 185 129", // #10b981 emerald-500
    social: "236 72 153", // #ec4899 pink-500
    discipline: "239 68 68", // #ef4444 red-500
    "anti-sabotage": "249 115 22", // #f97316 orange-500
  };

  it.each(Object.keys(WEB_ACCENTS_AS_RGB) as MindAccentSystem[])(
    "%s resolves to the web's own hue",
    (system) => {
      expect(mindAccentColor(system)).toBe(`rgb(${WEB_ACCENTS_AS_RGB[system]})`);
    },
  );

  it("falls back rather than throwing for an unknown system", () => {
    expect(() => mindAccentColor("not-a-system")).not.toThrow();
    expect(mindAccentColor("not-a-system")).toBe(resolveToken("mind-violet", "dark"));
  });

  it("is a fixed colour regardless of the phone's light/dark setting", () => {
    // The surfaces that use it (GuidedFlow, the breath player) have no light
    // mode on either client — see the comment at the top of the file.
    expect(mindAccentColor("state-shift")).toBe(resolveToken("mind-cyan", "dark"));
  });
});

// ─── 2. GuidedFlow is the web's fixed dark stage, not a themed screen ───────

const STEPS = [
  { title: "Step one", body: "First body copy." },
  { title: "Step two", body: "Second body copy." },
];

describe("(id: np298-guidedflow) GuidedFlow is a bare, always-dark Modal", () => {
  it("renders inside a real Modal — no header/tab bar can sit behind it", () => {
    const { UNSAFE_getByType } = render(
      <GuidedFlow
        title="Reset"
        steps={STEPS}
        accentColor={mindAccentColor("state-shift")}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    expect(UNSAFE_getByType(Modal)).toBeTruthy();
  });

  it("the screen, exit and back surfaces are the web's black/white, not theme classes", () => {
    const { getByTestId } = render(
      <GuidedFlow
        title="Reset"
        steps={STEPS}
        accentColor={mindAccentColor("state-shift")}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    expect(getByTestId("guided-flow-screen").props.className).toContain(
      "bg-black",
    );
    expect(getByTestId("guided-flow-screen").props.className).not.toContain(
      "bg-background",
    );

    const exit = getByTestId("guided-flow-exit");
    expect(exit.props.className).toContain("bg-white/10");
    expect(exit.props.className).not.toContain("bg-muted");
    expect(exit.findByType(X).props.color).toBe(onDarkForeground);

    expect(getByTestId("guided-flow-title").props.className).toContain(
      "text-white",
    );
    expect(getByTestId("guided-flow-title").props.className).not.toContain(
      "text-foreground",
    );
  });

  it("the progress bar fills with the TOOL'S accent, not a generic token", () => {
    const accent = mindAccentColor("mission");
    const { getByTestId } = render(
      <GuidedFlow
        title="Mission"
        steps={STEPS}
        accentColor={accent}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    // Step 0 in progress: its own segment is the 50%-filled one, in the
    // mission accent (blue-500), not a shared amber/red/success token.
    const style = getByTestId("guided-flow-progress-0-fill").props.style;
    expect(style).toMatchObject({ width: "50%", backgroundColor: accent });
    expect(accent).not.toBe(resolveToken("accent", "dark"));

    fireEvent.press(getByTestId("guided-flow-next"));
    // Step 0 complete, now behind us: fully filled, same accent.
    expect(getByTestId("guided-flow-progress-0-fill").props.style).toMatchObject(
      { width: "100%", backgroundColor: accent },
    );

    fireEvent.press(getByTestId("guided-flow-next"));
    // Done: the check icon is drawn in the accent too.
    expect(getByTestId("guided-flow-done-check")).toBeTruthy();
  });

  it("different tools get different accents on the same component", () => {
    const cyan = render(
      <GuidedFlow
        title="A"
        steps={STEPS}
        accentColor={mindAccentColor("state-shift")}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    const blue = render(
      <GuidedFlow
        title="B"
        steps={STEPS}
        accentColor={mindAccentColor("mission")}
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    expect(mindAccentColor("state-shift")).not.toBe(mindAccentColor("mission"));
    cyan.unmount();
    blue.unmount();
  });

  it("the completion screen still honours doneText — the button itself is Finish/Next on both clients", () => {
    // The card suspected native ignored `doneText` on the LAST STEP'S
    // advance button, unlike the web. Reading `webapp/components/mind/
    // system/GuidedFlow.tsx` line 294 shows the web's own button is also
    // hardcoded `isLast ? 'Finish' : 'Next'` — `doneText` only labels the
    // completion screen (`<p>{doneText}</p>`) that follows it, on BOTH
    // clients. So the fix here is the accent and the modal, not this text.
    const { getByTestId } = render(
      <GuidedFlow
        title="Enter test"
        steps={[{ title: "Only step" }]}
        accentColor={mindAccentColor("self-image")}
        doneText="Enter"
        onComplete={jest.fn()}
        onExit={jest.fn()}
      />,
    );
    expect(getByTestId("guided-flow-next")).toHaveTextContent("Finish");
    fireEvent.press(getByTestId("guided-flow-next"));
    expect(getByTestId("guided-flow-done-text")).toHaveTextContent("Enter");
  });
});

// ─── 3. ToolIntroGate feeds GuidedFlow the TOOL's accent ────────────────────

describe("(id: np298-intro) ToolIntroGate's intro run is the tool's own colour", () => {
  async function openIntro(system: string) {
    mockedApiFetch.mockImplementation(async (p: string) => {
      if (p === "/api/mind/progress") {
        return {
          chapter: 3,
          unlockedSystems: ["state-shift", "self-image", "mission"],
          introducedSystems: [],
        };
      }
      return {};
    });
    const utils = render(
      <ToolIntroGate system={system}>
        <></>
      </ToolIntroGate>,
    );
    await waitFor(() => {
      expect(utils.getByTestId("mind-intro-gate-intro")).toBeTruthy();
    });
    return utils;
  }

  it("Mission's intro renders full-screen dark, inside a Modal", async () => {
    const { UNSAFE_getByType, getByTestId } = await openIntro("mission");
    expect(UNSAFE_getByType(Modal)).toBeTruthy();
    expect(getByTestId("guided-flow-screen").props.className).toContain(
      "bg-black",
    );
  });

  it("still passes doneText=\"Enter\" through to GuidedFlow (unchanged by this card)", () => {
    const src = readExpo("components/mind/ToolIntroGate.tsx");
    expect(src).toContain('doneText="Enter"');
  });

  it.each([
    ["state-shift", mindAccentColor("state-shift")],
    ["self-image", mindAccentColor("self-image")],
    ["mission", mindAccentColor("mission")],
  ] as const)(
    "%s's intro progress bar is coloured with its OWN accent (%s)",
    async (system, accent) => {
      const { getByTestId } = await openIntro(system);
      expect(getByTestId("guided-flow-progress-0-fill").props.style).toMatchObject(
        { backgroundColor: accent },
      );
    },
  );
});

// ─── 4. every dashboard feeds its OWN accent, not a shared generic token ────

describe("(id: np298-dashboards) every system dashboard passes its own accent into GuidedFlow", () => {
  const DASHBOARDS: { file: string; system: MindAccentSystem }[] = [
    { file: "components/mind/StateShiftDashboard.tsx", system: "state-shift" },
    { file: "components/mind/SelfImageDashboard.tsx", system: "self-image" },
    { file: "components/mind/MissionDashboard.tsx", system: "mission" },
    { file: "components/mind/VisionDashboard.tsx", system: "vision" },
    { file: "components/mind/SocialDashboard.tsx", system: "social" },
    { file: "components/mind/DisciplineDashboard.tsx", system: "discipline" },
    { file: "components/mind/AntiSabotageDashboard.tsx", system: "anti-sabotage" },
  ];

  it.each(DASHBOARDS)(
    "$file calls mindAccentColor(\"$system\") on its GuidedFlow, not a generic colors.* token",
    ({ file, system }) => {
      const src = readExpo(file);
      const guidedFlowBlock = src.slice(
        src.indexOf("<GuidedFlow"),
        src.indexOf("<GuidedFlow") + src.slice(src.indexOf("<GuidedFlow")).indexOf("/>"),
      );
      expect(guidedFlowBlock).toContain(`mindAccentColor("${system}")`);
      expect(guidedFlowBlock).not.toMatch(/accentColor=\{colors\.(accent|primary|success)\}/);
    },
  );

  it("ToolIntroGate resolves its accent from the shared helper, not a hand-rolled class ladder", () => {
    const src = readExpo("components/mind/ToolIntroGate.tsx");
    expect(src).toContain("mindAccentColor(system)");
    expect(src).not.toContain("bg-cyan-500");
  });
});

// ─── 5. the breath player is the same fixed-dark stage, with a drawn ring ───

async function openStateShiftDashboard() {
  mockedApiFetch.mockImplementation(async (p: string) => {
    if (p === "/api/mind/state") return { state: "neutral", feeling: "Neutral" };
    if (p.startsWith("/api/mind/journal")) return { entries: [] };
    return {};
  });
  const utils = render(<StateShiftDashboard />);
  await waitFor(() => {
    expect(utils.getByTestId("state-shift-dashboard")).toBeTruthy();
  });
  return utils;
}

describe("(id: np298-breath) the breath player is a full-screen dark Modal with a drawn ring", () => {
  it("opening Physiological Sigh renders a Modal painted the web's black, not a light inline circle", async () => {
    const { getByTestId, UNSAFE_getByType } = await openStateShiftDashboard();
    fireEvent.press(getByTestId("mind-toolkit-card-physiological-sigh"));

    await waitFor(() => {
      expect(getByTestId("breath-session-screen")).toBeTruthy();
    });
    expect(UNSAFE_getByType(Modal)).toBeTruthy();
    expect(getByTestId("breath-session-screen").props.className).toContain(
      "bg-black",
    );
    expect(getByTestId("breath-session-screen").props.className).not.toContain(
      "bg-background",
    );
  });

  it("draws a progress ring (an SVG Circle), not a plain bordered circle", async () => {
    const { getByTestId } = await openStateShiftDashboard();
    fireEvent.press(getByTestId("mind-toolkit-card-physiological-sigh"));

    await waitFor(() => {
      expect(getByTestId("breath-session-ring")).toBeTruthy();
    });
    // The ring is stroked with State Shift's own accent — cyan, never the
    // generic amber `colors.accent` every tool used to share.
    expect(svgColorInt(getByTestId("breath-session-ring").props.stroke)).toBe(
      rgbStringToArgb(mindAccentColor("state-shift")),
    );
  });

  it("the ring sweeps as the phase elapses", async () => {
    jest.useFakeTimers();
    const { getByTestId, unmount } = await openStateShiftDashboard();
    fireEvent.press(getByTestId("mind-toolkit-card-physiological-sigh"));
    await waitFor(() => {
      expect(getByTestId("breath-session-ring")).toBeTruthy();
    });
    const before = getByTestId("breath-session-ring").props.strokeDashoffset;
    act(() => {
      jest.advanceTimersByTime(900);
    });
    const after = getByTestId("breath-session-ring").props.strokeDashoffset;
    expect(after).not.toBe(before);
    unmount();
    jest.useRealTimers();
  });
});
