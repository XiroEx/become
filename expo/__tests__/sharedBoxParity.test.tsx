/**
 * SharedBox parity (Profile/Training blank-tab fix).
 *
 * `lib/motion/reanimated.ts` is the one door every motion component imports
 * Reanimated through. Its `useSharedValue` must hand every caller the same
 * `SharedBox` shape — `.value` + `.get()` + `.set()` — on BOTH paths: the
 * real Reanimated hook on a phone, and the static stand-in when Reanimated
 * is missing (the `{}` mock under `renderRouter`). ScreenEnter and
 * ProgressFill write through `.set()` and read through `.get()`/`.value`,
 * so a path missing either method blanks the tab that mounts it.
 */
import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { useSharedValue, motionAvailable } from "@/lib/motion/reanimated";
import { ScreenEnter } from "@/components/motion/ScreenEnter";
import { ProgressFill } from "@/components/motion/ProgressFill";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

function mockA11y(initial: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- AccessibilityInfo is only reachable at test runtime
  const { AccessibilityInfo } = require("react-native");
  const read = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(initial));
  const sub = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((() => ({ remove: jest.fn() })) as never);
  return () => {
    read.mockRestore();
    sub.mockRestore();
  };
}

function BoxProbe({ init, testID }: { init: number; testID: string }) {
  const box = useSharedValue(init);
  return (
    <Text testID={testID}>
      {`${typeof (box as { get?: unknown }).get}:${typeof (box as { set?: unknown }).set}:${(box as { value: number }).value}`}
    </Text>
  );
}

describe("SharedBox parity across the real and static paths", () => {
  it("the shim's box carries value/get/set on this path", () => {
    const { getByTestId } = render(<BoxProbe init={3} testID="box" />);
    expect(getByTestId("box").props.children).toBe("function:function:3");
  });

  it("set() applies plain values and updater functions, get() reads them back", () => {
    function RoundTrip({ testID }: { testID: string }) {
      const box = useSharedValue(3);
      const [seen, setSeen] = React.useState<string | null>(null);
      React.useEffect(() => {
        box.set(7);
        const afterPlain = box.get();
        box.set((prev) => prev + 1);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot contract check: the effect syncs the box's answers (external system) into React state for the assertion
        setSeen(`${afterPlain}:${box.get()}:${box.value}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot contract check
      }, []);
      return <Text testID={testID}>{seen ?? "pending"}</Text>;
    }
    const { getByTestId } = render(<RoundTrip testID="roundtrip" />);
    expect(getByTestId("roundtrip").props.children).toBe("7:8:8");
    expect(motionAvailable()).toBe(true);
  });

  it("ScreenEnter paints its children on this path (Profile/Training tabs)", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <ScreenEnter testID="enter">
        <Text testID="inner">profile content</Text>
      </ScreenEnter>,
    );
    expect(getByTestId("enter")).toBeTruthy();
    expect(getByTestId("inner").props.children).toBe("profile content");
    restore();
  });

  it("ProgressFill paints at its width on this path", () => {
    const restore = mockA11y(true);
    const { UNSAFE_getByProps } = render(
      <ProgressFill pct={50} color="#fff" testID="fill" />,
    );
    expect(UNSAFE_getByProps({ testID: "fill" })).toBeTruthy();
    restore();
  });
});
