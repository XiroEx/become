// NP-299 — MIND SECTION DASHBOARDS: ICONS ORANGE INSTEAD OF EACH TOOL'S
// COLOUR, TRACK RECORD COPY, LOCKED TOOLS SHOW A LOCK PAGE.
//
// Full visual pass (native vs web), build d68b84e3:
//   1. Accent colour: web colours each tool's icons in its own hue (State
//      Shift cyan, Self-Image violet, Mission blue). Native drew the
//      breathwork/reset-protocol row icons, the adaptive-session sparkle,
//      the "Define your mission" compass and the State Shift Training
//      Grounds tile icon in the generic amber `colors.accent` (reads as
//      orange) instead.
//   2. Track record row: web "State Shift unlocked" / "intro · today";
//      native said "Intro completed · today" (same bug on Self-Image and
//      Mission) because native's `KIND_LABEL` had an `intro` entry the web's
//      map doesn't.
//   3. Locked tools (Discipline/Anti-Sabotage/Social on a chapter-2 member):
//      web's `/dashboard/mind/<tool>` bounces back to the Mind hub; native
//      rendered a dedicated "<Tool> is Locked / Unlocks in Chapter N / Back
//      to Mind" page instead.
//
// This suite asserts each dashboard's icons resolve to `mindAccentColor`,
// never `colors.accent`; that an "intro"-kind track-record entry's subtitle
// reads "intro · <when>" like the web; and that `ToolIntroGate` redirects to
// the Mind hub for a locked system instead of rendering a locked screen.
/* eslint-disable import/first */
import { render, waitFor, within } from "@testing-library/react-native";
import {
  Compass,
  Eye,
  Fingerprint,
  Focus,
  Search,
  Skull,
  Sparkles,
  Timer,
  Waves,
  Wind,
} from "lucide-react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
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

let mockEntitlementsState = {
  data: { enforced: false, features: {} } as any,
  feature: (_f: string) => null as any,
};
jest.mock("@/lib/entitlements", () => ({
  useEntitlements: () => mockEntitlementsState,
}));

import { apiFetch } from "@become/api-client";
import { mindAccentColor } from "@/lib/mind/accents";
import StateShiftDashboard from "@/components/mind/StateShiftDashboard";
import SelfImageDashboard from "@/components/mind/SelfImageDashboard";
import MissionDashboard from "@/components/mind/MissionDashboard";
import TrainingGrounds from "@/components/mind/TrainingGrounds";
import { TrackRecord, type TrackRecordEntry } from "@/components/mind/system/SystemDashboard";
import ToolIntroGate from "@/components/mind/ToolIntroGate";
import { Text } from "@/components/Text";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockReplace.mockReset();
  mockEntitlementsState = {
    data: { enforced: false, features: {} },
    feature: () => null,
  };
});

// ─── 1. Each dashboard's icons are the tool's own hue, not amber ────────────

describe("(id: np299-state-shift-accent) StateShiftDashboard's icons are cyan, never the generic accent", () => {
  async function open() {
    mockedApiFetch.mockImplementation(async (p: string) => {
      if (p.startsWith("/api/mind/journal")) return { entries: [] };
      return {};
    });
    const utils = render(<StateShiftDashboard />);
    await waitFor(() => {
      expect(utils.getByTestId("state-shift-dashboard")).toBeTruthy();
    });
    return utils;
  }

  it("the hero icon resolves to mindAccentColor(\"state-shift\")", async () => {
    const { getByTestId } = await open();
    const hero = getByTestId("mind-system-hero");
    expect(hero.findByType(Wind).props.color).toBe(
      mindAccentColor("state-shift"),
    );
  });

  it("a state-check tile icon resolves to the cyan accent", async () => {
    const { getByTestId } = await open();
    const tile = getByTestId("mind-state-tile-stressed");
    expect(tile.findByType(Waves).props.color).toBe(
      mindAccentColor("state-shift"),
    );
  });

  it("the Focus mode Timer icon resolves to the cyan accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-focus-mode").findByType(Timer).props.color,
    ).toBe(mindAccentColor("state-shift"));
  });

  it("the adaptive-session sparkle resolves to the cyan accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-adaptive-session").findByType(Sparkles).props.color,
    ).toBe(mindAccentColor("state-shift"));
  });

  it("a breathwork toolkit card icon resolves to the cyan accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-toolkit-card-physiological-sigh").findByType(Wind)
        .props.color,
    ).toBe(mindAccentColor("state-shift"));
  });

  it("a reset-protocol toolkit card icon resolves to the cyan accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-toolkit-card-name-the-next-action").findByType(Focus)
        .props.color,
    ).toBe(mindAccentColor("state-shift"));
  });
});

describe("(id: np299-self-image-accent) SelfImageDashboard's icons are violet, never the generic accent", () => {
  async function open() {
    mockedApiFetch.mockImplementation(async (p: string) => {
      if (p.startsWith("/api/mind/journal")) return { entries: [] };
      return {};
    });
    const utils = render(<SelfImageDashboard />);
    await waitFor(() => {
      expect(utils.getByTestId("self-image-dashboard")).toBeTruthy();
    });
    return utils;
  }

  it("the hero icon resolves to mindAccentColor(\"self-image\")", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-system-hero").findByType(Fingerprint).props.color,
    ).toBe(mindAccentColor("self-image"));
  });

  it("the \"Define who you're becoming\" icon resolves to the violet accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("self-image-define-button").findByType(Fingerprint).props
        .color,
    ).toBe(mindAccentColor("self-image"));
  });

  it("the adaptive-session sparkle resolves to the violet accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-adaptive-session").findByType(Sparkles).props.color,
    ).toBe(mindAccentColor("self-image"));
  });

  it("an identity-protocol toolkit card icon resolves to the violet accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-toolkit-card-kill-the-old-version").findByType(Skull)
        .props.color,
    ).toBe(mindAccentColor("self-image"));
  });
});

describe("(id: np299-mission-accent) MissionDashboard's icons are blue, never the generic accent", () => {
  async function open() {
    mockedApiFetch.mockImplementation(async (p: string) => {
      if (p.startsWith("/api/mind/journal")) return { entries: [] };
      return {};
    });
    const utils = render(<MissionDashboard />);
    await waitFor(() => {
      expect(utils.getByTestId("mission-dashboard")).toBeTruthy();
    });
    return utils;
  }

  it("the hero icon resolves to mindAccentColor(\"mission\")", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-system-hero").findByType(Compass).props.color,
    ).toBe(mindAccentColor("mission"));
  });

  it("the \"Define your mission\" compass resolves to the blue accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mission-define-button").findByType(Compass).props.color,
    ).toBe(mindAccentColor("mission"));
  });

  it("the adaptive-session sparkle resolves to the blue accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-adaptive-session").findByType(Sparkles).props.color,
    ).toBe(mindAccentColor("mission"));
  });

  it("a mission-protocol toolkit card icon resolves to the blue accent", async () => {
    const { getByTestId } = await open();
    expect(
      getByTestId("mind-toolkit-card-find-your-why").findByType(Search).props
        .color,
    ).toBe(mindAccentColor("mission"));
  });
});

// ─── 2. TrainingGrounds tiles are MATCHED to each dashboard's own hue ───────

describe("(id: np299-training-grounds) TrainingGrounds tile icons match each dashboard's own accent", () => {
  it("state-shift, self-image, mission and social tiles use mindAccentColor, not the generic accent", () => {
    const { getByTestId } = render(
      <TrainingGrounds
        unlocked={["state-shift", "self-image", "mission", "social"]}
      />,
    );
    expect(
      getByTestId("mind-system-tile-state-shift").findByType(Wind).props
        .color,
    ).toBe(mindAccentColor("state-shift"));
    expect(
      getByTestId("mind-system-tile-self-image").findByType(Eye).props
        .color,
    ).toBe(mindAccentColor("self-image"));
  });
});

// ─── 3. Track record copy matches the web's literal "intro" kind label ─────

describe("(id: np299-track-record) TrackRecord's intro-kind subtitle matches the web's literal kind, not a prettified label", () => {
  it("renders \"intro · today\", never \"Intro completed · today\"", () => {
    const entries: TrackRecordEntry[] = [
      {
        id: "1",
        title: "State Shift unlocked",
        kind: "intro",
        createdAt: new Date().toISOString(),
      },
    ];
    const { getByTestId } = render(<TrackRecord entries={entries} />);
    const row = getByTestId("mind-track-record-entry-1");
    expect(within(row).getByText("State Shift unlocked")).toBeTruthy();
    expect(within(row).getByText(/intro · today/)).toBeTruthy();
    expect(within(row).queryByText(/Intro completed/)).toBeNull();
  });
});

// ─── 4. Locked tools bounce to the Mind hub, never a dedicated lock page ────

describe("(id: np299-locked-redirect) ToolIntroGate bounces a locked system to the Mind hub", () => {
  it("replaces the route to /(tabs)/mind and never renders a locked screen or the children", async () => {
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

    const { queryByTestId } = render(
      <ToolIntroGate system="discipline">
        <Text testID="unlocked-content">Content</Text>
      </ToolIntroGate>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/mind");
    });

    expect(queryByTestId("mind-system-locked")).toBeNull();
    expect(queryByTestId("unlocked-content")).toBeNull();
  });

  it("an unlocked, already-introduced system renders straight to its children", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/mind/progress") {
        return {
          chapter: 1,
          unlockedSystems: ["state-shift"],
          introducedSystems: ["state-shift"],
        };
      }
      return {};
    });

    const { getByTestId } = render(
      <ToolIntroGate system="state-shift">
        <Text testID="unlocked-content">Content</Text>
      </ToolIntroGate>,
    );

    await waitFor(() => {
      expect(getByTestId("unlocked-content")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
