import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { Card } from "@/components/Card";

describe("Card", () => {
  it("renders title and subtitle when provided", () => {
    const { getByTestId } = render(
      <Card testID="card" title="Today" subtitle="Workout summary" />,
    );
    expect(getByTestId("card-title").props.children).toBe("Today");
    expect(getByTestId("card-subtitle").props.children).toBe("Workout summary");
  });

  it("renders children inside the card surface", () => {
    const { getByText } = render(
      <Card testID="card">
        <Text>Inner content</Text>
      </Card>,
    );
    expect(getByText("Inner content")).toBeTruthy();
  });

  it("exposes accessibilityLabel and summary role", () => {
    const { getByTestId } = render(
      <Card testID="card" accessibilityLabel="Today's check-in">
        <Text>x</Text>
      </Card>,
    );
    const card = getByTestId("card");
    expect(card.props.accessibilityLabel).toBe("Today's check-in");
    expect(card.props.accessibilityRole).toBe("summary");
  });
});
