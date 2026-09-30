import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { PermissionDeniedNotice } from "@/components/media/PermissionDeniedNotice";
import {
  SETTINGS_ACTION_LABEL,
  takePhoto,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";

/**
 * NP-059's third acceptance: "denying camera permission shows a clear message
 * with a way to Settings and does not crash".
 *
 * The flow is asserted end to end here — a refusal comes back from
 * `takePhoto()` as a value, that value is what the notice renders, and the
 * button beside it is the only thing that can change the answer once the OS
 * has stopped asking.
 */

function denial(
  overrides: Partial<PermissionDeniedCapture> = {},
): PermissionDeniedCapture {
  return {
    status: "permission-denied",
    source: "camera",
    canAskAgain: false,
    message: "Camera access is off for Become. Turn Camera on in Settings.",
    ...overrides,
  };
}

describe("<PermissionDeniedNotice>", () => {
  it("shows the sentence the refusal carried", () => {
    const { getByTestId } = render(<PermissionDeniedNotice denial={denial()} />);
    expect(getByTestId("permission-denied-notice-message").props.children).toBe(
      denial().message,
    );
  });

  it("is announced as an alert, not as decoration", () => {
    const { getByTestId } = render(<PermissionDeniedNotice denial={denial()} />);
    expect(getByTestId("permission-denied-notice").props.accessibilityRole).toBe(
      "alert",
    );
  });

  it("offers the way to Settings, and opens it", async () => {
    const openSettings = jest.fn(async () => {});
    const opened: boolean[] = [];
    const { getByTestId, getByText } = render(
      <PermissionDeniedNotice
        denial={denial()}
        openSettings={openSettings}
        onOpened={(ok) => opened.push(ok)}
      />,
    );
    expect(getByText(SETTINGS_ACTION_LABEL)).toBeTruthy();
    fireEvent.press(getByTestId("permission-denied-notice-settings"));
    await waitFor(() => expect(opened).toEqual([true]));
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("a Settings link that fails does not take the screen with it", async () => {
    const opened: boolean[] = [];
    const { getByTestId } = render(
      <PermissionDeniedNotice
        denial={denial()}
        openSettings={async () => {
          throw new Error("no such url");
        }}
        onOpened={(ok) => opened.push(ok)}
      />,
    );
    fireEvent.press(getByTestId("permission-denied-notice-settings"));
    await waitFor(() => expect(opened).toEqual([false]));
  });
});

describe("denying the camera, end to end", () => {
  it("returns a refusal and renders a message with a way to Settings", async () => {
    const result = await takePhoto({
      deps: {
        requestPermission: async () => ({ granted: false, canAskAgain: false }),
        launch: async () => {
          throw new Error("must never be reached");
        },
      },
    });

    expect(result.status).toBe("permission-denied");
    if (result.status !== "permission-denied") return;

    const openSettings = jest.fn(async () => {});
    const { getByTestId, getByText } = render(
      <PermissionDeniedNotice denial={result} openSettings={openSettings} />,
    );
    expect(getByText(result.message)).toBeTruthy();
    fireEvent.press(getByTestId("permission-denied-notice-settings"));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
  });
});
