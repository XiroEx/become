/* eslint-disable import/first */
// NP-165 — SHARE A PROGRAM, WORKOUT OR SESSION THROUGH THE NATIVE SHARE SHEET.
//
// Native port of `webapp/components/share/ShareButton.tsx`: `POST /api/share
// { kind: 'program' | 'workout' | 'session', programId, day, phase, session }`
// creates a public, read-only snapshot and answers `{ shareId, url }`, where
// `url` is a RELATIVE path (`/share/<shareId>`). The public page stays on the
// web (`webapp/app/share/[shareId]`, signed out) — native only creates the
// link and hands the ABSOLUTE URL on the web's domain to React Native's
// `Share.share`, so Messages, Mail and copy are offered by the system sheet
// on iOS and Android. JSON export (`GET /api/share/[shareId]`) stays
// web-only.
//
// The three acceptance ids, each asserted on its own below.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "prog-1" }),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  shareWorkoutLink,
  workoutShareViewerUrl,
} from "@/lib/share/workoutShare";
import { NativeShareButton } from "@/components/share/NativeShareButton";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  mockApiFetch.mockReset();
  jest.restoreAllMocks();
});

describe("(id: e015ca5d) Sharing a program natively produces a link that opens the public page in a browser, signed out", () => {
  it("posts kind=program and shares the absolute web URL", async () => {
    mockApiFetch.mockResolvedValue({ shareId: "abc123", url: "/share/abc123" });
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });

    const share = await shareWorkoutLink(
      { kind: "program", programId: "prog-1", token: "test-jwt" },
      {},
    );

    // Same contract as the web ShareButton: kind + programId.
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/share",
      expect.anything(),
      expect.objectContaining({
        method: "POST",
        body: { kind: "program", programId: "prog-1" },
      }),
    );
    expect(share).toEqual({ shareId: "abc123", url: "/share/abc123" });

    // The sheet opens with the ABSOLUTE URL on the web's domain — the
    // recipient opens it in a browser, where the public page renders signed
    // out (`webapp/app/share/[shareId]`).
    expect(workoutShareViewerUrl(share)).toBe(
      `${WEBAPP_BASE_URL}/share/abc123`,
    );
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `${WEBAPP_BASE_URL}/share/abc123`,
      }),
    );
  });

  it("a workout share posts programId + day, a session share posts the snapshot", async () => {
    mockApiFetch.mockResolvedValue({ shareId: "w1", url: "/share/w1" });
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });

    await shareWorkoutLink(
      { kind: "workout", programId: "prog-1", day: "Day 1", token: "t" },
      {},
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/share",
      expect.anything(),
      expect.objectContaining({
        body: { kind: "workout", programId: "prog-1", day: "Day 1" },
      }),
    );

    mockApiFetch.mockResolvedValue({ shareId: "s1", url: "/share/s1" });
    await shareWorkoutLink(
      {
        kind: "session",
        session: {
          title: "Quick Pump",
          focus: "push",
          exercises: [{ name: "Push-Up", sets: 3 }],
        },
        token: "t",
      },
      {},
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/share",
      expect.anything(),
      expect.objectContaining({
        body: {
          kind: "session",
          session: {
            title: "Quick Pump",
            focus: "push",
            exercises: [{ name: "Push-Up", sets: 3 }],
          },
        },
      }),
    );
  });

  it("a failed share rejects so the caller can render it (no sheet)", async () => {
    mockApiFetch.mockRejectedValue(new Error("404"));
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });

    await expect(
      shareWorkoutLink({ kind: "program", programId: "nope", token: "t" }, {}),
    ).rejects.toThrow();
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it("the button creates the link and surfaces a server refusal inline", async () => {
    mockApiFetch.mockResolvedValueOnce({
      shareId: "abc123",
      url: "/share/abc123",
    });
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });

    const { getByTestId, queryByTestId } = render(
      <NativeShareButton kind="program" programId="prog-1" token="t" />,
    );
    fireEvent.press(getByTestId("share-button"));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    expect(queryByTestId("share-button-error")).toBeNull();

    mockApiFetch.mockRejectedValueOnce(new Error("404"));
    fireEvent.press(getByTestId("share-button"));
    await waitFor(() =>
      expect(getByTestId("share-button-error")).toBeTruthy(),
    );
    // The refusal is another member's private program (NP-029): no sheet.
    expect(shareSpy).toHaveBeenCalledTimes(1);
  });

  it("hidden when the member cannot open the program", () => {
    const { queryByTestId } = render(
      <NativeShareButton kind="program" programId="prog-1" visible={false} />,
    );
    expect(queryByTestId("share-button")).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("(id: e015ca5e) The share sheet offers Messages, Mail and copy on iOS and Android", () => {
  it("goes through React Native Share with a plain message URL", async () => {
    mockApiFetch.mockResolvedValue({ shareId: "abc123", url: "/share/abc123" });
    const shareSpy = jest
      .spyOn(Share, "share")
      .mockResolvedValue({ action: "sharedAction" });

    await shareWorkoutLink(
      { kind: "program", programId: "prog-1", token: "test-jwt" },
      {},
    );

    // `Share.share({ message })` is what opens the SYSTEM sheet: on iOS the
    // activity view (Messages, Mail, copy, …) and on Android the chooser
    // (Messages, Gmail, copy, …). A bare URL message keeps every target —
    // no `url:` field (iOS-only) and no base64/file payload that would hide
    // copy or force a single app.
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const options = shareSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(typeof options.message).toBe("string");
    expect(options.message as string).toContain("/share/abc123");
    expect(options.url).toBeUndefined();
  });
});
