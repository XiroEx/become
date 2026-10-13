import { fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  PUSH_CARD_DISMISS_TTL_MS,
  PushOptInCard,
  shouldShowDeniedReprompt,
  shouldShowOptInCard,
} from "../components/push/PushOptInCard";

describe("push card visibility rules", () => {
  it("the 30-day dismissal matches the web's NotificationOptIn TTL", () => {
    expect(PUSH_CARD_DISMISS_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("undecided + never dismissed → show", () => {
    expect(shouldShowOptInCard("undetermined", null, 1_000)).toBe(true);
  });

  it("undecided + dismissed 29 days ago → hide", () => {
    const now = 1_000_000_000_000;
    expect(
      shouldShowOptInCard("undetermined", now - 29 * 24 * 60 * 60 * 1000, now),
    ).toBe(false);
  });

  it("undecided + dismissed 31 days ago → show again", () => {
    const now = 1_000_000_000_000;
    expect(
      shouldShowOptInCard("undetermined", now - 31 * 24 * 60 * 60 * 1000, now),
    ).toBe(true);
  });

  it("granted or denied never show the opt-in card", () => {
    expect(shouldShowOptInCard("granted", null, 1_000)).toBe(false);
    expect(shouldShowOptInCard("denied", null, 1_000)).toBe(false);
    expect(shouldShowOptInCard("unknown", null, 1_000)).toBe(false);
  });

  it("denied reprompt: silent for 7 days, then monthly", () => {
    const deniedAt = 1_000_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    expect(shouldShowDeniedReprompt(deniedAt, null, deniedAt + 6 * day)).toBe(false);
    expect(shouldShowDeniedReprompt(deniedAt, null, deniedAt + 8 * day)).toBe(true);
    expect(
      shouldShowDeniedReprompt(deniedAt, deniedAt + 8 * day, deniedAt + 20 * day),
    ).toBe(false);
    expect(
      shouldShowDeniedReprompt(deniedAt, deniedAt + 8 * day, deniedAt + 40 * day),
    ).toBe(true);
  });
});

describe("<PushOptInCard>", () => {
  it("renders the explainer + Turn on for an undecided member", async () => {
    const { getByTestId } = render(
      <PushOptInCard
        deps={{
          readState: async () => ({
            permission: "undetermined",
            dismissedAt: null,
            deniedAt: null,
            repromptShownAt: null,
          }),
          enable: async () => ({ kind: "registered" }),
        }}
      />,
    );
    await waitFor(() => expect(getByTestId("push-opt-in-card")).toBeTruthy());
    expect(getByTestId("push-opt-in-card-enable")).toBeTruthy();
  });

  it("stays hidden for a granted member", async () => {
    const { queryByTestId } = render(
      <PushOptInCard
        deps={{
          readState: async () => ({
            permission: "granted",
            dismissedAt: null,
            deniedAt: null,
            repromptShownAt: null,
          }),
        }}
      />,
    );
    await waitFor(() => expect(true).toBe(true));
    expect(queryByTestId("push-opt-in-card")).toBeNull();
  });

  it("dismiss hides the card and records the dismissal", async () => {
    const dismiss = jest.fn(async () => {});
    const { getByTestId, queryByTestId } = render(
      <PushOptInCard
        deps={{
          readState: async () => ({
            permission: "undetermined",
            dismissedAt: null,
            deniedAt: null,
            repromptShownAt: null,
          }),
          dismiss,
          enable: async () => ({ kind: "registered" }),
        }}
      />,
    );
    await waitFor(() => expect(getByTestId("push-opt-in-card")).toBeTruthy());
    fireEvent.press(getByTestId("push-opt-in-card-dismiss"));
    await waitFor(() => expect(queryByTestId("push-opt-in-card")).toBeNull());
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("Turn on runs the explicit registration, then hides", async () => {
    const enable = jest.fn(async () => ({ kind: "registered" }));
    const { getByTestId, queryByTestId } = render(
      <PushOptInCard
        deps={{
          readState: async () => ({
            permission: "undetermined",
            dismissedAt: null,
            deniedAt: null,
            repromptShownAt: null,
          }),
          enable,
        }}
      />,
    );
    await waitFor(() => expect(getByTestId("push-opt-in-card")).toBeTruthy());
    fireEvent.press(getByTestId("push-opt-in-card-enable"));
    await waitFor(() => expect(queryByTestId("push-opt-in-card")).toBeNull());
    expect(enable).toHaveBeenCalledTimes(1);
  });
});
