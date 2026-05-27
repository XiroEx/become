import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { AdminGate } from "@/components/admin/AdminGate";

describe("AdminGate", () => {
  it("renders children when role is 'admin'", () => {
    const { getByText, getByTestId } = render(
      <AdminGate role="admin">
        <Text>secret</Text>
      </AdminGate>,
    );
    expect(getByText("secret")).toBeTruthy();
    expect(getByTestId("admin-gate-allowed")).toBeTruthy();
  });

  it("blocks rendering when role is null", () => {
    const { queryByText, getByTestId } = render(
      <AdminGate role={null}>
        <Text>secret</Text>
      </AdminGate>,
    );
    expect(queryByText("secret")).toBeNull();
    expect(getByTestId("admin-gate-blocked")).toBeTruthy();
  });

  it("blocks rendering when role is 'user'", () => {
    const { queryByText } = render(
      <AdminGate role="user">
        <Text>secret</Text>
      </AdminGate>,
    );
    expect(queryByText("secret")).toBeNull();
  });

  it("renders a custom fallback when provided", () => {
    const { getByText } = render(
      <AdminGate role={null} fallback={<Text>nope</Text>}>
        <Text>secret</Text>
      </AdminGate>,
    );
    expect(getByText("nope")).toBeTruthy();
  });
});
