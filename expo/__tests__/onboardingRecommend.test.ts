import { buildOnboardingRecommendPath } from "@/lib/onboarding/useOnboardingRecommendation";
import {
  askNotificationPermissionAfterOnboarding,
  maybeShowTrialPromptAfterOnboarding,
} from "@/lib/push/afterOnboarding";

describe("buildOnboardingRecommendPath", () => {
  it("returns null with no goals (no request fires)", () => {
    expect(buildOnboardingRecommendPath({ fitnessGoals: [] })).toBeNull();
    expect(buildOnboardingRecommendPath({})).toBeNull();
  });

  it("mirrors the web query: goals, limit=1, profile=0, level, days, equipment", () => {
    const path = buildOnboardingRecommendPath({
      fitnessGoals: ["gain_muscle", "lose_weight"],
      experienceLevel: "intermediate",
      weeklyAvailability: 4,
      equipmentAccess: ["dumbbells", "barbell"],
    });
    expect(path).toBeTruthy();
    const url = new URL(`https://x.test${path!}`);
    expect(url.pathname).toBe("/api/programs/recommend");
    expect(url.searchParams.get("goals")).toBe("gain_muscle,lose_weight");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("profile")).toBe("0");
    expect(url.searchParams.get("level")).toBe("intermediate");
    expect(url.searchParams.get("days")).toBe("4");
    expect(url.searchParams.get("equipment")).toBe("dumbbells,barbell");
  });

  it("omits level/days/equipment when unanswered", () => {
    const path = buildOnboardingRecommendPath({
      fitnessGoals: ["maintain"],
    })!;
    const url = new URL(`https://x.test${path}`);
    expect(url.searchParams.get("goals")).toBe("maintain");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("profile")).toBe("0");
    expect(url.searchParams.get("level")).toBeNull();
    expect(url.searchParams.get("days")).toBeNull();
    expect(url.searchParams.get("equipment")).toBeNull();
  });
});

describe("afterOnboarding hooks", () => {
  it("askNotificationPermissionAfterOnboarding is a safe no-op until NP-065 fills it", async () => {
    await expect(askNotificationPermissionAfterOnboarding()).resolves.toBeUndefined();
  });

  it("maybeShowTrialPromptAfterOnboarding is a safe no-op until NP-129 fills it", async () => {
    await expect(maybeShowTrialPromptAfterOnboarding()).resolves.toBeUndefined();
  });
});
