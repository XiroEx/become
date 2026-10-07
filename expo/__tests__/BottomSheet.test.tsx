import { render, fireEvent } from "@testing-library/react-native";
import { Dimensions, Keyboard, Text } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

describe("BottomSheet", () => {
  it("renders title and children when visible", () => {
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={() => {}} title="Pick a unit">
        <Text testID="s-body">Sheet body</Text>
      </BottomSheet>,
    );
    expect(getByTestId("s-title").props.children).toBe("Pick a unit");
    expect(getByTestId("s-body").props.children).toBe("Sheet body");
  });

  it("shows a drag handle for affordance, and hides it from screen readers", () => {
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={() => {}} title="Pick">
        <Text>x</Text>
      </BottomSheet>,
    );
    // `includeHiddenElements` is the point of the test: the handle is on screen
    // and out of the accessibility tree, so the default query cannot see it.
    const handle = getByTestId("s-handle", { includeHiddenElements: true });
    expect(handle).toBeTruthy();
    // NP-124: it used to announce itself as "Drag handle" — a gesture VoiceOver
    // cannot perform. The scrub gesture (onAccessibilityEscape) closes the
    // sheet instead, so the grab bar is decoration.
    expect(handle.props.accessible).toBe(false);
    expect(handle.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(handle.props.accessibilityLabel).toBeUndefined();
  });

  it("calls onClose when backdrop is pressed", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={onClose}>
        <Text>x</Text>
      </BottomSheet>,
    );
    fireEvent.press(getByTestId("s-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render sheet content when visible=false", () => {
    const { queryByTestId } = render(
      <BottomSheet testID="s" visible={false} onClose={() => {}} title="Pick">
        <Text testID="s-body">x</Text>
      </BottomSheet>,
    );
    expect(queryByTestId("s-title")).toBeNull();
    expect(queryByTestId("s-body")).toBeNull();
  });

  // NP-319: Android's edge-to-edge enforcement (targetSdk 35) is part of why
  // real keyboard avoidance inside a Modal sheet was broken.
  it("sets statusBarTranslucent on the underlying Modal", () => {
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={() => {}}>
        <Text>x</Text>
      </BottomSheet>,
    );
    expect(getByTestId("s").props.statusBarTranslucent).toBe(true);
  });

  // NP-271: an uncapped sheet grew past the top of the screen for tall
  // content (e.g. the recipe editor mid-edit), pushing its own title under
  // the status bar with no way back — and on Android, its footer under the
  // gesture/navigation bar. The sheet must cap its own height to the safe
  // area and pad its bottom past the bottom inset, however tall its content.
  describe("safe-area cap (NP-271)", () => {
    it("caps the sheet's height below the top inset, and pads past the bottom inset", () => {
      const { getByTestId } = render(
        <BottomSheet testID="s" visible onClose={() => {}} title="Edit recipe">
          <Text>x</Text>
        </BottomSheet>,
      );
      const style = getByTestId("s-sheet").props.style as Record<string, unknown>;
      const windowHeight = Dimensions.get("window").height;
      // top inset 47 + the 24px gap this component leaves above it.
      expect(style.maxHeight).toBe(windowHeight - 47 - 24);
      // bottom inset 34 + 16px, comfortably clear of a gesture-nav bar.
      expect(style.paddingBottom).toBe(34 + 16);
      expect(style.overflow).toBe("hidden");
    });

    it("a caller's sheetStyle can still override the computed values", () => {
      const { getByTestId } = render(
        <BottomSheet
          testID="s"
          visible
          onClose={() => {}}
          sheetStyle={{ maxHeight: 999 }}
        >
          <Text>x</Text>
        </BottomSheet>,
      );
      const style = getByTestId("s-sheet").props.style as Record<string, unknown>;
      expect(style.maxHeight).toBe(999);
    });
  });

  describe("system back while the keyboard is up (NP-319 point 8)", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("the first back press only dismisses the keyboard, not the sheet", () => {
      jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
      const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
      const onClose = jest.fn();
      const { getByTestId } = render(
        <BottomSheet testID="s" visible onClose={onClose}>
          <Text>x</Text>
        </BottomSheet>,
      );

      getByTestId("s").props.onRequestClose();

      expect(dismiss).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("a second back press, once the keyboard is already down, closes the sheet", () => {
      jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
      const onClose = jest.fn();
      const { getByTestId } = render(
        <BottomSheet testID="s" visible onClose={onClose}>
          <Text>x</Text>
        </BottomSheet>,
      );

      getByTestId("s").props.onRequestClose();

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
