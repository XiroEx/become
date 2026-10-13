import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "@/components/Text";
import { ApiError } from "@become/api-client";
import { ScreenState } from "@/components/ScreenState";

describe("ScreenState", () => {
  it("renders loading indicator when loading=true and !hasData", () => {
    const { getByTestId, queryByTestId } = render(
      <ScreenState loading={true} hasData={false}>
        <Text>Content</Text>
      </ScreenState>,
    );
    expect(getByTestId("screen-state-loading")).toBeTruthy();
    expect(queryByTestId("screen-state-offline")).toBeNull();
    expect(queryByTestId("screen-state-server")).toBeNull();
  });

  it("renders offline error state with working Retry when error is a network failure", () => {
    const onRetry = jest.fn();
    const networkError = new Error("Network request failed");
    const { getByTestId, getByText } = render(
      <ScreenState
        error={networkError}
        hasData={false}
        onRetry={onRetry}
      />,
    );
    expect(getByTestId("screen-state-offline")).toBeTruthy();
    expect(getByText("No connection")).toBeTruthy();
    const retryBtn = getByTestId("screen-state-retry");
    fireEvent.press(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders server error state with working Retry when error is a 500 ApiError", () => {
    const onRetry = jest.fn();
    const serverError = new ApiError(500, { error: "Database unreachable" }, "Database unreachable");
    const { getByTestId, getByText } = render(
      <ScreenState
        error={serverError}
        hasData={false}
        onRetry={onRetry}
      />,
    );
    expect(getByTestId("screen-state-server")).toBeTruthy();
    expect(getByText("Server error")).toBeTruthy();
    expect(getByText("Database unreachable")).toBeTruthy();
    const retryBtn = getByTestId("screen-state-retry");
    fireEvent.press(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when empty=true and no error", () => {
    const { getByTestId, getByText } = render(
      <ScreenState
        empty={true}
        emptyTitle="No workouts found"
        emptyMessage="Check back later."
      />,
    );
    expect(getByTestId("screen-state-empty")).toBeTruthy();
    expect(getByText("No workouts found")).toBeTruthy();
    expect(getByText("Check back later.")).toBeTruthy();
  });

  it("renders children when hasData=true", () => {
    const { getByText, queryByTestId } = render(
      <ScreenState hasData={true}>
        <Text>Real Screen Content</Text>
      </ScreenState>,
    );
    expect(getByText("Real Screen Content")).toBeTruthy();
    expect(queryByTestId("screen-state-loading")).toBeNull();
    expect(queryByTestId("screen-state-server")).toBeNull();
  });

  it("renders offline note banner above children when hasData=true but device is offline", () => {
    const networkError = new Error("Failed to fetch");
    const { getByTestId, getByText } = render(
      <ScreenState
        error={networkError}
        hasData={true}
        offlineNote="You're offline. Showing last-saved settings."
      >
        <Text>Saved Settings Content</Text>
      </ScreenState>,
    );
    expect(getByTestId("screen-state-offline-note")).toBeTruthy();
    expect(getByText("You're offline. Showing last-saved settings.")).toBeTruthy();
    expect(getByText("Saved Settings Content")).toBeTruthy();
  });

  it("honors explicit state prop overrides", () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(
      <ScreenState state="offline" onRetry={onRetry} />,
    );
    expect(getByTestId("screen-state-offline")).toBeTruthy();
  });
});
