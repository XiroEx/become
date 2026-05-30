import { needsOnboarding } from "@/lib/auth/onboardingGate";
import type { User } from "@become/api-client";

const base = { _id: "u1", email: "jon@example.com" } as User;

describe("needsOnboarding", () => {
  it("gates ONLY when onboardingCompleted === false (strict)", () => {
    expect(needsOnboarding({ ...base, onboardingCompleted: false })).toBe(true);
  });

  it("does not gate a completed user", () => {
    expect(needsOnboarding({ ...base, onboardingCompleted: true })).toBe(false);
  });

  it("does not gate a legacy user (flag absent/undefined)", () => {
    expect(needsOnboarding(base)).toBe(false);
    expect(needsOnboarding({ ...base, onboardingCompleted: undefined })).toBe(
      false,
    );
  });

  it("does not gate a null/undefined user", () => {
    expect(needsOnboarding(null)).toBe(false);
    expect(needsOnboarding(undefined)).toBe(false);
  });
});
