import {
  act,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react-native";
import { ProgramsSearch } from "@/components/programs/ProgramsSearch";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

const empty: ProgramSummary[] = [];

describe("ProgramsSearch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the search input and the empty result state", () => {
    const onSearch = jest.fn();
    const { getByTestId } = render(
      <ProgramsSearch onSearch={onSearch} results={empty} />,
    );
    expect(getByTestId("programs-search-input")).toBeTruthy();
    expect(getByTestId("programs-search-results-empty")).toBeTruthy();
  });

  it("does not call onSearch with the new value until debounce elapses", () => {
    const onSearch = jest.fn();
    const { getByTestId } = render(
      <ProgramsSearch onSearch={onSearch} results={empty} debounceMs={300} />,
    );
    // initial render fires once with ''
    onSearch.mockClear();
    fireEvent.changeText(getByTestId("programs-search-input"), "str");
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onSearch).toHaveBeenCalledWith("str");
  });

  it("collapses rapid keystrokes into a single onSearch call", () => {
    const onSearch = jest.fn();
    const { getByTestId } = render(
      <ProgramsSearch onSearch={onSearch} results={empty} debounceMs={300} />,
    );
    onSearch.mockClear();
    fireEvent.changeText(getByTestId("programs-search-input"), "s");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    fireEvent.changeText(getByTestId("programs-search-input"), "st");
    act(() => {
      jest.advanceTimersByTime(150);
    });
    fireEvent.changeText(getByTestId("programs-search-input"), "str");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenLastCalledWith("str");
  });

  it("fires onItemPress on a result tap", async () => {
    const results: ProgramSummary[] = [
      {
        id: "p1",
        name: "Strength A",
        description: "desc",
      },
    ];
    const onItemPress = jest.fn();
    const { getByTestId } = render(
      <ProgramsSearch
        onSearch={() => {}}
        results={results}
        onItemPress={onItemPress}
      />,
    );
    await waitFor(() => {
      expect(getByTestId("programs-search-results-item-p1")).toBeTruthy();
    });
    fireEvent.press(getByTestId("programs-search-results-item-p1"));
    expect(onItemPress).toHaveBeenCalledWith("p1");
  });
});
