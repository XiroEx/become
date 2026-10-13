// NP-319 (comment thread) — "Vision editor (Mind > Vision > pencil, a normal
// screen): tapping the Environment field opens the keyboard over it and the
// screen does not scroll it into view." VisionDashboard doesn't own its
// ScrollView (its parent route does), so the Android scroll-into-view fix is
// handed down as `setActiveField` — this pins that every editable field
// wires its `onFocus` to it.

/* eslint-disable import/first */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import VisionDashboard from "@/components/mind/VisionDashboard";
/* eslint-enable import/first */

const mockedApiFetch = apiFetch as unknown as jest.Mock;

const EMPTY_VISION = {
  vision: null,
  alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
};

beforeEach(() => {
  mockedApiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/mind/vision") return EMPTY_VISION;
    if (path.startsWith("/api/mind/journal")) return { entries: [], counts: {} };
    throw new Error(`unexpected call: ${path}`);
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

let setActiveField: jest.Mock;

async function openEditor() {
  const utils = render(<VisionDashboard setActiveField={setActiveField} />);
  await waitFor(() => expect(utils.getByTestId("vision-dashboard")).toBeTruthy());
  fireEvent.press(utils.getByTestId("vision-paint-button"));
  await waitFor(() => expect(utils.getByTestId("vision-edit-form")).toBeTruthy());
  return utils;
}

describe("VisionDashboard Android focused-field scroll wiring (NP-319)", () => {
  beforeEach(() => {
    setActiveField = jest.fn();
  });

  it("wires the identity field's onFocus to the handed-down setActiveField", async () => {
    const { getByTestId } = await openEditor();

    const onFocus = getByTestId("vision-identity-input").props.onFocus;
    expect(typeof onFocus).toBe("function");
    onFocus();

    expect(setActiveField).toHaveBeenCalledTimes(1);
    // Must resolve to the field's own node (what measureInWindow is called
    // on), not a stale or empty ref.
    expect(setActiveField.mock.calls[0]![0]).toBeTruthy();
  });

  it("wires the Environment domain field's onFocus the same way", async () => {
    const { getByTestId } = await openEditor();

    const onFocus = getByTestId("vision-domain-environment").props.onFocus;
    expect(typeof onFocus).toBe("function");
    onFocus();

    expect(setActiveField).toHaveBeenCalledTimes(1);
    expect(setActiveField.mock.calls[0]![0]).toBeTruthy();
  });

  it("still renders without a setActiveField prop (standalone usage)", async () => {
    const utils = render(<VisionDashboard />);
    await waitFor(() => expect(utils.getByTestId("vision-dashboard")).toBeTruthy());
    fireEvent.press(utils.getByTestId("vision-paint-button"));
    await waitFor(() => expect(utils.getByTestId("vision-edit-form")).toBeTruthy());

    const onFocus = utils.getByTestId("vision-identity-input").props.onFocus;
    expect(typeof onFocus).toBe("function");
    expect(() => onFocus()).not.toThrow();
  });
});
