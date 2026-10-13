// NP-319 — the chat sheet behind "Talk to your coach" (Mind) and the
// nutrition consultant (nutrition day) shares one Modal. These two bugs were
// one root cause each: no real Android keyboard avoidance (the input and
// send button sat under the keyboard) and the hardware back button closing
// the keyboard AND the sheet in the same press.

import { render } from "@testing-library/react-native";
import { Keyboard } from "react-native";

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

import { CoachChat } from "@/components/ai/CoachChat";

function renderChat(onClose: () => void) {
  return render(
    <CoachChat
      testID="coach-chat"
      visible
      onClose={onClose}
      endpoint="/api/ai/consultant"
      domain="mindset"
      persistKey="mind-coach"
      title="Your mindset coach"
      greeting="I'm here. What's loudest right now?"
    />,
  );
}

describe("CoachChat Android keyboard handling (NP-319)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sets statusBarTranslucent on its Modal", () => {
    const { getByTestId } = renderChat(() => {});
    expect(getByTestId("coach-chat").props.statusBarTranslucent).toBe(true);
  });

  it("the first system back while the keyboard is up only dismisses the keyboard, not the sheet", () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const onClose = jest.fn();
    const { getByTestId } = renderChat(onClose);

    getByTestId("coach-chat").props.onRequestClose();

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a second system back, once the keyboard is down, closes the chat sheet", () => {
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    const onClose = jest.fn();
    const { getByTestId } = renderChat(onClose);

    getByTestId("coach-chat").props.onRequestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
