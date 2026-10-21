// CARD: "The mind set daily session need to be in black like how they are on
// web app. The white background needs to turn back to black."
//
// The attached screenshot is the state-check scene ("Where are you right
// now?" — the FIRST move of every Mind daily session) with a white card grid
// under the session player's black top bar. The web's equivalent
// (`webapp/components/mind/session/scenes/StateCheckScene.tsx`) has no
// surface of its own — it renders straight onto the player's fixed
// `bg-black text-white` stage and never reads `prefers-color-scheme`. Native
// drew the same scene from `useThemeTokens()` (NP-098/123's deliberate,
// system-following design for scenes used elsewhere), which is exactly what
// put a white grid on a light-mode phone, directly under the player's own
// forced-black chrome (NP-297).
//
// This scene is now pinned to the dark palette itself (`resolveToken(name,
// "dark")`, never the hook), on BOTH system schemes, matching the web.
/* eslint-disable import/first */
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Heart } from "lucide-react-native";

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

import { apiFetch } from "@become/api-client";
import type { Move } from "@become/core";
import { StateCheckScene } from "@/components/mind/session/scenes/StateCheckScene";
import { resolveToken } from "@/lib/theme/tokens";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const MOVE: Move = {
  id: "state-check",
  kind: "state-check",
  title: "Where are you right now?",
  subtitle: "One honest tap.",
  xp: 10,
};

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("(id: mind-state-check-dark-stage) the opening check-in is black-on-white regardless of the system scheme", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    // No recent check-in → the full 20-feeling grid (what the screenshot shows).
    mockApiFetch.mockResolvedValue({ logs: [], todayMood: null });
  });

  it.each(["light", "dark"] as const)(
    "%s system scheme: the grid's own surfaces are the web's literal black, not a themed card",
    async (mode) => {
      setSystemScheme(mode);
      const { getByTestId } = render(
        <StateCheckScene move={MOVE} onDone={jest.fn()} onState={jest.fn()} />,
      );
      await flush();

      const grid = getByTestId("mind-state-check-grid");
      expect(grid.props.className).toContain("bg-black");
      expect(grid.props.className).not.toContain("bg-background");

      const title = getByTestId("mind-state-check-grid").findByProps({
        children: "Where are you right now?",
      });
      expect(title.props.className).toContain("text-white");
      expect(title.props.className).not.toContain("text-foreground");

      const tile = getByTestId("mind-state-check-feeling-grateful");
      expect(tile.props.className).toContain("bg-white/5");
      expect(tile.props.className).not.toContain("bg-card");
      expect(tile.props.className).not.toContain("border-border");
    },
  );

  it("a chosen feeling's icon is the web's fixed hue, the same in both system schemes", async () => {
    setSystemScheme("light");
    const { getByTestId } = render(
      <StateCheckScene move={MOVE} onDone={jest.fn()} onState={jest.fn()} />,
    );
    await flush();

    const icon = getByTestId(
      "mind-state-check-feeling-grateful",
    ).findByType(Heart);
    expect(icon.props.color).toBe(resolveToken("success", "dark"));
  });

  it("the reveal and the Continue CTA stay the web's black stage with a white button", async () => {
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/state" && method === "GET") {
        return Promise.resolve({ logs: [], todayMood: null });
      }
      if (clean === "/api/mind/state" && method === "POST") {
        return Promise.resolve({ recommendation: { message: "Noted." } });
      }
      return Promise.resolve({});
    });
    setSystemScheme("light");
    const onDone = jest.fn();
    const { getByTestId } = render(
      <StateCheckScene move={MOVE} onDone={onDone} onState={jest.fn()} />,
    );
    await flush();
    fireEvent.press(getByTestId("mind-state-check-feeling-grateful"));
    await flush();

    const reveal = getByTestId("mind-state-check-reveal");
    expect(reveal.props.className).toContain("bg-black");

    const cta = getByTestId("mind-state-check-continue");
    expect(cta.props.className).toContain("bg-white");
    expect(cta.props.className).not.toContain("bg-primary");

    fireEvent.press(cta);
    expect(onDone).toHaveBeenCalled();
  });
});
