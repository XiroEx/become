import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { AuthGuard } from "@/lib/auth/AuthGuard";

describe("AuthGuard", () => {
  it("renders a loading spinner while auth is loading", () => {
    const { getByTestId, queryByText } = render(
      <AuthGuard
        isAuthed={false}
        loading
        onUnauthed={() => {}}
        testID="g"
      >
        <Text>protected</Text>
      </AuthGuard>,
    );
    expect(getByTestId("g-loading")).toBeTruthy();
    expect(queryByText("protected")).toBeNull();
  });

  it("calls onUnauthed and renders fallback when unauthenticated", () => {
    const onUnauthed = jest.fn();
    const { getByTestId, queryByText } = render(
      <AuthGuard
        isAuthed={false}
        loading={false}
        onUnauthed={onUnauthed}
        testID="g"
        fallback={<Text testID="fallback-text">go to login</Text>}
      >
        <Text>protected</Text>
      </AuthGuard>,
    );
    expect(onUnauthed).toHaveBeenCalledTimes(1);
    expect(getByTestId("g-fallback")).toBeTruthy();
    expect(getByTestId("fallback-text")).toBeTruthy();
    expect(queryByText("protected")).toBeNull();
  });

  it("renders children when authenticated", () => {
    const onUnauthed = jest.fn();
    const { getByText } = render(
      <AuthGuard
        isAuthed
        loading={false}
        onUnauthed={onUnauthed}
        testID="g"
      >
        <Text>protected</Text>
      </AuthGuard>,
    );
    expect(getByText("protected")).toBeTruthy();
    expect(onUnauthed).not.toHaveBeenCalled();
  });

  it("does not call onUnauthed while still loading", () => {
    const onUnauthed = jest.fn();
    render(
      <AuthGuard isAuthed={false} loading onUnauthed={onUnauthed}>
        <Text>x</Text>
      </AuthGuard>,
    );
    expect(onUnauthed).not.toHaveBeenCalled();
  });
});
