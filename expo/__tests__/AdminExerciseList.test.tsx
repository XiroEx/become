import { render, fireEvent } from "@testing-library/react-native";
import {
  AdminExerciseList,
  type AdminExerciseRow,
} from "@/components/admin/AdminExerciseList";
import { adminExerciseEditUrl } from "@/lib/admin/adminLinks";

const exercises: AdminExerciseRow[] = [
  { slug: "bench-press", name: "Bench Press", category: "Push", hasVideo: true },
  { slug: "deadlift", name: "Deadlift", category: "Pull", hasVideo: false },
];

describe("AdminExerciseList", () => {
  it("renders empty state when there are no exercises", () => {
    const { getByTestId } = render(<AdminExerciseList exercises={[]} />);
    expect(getByTestId("admin-exercises-empty")).toBeTruthy();
  });

  it("renders one card per exercise", () => {
    const { getByTestId } = render(<AdminExerciseList exercises={exercises} />);
    expect(getByTestId("admin-exercises-item-bench-press")).toBeTruthy();
    expect(getByTestId("admin-exercises-item-deadlift")).toBeTruthy();
  });

  it("Edit-in-browser fires the launcher with the slug-encoded URL", async () => {
    const launcher = jest.fn(async () => undefined);
    const { getByTestId } = render(
      <AdminExerciseList
        exercises={exercises}
        browserLauncher={launcher}
      />,
    );
    fireEvent.press(getByTestId("admin-exercises-edit-bench-press"));
    expect(launcher).toHaveBeenCalledWith(adminExerciseEditUrl("bench-press"));
    expect(adminExerciseEditUrl("bench-press")).toBe(
      "https://become.redbtn.io/dashboard/admin/exercises/bench-press",
    );
  });

  it("URL-encodes special characters in the slug", () => {
    expect(adminExerciseEditUrl("a b/c")).toBe(
      "https://become.redbtn.io/dashboard/admin/exercises/a%20b%2Fc",
    );
  });
});
