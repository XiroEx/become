import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { OnboardingGuard } from "@/components/auth/OnboardingGuard";
import type { User } from "@become/api-client";

const base = { _id: "u1", email: "jon@example.com" } as User;

function setup(user: User | null, loading = false) {
  const onNeedsOnboarding = jest.fn();
  const r = render(
    <OnboardingGuard
      user={user}
      loading={loading}
      onNeedsOnboarding={onNeedsOnboarding}
    >
      <Text testID="protected">protected</Text>
    </OnboardingGuard>,
  );
  return { onNeedsOnboarding, ...r };
}

describe("OnboardingGuard", () => {
  it("redirects when onboardingCompleted === false (renders no children)", () => {
    const { onNeedsOnboarding, queryByTestId } = setup({
      ...base,
      onboardingCompleted: false,
    });
    expect(onNeedsOnboarding).toHaveBeenCalledTimes(1);
    expect(queryByTestId("protected")).toBeNull();
  });

  it("renders children for a completed user, no redirect", () => {
    const { onNeedsOnboarding, getByTestId } = setup({
      ...base,
      onboardingCompleted: true,
    });
    expect(onNeedsOnboarding).not.toHaveBeenCalled();
    expect(getByTestId("protected")).toBeTruthy();
  });

  it("renders children for a legacy user (flag absent), no redirect", () => {
    const { onNeedsOnboarding, getByTestId } = setup(base);
    expect(onNeedsOnboarding).not.toHaveBeenCalled();
    expect(getByTestId("protected")).toBeTruthy();
  });

  it("does not redirect while auth is still loading", () => {
    const { onNeedsOnboarding } = setup(
      { ...base, onboardingCompleted: false },
      true,
    );
    expect(onNeedsOnboarding).not.toHaveBeenCalled();
  });
});
