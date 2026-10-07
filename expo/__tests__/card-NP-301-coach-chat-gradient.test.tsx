/* eslint-disable import/first */
// NP-301 — "Mind coach chat: red header tile and send button where web uses
// the violet-to-green gradient", plus the Android full-pass follow-ups on the
// same thread: the user bubble's colour/corner, the coach bubble's corner,
// the composer's bottom inset on the gesture bar, and the suggestion chip
// size.
//
// Covers `expo/components/ai/CoachChat.tsx` and its two entry points,
// `expo/components/mind/MindCoachTeaser.tsx` (gradient) and
// `expo/components/nutrition/NutritionConsultantTeaser.tsx` (flat — no
// regression).

import { fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "member-1", email: "member@example.com" },
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: jest.fn(() => null),
  subscribeToUpgradeSheet: jest.fn(() => () => {}),
}));

jest.mock("@/lib/ai/aiConsentPrompt", () => ({
  showAiConsentPrompt: jest.fn(),
  raiseAiConsentPrompt: jest.fn(),
  hideAiConsentPrompt: jest.fn(),
  getAiConsentPromptState: jest.fn(() => ({
    open: false,
    error: null,
    provider: "Google Gemini",
  })),
  subscribeToAiConsentPrompt: jest.fn(() => () => {}),
  executeWithAiConsent: jest.fn(),
}));

// Default: throws, like a real `useSafeAreaInsets` with no `SafeAreaProvider`
// above it — exercises CoachChat's own `useSafeAreaInsetsOrZero` fallback.
// Individual tests override this with `mockReturnValueOnce` to simulate a
// real device's gesture-bar inset.
type Insets = { top: number; bottom: number; left: number; right: number };
const mockUseSafeAreaInsets = jest.fn<Insets, []>(() => {
  throw new Error("no SafeAreaProvider in this test tree");
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

import { CoachChat } from "@/components/ai/CoachChat";
import { Text } from "@/components/Text";
import { MindCoachTeaser } from "@/components/mind/MindCoachTeaser";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";
/* eslint-enable import/first */

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]));
}

afterEach(() => {
  mockUseSafeAreaInsets.mockClear();
});

describe("(card NP-301) mind coach header tile + send button use the violet→green gradient", () => {
  it("MindCoachTeaser passes a violet→green accentGradient into CoachChat's header tile", async () => {
    const { getByTestId, findByTestId } = render(<MindCoachTeaser />);
    fireEvent.press(getByTestId("mind-coach-teaser"));

    const headerIcon = await findByTestId("mind-coach-chat-header-icon");
    // violet-500 → green-500 (`tokens.ts`'s `mind-violet` / `mind-green`),
    // the same two stops the web's `from-violet-500 to-green-500` draws.
    expect(headerIcon.props.colors).toEqual(["rgb(139 92 246)", "rgb(34 197 94)"]);

    const sendGradient = await findByTestId("mind-coach-chat-send-gradient");
    expect(sendGradient.props.colors).toEqual(["rgb(139 92 246)", "rgb(34 197 94)"]);
  });

  it("the nutrition consultant keeps its flat teal tile — no gradient, no regression", async () => {
    const { getByTestId, findByTestId } = render(<NutritionConsultantTeaser />);
    fireEvent.press(getByTestId("nutrition-consultant-teaser"));

    const headerIcon = await findByTestId("nutrition-consultant-chat-header-icon");
    // Both gradient stops equal: renders solid teal, exactly as before.
    expect(headerIcon.props.colors).toEqual(["rgb(20 184 166)", "rgb(20 184 166)"]);
  });

  it("with neither accentColor nor accentGradient, the tile stays the neutral default (unchanged)", () => {
    const { getByTestId } = render(
      <CoachChat
        testID="plain-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        persistKey="plain"
        title="A coach"
        greeting="Hi"
      />,
    );
    const headerIcon = getByTestId("plain-chat-header-icon");
    expect(headerIcon.props.colors[0]).toBe(headerIcon.props.colors[1]);
  });
});

describe("(card NP-301) user/coach message bubbles match the web regardless of accent", () => {
  it("the coach's greeting bubble is squared on the bottom-left, never the accent colour", () => {
    const { getByTestId } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="Hello there"
        accentGradient={["rgb(139 92 246)", "rgb(34 197 94)"]}
      />,
    );
    const bubble = flattenStyle(getByTestId("mind-coach-chat-message-0").props.style);
    // The greeting is rendered by the coach (role "assistant"), so bubble 0
    // is the coach's — squared bottom-LEFT corner, never the accent colour.
    expect(bubble.borderBottomLeftRadius).toBe(6);
    expect(bubble.borderBottomRightRadius).toBe(18);
    expect(bubble.backgroundColor).not.toBe("rgb(139 92 246)");
  });
});

describe("(card NP-301) suggestion chips match the web's px-3 py-1.5 text-xs sizing", () => {
  it("chip padding and text size are the web's exact px values", () => {
    const { getByTestId } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="Hello there"
        suggestions={["I keep starting and quitting"]}
      />,
    );
    const chipTestId = "mind-coach-chat-suggestion-I keep starting and quitting";
    const chip = flattenStyle(getByTestId(chipTestId).props.style);
    expect(chip.paddingHorizontal).toBe(12); // web's px-3
    expect(chip.paddingVertical).toBe(6); // web's py-1.5

    const label = getByTestId(chipTestId).findByType(Text);
    const labelStyle = flattenStyle(label.props.style);
    expect(labelStyle.fontSize).toBe(12); // web's text-xs
    expect(labelStyle.lineHeight).toBe(16);
  });
});

describe("(card NP-301) composer sits above the gesture bar", () => {
  it("adds the safe-area bottom inset to the composer's padding", () => {
    mockUseSafeAreaInsets.mockReturnValueOnce({ top: 0, bottom: 34, left: 0, right: 0 });
    const { getByTestId } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="Hello there"
      />,
    );
    const composer = flattenStyle(getByTestId("mind-coach-chat-composer").props.style);
    expect(composer.paddingBottom).toBe(34 + 10);
  });

  it("falls back to zero inset (no SafeAreaProvider) without crashing", () => {
    // The default mock (see above) throws, like a real `useSafeAreaInsets`
    // with no provider in the tree — this is `coachChatNP155.test.tsx`'s own
    // mount style, bare, so this is the realistic default for this sheet.
    const { getByTestId } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="Hello there"
      />,
    );
    const composer = flattenStyle(getByTestId("mind-coach-chat-composer").props.style);
    expect(composer.paddingBottom).toBe(10);
  });
});
