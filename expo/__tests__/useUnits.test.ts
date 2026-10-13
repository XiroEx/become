import { renderHook } from "@testing-library/react-native";
import { formatWeight, useUnits } from "@/lib/hooks/useUnits";

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("useUnits & formatWeight (NP-048)", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  describe("formatWeight", () => {
    it("formats pounds as whole numbers", () => {
      expect(formatWeight(180, "lbs")).toBe("180");
      expect(formatWeight(180.4, "lbs")).toBe("180");
      expect(formatWeight(180.6, "lbs")).toBe("181");
      expect(formatWeight(180)).toBe("180"); // default is lbs
    });

    it("formats kilograms with one decimal place", () => {
      expect(formatWeight(81.6466, "kg")).toBe("81.6");
      expect(formatWeight(81.65, "kg")).toBe("81.7");
      expect(formatWeight(80, "kg")).toBe("80");
    });
  });

  describe("useUnits hook", () => {
    it("defaults to lbs when profile has no weightUnit", () => {
      mockUseAuth.mockReturnValue({
        user: { _id: "u1", email: "test@example.com" },
      });
      const { result } = renderHook(() => useUnits());
      expect(result.current.unit).toBe("lbs");
      expect(result.current.weightUnit).toBe("lbs");
      expect(result.current.isImperial).toBe(true);
      expect(result.current.isMetric).toBe(false);
      expect(result.current.formatWeight(182.4)).toBe("182");
    });

    it("reads kg when profile.weightUnit is kg", () => {
      mockUseAuth.mockReturnValue({
        user: {
          _id: "u1",
          email: "test@example.com",
          profile: { weightUnit: "kg" },
        },
      });
      const { result } = renderHook(() => useUnits());
      expect(result.current.unit).toBe("kg");
      expect(result.current.weightUnit).toBe("kg");
      expect(result.current.isImperial).toBe(false);
      expect(result.current.isMetric).toBe(true);
      expect(result.current.formatWeight(82.4)).toBe("82.4");
    });
  });
});
