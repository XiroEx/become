/* eslint-disable import/first */
// THE ACCESSIBILITY BASELINE (NP-124), RENDERED.
//
// The primitives carried roles and labels from the start, and nobody had used
// the app with VoiceOver or at the largest text size — so the counting was
// green while the settings gear was a 36-point target, the modal backdrop was a
// full-screen "Close modal" button in front of every dialog, a button that
// started loading lost its name, the streak message was read as an unrelated
// fragment and "Log weight" / "Skip today" sat side by side at their intrinsic
// width, which at the largest Dynamic Type size is wider than the phone.
//
// WHAT THIS SUITE IS, AND IS NOT. It walks the RENDERED tree of the v1 screens
// (sign-in, consent, onboarding, Home, Settings) the way a screen reader does
// and asserts the four rules the card sets: a role and a name on everything
// interactive, 44 x 44 minimum targets, state changes that are announced, and no
// construction that clips text when it grows. It cannot lay text out — jest has
// no text engine — so "nothing is cut off" is enforced as the PROPERTIES that
// cut text off (`allowFontScaling={false}`, `numberOfLines`, a fixed height
// around text, an unshrinkable child of a row) plus a render at the largest
// iOS multiplier. The device pass is `ACCESSIBILITY.md`'s checklist.

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

const mockSetToken = jest.fn(async () => {});
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com", name: "Jon" },
    token: "jwt",
    status: "signed-in",
    loading: false,
    isAuthed: false,
    signedOutReason: null,
    setToken: mockSetToken,
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Settings reads two endpoints and writes two. The screen under test is the
// LAYOUT, so the hooks answer straight away with the fullest state: a saved
// name, a last weight, nothing loading.
jest.mock("@/lib/hooks/useFetch", () => ({
  useFetch: (path: string | null) => ({
    data:
      path === "/api/profile"
        ? { name: "Jon Don", onboardingCompleted: true }
        : { lastWeight: 182, daysSinceLastEntry: 3 },
    error: null,
    loading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock("@/lib/hooks/useMutation", () => ({
  useMutation: () => ({
    mutate: jest.fn(async () => ({})),
    data: null,
    error: null,
    loading: false,
    reset: jest.fn(),
  }),
}));

jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  let value: string | null = "jwt";
  return {
    ...actual,
    sessionStore: {
      async get() {
        return value;
      },
      async set(v: string) {
        value = v;
      },
      async clear() {
        value = null;
      },
    },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({ sessionId: "s1", status: "pending" })),
  };
});

import * as fs from "fs";
import * as path from "path";
import { AccessibilityInfo, PixelRatio } from "react-native";
import LoginScreen from "../app/(auth)/login";
import HealthSettingsRoute from "../app/(app)/(tabs)/profile/health";
import PlanScreen from "../app/(app)/plan";
import type { BillingPlansResponse } from "@become/api-client";
import type { EntitlementsSnapshot } from "@become/core";
import { ConsentGate } from "@/components/auth/ConsentGate";
import { DashboardScreen } from "@/components/DashboardScreen";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { Text } from "@/components/Text";
import { LARGEST_DYNAMIC_TYPE_SCALE } from "@/lib/a11y/dynamicType";
import { MIN_TOUCH_TARGET } from "@/lib/a11y/touchTarget";
import {
  INTERACTIVE_ROLES,
  accessibleName,
  describeNode,
  hostName,
  interactiveNodes,
  isShrinkable,
  rowChildren,
  rowContainers,
  spokenText,
  styleOf,
  textNodes,
  touchTargetShortfall,
} from "../test-support/a11y";
/* eslint-enable import/first */

const APP_DIR = path.resolve(__dirname, "..", "app");

/** The screens the card names, each rendered at its fullest state. */
interface Screen {
  name: string;
  render: () => void;
  /** Extra taps that reveal the rest of the screen (a modal, a later step). */
  reveal?: () => void | Promise<void>;
  /**
   * A screen that deliberately has no controls at all: "check your inbox" is a
   * member waiting for an email, with nothing to press.
   */
  noControls?: boolean;
}

const A11Y_PLANS_BODY: BillingPlansResponse = {
  currency: "USD",
  plans: {
    monthly: {
      display: "15 USD",
      per: "month",
      billed: "Billed monthly.",
      renewalLine: "Renews automatically.",
    },
    annual: {
      display: "120 USD",
      per: "year",
      billed: "Billed once a year.",
      renewalLine: "Renews automatically.",
      perMonthDisplay: "10 USD",
      savesDisplay: "60 USD",
      savesPercentDisplay: "33%",
      savingLine: "Save 33% off monthly.",
    },
  },
  rows: [
    {
      feature: "ai-food-estimate",
      label: "AI food scans",
      free: "1 a day",
      plus: "Unlimited",
    },
  ],
  freeForever: [
    {
      label: "Logging training",
      detail: "Every workout and rep.",
    },
  ],
  freeForeverNote: "No plan needed.",
  renewalTerms: ["Renews automatically."],
};

const A11Y_FREE_SNAPSHOT: EntitlementsSnapshot = {
  role: "user",
  tier: "free",
  enforced: true,
  grandfathered: false,
  subscription: null,
  checkoutAvailable: true,
  features: {
    "ai-food-estimate": {
      allowed: true,
      canCreate: true,
      requiresTier: "free",
      limit: 1,
      used: 0,
      remaining: 1,
      resetsAt: "2026-10-02T00:00:00Z",
      window: "day",
    },
  },
};

const A11Y_PLUS_SNAPSHOT: EntitlementsSnapshot = {
  role: "user",
  tier: "plus",
  enforced: true,
  grandfathered: false,
  subscription: {
    status: "active",
    currentPeriodEnd: "2026-11-01T00:00:00Z",
    cancelAtPeriodEnd: false,
  },
  checkoutAvailable: true,
  features: {
    "ai-food-estimate": {
      allowed: true,
      canCreate: true,
      requiresTier: "plus",
      limit: null,
      used: 5,
      remaining: null,
      resetsAt: null,
      window: "day",
    },
  },
};

const V1_SCREENS: Screen[] = [
  {
    name: "sign-in",
    render: () => {
      render(<LoginScreen />);
    },
  },
  {
    name: "sign-in (link sent)",
    render: () => {
      render(<LoginScreen />);
    },
    noControls: true,
    reveal: async () => {
      fireEvent.changeText(screen.getByLabelText("Email"), "jon@example.com");
      fireEvent.press(screen.getByRole("button", { name: "Send magic link" }));
      await waitFor(() => screen.getByTestId("login-submitted"));
    },
  },
  {
    name: "onboarding",
    render: () => {
      render(<OnboardingFlow onComplete={() => {}} />);
    },
  },
  {
    name: "onboarding (last step)",
    render: () => {
      render(<OnboardingFlow onComplete={() => {}} />);
    },
    reveal: () => {
      // Step 1: Goals
      fireEvent.press(screen.getByLabelText("Lose Weight"));
      fireEvent.press(screen.getByRole("button", { name: "Next" }));
      // Step 2: About you
      fireEvent.changeText(
        screen.getByLabelText("What should we call you?"),
        "Jon",
      );
      fireEvent.changeText(screen.getByLabelText("Age"), "25");
      fireEvent.press(screen.getByLabelText("Male"));
      fireEvent.press(screen.getByRole("button", { name: "Next" }));
      // Step 3: Body & nutrition
      fireEvent.changeText(screen.getByLabelText("Feet"), "5");
      fireEvent.changeText(screen.getByLabelText("Inches"), "10");
      fireEvent.changeText(screen.getByLabelText("Current weight (lbs)"), "175");
      fireEvent.press(screen.getByRole("button", { name: "Next" }));
      // Step 4: Equipment
      fireEvent.press(screen.getByLabelText("Full Gym"));
      fireEvent.press(screen.getByRole("button", { name: "Next" }));
    },
  },
  {
    name: "Home",
    render: () => {
      render(
        <DashboardScreen
          userName="Jon"
          streakDays={12}
          freezeAvailable
          todayWorkout={{
            programName: "Hypertrophy Block",
            workoutTitle: "Upper Body A",
            phaseLabel: "Phase 1",
            exerciseCount: 6,
          }}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onOpenSettings={() => {}}
          onSubmitCheckIn={() => {}}
          onRefresh={() => {}}
        />,
      );
    },
  },
  {
    name: "Home (check-in open)",
    render: () => {
      render(
        <DashboardScreen
          userName="Jon"
          streakDays={0}
          todayWorkout={null}
          onStartWorkout={() => {}}
          onOpenCalendar={() => {}}
          onOpenSettings={() => {}}
          onSubmitCheckIn={() => {}}
          checkInOpen
        />,
      );
    },
  },
  {
    name: "Settings",
    render: () => {
      render(<HealthSettingsRoute />);
    },
  },
  {
    name: "Settings (delete confirmation)",
    render: () => {
      render(<HealthSettingsRoute />);
    },
    reveal: () => {
      fireEvent.press(screen.getByTestId("delete-account"));
    },
  },
  {
    name: "Plan",
    render: () => {
      render(
        <PlanScreen
          initialSnapshot={A11Y_FREE_SNAPSHOT}
          initialPlans={A11Y_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );
    },
  },
  {
    name: "Plan (plus)",
    render: () => {
      render(
        <PlanScreen
          initialSnapshot={A11Y_PLUS_SNAPSHOT}
          initialPlans={A11Y_PLANS_BODY}
          initialStatus={{
            configured: true,
            plans: { monthly: true, annual: true },
          }}
        />,
      );
    },
  },
];

async function renderScreen(s: Screen): Promise<ReactTestInstance> {
  s.render();
  await s.reveal?.();
  return screen.UNSAFE_root;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("every interactive element has a role and a label", () => {
  it.each(V1_SCREENS.map((s) => [s.name, s] as const))(
    "%s",
    async (_name, s) => {
      const root = await renderScreen(s);
      const nodes = interactiveNodes(root);
      if (!s.noControls) expect(nodes.length).toBeGreaterThan(0);

      const roleless: string[] = [];
      const nameless: string[] = [];
      for (const node of nodes) {
        const role = (node.props as { accessibilityRole?: string })
          .accessibilityRole;
        // A TextInput is a text field to both platforms without being told, so
        // the role is implicit — the NAME never is.
        if (hostName(node) !== "TextInput") {
          if (!role || !INTERACTIVE_ROLES.includes(role)) {
            roleless.push(describeNode(node));
          }
        }
        if (accessibleName(node) === "") nameless.push(describeNode(node));
      }
      expect({ roleless, nameless }).toEqual({ roleless: [], nameless: [] });
    },
  );

  it("a button that is loading keeps its name — the spinner has none", () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "jon@example.com");
    const button = screen.getByRole("button", { name: "Send magic link" });
    expect(button.props.accessibilityLabel).toBe("Send magic link");
    // Sending swaps the label for an ActivityIndicator. Without the name
    // computed from the children this becomes "button", with nothing else said.
    const sending = render(
      <DashboardScreen
        userName="Jon"
        streakDays={0}
        todayWorkout={null}
        onStartWorkout={() => {}}
        onOpenCalendar={() => {}}
        onOpenSettings={() => {}}
        onSubmitCheckIn={() => {}}
        checkInOpen
        submittingCheckIn
      />,
    );
    const submit = sending.getByTestId("dashboard-checkin-modal-submit");
    expect(submit.props.accessibilityLabel).toBe("Save check-in");
    expect(submit.props.accessibilityState?.busy).toBe(true);
  });

  it("the consent seam adds no unlabelled control of its own (NP-045 owns the prompt)", () => {
    render(
      <ConsentGate>
        <Text>gated</Text>
      </ConsentGate>,
    );
    expect(interactiveNodes(screen.UNSAFE_root)).toEqual([]);
    expect(screen.getByText("gated")).toBeTruthy();
  });
});

describe("44 by 44 minimum targets", () => {
  it.each(V1_SCREENS.map((s) => [s.name, s] as const))(
    "%s",
    async (_name, s) => {
      const root = await renderScreen(s);
      const short: string[] = [];
      for (const node of interactiveNodes(root)) {
        const shortfall = touchTargetShortfall(node);
        if (shortfall) short.push(`${describeNode(node)} — ${shortfall}`);
      }
      expect(short).toEqual([]);
    },
  );

  it("the minimum is Apple's 44 points, in one place", () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });
});

describe("the largest Dynamic Type size", () => {
  const scaled = jest
    .spyOn(PixelRatio, "getFontScale")
    .mockReturnValue(LARGEST_DYNAMIC_TYPE_SCALE);

  afterAll(() => {
    scaled.mockRestore();
  });

  it.each(V1_SCREENS.map((s) => [s.name, s] as const))(
    "%s renders and nothing is built to clip",
    async (_name, s) => {
      const root = await renderScreen(s);

      const offenders: string[] = [];
      for (const node of textNodes(root)) {
        const props = node.props as {
          allowFontScaling?: boolean;
          numberOfLines?: number;
          ellipsizeMode?: string;
        };
        // Turning scaling off is the one way to make text ignore the setting
        // entirely; a line limit and an ellipsize mode are the two ways to cut
        // it off when it obeys.
        if (props.allowFontScaling === false) {
          offenders.push(`${describeNode(node)} — allowFontScaling={false}`);
        }
        if (typeof props.numberOfLines === "number") {
          offenders.push(
            `${describeNode(node)} — numberOfLines={${props.numberOfLines}}`,
          );
        }
        if (props.ellipsizeMode !== undefined) {
          offenders.push(`${describeNode(node)} — ellipsizeMode`);
        }
        const height = styleOf(node).height;
        if (typeof height === "number") {
          offenders.push(`${describeNode(node)} — fixed height ${height}`);
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it.each(V1_SCREENS.map((s) => [s.name, s] as const))(
    "%s puts no text in a fixed-height box",
    async (_name, s) => {
      const root = await renderScreen(s);
      const offenders: string[] = [];
      for (const node of root.findAll(
        (n) => typeof n.type === "string" && typeof styleOf(n).height === "number",
      )) {
        if (textNodes(node).length > 0) {
          offenders.push(
            `${describeNode(node)} — height ${styleOf(node).height} around text`,
          );
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it.each(V1_SCREENS.map((s) => [s.name, s] as const))(
    "%s gives every text-bearing child of a row room to wrap",
    async (_name, s) => {
      const root = await renderScreen(s);
      // The bug this catches: React Native's flexShrink defaults to 0 (CSS says
      // 1), so a Text in a row keeps its intrinsic width at any font scale and
      // runs off the end of the screen instead of wrapping. Every child of a row
      // that carries words has to be able to give width up.
      const offenders: string[] = [];
      for (const row of rowContainers(root)) {
        for (const node of rowChildren(row)) {
          if (spokenText(node) === "") continue;
          if (!isShrinkable(node)) {
            offenders.push(
              `${describeNode(row)} > ${describeNode(node)} cannot shrink`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    },
  );
});

describe("state changes are announced", () => {
  it("sign-in says the link was sent — the form it replaced is gone", async () => {
    const spoken = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "jon@example.com");
    fireEvent.press(screen.getByRole("button", { name: "Send magic link" }));
    await waitFor(() => screen.getByTestId("login-submitted"));
    expect(spoken).toHaveBeenCalledWith(
      expect.stringContaining("Check your inbox"),
    );
    expect(
      screen.getByTestId("login-submitted").props.accessibilityLiveRegion,
    ).toBe("polite");
    spoken.mockRestore();
  });

  it("onboarding says which step it moved to", () => {
    const spoken = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => {});
    render(<OnboardingFlow onComplete={() => {}} />);
    fireEvent.press(screen.getByLabelText("Lose Weight"));
    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(spoken).toHaveBeenCalledWith(
      "Step 2 of 5. A bit about you",
    );
    spoken.mockRestore();
  });

  it("an error is an alert, not a paragraph three swipes away", () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "not-an-email");
    fireEvent.press(screen.getByRole("button", { name: "Send magic link" }));
    const error = screen.getByTestId("login-email-error");
    expect(error.props.accessibilityRole).toBe("alert");
    expect(error.props.accessibilityLiveRegion).toBe("assertive");
  });
});

describe("sign-in through to Home, by role and name only", () => {
  // This is the acceptance criterion as a walk: every step is performed through
  // the accessibility API — a query by ROLE and accessible NAME, which is
  // exactly what VoiceOver exposes and all it exposes. A control missing either
  // one cannot be found here, which is the same as not existing to a member
  // using the app with the screen curtain on.
  it("the email field, the send button, the questionnaire, Home and Settings", async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "jon@example.com");
    fireEvent.press(screen.getByRole("button", { name: "Send magic link" }));
    expect(await screen.findByText("Check your inbox")).toBeTruthy();
    screen.unmount();

    // A new member lands in onboarding, which is 5 steps and Next/Finish
    // buttons. Answer each by name.
    render(<OnboardingFlow onComplete={() => {}} />);
    // Step 1: Goals
    fireEvent.press(screen.getByLabelText("Lose Weight"));
    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    // Step 2: About you
    fireEvent.changeText(
      screen.getByLabelText("What should we call you?"),
      "Jon",
    );
    fireEvent.changeText(screen.getByLabelText("Age"), "25");
    fireEvent.press(screen.getByLabelText("Male"));
    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    // Step 3: Body & nutrition
    fireEvent.changeText(screen.getByLabelText("Feet"), "5");
    fireEvent.changeText(screen.getByLabelText("Inches"), "10");
    fireEvent.changeText(screen.getByLabelText("Current weight (lbs)"), "175");
    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    // Step 4: Equipment
    fireEvent.press(screen.getByLabelText("Full Gym"));
    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    // Step 5: Review
    fireEvent.press(screen.getByRole("button", { name: "Finish" }));
    screen.unmount();

    // Home. The three things a member does from it are a button with a name.
    const onStartWorkout = jest.fn();
    const onOpenSettings = jest.fn();
    render(
      <DashboardScreen
        userName="Jon"
        streakDays={3}
        todayWorkout={{
          programName: "Hypertrophy Block",
          workoutTitle: "Upper Body A",
          phaseLabel: "Phase 1",
          exerciseCount: 6,
        }}
        onStartWorkout={onStartWorkout}
        onOpenCalendar={() => {}}
        onOpenSettings={onOpenSettings}
        onSubmitCheckIn={() => {}}
      />,
    );
    fireEvent.press(
      screen.getByRole("button", { name: "Start workout: Upper Body A" }),
    );
    expect(onStartWorkout).toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalled();
    screen.unmount();

    // Check-in modal when prompted (NP-211)
    render(
      <DashboardScreen
        userName="Jon"
        streakDays={3}
        todayWorkout={null}
        onStartWorkout={() => {}}
        onOpenCalendar={() => {}}
        onOpenSettings={() => {}}
        onSubmitCheckIn={() => {}}
        checkInOpen
      />,
    );
    expect(
      screen.getByRole("radio", { name: "Mood 3: Okay" }),
    ).toBeTruthy();
  });

  it("Home reads today's workout as one fact, not three fragments", () => {
    render(
      <DashboardScreen
        userName="Jon"
        streakDays={3}
        todayWorkout={{
          programName: "Hypertrophy Block",
          workoutTitle: "Upper Body A",
          phaseLabel: "Phase 1",
          exerciseCount: 6,
        }}
        onStartWorkout={() => {}}
        onOpenCalendar={() => {}}
        onSubmitCheckIn={() => {}}
      />,
    );
    const summary = screen.getByTestId("dashboard-today-summary");
    expect(summary.props.accessible).toBe(true);
    expect(summary.props.accessibilityLabel).toBe(
      "Upper Body A. Hypertrophy Block, Phase 1. 6 exercises.",
    );
  });
});

describe("the rule that travels, across every screen in the app", () => {
  // The walks above render the six screens this card owns. This one is a sweep
  // of the SOURCE for the rule itself — "every interactive element has a role
  // and a label" — so a screen outside the v1 set cannot add a bare touchable
  // without saying what it is. It counts rather than parses: a file may not hold
  // more touchables than it holds roles.
  const TOUCHABLE =
    /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|TouchableNativeFeedback)\b/g;

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".tsx")) out.push(full);
      }
    };
    walk(APP_DIR);
    walk(path.resolve(__dirname, "..", "components"));
    return out;
  }

  it("no file holds more touchables than accessibility roles", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, "utf8");
      const touchables = (src.match(TOUCHABLE) ?? []).length;
      if (touchables === 0) continue;
      const roles = (src.match(/accessibilityRole=/g) ?? []).length;
      if (roles < touchables) {
        offenders.push(
          `${path.relative(path.resolve(__dirname, ".."), file)}: ${touchables} touchables, ${roles} roles`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("finds the touchables — the sweep is not matching nothing", () => {
    const total = sourceFiles().reduce(
      (n, file) =>
        n + (fs.readFileSync(file, "utf8").match(TOUCHABLE) ?? []).length,
      0,
    );
    expect(total).toBeGreaterThan(30);
  });
});

describe("the plan page", () => {
  it("exists natively and joins this walk (NP-053)", () => {
    const routes: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/plan/i.test(entry.name)) routes.push(full);
      }
    };
    walk(APP_DIR);
    expect(routes.length).toBeGreaterThan(0);
    expect(V1_SCREENS.some((s) => s.name === "Plan")).toBe(true);
  });
});
