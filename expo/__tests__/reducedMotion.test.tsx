// REDUCE MOTION (NP-124).
//
// React Native applies none of this for us: `Modal.animationType` animates,
// moti's `from`/`animate` animates and every Reanimated `withTiming` runs,
// whatever the phone's Accessibility settings say. So the app asks
// `lib/a11y/reducedMotion.ts`, and the last test here is the rule that travels:
// a file that reaches for moti or Reanimated has to reach for the hook too.

import * as fs from "fs";
import * as path from "path";
import { render, screen, waitFor, act } from "@testing-library/react-native";
import { AccessibilityInfo, View } from "react-native";
import { Text } from "@/components/Text";
import { Modal } from "@/components/Modal";
import { BottomSheet } from "@/components/BottomSheet";
import {
  modalAnimation,
  motionDuration,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";

const EXPO_DIR = path.resolve(__dirname, "..");

function Probe() {
  const reduced = useReducedMotion();
  return (
    <View>
      <Text testID="probe">{reduced ? "reduced" : "full"}</Text>
    </View>
  );
}

type MotionListener = (value: boolean) => void;

/** Take over both halves of the API: the initial read and the change event. */
function mockAccessibility(initial: boolean): {
  emit: (value: boolean) => void;
  removed: () => number;
  restore: () => void;
} {
  const listeners: MotionListener[] = [];
  let removals = 0;
  const read = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(initial));
  const subscribe = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((event: string, handler: unknown) => {
      if (event === "reduceMotionChanged") {
        listeners.push(handler as MotionListener);
      }
      return {
        remove: () => {
          removals += 1;
        },
      } as never;
    });
  return {
    emit: (value: boolean) => {
      act(() => {
        listeners.forEach((l) => l(value));
      });
    },
    removed: () => removals,
    restore: () => {
      read.mockRestore();
      subscribe.mockRestore();
    },
  };
}

describe("useReducedMotion", () => {
  it("starts full-motion and lands on what the system says", async () => {
    const a11y = mockAccessibility(true);
    render(<Probe />);
    // The first paint cannot wait on a promise, so full motion is the default
    // and the real answer arrives on the first tick.
    expect(screen.getByTestId("probe").props.children).toBe("full");
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe("reduced"),
    );
    a11y.restore();
  });

  it("follows the setting while the app is open", async () => {
    const a11y = mockAccessibility(false);
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe("full"),
    );
    a11y.emit(true);
    expect(screen.getByTestId("probe").props.children).toBe("reduced");
    a11y.emit(false);
    expect(screen.getByTestId("probe").props.children).toBe("full");
    a11y.restore();
  });

  it("drops its subscription on unmount", async () => {
    const a11y = mockAccessibility(false);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("probe")).toBeTruthy());
    screen.unmount();
    expect(a11y.removed()).toBe(1);
    a11y.restore();
  });

  it("survives a platform with no accessibility manager attached", async () => {
    const read = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockImplementation(() => Promise.reject(new Error("no manager")));
    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("probe").props.children).toBe("full"),
    );
    read.mockRestore();
  });
});

describe("the helpers", () => {
  it("motionDuration zeroes the duration but keeps the end state", () => {
    expect(motionDuration(250, false)).toBe(250);
    expect(motionDuration(250, true)).toBe(0);
  });

  it("modalAnimation cuts instead of travelling", () => {
    expect(modalAnimation("fade", false)).toBe("fade");
    expect(modalAnimation("slide", false)).toBe("slide");
    expect(modalAnimation("fade", true)).toBe("none");
    expect(modalAnimation("slide", true)).toBe("none");
  });
});

describe("the app's two animations honour it", () => {
  it("the modal fades, or does not", async () => {
    const a11y = mockAccessibility(false);
    const { getByTestId, unmount } = render(
      <Modal testID="m" visible onClose={() => {}} title="Delete account?">
        <Text>body</Text>
      </Modal>,
    );
    await waitFor(() => expect(getByTestId("m").props.animationType).toBe("fade"));
    a11y.emit(true);
    expect(getByTestId("m").props.animationType).toBe("none");
    unmount();
    a11y.restore();
  });

  it("the sheet slides, or does not", async () => {
    const a11y = mockAccessibility(true);
    const { getByTestId, unmount } = render(
      <BottomSheet testID="s" visible onClose={() => {}} title="Pick a unit">
        <Text>body</Text>
      </BottomSheet>,
    );
    await waitFor(() => expect(getByTestId("s").props.animationType).toBe("none"));
    a11y.emit(false);
    expect(getByTestId("s").props.animationType).toBe("slide");
    unmount();
    a11y.restore();
  });

  it("closes on the VoiceOver scrub gesture, the only dismissal it has", () => {
    // The backdrop is hidden from assistive technology (it used to be a
    // full-screen "Close modal" button in front of the dialog), so the escape
    // gesture is what replaces it.
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Modal testID="m" visible onClose={onClose} title="Delete account?">
        <Text>body</Text>
      </Modal>,
    );
    const card = getByTestId("m-card");
    expect(typeof card.props.onAccessibilityEscape).toBe("function");
    card.props.onAccessibilityEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getByTestId("m-backdrop").props.accessible).toBe(false);
  });
});

describe("the rule that travels", () => {
  const MOTION_IMPORT = /from\s+["'](moti|react-native-reanimated)["']/;

  function sourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
      }
    };
    for (const dir of ["app", "components", "lib"]) {
      walk(path.join(EXPO_DIR, dir));
    }
    return out;
  }

  it("every file that animates asks whether it should", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, "utf8");
      if (!MOTION_IMPORT.test(src)) continue;
      if (!/reducedMotion|useReducedMotion|motionDuration/.test(src)) {
        offenders.push(path.relative(EXPO_DIR, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("moti and Reanimated are installed, so the rule is not theoretical", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(EXPO_DIR, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.moti).toBeTruthy();
    expect(pkg.dependencies["react-native-reanimated"]).toBeTruthy();
  });

  it("the overlays, which are the animations there are today, consult it", () => {
    for (const rel of ["components/Modal.tsx", "components/BottomSheet.tsx"]) {
      const src = fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
      expect(src).toMatch(/useReducedMotion/);
      expect(src).toMatch(/modalAnimation\(/);
    }
  });
});
