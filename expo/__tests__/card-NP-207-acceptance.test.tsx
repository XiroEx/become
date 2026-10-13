/* eslint-disable import/first */
// NP-207 — NATIVE: SHORT COACH-MARK TOUR OF THE MAIN HUBS, WITH A DECLINE OPTION
//
// Origin: Jon's 2026-10-08 decision on NP-164 — a short native coach-mark
// tour through each main hub, with an upfront choice to decline. Full spec:
// expo/gap_analysis/NP-207-native-guided-tour.md.
//
// Acceptance criteria, each asserted under its id:
//
//   (id: a69ae1a4) Upfront prompt offers "Walk me through" vs "Nah, I'm good"
//     (or Skip), and the tour can be dismissed at any step
//   (id: a69ae1a5) The tour highlights each main hub — dashboard, programming,
//     nutrition, mind, profile — with concise coach copy
//   (id: a69ae1a6) Progress persists under `native-onboarding` and never
//     writes `become-onboarding`
//   (id: a69ae1a7) No native screen or modal delays rendering or waits for
//     tour completion
//   (id: a69ae1a8) Once settled (declined, dismissed or completed) the tour
//     does not re-prompt unless the member asks for it

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { NativeTourOverlay } from "../components/tour/NativeTourOverlay";
import {
  NATIVE_TOUR_HUBS,
  NATIVE_TOUR_PROGRESS_KEY,
  WEB_TOUR_PROGRESS_KEY,
} from "../lib/tour/tourConfig";
import {
  getNativeTourProgress,
  hasSettledNativeTour,
  setNativeTourStatus,
} from "../lib/tour/nativeTourProgress";
import {
  requestNativeTourReplay,
  subscribeNativeTourReplayRequests,
} from "../lib/tour/nativeTourRequest";
import { createMemoryAsyncStorage, type AsyncStorageLike } from "../lib/query/persistor";
/* eslint-enable import/first */

describe("NP-207 — Native coach-mark tour of the main hubs, with a decline option", () => {
  let storage: AsyncStorageLike;
  let onLoaded: jest.Mock;

  beforeEach(() => {
    mockPush.mockClear();
    storage = createMemoryAsyncStorage();
    onLoaded = jest.fn();
  });

  /** Renders the overlay and waits for its one-time async progress read to resolve. */
  async function renderLoaded() {
    const utils = render(
      <NativeTourOverlay storage={storage} onLoaded={onLoaded} />,
    );
    await waitFor(() => expect(onLoaded).toHaveBeenCalled(), { timeout: 10000 });
    return utils;
  }

  describe('(id: a69ae1a4) Upfront prompt offers "Walk me through" vs "Nah, I\'m good" (or Skip), and the tour can be dismissed at any step', () => {
    it("shows the upfront prompt with both choices on first run", async () => {
      const { getByTestId, getByText } = await renderLoaded();

      expect(onLoaded).toHaveBeenCalledWith("prompt");
      expect(getByTestId("native-tour-prompt")).toBeTruthy();
      expect(getByTestId("native-tour-prompt-walkthrough")).toBeTruthy();
      expect(getByText("Walk me through")).toBeTruthy();
      expect(getByTestId("native-tour-prompt-decline")).toBeTruthy();
      expect(getByText("Nah, I'm good")).toBeTruthy();
    });

    it('settles as "declined" and hides when "Nah, I\'m good" is pressed', async () => {
      const { getByTestId, queryByTestId } = await renderLoaded();

      fireEvent.press(getByTestId("native-tour-prompt-decline"));

      expect(queryByTestId("native-tour-prompt")).toBeNull();
      expect(queryByTestId("native-tour-step")).toBeNull();
      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("declined");
      });
    });

    it("can be dismissed via Skip at the FIRST step", async () => {
      const { getByTestId, queryByTestId } = await renderLoaded();

      fireEvent.press(getByTestId("native-tour-prompt-walkthrough"));
      expect(getByTestId("native-tour-step-count").props.children).toBe(
        "Step 1 of 5",
      );

      fireEvent.press(getByTestId("native-tour-step-skip"));

      expect(queryByTestId("native-tour-step")).toBeNull();
      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("dismissed");
      });
    });

    it("can be dismissed via Skip at the LAST step too — not just the first", async () => {
      const { getByTestId, queryByTestId } = await renderLoaded();
      fireEvent.press(getByTestId("native-tour-prompt-walkthrough"));

      // Walk to the last of the five hubs.
      for (let i = 0; i < NATIVE_TOUR_HUBS.length - 1; i += 1) {
        fireEvent.press(getByTestId("native-tour-step-next"));
      }
      expect(getByTestId("native-tour-step-count").props.children).toBe(
        `Step ${NATIVE_TOUR_HUBS.length} of ${NATIVE_TOUR_HUBS.length}`,
      );

      fireEvent.press(getByTestId("native-tour-step-skip"));

      expect(queryByTestId("native-tour-step")).toBeNull();
      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("dismissed");
      });
    });

    it("dismisses via the backdrop too (the Modal's own onClose), not only the Skip button", async () => {
      const { getByTestId, queryByTestId } = await renderLoaded();
      fireEvent.press(getByTestId("native-tour-prompt-walkthrough"));
      fireEvent.press(getByTestId("native-tour-step-next")); // step 2 of 5

      fireEvent.press(getByTestId("native-tour-step-backdrop"));

      expect(queryByTestId("native-tour-step")).toBeNull();
      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("dismissed");
      });
    });
  });

  describe("(id: a69ae1a5) The tour highlights each main hub — dashboard, programming, nutrition, mind, profile — with concise coach copy", () => {
    it("covers exactly the five main hubs, in order", () => {
      expect(NATIVE_TOUR_HUBS.map((h) => h.id)).toEqual([
        "dashboard",
        "programming",
        "nutrition",
        "mind",
        "profile",
      ]);
      for (const hub of NATIVE_TOUR_HUBS) {
        expect(hub.title.length).toBeGreaterThan(0);
        // "Concise" — a coach mark, not a paragraph.
        expect(hub.description.length).toBeLessThan(160);
      }
    });

    it("steps through every hub's title and description, navigating to its tab each time", async () => {
      const { getByTestId } = await renderLoaded();
      fireEvent.press(getByTestId("native-tour-prompt-walkthrough"));

      for (let i = 0; i < NATIVE_TOUR_HUBS.length; i += 1) {
        const hub = NATIVE_TOUR_HUBS[i]!;
        expect(getByTestId("native-tour-step")).toBeTruthy();
        expect(getByTestId("native-tour-step-body").props.children).toBe(
          hub.description,
        );
        await waitFor(() => {
          expect(mockPush).toHaveBeenLastCalledWith(`/(tabs)/${hub.id}`);
        });
        if (i < NATIVE_TOUR_HUBS.length - 1) {
          fireEvent.press(getByTestId("native-tour-step-next"));
        }
      }
    });

    it('ends the last step\'s button with "Done" rather than "Next"', async () => {
      const { getByTestId, getByText, queryByText } = await renderLoaded();
      fireEvent.press(getByTestId("native-tour-prompt-walkthrough"));
      for (let i = 0; i < NATIVE_TOUR_HUBS.length - 1; i += 1) {
        fireEvent.press(getByTestId("native-tour-step-next"));
      }
      expect(getByText("Done")).toBeTruthy();
      expect(queryByText("Next")).toBeNull();

      fireEvent.press(getByTestId("native-tour-step-next"));
      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("completed");
      });
    });
  });

  describe("(id: a69ae1a6) Progress persists under `native-onboarding` and never writes `become-onboarding`", () => {
    it("writes completion under the native key only", async () => {
      await setNativeTourStatus("completed", storage);
      const raw = await storage.getItem(NATIVE_TOUR_PROGRESS_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).status).toBe("completed");
      expect(await storage.getItem(WEB_TOUR_PROGRESS_KEY)).toBeNull();
    });

    it("NATIVE_TOUR_PROGRESS_KEY and WEB_TOUR_PROGRESS_KEY are distinct, and the overlay only ever touches the native one", async () => {
      expect(NATIVE_TOUR_PROGRESS_KEY).toBe("native-onboarding");
      expect(WEB_TOUR_PROGRESS_KEY).toBe("become-onboarding");

      await storage.setItem(WEB_TOUR_PROGRESS_KEY, "web-owns-this");

      const { getByTestId } = await renderLoaded();
      fireEvent.press(getByTestId("native-tour-prompt-decline"));

      await waitFor(async () => {
        const progress = await getNativeTourProgress(storage);
        expect(progress.status).toBe("declined");
      });
      // The web's key is never touched by any native write in this run.
      expect(await storage.getItem(WEB_TOUR_PROGRESS_KEY)).toBe(
        "web-owns-this",
      );
    });
  });

  describe("(id: a69ae1a7) No native screen or modal delays rendering or waits for tour completion", () => {
    it("renders nothing synchronously — the first render commits before storage resolves", () => {
      // A storage whose getItem never resolves within this test: if the
      // overlay (or anything mounting it) awaited this before painting,
      // `render()` itself would hang. It returns immediately instead,
      // proving the surrounding tree never waits on tour state.
      const neverResolves: AsyncStorageLike = {
        getItem: () => new Promise(() => {}),
        setItem: async () => {},
        removeItem: async () => {},
      };
      const { queryByTestId } = render(
        <NativeTourOverlay storage={neverResolves} />,
      );
      expect(queryByTestId("native-tour-prompt")).toBeNull();
      expect(queryByTestId("native-tour-step")).toBeNull();
    });

    it("is mounted (not awaited) once, in the signed-in app shell", () => {
      // Mirrors NP-164's own guard (card-NP-164-acceptance.test.ts): the
      // overlay is a fire-and-mount sibling of the Stack in
      // app/(app)/_layout.tsx, never something the shell waits on.
      const layoutSrc = fs.readFileSync(
        path.resolve(__dirname, "..", "app", "(app)", "_layout.tsx"),
        "utf8",
      );
      expect(layoutSrc).toMatch(/<NativeTourOverlay\s*\/>/);
      expect(layoutSrc).not.toMatch(/await[^;]*NativeTourOverlay/);
    });
  });

  describe("(id: a69ae1a8) Once settled (declined, dismissed or completed) the tour does not re-prompt unless the member asks for it", () => {
    it.each(["completed", "declined", "dismissed"] as const)(
      "does not show the prompt again on a fresh mount once status is %s",
      async (status) => {
        await setNativeTourStatus(status, storage);
        const progress = await getNativeTourProgress(storage);
        expect(hasSettledNativeTour(progress)).toBe(true);

        const { queryByTestId } = await renderLoaded();
        expect(onLoaded).toHaveBeenCalledWith("hidden");
        expect(queryByTestId("native-tour-prompt")).toBeNull();
        expect(queryByTestId("native-tour-step")).toBeNull();
      },
    );

    it("shows the prompt again ONLY after requestNativeTourReplay() — the Settings/Help escape hatch", async () => {
      await setNativeTourStatus("completed", storage);

      const { getByTestId, queryByTestId } = await renderLoaded();
      expect(queryByTestId("native-tour-prompt")).toBeNull();

      act(() => {
        requestNativeTourReplay();
      });

      expect(getByTestId("native-tour-prompt")).toBeTruthy();
    });

    it("subscribeNativeTourReplayRequests unsubscribes cleanly (no leak across mounts)", () => {
      const calls: number[] = [];
      const unsubscribe = subscribeNativeTourReplayRequests(() => {
        calls.push(1);
      });
      requestNativeTourReplay();
      unsubscribe();
      requestNativeTourReplay();
      expect(calls.length).toBe(1);
    });
  });
});
