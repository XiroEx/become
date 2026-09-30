/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";

let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockSetToken = jest.fn(async () => {});
let mockAuth: Record<string, unknown> = {};
const baseAuth = () => ({
  user: null,
  token: null,
  status: "signed-out",
  loading: false,
  isAuthed: false,
  signedOutReason: null,
  setToken: mockSetToken,
  refresh: jest.fn(),
  signOut: jest.fn(),
  logout: jest.fn(),
});
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import {
  apiFetch,
  ApiError,
  SendLinkResponseSchema,
} from "@become/api-client";
import { CONSENT_STATEMENT } from "@become/core";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import {
  createPendingSessionStore,
  AUTH_LINK_MAX_AGE_MS,
} from "@/lib/auth/pendingAuthSession";
import LoginScreen from "../app/(auth)/login";
import { VerifyScreen } from "../app/(auth)/verify";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("Native email-link sign-in and sign-up with consent and resumable wait", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockParams = {};
    mockAuth = baseAuth();
  });

  // Acceptance criterion (id: e015c784)
  describe("(id: e015c784) Sign-up mode with consent tick and no client version", () => {
    it("renders CONSENT_STATEMENT word for word on the sign-up screen", () => {
      const { getByTestId, getByText } = render(
        <LoginScreen initialMode="register" />,
      );

      expect(getByText("Create an account")).toBeTruthy();
      expect(getByTestId("consent-checkbox")).toBeTruthy();
      expect(getByText(CONSENT_STATEMENT)).toBeTruthy();
      expect(getByTestId("consent-checkbox").props.accessibilityRole).toBe(
        "checkbox",
      );
      expect(
        getByTestId("consent-checkbox").props.accessibilityState.checked,
      ).toBe(false);
    });

    it("allows toggling between login and register modes, preserving typed email", () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <LoginScreen initialMode="login" />,
      );

      expect(getByText("Sign in with a magic link")).toBeTruthy();
      expect(queryByTestId("consent-checkbox")).toBeNull();

      // Enter email in login mode
      fireEvent.changeText(getByTestId("login-email"), "newmember@example.com");

      // Switch to register mode
      fireEvent.press(getByTestId("login-mode-toggle"));
      expect(getByText("Create an account")).toBeTruthy();
      expect(getByTestId("consent-checkbox")).toBeTruthy();
      expect(getByTestId("login-email").props.value).toBe(
        "newmember@example.com",
      );

      // Switch back to login mode
      fireEvent.press(getByTestId("login-mode-toggle"));
      expect(getByText("Sign in with a magic link")).toBeTruthy();
      expect(queryByTestId("consent-checkbox")).toBeNull();
      expect(getByTestId("login-email").props.value).toBe(
        "newmember@example.com",
      );
    });

    it("makes register without the tick impossible (submit button is disabled)", () => {
      const { getByTestId } = render(<LoginScreen initialMode="register" />);

      fireEvent.changeText(getByTestId("login-email"), "newmember@example.com");
      const submitBtn = getByTestId("login-submit");
      expect(submitBtn.props.accessibilityState.disabled).toBe(true);

      // Pressing while disabled does not call API
      fireEvent.press(submitBtn);
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it("ticking consent enables submit and sends consent: true without sending any legal version", async () => {
      mockApiFetch.mockResolvedValue({
        success: true,
        message: "sent",
        sessionId: "sess-reg-1",
      });

      const { getByTestId } = render(
        <LoginScreen
          initialMode="register"
          checkSessionFn={async () => ({ status: "pending" as const })}
        />,
      );

      fireEvent.changeText(getByTestId("login-email"), "newmember@example.com");
      const checkbox = getByTestId("consent-checkbox");
      fireEvent.press(checkbox);
      expect(checkbox.props.accessibilityState.checked).toBe(true);

      const submitBtn = getByTestId("login-submit");
      expect(submitBtn.props.accessibilityState.disabled).toBe(false);
      fireEvent.press(submitBtn);

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/api/auth/send-link",
          SendLinkResponseSchema,
          {
            method: "POST",
            body: {
              email: "newmember@example.com",
              mode: "register",
              consent: true,
            },
            baseUrl: WEBAPP_BASE_URL,
          },
        );
      });

      // Verify the payload NEVER carries a version field
      const call = mockApiFetch.mock.calls.find(
        (c) => c[0] === "/api/auth/send-link",
      );
      const requestBody = call?.[2]?.body as Record<string, unknown>;
      expect(requestBody.version).toBeUndefined();
      expect(requestBody.legalVersion).toBeUndefined();
      expect(requestBody.termsVersion).toBeUndefined();
      expect(requestBody.consent).toBe(true);

      expect(getByTestId("login-submitted")).toBeTruthy();
    });
  });

  // Acceptance criterion (id: e015c785)
  describe("(id: e015c785) Resumable wait and direct universal link completion", () => {
    it("saves { sessionId, email, mode, startedAt } in SecureStore when link is sent", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      const fixedNow = 1775000000000;

      mockApiFetch.mockResolvedValue({
        success: true,
        message: "sent",
        sessionId: "sess-resumable-1",
      });

      const { getByTestId } = render(
        <LoginScreen
          pendingSessionStore={pendingStore}
          now={() => fixedNow}
          checkSessionFn={async () => ({ status: "pending" as const })}
        />,
      );

      fireEvent.changeText(getByTestId("login-email"), "resumable@example.com");
      fireEvent.press(getByTestId("login-submit"));

      await waitFor(() => {
        expect(getByTestId("login-submitted")).toBeTruthy();
      });

      const saved = await pendingStore.get();
      expect(saved).toEqual({
        sessionId: "sess-resumable-1",
        email: "resumable@example.com",
        mode: "login",
        startedAt: fixedNow,
      });
    });

    it("resumes polling on launch when a pending session exists and is < 15 minutes old", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      const startTime = 1775000000000;
      await pendingStore.set({
        sessionId: "sess-saved-active",
        email: "saved@example.com",
        mode: "register",
        startedAt: startTime,
      });

      const checkSessionFn = jest
        .fn()
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValue({ status: "verified", authToken: "jwt-from-poll" });

      const { getByTestId, getByText } = render(
        <LoginScreen
          pendingSessionStore={pendingStore}
          now={() => startTime + 60 * 1000} // 1 minute in
          checkSessionFn={checkSessionFn}
          pollIntervalMs={10}
        />,
      );

      // Immediately restores the waiting screen with saved email
      await waitFor(() => {
        expect(getByTestId("login-submitted")).toBeTruthy();
      });
      expect(getByText(/saved@example\.com/)).toBeTruthy();

      // Resumes polling
      await waitFor(() => {
        expect(checkSessionFn).toHaveBeenCalledWith("sess-saved-active");
      });

      // Once verified, clears pending session, sets token, navigates to "/"
      await waitFor(() => {
        expect(mockSetToken).toHaveBeenCalledWith("jwt-from-poll");
      });
      expect(mockReplace).toHaveBeenCalledWith("/");
      expect(await pendingStore.get()).toBeNull();
    });

    it("clears pending session and shows expired error on launch if >= 15 minutes old", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      const startTime = 1775000000000;
      await pendingStore.set({
        sessionId: "sess-expired-old",
        email: "old@example.com",
        mode: "login",
        startedAt: startTime,
      });

      const { queryByTestId, getByText } = render(
        <LoginScreen
          pendingSessionStore={pendingStore}
          now={() => startTime + AUTH_LINK_MAX_AGE_MS + 1000} // 15 min + 1s
        />,
      );

      await waitFor(() => {
        expect(
          getByText("That link expired. Please request a new one."),
        ).toBeTruthy();
      });
      expect(queryByTestId("login-submitted")).toBeNull();
      expect(await pendingStore.get()).toBeNull();
    });

    it("resumes or checks on return to foreground", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      const startTime = 1775000000000;
      const holder: { listener: ((status: AppStateStatus) => void) | null } = {
        listener: null,
      };
      const subscribeToAppState = (fn: (status: AppStateStatus) => void) => {
        holder.listener = fn;
        return () => {
          holder.listener = null;
        };
      };

      const checkSessionFn = jest
        .fn()
        .mockResolvedValue({ status: "pending" });

      render(
        <LoginScreen
          pendingSessionStore={pendingStore}
          now={() => startTime}
          checkSessionFn={checkSessionFn}
          subscribeToAppState={subscribeToAppState}
          pollIntervalMs={10}
        />,
      );

      // Put pending session in store while app was in background
      await pendingStore.set({
        sessionId: "sess-bg-resume",
        email: "bg@example.com",
        mode: "login",
        startedAt: startTime,
      });

      // App returns to foreground
      holder.listener?.("active");

      await waitFor(() => {
        expect(checkSessionFn).toHaveBeenCalledWith("sess-bg-resume");
      });
    });

    it("'Use a different email' stops polling, clears SecureStore, and resets to form", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      await pendingStore.set({
        sessionId: "sess-to-clear",
        email: "cancel@example.com",
        mode: "login",
        startedAt: Date.now(),
      });

      const { getByTestId, queryByTestId } = render(
        <LoginScreen
          pendingSessionStore={pendingStore}
          checkSessionFn={async () => ({ status: "pending" as const })}
          pollIntervalMs={100000}
        />,
      );

      await waitFor(() => {
        expect(getByTestId("login-submitted")).toBeTruthy();
      });

      fireEvent.press(getByTestId("login-change-email"));

      await waitFor(() => {
        expect(queryByTestId("login-submitted")).toBeNull();
      });
      expect(getByTestId("login-email")).toBeTruthy();
      expect(await pendingStore.get()).toBeNull();
    });

    it("verify.tsx completes sign-in, clears pending session, and routes through guards (/) on direct link open", async () => {
      const memory = createMemoryTokenStore();
      const pendingStore = createPendingSessionStore(memory);
      await pendingStore.set({
        sessionId: "sess-verify-clear",
        email: "verify@example.com",
        mode: "register",
        startedAt: Date.now(),
      });

      mockParams = { token: "real-token-1234", mode: "register" };
      const verifyFn = jest.fn(async () => ({ token: "jwt-direct-verify" }));
      const onSuccess = jest.fn();

      render(
        <VerifyScreen
          verifyFn={verifyFn}
          onSuccess={onSuccess}
          pendingSessionStore={pendingStore}
        />,
      );

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith("jwt-direct-verify");
      });
      expect(await pendingStore.get()).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  // Acceptance criterion (id: e015c786)
  describe("(id: e015c786) Existing email on sign-up screen shows 409 message and offers sign-in", () => {
    it("shows server's 409 'Email already in use' message and offers sign-in", async () => {
      mockApiFetch.mockRejectedValue(
        new ApiError(409, {
          message: "Email already in use. Please sign in instead.",
        }),
      );

      const { getByTestId, getByText, queryByText } = render(
        <LoginScreen
          initialMode="register"
          checkSessionFn={async () => ({ status: "pending" as const })}
        />,
      );

      fireEvent.changeText(
        getByTestId("login-email"),
        "existinguser@example.com",
      );
      fireEvent.press(getByTestId("consent-checkbox"));
      fireEvent.press(getByTestId("login-submit"));

      await waitFor(() => {
        expect(
          getByText("Email already in use. Please sign in instead."),
        ).toBeTruthy();
      });

      // The screen offers sign-in
      const offerBtn = getByTestId("login-offer-signin");
      expect(offerBtn).toBeTruthy();
      expect(offerBtn).toHaveTextContent("Sign in instead");

      // Clicking "Sign in instead" switches to login mode, keeps email, clears error
      fireEvent.press(offerBtn);
      expect(getByText("Sign in with a magic link")).toBeTruthy();
      expect(getByTestId("login-email").props.value).toBe(
        "existinguser@example.com",
      );
      expect(
        queryByText("Email already in use. Please sign in instead."),
      ).toBeNull();
    });
  });

  // Acceptance criterion (id: e015c787)
  describe("(id: e015c787) Second send within 30 seconds shows server's wait message", () => {
    it("surfaces the server's 429 throttle message verbatim", async () => {
      mockApiFetch.mockRejectedValue(
        new ApiError(
          429,
          {
            message:
              "A link was just sent. Check your inbox or try again in 27s.",
          },
          undefined,
          "27",
        ),
      );

      const { getByTestId, getByText, queryByTestId } = render(
        <LoginScreen checkSessionFn={async () => ({ status: "pending" as const })} />,
      );

      fireEvent.changeText(getByTestId("login-email"), "throttled@example.com");
      fireEvent.press(getByTestId("login-submit"));

      await waitFor(() => {
        expect(
          getByText(
            "A link was just sent. Check your inbox or try again in 27s.",
          ),
        ).toBeTruthy();
      });
      // Remains on the form with error displayed
      expect(queryByTestId("login-submitted")).toBeNull();
    });
  });
});
