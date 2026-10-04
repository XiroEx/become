/**
 * NP-082 back guard: confirm before leaving the live workout with unsaved
 * sets (Android back through `useAndroidBackHandler`, iOS swipe-back
 * disabled + `beforeRemove` confirm).
 */
import { act, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useLiveBackGuard } from "@/lib/live/useLiveBackGuard";

jest.mock("expo-router", () => ({
  useNavigation: () => null,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

function GuardHarness({
  enabled,
  navigation,
}: {
  enabled: boolean;
  navigation?: import("@/lib/live/useLiveBackGuard").BackGuardNavigator | null;
}) {
  useLiveBackGuard({ enabled, navigation });
  return null;
}

describe("useLiveBackGuard (NP-082)", () => {
  it("disables the iOS swipe-back while there is unsaved work, restores after", () => {
    const setOptions = jest.fn();
    const addListener = jest.fn(() => jest.fn());
    const navigation = {
      setOptions,
      addListener,
      dispatch: jest.fn(),
    };
    const { unmount } = render(
      <GuardHarness enabled navigation={navigation} />,
    );
    expect(setOptions).toHaveBeenCalledWith({ gestureEnabled: false });
    expect(addListener).toHaveBeenCalledWith(
      "beforeRemove",
      expect.any(Function),
    );
    unmount();
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });

  it("beforeRemove is intercepted and offers Stay / Leave", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const dispatch = jest.fn();
    const navigation = {
      setOptions: jest.fn(),
      addListener: jest.fn((_event: "beforeRemove", handler: (e: never) => void) => {
        void handler;
        return jest.fn();
      }),
      dispatch,
    };
    render(<GuardHarness enabled navigation={navigation} />);
    const handler = navigation.addListener.mock.calls[0]?.[1] as (
      e: { preventDefault: () => void; data: { action: unknown } },
    ) => void;
    const preventDefault = jest.fn();
    act(() => {
      handler({ preventDefault, data: { action: { type: "GO_BACK" } } });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      "Leave workout?",
      expect.stringContaining("unsaved"),
      expect.any(Array),
    );
    // Tapping Leave dispatches the held navigation action.
    const buttons = alertSpy.mock.calls[0]?.[2] as {
      text: string;
      onPress?: () => void;
    }[];
    act(() => {
      buttons.find((b) => b.text === "Leave")?.onPress?.();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
    alertSpy.mockRestore();
  });

  it("disabled: no swipe-back change and no beforeRemove listener", () => {
    const navigation = {
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
      dispatch: jest.fn(),
    };
    render(<GuardHarness enabled={false} navigation={navigation} />);
    expect(navigation.setOptions).not.toHaveBeenCalled();
    expect(navigation.addListener).not.toHaveBeenCalled();
  });

  it("Android hardware back asks first and blocks the default back", () => {
    const backHandlerModule = jest.requireActual(
      "@/lib/android/backHandler",
    ) as typeof import("@/lib/android/backHandler");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onConfirm = jest.fn(() => {
      Alert.alert("Leave workout?", "You have unsaved sets. Leave without saving?", []);
    });
    const handler = backHandlerModule.makeConfirmOnBack({
      onConfirm,
      isConfirmed: () => false,
    });
    // First press: confirm dialog, back blocked.
    expect(handler()).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
