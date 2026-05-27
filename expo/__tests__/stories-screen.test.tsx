import { render } from "@testing-library/react-native";
import StoriesScreen from "../app/_stories";

describe("StoriesScreen", () => {
  it("mounts the stories container", () => {
    const { getByTestId } = render(<StoriesScreen />);
    expect(getByTestId("stories-screen")).toBeTruthy();
  });

  it("renders every component card section", () => {
    const { getByTestId } = render(<StoriesScreen />);
    expect(getByTestId("card-default")).toBeTruthy();
    expect(getByTestId("card-buttons")).toBeTruthy();
    expect(getByTestId("card-inputs")).toBeTruthy();
    expect(getByTestId("card-toggle")).toBeTruthy();
    expect(getByTestId("card-badges")).toBeTruthy();
    expect(getByTestId("card-overlays")).toBeTruthy();
  });

  it("matches a stable snapshot of the stories tree", () => {
    const { toJSON } = render(<StoriesScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
