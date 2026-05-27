import { render, fireEvent } from "@testing-library/react-native";
import {
  AdminFoodList,
  type AdminFoodRow,
} from "@/components/admin/AdminFoodList";
import { adminFoodReviewUrl } from "@/lib/admin/adminLinks";

const foods: AdminFoodRow[] = [
  {
    id: "f1",
    name: "Test Apple",
    brand: null,
    source: "usda",
    pendingReview: true,
  },
  {
    id: "f2",
    name: "Test Bar",
    brand: "Brand X",
    source: "off",
    pendingReview: false,
  },
];

describe("AdminFoodList", () => {
  it("renders empty state when there are no foods", () => {
    const { getByTestId } = render(<AdminFoodList foods={[]} />);
    expect(getByTestId("admin-foods-empty")).toBeTruthy();
  });

  it("renders one card per food", () => {
    const { getByTestId } = render(<AdminFoodList foods={foods} />);
    expect(getByTestId("admin-foods-item-f1")).toBeTruthy();
    expect(getByTestId("admin-foods-item-f2")).toBeTruthy();
  });

  it("Edit-in-browser fires the launcher with the correct URL", async () => {
    const launcher = jest.fn(async () => undefined);
    const { getByTestId } = render(
      <AdminFoodList foods={foods} browserLauncher={launcher} />,
    );
    fireEvent.press(getByTestId("admin-foods-edit-f1"));
    expect(launcher).toHaveBeenCalledWith(adminFoodReviewUrl("f1"));
    expect(adminFoodReviewUrl("f1")).toBe(
      "https://become.redbtn.io/dashboard/admin/foods/f1",
    );
  });

  it("URL-encodes special characters in the food id", () => {
    expect(adminFoodReviewUrl("a b/c")).toBe(
      "https://become.redbtn.io/dashboard/admin/foods/a%20b%2Fc",
    );
  });
});
