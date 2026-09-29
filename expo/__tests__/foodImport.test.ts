/* eslint-disable import/first */
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  foodRowParam,
  importExternalFood,
  isObjectIdString,
  manualFoodDataFromRow,
  parseExternalFoodId,
  parseFoodRowParam,
} from "@/lib/nutrition/foodImport";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const usdaRow = {
  _id: "usda-2341234",
  name: "Protein Bar",
  brand: "Brandy",
  category: "snacks",
  source: "usda",
  servingSize: 1,
  servingUnit: "each",
  gramsPerServing: 60,
  alternateServings: [{ label: "100 g", multiplier: 1.667 }],
  barcode: "0123456789012",
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
};

describe("parseExternalFoodId", () => {
  it("splits the synthetic prefixes the search route hands out", () => {
    expect(parseExternalFoodId("usda-2341234")).toEqual({
      source: "usda",
      externalId: "2341234",
    });
    // The import route's source name is `openfoodfacts`, not `off`.
    expect(parseExternalFoodId("off-737628064502")).toEqual({
      source: "openfoodfacts",
      externalId: "737628064502",
    });
  });

  it("returns null for a real Food id or an empty external id", () => {
    expect(parseExternalFoodId("6512c0ffee1234567890abcd")).toBeNull();
    expect(parseExternalFoodId("usda-")).toBeNull();
    expect(parseExternalFoodId(undefined)).toBeNull();
  });
});

describe("isObjectIdString", () => {
  it("only accepts a 24-char hex id", () => {
    expect(isObjectIdString("6512c0ffee1234567890abcd")).toBe(true);
    expect(isObjectIdString("usda-9")).toBe(false);
    expect(isObjectIdString(undefined)).toBe(false);
  });
});

describe("manualFoodDataFromRow", () => {
  it("builds the fallback payload importManualFood needs", () => {
    expect(manualFoodDataFromRow(usdaRow)).toEqual({
      name: "Protein Bar",
      brand: "Brandy",
      category: "snacks",
      aliases: [],
      servingSize: 1,
      servingUnit: "each",
      gramsPerServing: 60,
      alternateServings: [{ label: "100 g", multiplier: 1.667 }],
      nutrition: expect.objectContaining({ calories: 210, fats: 7 }),
    });
  });

  it("never forwards a barcode (a global key only admins may set)", () => {
    expect(manualFoodDataFromRow(usdaRow)).not.toHaveProperty("barcode");
  });

  it("is null when the row has no nutrition to persist", () => {
    // importManualFood throws without nutrition+servingSize, 500ing the route.
    expect(manualFoodDataFromRow({ name: "Banana", source: "usda" })).toBeNull();
    expect(manualFoodDataFromRow({ servingSize: 100 })).toBeNull();
    expect(manualFoodDataFromRow(null)).toBeNull();
  });

  it("round-trips through the route param", () => {
    const param = foodRowParam(usdaRow)!;
    expect(parseFoodRowParam(param)).toEqual(manualFoodDataFromRow(usdaRow));
    expect(foodRowParam({ name: "no macros" })).toBeNull();
    expect(parseFoodRowParam("{not json")).toBeNull();
    expect(parseFoodRowParam(undefined)).toBeNull();
  });
});

describe("importExternalFood", () => {
  const getToken = () => "test-jwt";
  const imported = {
    food: {
      _id: "6512c0ffee1234567890abcd",
      name: "Protein Bar",
      servingSize: 1,
      servingUnit: "each",
      nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
    },
  };

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("POSTs the ungated import route with { source, externalId }", async () => {
    mockApiFetch.mockResolvedValue(imported);
    const food = await importExternalFood({
      ref: { source: "usda", externalId: "2341234" },
      getToken,
    });
    expect(food._id).toBe("6512c0ffee1234567890abcd");
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/nutrition/foods/import");
    expect(call[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        body: { source: "usda", externalId: "2341234" },
      }),
    );
    // Never the quota-gated create.
    expect(
      mockApiFetch.mock.calls.some((c) => c[0] === "/api/nutrition/foods"),
    ).toBe(false);
  });

  it("falls back to { source: 'manual', data } with the cached row", async () => {
    mockApiFetch
      .mockRejectedValueOnce(new Error("USDA 502"))
      .mockResolvedValueOnce(imported);
    const fallback = manualFoodDataFromRow(usdaRow)!;
    const food = await importExternalFood({
      ref: { source: "usda", externalId: "2341234" },
      fallback,
      getToken,
    });
    expect(food.name).toBe("Protein Bar");
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[1]![0]).toBe("/api/nutrition/foods/import");
    expect(mockApiFetch.mock.calls[1]![2]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: { source: "manual", data: fallback },
      }),
    );
  });

  it("rethrows the source error when there is no row to fall back on", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("USDA 502"));
    await expect(
      importExternalFood({
        ref: { source: "openfoodfacts", externalId: "737628064502" },
        getToken,
      }),
    ).rejects.toThrow("USDA 502");
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
