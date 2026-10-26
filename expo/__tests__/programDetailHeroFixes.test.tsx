/**
 * Program detail, three bugs George found on a device build (2026-10-26):
 *
 * 1. The page ended ~90pt above the tab bar on a black strip: the Stack padded
 *    the pushed screen's container for the bar AND `ProgramDetail` padded its
 *    own ScrollView. The screen now opts out of the Stack's band, like the
 *    tab roots, so the list scrolls under the glass bar.
 * 2. No cover photo: an uploaded cover is stored as a site-relative path
 *    (`/api/programs/<id>/image?v=…`), which a browser resolves and
 *    `<Image source={{ uri }}>` does not. `webAssetUrl` puts the Become origin
 *    in front of it.
 * 3. No snap: the web's `useHeroSnap` (a scroll inside the hero settles with
 *    the hero fully shown or fully gone) was never ported.
 */
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render } from "@testing-library/react-native";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { webAssetUrl } from "@/lib/media/webAssetUrl";
import { WEBAPP_BASE_URL } from "@/lib/config";

const readExpo = (rel: string) =>
  fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const sample: ProgramDetailViewModel = {
  id: "prog-hero",
  name: "Dumbbell Only",
  description: "Train anywhere.",
  durationWeeks: 8,
  trainingDaysPerWeek: 3,
  targetUser: "Beginner",
  coverImage: "/api/programs/prog-hero/image?v=1761400000000",
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1",
      weekStart: 1,
      weekEnd: 4,
      focus: "Base.",
      workouts: [{ workoutIndex: 0, day: "Day 1", title: "Full Body", exerciseCount: 0 }],
    },
  ],
};

describe("program detail: bottom band, cover photo, hero snap", () => {
  it("does not take the Stack's tab-bar band (it pads its own scroll content)", () => {
    const layout = readExpo("app/(app)/(tabs)/programming/_layout.tsx");
    expect(layout).toContain('"[id]/index"');
    expect(layout).toContain("scrollUnderRoutes={SCROLL_UNDER_ROUTES}");
    const stack = readExpo("components/navigation/TabStack.tsx");
    expect(stack).toContain("[...fullScreenRoutes, ...scrollUnderRoutes]");
    expect(readExpo("components/programs/ProgramDetail.tsx")).toContain(
      "paddingBottom: TAB_BAR_CONTENT_INSET",
    );
  });

  it("resolves a site-relative cover against the Become origin", () => {
    expect(webAssetUrl("/api/programs/p/image?v=1")).toBe(
      `${WEBAPP_BASE_URL}/api/programs/p/image?v=1`,
    );
    expect(webAssetUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(webAssetUrl("//cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(webAssetUrl("")).toBeNull();
    expect(webAssetUrl(null)).toBeNull();

    const { getByTestId } = render(<ProgramDetail program={sample} />);
    expect(getByTestId("program-detail-hero-cover").props.source).toEqual({
      uri: `${WEBAPP_BASE_URL}${sample.coverImage}`,
    });
  });

  it("snaps to the hero's top and bottom once the hero has a height, and scrolls freely past it", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const scroll = () => getByTestId("program-detail");
    expect(scroll().props.snapToOffsets).toBeUndefined();

    fireEvent(getByTestId("program-detail-hero"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 412 } },
    });
    expect(scroll().props.snapToOffsets).toEqual([0, 412]);
    expect(scroll().props.snapToEnd).toBe(false);
  });
});
