import {
  findFoodSearchRow,
  foodDetailHref,
  narrowFoodSource,
  toFoodSearchResults,
} from "@/lib/nutrition/foodSearch";

describe("narrowFoodSource", () => {
  it("maps webapp source strings to presentational tiers", () => {
    expect(narrowFoodSource("usda")).toBe("usda");
    // The web's source string is `openfoodfacts`; `off` is only the id prefix.
    expect(narrowFoodSource("openfoodfacts")).toBe("off");
    expect(narrowFoodSource("off")).toBe("off");
    expect(narrowFoodSource("manual")).toBe("custom");
    expect(narrowFoodSource("custom")).toBe("custom");
    expect(narrowFoodSource(undefined)).toBe("custom");
  });
});

// Rows as GET /api/nutrition/foods really sends them: `_id` always (synthetic
// for an external hit), and the macros on `nutrition` — the flattened default
// variant's PER-SERVING block. There is no bare top-level `calories`.
const oatsRow = {
  _id: "db1",
  name: "Oats",
  source: "manual" as const,
  servingSize: 100,
  servingUnit: "g",
  alternateServings: [],
  nutrition: { calories: 380, protein: 13, carbs: 67, fats: 7 },
  variants: [],
};

const bananaRow = {
  _id: "usda-9",
  name: "Banana",
  brand: null,
  source: "usda" as const,
  servingSize: 100,
  servingUnit: "g",
  alternateServings: [],
  nutrition: { calories: 89, protein: 1.1, carbs: 22.8, fats: 0.3 },
  gramsPerServing: 118,
  variants: [],
};

describe("toFoodSearchResults", () => {
  it("flattens foods → results with id/source/kcalPer100g", () => {
    const results = toFoodSearchResults({ foods: [oatsRow, bananaRow] });
    expect(results).toEqual([
      { id: "db1", name: "Oats", brand: null, source: "custom", kcalPer100g: 380 },
      { id: "usda-9", name: "Banana", brand: null, source: "usda", kcalPer100g: 89 },
    ]);
  });

  it("tolerates an empty/absent response", () => {
    expect(toFoodSearchResults(null)).toEqual([]);
    expect(toFoodSearchResults({ foods: [] })).toEqual([]);
  });
});

describe("findFoodSearchRow", () => {
  const response = { foods: [oatsRow, bananaRow] };

  it("finds the raw row behind a result id", () => {
    expect(findFoodSearchRow(response, "usda-9")?.name).toBe("Banana");
    expect(findFoodSearchRow(response, "db1")?.name).toBe("Oats");
    expect(findFoodSearchRow(response, "nope")).toBeNull();
    expect(findFoodSearchRow(null, "db1")).toBeNull();
  });
});

describe("foodDetailHref", () => {
  it("carries a persistable external row so the detail screen can import it", () => {
    const href = foodDetailHref("off-737628064502", {
      name: "Crisps",
      source: "openfoodfacts",
      servingSize: 100,
      servingUnit: "g",
      gramsPerServing: 38,
      nutrition: { calories: 530, protein: 6, carbs: 50, fats: 34 },
    });
    const [path, query] = href.split("?row=");
    expect(path).toBe("/(tabs)/nutrition/food/off-737628064502");
    expect(JSON.parse(decodeURIComponent(query as string))).toEqual(
      expect.objectContaining({ name: "Crisps", gramsPerServing: 38 }),
    );
  });

  it("is a bare path for a DB food or a row with nothing to persist", () => {
    expect(foodDetailHref("6512c0ffee1234567890abcd")).toBe(
      "/(tabs)/nutrition/food/6512c0ffee1234567890abcd",
    );
    expect(foodDetailHref("usda-9", { name: "Banana" })).toBe(
      "/(tabs)/nutrition/food/usda-9",
    );
  });
});
