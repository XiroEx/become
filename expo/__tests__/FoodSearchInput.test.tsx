import {
  act,
  fireEvent,
  render,
} from "@testing-library/react-native";
import {
  FoodSearchInput,
  type FoodSearchResult,
} from "@/components/nutrition/FoodSearchInput";

describe("FoodSearchInput", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the input and empty state initially", () => {
    const { getByTestId } = render(
      <FoodSearchInput results={[]} onSearch={() => {}} />,
    );
    expect(getByTestId("food-search-input")).toBeTruthy();
    expect(getByTestId("food-search-empty")).toBeTruthy();
  });

  it("debounces 300ms before firing onSearch with the new value", () => {
    const onSearch = jest.fn();
    const { getByTestId } = render(
      <FoodSearchInput results={[]} onSearch={onSearch} debounceMs={300} />,
    );
    onSearch.mockClear();
    fireEvent.changeText(getByTestId("food-search-input"), "appl");
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onSearch).toHaveBeenCalledWith("appl");
  });

  it("collapses rapid typing into a single onSearch call", () => {
    const onSearch = jest.fn();
    const { getByTestId } = render(
      <FoodSearchInput results={[]} onSearch={onSearch} debounceMs={300} />,
    );
    onSearch.mockClear();
    fireEvent.changeText(getByTestId("food-search-input"), "a");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    fireEvent.changeText(getByTestId("food-search-input"), "ap");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    fireEvent.changeText(getByTestId("food-search-input"), "appl");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith("appl");
  });

  it("renders source badges for each result (custom / USDA / OFF)", () => {
    const results: FoodSearchResult[] = [
      { id: "1", name: "My Eggs", source: "custom", kcalPer100g: 155 },
      { id: "2", name: "Apple, raw", source: "usda", kcalPer100g: 52 },
      { id: "3", name: "Banana", source: "off", kcalPer100g: 89 },
    ];
    const { getByTestId, getByText } = render(
      <FoodSearchInput results={results} onSearch={() => {}} />,
    );
    expect(getByTestId("food-search-result-1-source")).toBeTruthy();
    expect(getByTestId("food-search-result-2-source")).toBeTruthy();
    expect(getByTestId("food-search-result-3-source")).toBeTruthy();
    expect(getByText("Custom")).toBeTruthy();
    expect(getByText("USDA")).toBeTruthy();
    expect(getByText("OFF")).toBeTruthy();
  });

  it("onPickResult fires with the chosen FoodSearchResult", () => {
    const onPick = jest.fn();
    const results: FoodSearchResult[] = [
      { id: "x", name: "Tofu", source: "usda", kcalPer100g: 76 },
    ];
    const { getByTestId } = render(
      <FoodSearchInput results={results} onSearch={() => {}} onPickResult={onPick} />,
    );
    fireEvent.press(getByTestId("food-search-result-x"));
    expect(onPick).toHaveBeenCalledWith(results[0]);
  });
});
