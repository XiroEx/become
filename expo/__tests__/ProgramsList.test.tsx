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

  // NP-278: the browse card must mirror the web's — `Nw`/`Nx/wk` chips next
  // to the title, the level line for EVERY target_user (including the two
  // "X to Y" values), and a tags row capped at 4 with "+N more".
  describe("(NP-278) the browse card matches the web's", () => {
    it("shows a level line for 'Beginner to Intermediate', not just the 3 single levels", () => {
      const programs: ProgramSummary[] = [
        {
          id: "p1",
          name: "12 Week Fat-Loss Foundation Program",
          description: "d",
          targetUser: "Beginner to Intermediate",
        },
      ];
      const { getByText } = render(<ProgramsList programs={programs} />);
      expect(getByText("Beginner to Intermediate")).toBeTruthy();
    });

    it("renders duration and frequency as separate chips, not concatenated into the level line", () => {
      const programs: ProgramSummary[] = [
        {
          id: "p1",
          name: "Strength 5x5",
          description: "d",
          durationWeeks: 4,
          trainingDaysPerWeek: 5,
          targetUser: "Intermediate",
        },
      ];
      const { getByText, queryByText } = render(
        <ProgramsList programs={programs} />,
      );
      expect(getByText("4w")).toBeTruthy();
      expect(getByText("5x/wk")).toBeTruthy();
      expect(getByText("Intermediate")).toBeTruthy();
      expect(
        queryByText("Intermediate · 4 weeks · 5d / week"),
      ).toBeNull();
    });

    it("caps tags at 4 and shows '+N more' for the rest", () => {
      const programs: ProgramSummary[] = [
        {
          id: "p1",
          name: "Tagged Program",
          description: "d",
          tags: ["Fat Loss", "HIIT", "Conditioning", "Strength", "Mobility"],
        },
      ];
      const { getByText } = render(<ProgramsList programs={programs} />);
      expect(getByText("Fat Loss")).toBeTruthy();
      expect(getByText("Strength")).toBeTruthy();
      expect(getByText("+1 more")).toBeTruthy();
    });
  });
});
