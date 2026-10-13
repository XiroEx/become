/* eslint-disable import/first */
// NP-165 — SHARE A PROGRAM, WORKOUT OR SESSION THROUGH THE NATIVE SHARE SHEET.
//
// Fetch is mocked at the `apiFetch` seam (no network); `Share.share` is
// mocked (no sheet). The two acceptance ids, each asserted on its own below:
//
//   e015ca5d — sharing a program natively produces a link that opens the
//     public page in a browser, signed out: `POST /api/share` with the web's
//     program body, and the shared URL is the absolute public URL on the
//     web's domain (`/share/<shareId>`, the route `webapp/app/share/[shareId]`
//     renders signed out).
//   e015ca5e — the share sheet offers Messages, Mail and copy on iOS and
//     Android: the link goes through React Native's `Share.share` (the one
//     API that opens the system sheet on both platforms) with the URL as
//     both `message` and `url` (Android drops `url` without `message`; iOS
//     Mail/Messages read `message`).

import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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

const mockShare = jest.fn().mockResolvedValue({ action: "sharedAction" });
jest.mock("react-native/Libraries/Share/Share", () => ({
  __esModule: true,
  default: { share: (...args: unknown[]) => mockShare(...args) },
}));

jest.mock("@/lib/theme/useThemeTokens", () => {
  const tokens = jest.requireActual("@/lib/theme/tokens");
  const mode = "dark" as const;
  const triplets = tokens.getTokens(mode);
  const colors = Object.fromEntries(
    Object.entries(triplets).map(([k, v]) => [k, `rgb(${v})`]),
  );
  return {
    useThemeTokens: () => ({
      mode,
      isDark: true,
      colors,
      tint: (name: string, alpha: number) => tokens.tintToken(name, mode, alpha),
      scrim: "",
      statusBarStyle: "light" as const,
    }),
  };
});

import { Share } from "react-native";
import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { canShareProgram, shareLink, shareViewerUrl } from "@/lib/share/shareLink";
import { NativeShareButton } from "@/components/share/NativeShareButton";

const mockApiFetch = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockShare.mockResolvedValue({ action: "sharedAction" });
});

test("e015ca5d: sharing a program produces the absolute public-page URL", async () => {
  mockApiFetch.mockResolvedValue({ shareId: "abc123def456", url: "/share/abc123def456" });

  const url = await shareLink(
    { kind: "program", programId: "strength-foundation" },
    { getToken: () => "test-jwt", shareImpl: Share.share },
  );

  // The web's program body, verbatim.
  expect(mockApiFetch).toHaveBeenCalledWith(
    "/api/share",
    expect.anything(),
    expect.objectContaining({
      method: "POST",
      body: { kind: "program", programId: "strength-foundation" },
    }),
  );
  // Absolute URL on the web's domain — the public page it opens needs no
  // session (webapp/app/share/[shareId]/page.tsx renders signed out).
  expect(url).toBe(`${WEBAPP_BASE_URL}/share/abc123def456`);
  expect(shareViewerUrl("/share/abc123def456")).toBe(url);
});

test("e015ca5e: the link goes through the system share sheet", async () => {
  mockApiFetch.mockResolvedValue({ shareId: "abc123def456", url: "/share/abc123def456" });

  const { getByTestId } = render(
    <NativeShareButton
      body={{ kind: "program", programId: "strength-foundation" }}
      getToken={() => "test-jwt"}
      testID="share-button"
    />,
  );

  fireEvent.press(getByTestId("share-button"));
  await waitFor(() => expect(mockShare).toHaveBeenCalledTimes(1));

  // React Native's Share is the system sheet on both platforms (Messages,
  // Mail, copy); the URL travels as both message and url so neither
  // platform drops it.
  const expected = `${WEBAPP_BASE_URL}/share/abc123def456`;
  expect(mockShare).toHaveBeenCalledWith({ message: expected, url: expected });
});

test("share gate: only openable programs offer Share", () => {
  // Catalogue — every member.
  expect(canShareProgram({ isCustom: false }, "u1")).toBe(true);
  expect(canShareProgram({ isCustom: false }, null)).toBe(true);
  // Own custom.
  expect(canShareProgram({ isCustom: true, createdBy: "u1" }, "u1")).toBe(true);
  // Shared with them.
  expect(
    canShareProgram({ isCustom: true, createdBy: "coach", sharedWith: ["u1"] }, "u1"),
  ).toBe(true);
  // Another member's custom program — no button (and the server 404s).
  expect(canShareProgram({ isCustom: true, createdBy: "other" }, "u1")).toBe(false);
  expect(canShareProgram({ isCustom: true, createdBy: "other", sharedWith: [] }, "u1")).toBe(
    false,
  );
  // Nothing loaded yet — no flash of a button that cannot work.
  expect(canShareProgram(null, "u1")).toBe(false);
});
