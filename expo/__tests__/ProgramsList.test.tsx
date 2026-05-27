import { render, fireEvent } from "@testing-library/react-native";
import { ProgramsList } from "@/components/programs/ProgramsList";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

function makePrograms(count: number): ProgramSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `prog-${i}`,
    name: `Program ${i}`,
    description: `Description ${i}`,
    durationWeeks: 8,
    trainingDaysPerWeek: 4,
    targetUser: "Intermediate",
  }));
}

describe("ProgramsList", () => {
  it("renders an item for each program in the first page", () => {
    const programs = makePrograms(3);
    const { getByTestId } = render(<ProgramsList programs={programs} />);
    expect(getByTestId("programs-list-item-prog-0")).toBeTruthy();
    expect(getByTestId("programs-list-item-prog-1")).toBeTruthy();
    expect(getByTestId("programs-list-item-prog-2")).toBeTruthy();
  });

  it("renders empty state when the list is empty", () => {
    const { getByTestId } = render(<ProgramsList programs={[]} />);
    expect(getByTestId("programs-list-empty")).toBeTruthy();
  });

  it("paginates: 'Load more' button reveals the next page", () => {
    const programs = makePrograms(15);
    const { getByTestId, queryByTestId } = render(
      <ProgramsList programs={programs} pageSize={10} />,
    );
    expect(queryByTestId("programs-list-item-prog-9")).toBeTruthy();
    expect(queryByTestId("programs-list-item-prog-10")).toBeNull();
    fireEvent.press(getByTestId("programs-list-load-more"));
    expect(getByTestId("programs-list-item-prog-10")).toBeTruthy();
    expect(getByTestId("programs-list-item-prog-14")).toBeTruthy();
  });

  it("hides 'Load more' once everything is shown", () => {
    const programs = makePrograms(3);
    const { queryByTestId } = render(
      <ProgramsList programs={programs} pageSize={10} />,
    );
    expect(queryByTestId("programs-list-load-more")).toBeNull();
  });

  it("fires onItemPress with the program id", () => {
    const programs = makePrograms(2);
    const onItemPress = jest.fn();
    const { getByTestId } = render(
      <ProgramsList programs={programs} onItemPress={onItemPress} />,
    );
    fireEvent.press(getByTestId("programs-list-item-prog-1"));
    expect(onItemPress).toHaveBeenCalledWith("prog-1");
  });
});
