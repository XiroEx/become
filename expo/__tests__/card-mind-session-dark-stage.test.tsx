/* eslint-disable import/first */
// CARD: "Daily Mindset sessions need to have a black background in all parts
// of that session instead of a white background."
//
// The attached screenshot is the win scene ("Bank what you already did") with
// a WHITE body under the session player's black top bar. The web's whole
// session (`webapp/components/mind/session/SessionPlayer.tsx`) is one fixed
// `bg-black text-white` stage — intro, every move, payoff, level-up — and no
// scene reads `prefers-color-scheme`. Native drew each scene from
// `useThemeTokens()` (the system light/dark setting), which is exactly what
// painted every move white on a light-mode phone under the player's own
// forced-black chrome (NP-297).
//
// Every scene is now pinned to the dark palette (`resolveToken(name, "dark")`
// for RN colour props, literal dark Tailwind classes for surfaces), mirroring
// the web scene for scene. This test renders each scene on the LIGHT system
// scheme and asserts the dark surfaces — the bug only shows there.
import { act, fireEvent, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { View } from "react-native";

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
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import { AssembleScene } from "@/components/mind/session/scenes/AssembleScene";
import { BreathScene } from "@/components/mind/session/scenes/BreathScene";
import { ChallengeScene } from "@/components/mind/session/scenes/ChallengeScene";
import { ChoiceScene } from "@/components/mind/session/scenes/ChoiceScene";
import { ComposeScene } from "@/components/mind/session/scenes/ComposeScene";
import { ContrastScene } from "@/components/mind/session/scenes/ContrastScene";
import { HoldToAffirmScene } from "@/components/mind/session/scenes/HoldToAffirmScene";
import { IdentityScene } from "@/components/mind/session/scenes/IdentityScene";
import { MissionScene } from "@/components/mind/session/scenes/MissionScene";
import { MirrorScene } from "@/components/mind/session/scenes/MirrorScene";
import { PatternScene } from "@/components/mind/session/scenes/PatternScene";
import { SocialScene } from "@/components/mind/session/scenes/SocialScene";
import { SpeakScene } from "@/components/mind/session/scenes/SpeakScene";
import { TypeScene } from "@/components/mind/session/scenes/TypeScene";
import { VisionScene } from "@/components/mind/session/scenes/VisionScene";
import { WinScene } from "@/components/mind/session/scenes/WinScene";
import { WriteAffirm } from "@/components/mind/session/scenes/WriteAffirm";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

/** No themed surface may survive on the black stage. */
const THEMED = [
  "bg-background",
  "bg-card",
  "bg-muted",
  "bg-primary",
  "text-foreground",
  "text-muted-foreground",
  "text-primary-foreground",
  "border-border",
];

function expectDark(className: unknown): void {
  const cls = String(className ?? "");
  for (const t of THEMED) expect(cls).not.toContain(t);
}

const GRANTED = { status: "granted", granted: true, canAskAgain: true, expires: "never" };

function mockCamera() {
  const requestPermission = jest.fn(async () => GRANTED);
  const permissionImpl = jest.fn(() => [GRANTED, requestPermission]) as any;
  const CameraStub = ({ testID }: any) => <View testID={testID ?? "mock-camera-view"} />;
  return { permissionImpl, CameraStub };
}

describe("(id: mind-session-dark-stage) every Mindset session part is black on a light-mode phone", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/discipline" && method === "GET") {
        return Promise.resolve({
          challenge: { _id: "ch-1", date: "2026-10-01", challenge: "Take the stairs", completed: false },
        });
      }
      if (clean === "/api/mind/vision" && method === "GET") {
        return Promise.resolve({ vision: null, alignment: { avg7: 0, entries7: 0, checkedToday: false } });
      }
      return Promise.resolve({});
    });
    setSystemScheme("light");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("win scene: the screenshot's scene is black with a white CTA", async () => {
    const move: Move = { id: "m-win", kind: "win", title: "Bank what you already did", prompt: "Who did you help today?", xp: 5 };
    const { getByTestId } = render(<WinScene move={move} onDone={jest.fn()} />);
    await flush();
    expect(getByTestId("mind-win-scene").props.className).toContain("bg-black");
    const title = getByTestId("mind-win-scene-title");
    expect(title.props.className).toContain("text-white");
    expectDark(title.props.className);
    const cta = getByTestId("mind-win-scene-bank-it");
    expect(cta.props.className).toContain("bg-white");
    expectDark(cta.props.className);
  });

  it("choice scene: options are white-on-dark cards, CTA is white", async () => {
    const move: Move = {
      id: "m-choice", kind: "choice", title: "Where is your attention?",
      options: [{ label: "On what I control", response: "Leverage." }], xp: 5,
    };
    const { getByTestId } = render(<ChoiceScene move={move} onDone={jest.fn()} />);
    await flush();
    expect(getByTestId("mind-choice-scene").props.className).toContain("bg-black");
    const title = getByTestId("mind-choice-scene-title");
    expect(title.props.className).toContain("text-white");
    expectDark(title.props.className);
    const opt = getByTestId("mind-choice-scene-option-0");
    expect(opt.props.className).toContain("bg-white/5");
    expect(opt.props.className).toContain("border-white/10");
    expectDark(opt.props.className);
  });

  it("type scene: input and target are dark", async () => {
    const move: Move = { id: "m-type", kind: "type", title: "In your own hand", statement: "I do the work.", xp: 5 };
    const { getByTestId } = render(<TypeScene move={move} onDone={jest.fn()} />);
    await flush();
    expect(getByTestId("mind-type-scene").props.className).toContain("bg-black");
    const input = getByTestId("mind-type-scene-input");
    expect(input.props.className).toContain("bg-white/5");
    expect(input.props.className).toContain("border-white/15");
    expectDark(input.props.className);
  });

  it("identity + hold-to-affirm scenes: the line is white", async () => {
    const move: Move = { id: "m-id", kind: "identity", title: "I am becoming", statement: "I finish what I start.", xp: 5 };
    const { getByTestId: getId } = render(<IdentityScene move={move} onDone={jest.fn()} />);
    expect(getId("mind-identity-scene").props.className).toContain("bg-black");
    const { getByTestId: getHold } = render(<HoldToAffirmScene move={move} onDone={jest.fn()} />);
    const line = getHold("mind-hold-affirm-line");
    expect(line.props.className).toContain("text-white");
    expectDark(line.props.className);
  });

  it("assemble scene: bank tiles are dark cards", async () => {
    const move: Move = { id: "m-asm", kind: "assemble", title: "Rebuild the line", statement: "Stay the course.", xp: 5 };
    const { getByTestId } = render(<AssembleScene move={move} onDone={jest.fn()} />);
    const tile = getByTestId("mind-assemble-scene-bank-0");
    expect(tile.props.className).toContain("bg-white/5");
    expect(tile.props.className).toContain("border-white/10");
    expectDark(tile.props.className);
  });

  it("challenge scene: title and task are white", async () => {
    const move: Move = { id: "m-ch", kind: "challenge", title: "Today's hard thing", xp: 5 };
    const { getByTestId } = render(<ChallengeScene move={move} onDone={jest.fn()} />);
    await flush();
    const title = getByTestId("mind-challenge-scene-title");
    expect(title.props.className).toContain("text-white/40");
    expectDark(title.props.className);
    const text = getByTestId("mind-challenge-scene-text");
    expect(text.props.className).toContain("text-white");
    expectDark(text.props.className);
  });

  it("compose scene: options are dark cards, lock-in is white", async () => {
    const move: Move = {
      id: "m-comp", kind: "compose", title: "Fill it in",
      compose: { template: "Today I am {0}.", blanks: [["focused", "calm"]] }, xp: 5,
    };
    const { getByTestId } = render(<ComposeScene move={move} onDone={jest.fn()} />);
    const opt = getByTestId("mind-compose-scene-option-focused");
    expect(opt.props.className).toContain("bg-white/5");
    expect(opt.props.className).toContain("border-white/10");
    expectDark(opt.props.className);
  });

  it("contrast scene: obstacle options are dark cards, CTA is white", async () => {
    const move: Move = { id: "m-cont", kind: "contrast", title: "Mental contrast", statement: "Execute with clarity.", xp: 5 };
    const { getByTestId } = render(<ContrastScene move={move} onDone={jest.fn()} />);
    fireEvent.press(getByTestId("mind-contrast-scene-obstacle-next"));
    const opt = getByTestId("mind-contrast-scene-obstacle-0");
    expect(opt.props.className).toContain("bg-white/5");
    expect(opt.props.className).toContain("border-white/10");
    expectDark(opt.props.className);
  });

  it("pattern scene: patterns are dark cards, CTA is white", async () => {
    const move: Move = { id: "m-pat", kind: "antisabotage", title: "Anti-sabotage check", xp: 5 };
    const { getByTestId } = render(<PatternScene move={move} onDone={jest.fn()} />);
    await flush();
    const pat = getByTestId("mind-pattern-scene-pattern-0");
    expect(pat.props.className).toContain("bg-white/5");
    expect(pat.props.className).toContain("border-white/10");
    expectDark(pat.props.className);
    fireEvent.press(pat);
    const cta = getByTestId("mind-pattern-scene-continue");
    expect(cta.props.className).toContain("bg-white");
    expectDark(cta.props.className);
  });

  it("social scene: commit CTA is white before committing", async () => {
    const move: Move = { id: "m-soc", kind: "social", title: "Pull someone in", xp: 5 };
    const { getByTestId } = render(<SocialScene move={move} onDone={jest.fn()} />);
    const cta = getByTestId("mind-social-scene-commit");
    expect(cta.props.className).toContain("bg-white");
    expectDark(cta.props.className);
  });

  it("mission scene: input is a dark card, CTA is white", async () => {
    const move: Move = { id: "m-mis", kind: "mission", title: "Daily mission", xp: 5 };
    const { getByTestId } = render(<MissionScene move={move} onDone={jest.fn()} />);
    const input = getByTestId("mind-mission-scene-input");
    expect(input.props.className).toContain("bg-white/5");
    expect(input.props.className).toContain("border-white/15");
    expectDark(input.props.className);
    const cta = getByTestId("mind-mission-scene-commit");
    expect(cta.props.className).toContain("bg-white");
    expectDark(cta.props.className);
  });

  it("vision scene: empty state is black with a dark skip link", async () => {
    const move: Move = { id: "m-vis", kind: "vision", title: "See it", xp: 5 };
    const { getByTestId } = render(<VisionScene move={move} onDone={jest.fn()} />);
    await flush();
    expect(getByTestId("mind-vision-scene").props.className).toContain("bg-black");
  });

  it("write-affirm: input is a dark card, CTA is white", async () => {
    const { getByTestId } = render(<WriteAffirm statement="I finish what I start." onDone={jest.fn()} />);
    const input = getByTestId("mind-write-affirm-input");
    expect(input.props.className).toContain("bg-white/5");
    expect(input.props.className).toContain("border-white/15");
    expectDark(input.props.className);
    const cta = getByTestId("mind-write-affirm-lock-in");
    expect(cta.props.className).toContain("bg-white");
    expectDark(cta.props.className);
  });

  it("breath scene: ready screen is black with a white Start CTA", async () => {
    const move: Move = { id: "m-breath", kind: "breath", title: "Breathe", xp: 5 };
    const { getByTestId } = render(<BreathScene move={move} onDone={jest.fn()} />);
    expect(getByTestId("mind-breath-ready").props.className).toContain("bg-black");
    const name = getByTestId("mind-breath-name");
    expect(name.props.className).toContain("text-white");
    expectDark(name.props.className);
    const start = getByTestId("mind-breath-start");
    expect(start.props.className).toContain("bg-white");
    expectDark(start.props.className);
  });

  it("speak scene: statement is white on black", async () => {
    const move: Move = { id: "m-speak", kind: "speak", title: "Declaration", statement: "I choose to be disciplined", xp: 5 };
    const { getByTestId } = render(<SpeakScene move={move} onDone={jest.fn()} />);
    expect(getByTestId("mind-speak-scene").props.className).toContain("bg-black");
    const statement = getByTestId("mind-speak-scene-statement");
    expect(statement.props.className).toContain("text-white");
    expectDark(statement.props.className);
  });

  it("mirror scene: stage is black with a white statement", async () => {
    const cam = mockCamera();
    const move: Move = { id: "m-mir", kind: "mirror", title: "Mirror", statement: "I choose to be disciplined", xp: 5 };
    const { getByTestId } = render(
      <MirrorScene move={move} onDone={jest.fn()} permissionImpl={cam.permissionImpl} cameraImpl={cam.CameraStub as any} />,
    );
    expect(getByTestId("mind-mirror-scene").props.className).toContain("bg-black");
    const statement = getByTestId("mind-mirror-scene-statement");
    expect(statement.props.className).toContain("text-white");
    expectDark(statement.props.className);
  });

  it("player: the move stage has no themed background — the black root shows through", async () => {
    const plan = {
      intro: { title: "Today's session", subtitle: "Three minutes." },
      moves: [
        { id: "m1", kind: "choice", title: "Pick one", options: [{ label: "A", response: "R" }], xp: 5 },
        { id: "m2", kind: "win", title: "Bank it", xp: 5 },
      ],
      openingId: "steady",
    } as any;
    const { getByTestId } = render(<SessionPlayer plan={plan} onExit={jest.fn()} preview />);
    fireEvent.press(getByTestId("mind-session-player-intro-begin"));
    await flush();
    const stage = getByTestId("mind-session-player-stage");
    expect(String(stage.props.className ?? "")).not.toContain("bg-background");
    expect(getByTestId("mind-session-player-root").props.className).toContain("bg-black");
  });
});
