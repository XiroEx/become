/* eslint-disable import/first */
// THE REVIEWER DEMO SIGN-IN, on the native sign-in screen.
//
// Apple and Google hand the build to a person who has to sign in, and a magic
// link needs an inbox they do not have. The store builds therefore carry the
// same narrow door the web does: the designated demo account, a fixed code
// from the runtime config, typed on the NORMAL sign-in screen.
//
// What this pins, and why each one is a way the door quietly stops existing:
//
//   • the control is reachable in a store build — collapsed behind one tap on
//     the sign-in screen, and absent from sign-UP (a review code cannot create
//     an account);
//   • the default call posts REVIEW_SIGN_IN_PATH to the webapp base URL and
//     parses the shared schema, so a renamed route fails here rather than in
//     App Review;
//   • a granted code is STORED as the session and the app routes on, exactly
//     as it does after a magic link;
//   • a refusal (wrong code, wrong account, rate limited, door switched off)
//     leaves the member on the screen with the server's own message.
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
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

import { apiFetch, ApiError, ReviewSignInResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import LoginScreen, { REVIEW_SIGN_IN_PATH } from "../app/(auth)/login";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("LoginScreen — review code", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockAuth = baseAuth();
  });

  it("is the path the server serves", () => {
    expect(REVIEW_SIGN_IN_PATH).toBe("/api/auth/review-sign-in");
  });

  it("is one tap from the sign-in screen and hidden until asked for", () => {
    const { getByTestId, queryByTestId } = render(<LoginScreen />);
    expect(queryByTestId("login-review-code")).toBeNull();
    fireEvent.press(getByTestId("login-review-code-disclosure"));
    expect(getByTestId("login-review-code-input")).toBeTruthy();
    expect(getByTestId("login-review-code-submit")).toBeTruthy();
  });

  it("is not offered on the sign-up screen", () => {
    const { queryByTestId } = render(<LoginScreen initialMode="register" />);
    expect(queryByTestId("login-review-code-disclosure")).toBeNull();
  });

  it("POSTs the review code to the webapp and stores the session", async () => {
    mockApiFetch.mockResolvedValue({
      token: "review-jwt",
      user: { id: "u1", name: "Alex Reviewer", email: "app-review@become.redbtn.io" },
    });
    const { getByTestId } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId("login-email"), " App-Review@Become.redbtn.io ");
    fireEvent.press(getByTestId("login-review-code-disclosure"));
    fireEvent.changeText(getByTestId("login-review-code-input"), "become-review-2026-a1b2");
    fireEvent.press(getByTestId("login-review-code-submit"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        REVIEW_SIGN_IN_PATH,
        ReviewSignInResponseSchema,
        {
          method: "POST",
          body: {
            email: "app-review@become.redbtn.io",
            code: "become-review-2026-a1b2",
          },
          baseUrl: WEBAPP_BASE_URL,
        },
      );
    });
    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("review-jwt"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });

  it("shows the server's refusal and stays put — wrong code or wrong account", async () => {
    const reviewSignInFn = jest.fn().mockRejectedValue(
      new ApiError(403, {
        message: "That review code is not valid for this email address.",
        error: "invalid_review_code",
      }),
    );
    const { getByTestId, findByText } = render(
      <LoginScreen reviewSignInFn={reviewSignInFn} />,
    );

    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent.press(getByTestId("login-review-code-disclosure"));
    fireEvent.changeText(getByTestId("login-review-code-input"), "become-review-2026-a1b2");
    fireEvent.press(getByTestId("login-review-code-submit"));

    expect(
      await findByText("That review code is not valid for this email address."),
    ).toBeTruthy();
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows the rate limit, and the 404 when the door is switched off", async () => {
    const limited = jest.fn().mockRejectedValue(
      new ApiError(429, {
        message: "Too many attempts. Please wait and try again.",
        error: "rate_limited",
      }),
    );
    const first = render(<LoginScreen reviewSignInFn={limited} />);
    fireEvent.changeText(first.getByTestId("login-email"), "app-review@become.redbtn.io");
    fireEvent.press(first.getByTestId("login-review-code-disclosure"));
    fireEvent.changeText(first.getByTestId("login-review-code-input"), "nope-nope-nope-1");
    fireEvent.press(first.getByTestId("login-review-code-submit"));
    expect(
      await first.findByText("Too many attempts. Please wait and try again."),
    ).toBeTruthy();

    const off = jest.fn().mockRejectedValue(
      new ApiError(404, { message: "Review sign-in is not available." }),
    );
    const second = render(<LoginScreen reviewSignInFn={off} />);
    fireEvent.changeText(second.getByTestId("login-email"), "app-review@become.redbtn.io");
    fireEvent.press(second.getByTestId("login-review-code-disclosure"));
    fireEvent.changeText(second.getByTestId("login-review-code-input"), "become-review-2026-a1b2");
    fireEvent.press(second.getByTestId("login-review-code-submit"));
    expect(await second.findByText("Review sign-in is not available.")).toBeTruthy();
    expect(mockSetToken).not.toHaveBeenCalled();
  });

  it("does not call the server without an email and a code", async () => {
    const reviewSignInFn = jest.fn();
    const { getByTestId, findByText } = render(
      <LoginScreen reviewSignInFn={reviewSignInFn} />,
    );

    fireEvent.press(getByTestId("login-review-code-disclosure"));
    fireEvent.press(getByTestId("login-review-code-submit"));

    expect(
      await findByText("Enter the email and review code you were given"),
    ).toBeTruthy();
    expect(reviewSignInFn).not.toHaveBeenCalled();
  });
});
