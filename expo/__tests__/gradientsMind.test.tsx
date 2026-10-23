// The Mind area's web gradients: the scenes' finishing check badges
// (`bg-gradient-to-br from-X to-Y` circles), Social's committed button,
// and the daily-drop card's `from-zinc-50 to-white` wash.
// Screens: `components/mind/session/scenes/*`, `components/mind/system/SystemDashboard.tsx`.

import { act, fireEvent, render } from "@testing-library/react-native";
import { Sparkles } from "lucide-react-native";
import type { Move } from "@become/core";
import {
  DONE_BADGE_GRADIENTS,
  DoneBadge,
  type DoneBadgeTone,
} from "@/components/mind/session/scenes/DoneBadge";
import { SocialScene } from "@/components/mind/session/scenes/SocialScene";
import { DailyDrop } from "@/components/mind/system/SystemDashboard";
import { darkTokens, lightTokens, webGradientTokens } from "@/lib/theme/tokens";

const rgb = (triplet: string) => `rgb(${triplet})`;

describe("Mind scene done badges", () => {
  it("each tone carries the web's two stops, top-left to bottom-right", () => {
    const expected: Record<DoneBadgeTone, [string, string]> = {
      contrast: [rgb(darkTokens["mind-emerald"]), rgb(darkTokens["mind-green"])],
      violet: [rgb(darkTokens["mind-violet"]), rgb(darkTokens["mind-green"])],
      challenge: [rgb(webGradientTokens.red500), rgb(webGradientTokens.amber500)],
      assemble: [rgb(webGradientTokens.sky500), rgb(darkTokens["mind-green"])],
      win: [rgb(webGradientTokens.amber500), rgb(darkTokens["mind-green"])],
    };
    for (const tone of Object.keys(DONE_BADGE_GRADIENTS) as DoneBadgeTone[]) {
      const { getByTestId, unmount } = render(
        <DoneBadge tone={tone} testID={`badge-${tone}`} />,
      );
      const g = getByTestId(`badge-${tone}`);
      expect(g.props.colors).toEqual(expected[tone]);
      expect(g.props.start).toEqual({ x: 0, y: 0 });
      expect(g.props.end).toEqual({ x: 1, y: 1 });
      unmount();
    }
  });
});

describe("SocialScene committed button", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("paints emerald-500 → green-500 once committed, and not before", async () => {
    const move: Move = { id: "m-soc", kind: "social", title: "Pull someone in", xp: 5 };
    const { getByTestId, queryByTestId } = render(
      <SocialScene move={move} onDone={jest.fn()} />,
    );
    expect(queryByTestId("mind-social-scene-commit-gradient")).toBeNull();

    fireEvent.press(getByTestId("mind-social-scene-commit"));
    await act(async () => {
      await Promise.resolve();
    });

    const g = getByTestId("mind-social-scene-commit-gradient");
    expect(g.props.colors).toEqual([
      rgb(darkTokens["mind-emerald"]),
      rgb(darkTokens["mind-green"]),
    ]);
    expect(g.props.end).toEqual({ x: 1, y: 0 });
  });
});

describe("DailyDrop wash", () => {
  it("light: zinc-50 (background) → white (card)", () => {
    const { getByTestId } = render(
      <DailyDrop
        Icon={Sparkles}
        eyebrow="Today"
        title="Reset"
        blurb="Two minutes"
        ctaLabel="Go"
        onClick={() => {}}
        colorClass="text-foreground"
      />,
    );
    const g = getByTestId("mind-daily-drop-gradient");
    expect(g.props.colors).toEqual([
      rgb(lightTokens.background),
      rgb(lightTokens.card),
    ]);
    expect(g.props.start).toEqual({ x: 0, y: 0 });
    expect(g.props.end).toEqual({ x: 1, y: 1 });
  });
});
