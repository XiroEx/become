/* eslint-disable import/first */
// THE ROOT BOUNDARY (card "A render error anywhere in the native app has
// nothing to catch it: the root layout exports no ErrorBoundary").
//
// `app/_layout.tsx` exports an `ErrorBoundary` that Expo Router (57.0.24 —
// `ErrorBoundaryProps` in its shipped types, caught by its `Try` boundary)
// renders when a route throws, instead of unmounting the tree. This suite
// pins that contract from the outside:
//
//   1. a throwing child renders the recovery screen, with the error message,
//      while the rest of the tree stays mounted;
//   2. the retry button calls `retry()` — and a retry after the cause is
//      gone brings the child back;
//   3. the screen is themed from `useThemeTokens()` and renders its copy
//      with no font preconditions (an unregistered app face falls back to
//      the system font; the screen never returns null for it).

import { Component, type ComponentType, type ReactNode } from "react";
import { View } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import type { ErrorBoundaryProps } from "expo-router";

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/theme/useThemeTokens", () => {
  const actual = jest.requireActual("@/lib/theme/useThemeTokens");
  return {
    ...actual,
    useThemeTokens: () => ({
      mode: "light" as const,
      isDark: false,
      colors: {
        background: "rgb(250 250 250)",
        foreground: "rgb(24 24 27)",
        "muted-foreground": "rgb(113 113 122)",
      },
      tint: () => "rgb(244 244 245)",
      scrim: "rgba(0,0,0,0.4)",
      statusBarStyle: "dark" as const,
    }),
  };
});

import { ErrorBoundary } from "../app/_layout";
import { RootErrorScreen } from "@/components/RootErrorScreen";
/* eslint-enable import/first */

/**
 * The router's `Try` boundary, reduced to what this suite needs: catch the
 * throw, render the route's `ErrorBoundary` export with `{ error, retry }`,
 * and re-render the route when `retry()` runs. The real one lives in
 * expo-router's internals; what matters here is the contract on OUR export.
 */
class TestCatcher extends Component<
  { catch: ComponentType<ErrorBoundaryProps>; children: ReactNode },
  { error?: Error }
> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  retry = async (): Promise<void> => {
    this.setState({ error: undefined });
  };

  override render(): ReactNode {
    if (this.state.error) {
      const Catch = this.props.catch;
      return <Catch error={this.state.error} retry={this.retry} />;
    }
    return this.props.children;
  }
}

function Boom(): ReactNode {
  throw new Error("server sent null where a list was promised");
}

function silenceConsoleError(): jest.SpyInstance {
  return jest.spyOn(console, "error").mockImplementation(() => {});
}

describe("root ErrorBoundary", () => {
  it("renders the recovery screen with the error message and leaves the rest of the tree mounted", () => {
    const spy = silenceConsoleError();
    try {
      const { getByTestId } = render(
        <View>
          <View testID="sibling">
            <View testID="sibling-child" />
          </View>
          <TestCatcher catch={ErrorBoundary}>
            <Boom />
          </TestCatcher>
        </View>,
      );

      // The boundary caught it: recovery screen, with the throw's message.
      expect(getByTestId("root-error-screen")).toBeTruthy();
      expect(getByTestId("root-error-message").props.children).toContain(
        "server sent null where a list was promised",
      );
      // The tree did not go down with it: the sibling is still mounted.
      expect(getByTestId("sibling")).toBeTruthy();
      expect(getByTestId("sibling-child")).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("wires the retry button to retry()", () => {
    const retry = jest.fn(async () => {});
    const { getByTestId } = render(
      <RootErrorScreen error={new Error("boom")} retry={retry} />,
    );
    fireEvent.press(getByTestId("root-error-retry"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("recovers the child when retry runs after the cause is gone", () => {
    const spy = silenceConsoleError();
    try {
      let broken = true;
      function Flaky(): ReactNode {
        if (broken) throw new Error("transient bad render");
        return <View testID="recovered-child" />;
      }
      const { getByTestId, queryByTestId } = render(
        <TestCatcher catch={ErrorBoundary}>
          <Flaky />
        </TestCatcher>,
      );
      expect(getByTestId("root-error-screen")).toBeTruthy();

      broken = false;
      fireEvent.press(getByTestId("root-error-retry"));
      expect(getByTestId("recovered-child")).toBeTruthy();
      expect(queryByTestId("root-error-screen")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("themes the screen from useThemeTokens() and renders its copy with no font preconditions", () => {
    const { getByTestId, getByText } = render(
      <RootErrorScreen error={new Error("boom")} retry={async () => {}} />,
    );
    const screen = getByTestId("root-error-screen");
    const backgrounds = (style: unknown): string[] => {
      if (Array.isArray(style)) return style.flatMap(backgrounds);
      if (style && typeof style === "object") {
        const value = (style as { backgroundColor?: unknown }).backgroundColor;
        return typeof value === "string" ? [value] : [];
      }
      return [];
    };
    // The mocked light palette's page colour — not a literal, not white.
    expect(backgrounds(screen.props.style)).toContain("rgb(250 250 250)");
    // Honest copy, through the app's Text (the Arial stack): present even
    // though no font was loaded for this render.
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText("Try again")).toBeTruthy();
  });
});
