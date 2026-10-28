/**
 * Jon, 2026-10-28: on the plate estimate, the workout generator and the swap
 * sheet, "most of the time I can't scroll up or down".
 *
 * 1. BottomSheet and Modal wrapped their content in a Pressable (to swallow
 *    taps) INSIDE the backdrop's Pressable, so two touch responders sat around
 *    every sheet's ScrollView and iOS often gave the drag to one of them. The
 *    backdrop is now a sibling behind the sheet, and the sheet is a plain View.
 * 2. The swap sheet's Create Custom Exercise form rendered below the list's
 *    flex-1 ScrollView in a fixed-height sheet, with nothing to scroll it.
 * 3. The generator's sliders claimed every move, vertical ones included.
 * 4. (Audit of every sheet, same day.) The live workout's exercise list had no
 *    ScrollView in a fixed-height, overflow-hidden sheet.
 */
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Modal } from "@/components/Modal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

type Node = { props: Record<string, unknown>; parent: Node | null };

function ancestorTestIds(node: Node): unknown[] {
  const ids: unknown[] = [];
  for (let n = node.parent; n; n = n.parent) ids.push(n.props.testID);
  return ids;
}

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("sheets leave the drag to their ScrollView", () => {
  it("BottomSheet: the sheet is not inside the backdrop, and claims no touches itself", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <BottomSheet testID="s" visible onClose={onClose} title="T">
        <Text testID="s-body">x</Text>
      </BottomSheet>,
    );
    const sheet = getByTestId("s-sheet") as unknown as Node;
    expect(ancestorTestIds(sheet)).not.toContain("s-backdrop");
    expect(sheet.props.onPress).toBeUndefined();
    expect(sheet.props.onStartShouldSetResponder).toBeUndefined();
    // A tap on the body does not close the sheet; the backdrop still does.
    fireEvent.press(getByTestId("s-body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.press(getByTestId("s-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Modal: the card is not inside the backdrop, and claims no touches itself", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Modal testID="m" visible onClose={onClose} title="T">
        <Text>x</Text>
      </Modal>,
    );
    const card = getByTestId("m-card") as unknown as Node;
    expect(ancestorTestIds(card)).not.toContain("m-backdrop");
    expect(card.props.onPress).toBeUndefined();
    fireEvent.press(getByTestId("m-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Swap: the create form scrolls, in place of the list", () => {
    const src = read("components/live/ExerciseSwapModal.tsx");
    expect(src).toContain("{showCreateForm ? null : isLoading ? (");
    const form = src.indexOf("testID={`${testID}-create-form`}");
    const scroll = src.lastIndexOf("<ScrollView", form);
    expect(scroll).toBeGreaterThan(src.indexOf("{showCreateForm ? null"));
    expect(src.slice(scroll, form)).toContain("create-scroll");
  });

  it("Generator sliders only claim sideways moves, and give the touch back", () => {
    const src = read("components/programs/GenerateSheet.tsx");
    expect(src).toContain("onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > Math.abs(g.dy)");
    expect(src).toContain("onPanResponderTerminationRequest: () => true");
    expect(src).not.toContain("onMoveShouldSetPanResponder: () => true");
  });

  it("Live exercise list scrolls, so a long workout's last rows are reachable", () => {
    const src = read("components/live/LiveExerciseSheet.tsx");
    const scroll = src.indexOf("<ScrollView");
    expect(scroll).toBeGreaterThan(-1);
    expect(src.indexOf("exercises.map(")).toBeGreaterThan(scroll);
    expect(src.indexOf("</ScrollView>")).toBeGreaterThan(src.indexOf("exercises.map("));
  });
});
