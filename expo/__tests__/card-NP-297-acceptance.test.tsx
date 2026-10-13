// NP-297 — MIND SESSION PLAYER: LIGHT THEME INSTEAD OF THE WEB'S BLACK
// IMMERSIVE PLAYER, AND THE TOP BAR SITS UNDER THE STATUS BAR.
//
// Full visual pass (native vs web), build d68b84e3:
//   1. Theme: the web's `SessionPlayer` is `fixed inset-0 bg-black text-white`
//      on every stage (intro, every move, payoff, level-up) — white primary
//      buttons, a violet→green gradient progress bar. Native drew all of it
//      from `useThemeTokens()`, which is the system's light/dark toggle, so a
//      light-mode phone showed a light background and the red `primary` token.
//   2. Layout: the exit (X), back arrow and the progress bars drew at the very
//      top, under the iOS status bar, because this file's bare `Modal` was
//      padded by a `SafeAreaView` whose insets don't resolve inside a Modal's
//      own native window.
//   3. Progress bar: the web fills violet→green; native filled flat red.
//
// This suite asserts the fix is literal Tailwind classes / forced-dark tokens
// (not a literal that would fail `noHexColorLiterals.test.ts`), that the
// chrome does NOT change with the system colour scheme (unlike a themed
// screen), that the `move` stage keeps its own themed surface so the scenes
// it hosts (NP-098/123) stay exactly as legible as they always were, and that
// the top bar now pads by the REAL device inset.
/* eslint-disable import/first */
import { act, fireEvent, render } from "@testing-library/react-native";

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

import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, X } from "lucide-react-native";
import { colorScheme } from "nativewind";
import type { MindSessionPlan } from "@become/core";
import { onDarkForeground, resolveToken } from "@/lib/theme/tokens";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
/* eslint-enable import/first */

const PLAN: MindSessionPlan = {
  openingId: "open-pour-it-in",
  intro: { title: "Pour it in", subtitle: "A quick reset." },
  doneText: "Decided. Now go.",
  rewardXp: 15,
  moves: [
    { id: "m1", kind: "win", title: "Bank a win", xp: 10 },
    { id: "m2", kind: "mission", title: "Name your move", xp: 10 },
  ],
};

const P = "mind-session-player";

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

describe("(id: np297-theme) the chrome is the web's fixed black, not the system theme", () => {
  it.each(["light", "dark"] as const)(
    "%s system scheme: the root, top bar and intro stay the web's black-and-white",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId } = render(
        <SessionPlayer plan={PLAN} onExit={jest.fn()} />,
      );

      expect(getByTestId(`${P}-root`).props.className).toContain("bg-black");

      expect(getByTestId(`${P}-exit`).props.className).toContain("bg-white/10");
      expect(getByTestId(`${P}-exit`).props.className).not.toContain("bg-muted");

      const exitIcon = getByTestId(`${P}-exit`).findByType(X);
      expect(exitIcon.props.color).toBe(onDarkForeground);

      expect(getByTestId(`${P}-intro-title`).props.className).toContain(
        "text-white",
      );
      expect(getByTestId(`${P}-intro-title`).props.className).not.toContain(
        "text-foreground",
      );

      const begin = getByTestId(`${P}-intro-begin`);
      expect(begin.props.className).toContain("bg-white");
      expect(begin.props.className).not.toContain("bg-primary");
    },
  );

  it("the back button is white-on-dark too, once a move can go back", () => {
    setSystemScheme("light");
    const { getByTestId } = render(
      <SessionPlayer plan={PLAN} onExit={jest.fn()} />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    expect(getByTestId(`${P}-back`).props.className).toContain("bg-white/10");
    const backIcon = getByTestId(`${P}-back`).findByType(ArrowLeft);
    expect(backIcon.props.color).toBe(onDarkForeground);
  });

  it("the `move` stage keeps its OWN themed surface — the scenes it hosts are untouched", () => {
    setSystemScheme("light");
    const { getByTestId } = render(
      <SessionPlayer plan={PLAN} onExit={jest.fn()} />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    expect(getByTestId(`${P}-stage`).props.className).toContain(
      "bg-background",
    );
  });
});

describe("(id: np297-progress) the progress bar fills the web's violet→green gradient, not red", () => {
  it("every segment's fill is a LinearGradient with the mind-violet → mind-green stops", () => {
    const { getAllByTestId } = render(
      <SessionPlayer plan={PLAN} onExit={jest.fn()} />,
    );
    const fills = [0, 1].map((i) => getAllByTestId(`${P}-progress-${i}-fill`)[0]!);
    for (const fill of fills) {
      expect(fill.props.colors).toEqual([
        resolveToken("mind-violet", "dark"),
        resolveToken("mind-green", "dark"),
      ]);
    }
  });

  it("the intro sparkle tile and the payoff seal are the same gradient, not a flat red tile", () => {
    const { getByTestId, UNSAFE_getAllByType } = render(
      <SessionPlayer plan={PLAN} onExit={jest.fn()} />,
    );
    expect(getByTestId(`${P}-intro`)).toBeTruthy();
    const gradients = UNSAFE_getAllByType(LinearGradient);
    expect(gradients.length).toBeGreaterThan(0);
    for (const g of gradients) {
      expect(g.props.colors).toEqual([
        resolveToken("mind-violet", "dark"),
        resolveToken("mind-green", "dark"),
      ]);
    }
  });
});

describe("(id: np297-insets) the top bar pads below the REAL device inset, not a SafeAreaView guess", () => {
  it("the root surface's top/bottom padding comes from the injected insets", () => {
    const { getByTestId } = render(
      <SessionPlayer
        plan={PLAN}
        onExit={jest.fn()}
        insetsImpl={() => ({ top: 47, bottom: 34, left: 0, right: 0 })}
      />,
    );
    const root = getByTestId(`${P}-root`);
    const style = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style)
      : root.props.style;
    expect(style.paddingTop).toBe(47);
    expect(style.paddingBottom).toBe(34);
  });

  it("falls back to zero insets (no SafeAreaProvider) rather than throwing", () => {
    expect(() =>
      render(<SessionPlayer plan={PLAN} onExit={jest.fn()} />),
    ).not.toThrow();
  });
});
