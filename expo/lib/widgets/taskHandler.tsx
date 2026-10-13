/**
 * THE OS-DRIVEN REFRESH — what runs when Android, not the member, decides a
 * widget should be redrawn.
 *
 * An App Widget's provider wakes a HEADLESS JS task: this app's bundle, in this
 * app's process, with no activity, no navigation and no React tree. Three things
 * follow, and they shape every line below:
 *
 *  • **There is no session in memory.** The task reads the widgets token out of
 *    SecureStore — the hand-off the app wrote at its last open
 *    (`lib/widgets/token.ts`). No token means the member is signed out as far as
 *    the home screen is concerned, and the tile says so. That is the whole of
 *    acceptance criterion "after sign-out the widgets show the sign-in prompt":
 *    a sign-out clears the token here AND bumps `widgetTokenVersion` on the
 *    server, so both the local read and any refresh that still has the old token
 *    land on the prompt.
 *  • **It may have no network.** A refresh fires when the OS feels like it, and
 *    so does a lift. A failure falls back to the cached snapshot for TODAY, and
 *    to "open Become" when there is not one — never to a blank tile.
 *  • **It must not throw.** An exception out of a headless task is a widget
 *    frozen on whatever it drew last, with nothing anywhere saying why. So the
 *    whole body is wrapped, and the fallback path is the same one used offline.
 *
 * Registered ONCE, from the app's entry file (`expo/index.js`), because
 * `AppRegistry.registerHeadlessTask` has to have run by the time the bundle
 * finishes loading — a registration inside a screen or a layout would only exist
 * when the UI does, which in a headless task is never.
 */
import type {
  WidgetTaskHandler,
  WidgetTaskHandlerProps,
} from "react-native-android-widget";
import { currentTzOffsetMinutes } from "@become/api-client";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import { androidWidgetByName } from "@/lib/widgets/androidWidgets";
import { fetchWidgetFeed, type WidgetFeedResult } from "@/lib/widgets/feed";
import { renderAndroidWidget } from "@/lib/widgets/render";
import {
  loadSnapshot,
  saveSnapshot,
  snapshotFromFeed,
  snapshotIsForDay,
  snapshotRowFor,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";
import { clearWidgetsToken, loadWidgetsToken } from "@/lib/widgets/token";

export interface WidgetTaskDeps {
  loadToken?: () => Promise<string | null>;
  clearToken?: () => Promise<void>;
  loadSnapshot?: () => Promise<WidgetSnapshot | null>;
  saveSnapshot?: (snapshot: WidgetSnapshot) => Promise<void>;
  fetchFeed?: (token: string) => Promise<WidgetFeedResult>;
  now?: () => Date;
  /** Minutes WEST of UTC. Injectable so a test is not the machine's zone. */
  tzOffsetMinutes?: () => number;
}

type ResolvedDeps = Required<WidgetTaskDeps>;

function resolveDeps(deps: WidgetTaskDeps): ResolvedDeps {
  return {
    loadToken: deps.loadToken ?? (() => loadWidgetsToken()),
    clearToken: deps.clearToken ?? (() => clearWidgetsToken()),
    loadSnapshot: deps.loadSnapshot ?? (() => loadSnapshot()),
    saveSnapshot: deps.saveSnapshot ?? ((s) => saveSnapshot(s)),
    fetchFeed: deps.fetchFeed ?? ((token) => fetchWidgetFeed(token)),
    now: deps.now ?? (() => new Date()),
    tzOffsetMinutes: deps.tzOffsetMinutes ?? (() => currentTzOffsetMinutes() ?? 0),
  };
}

/**
 * Handle one widget action.
 *
 * `WIDGET_ADDED`, `WIDGET_UPDATE` and `WIDGET_RESIZED` all mean "draw". A
 * `WIDGET_CLICK` never arrives for the four tiles — their taps are `OPEN_URI`,
 * which the library's provider handles natively without waking JS — but if a
 * future action does, drawing the current state is the safe reading of it.
 * `WIDGET_DELETED` draws nothing: there is no tile left, and the library ignores
 * a render for one anyway.
 */
export async function handleWidgetTask(
  props: WidgetTaskHandlerProps,
  deps: WidgetTaskDeps = {},
): Promise<void> {
  if (props.widgetAction === "WIDGET_DELETED") return;

  const definition = androidWidgetByName(props.widgetInfo?.widgetName);
  // A widget from a build that declared a name this one does not. Nothing to
  // draw, and nothing broken: the provider it belongs to is gone.
  if (!definition) return;

  const d = resolveDeps(deps);
  const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());

  const draw = (signedIn: boolean, snapshot: WidgetSnapshot | null): void => {
    const usable = snapshotIsForDay(snapshot, todayKey) ? snapshot : null;
    props.renderWidget(
      renderAndroidWidget({
        definition,
        row: snapshotRowFor(usable, definition.feedKey),
        signedIn,
      }),
    );
  };

  try {
    const token = await d.loadToken();
    if (!token) {
      // Signed out — and the tile says exactly that, on every one of the four.
      draw(false, null);
      return;
    }

    const result = await d.fetchFeed(token);

    if (result.kind === "ok") {
      const snapshot = snapshotFromFeed(result.feed, d.now().getTime());
      // Saved BEFORE drawing, so the next refresh with no network has today's
      // numbers even if this draw is the last thing that happens in this task.
      await d.saveSnapshot(snapshot);
      draw(true, snapshot);
      return;
    }

    if (result.kind === "revoked") {
      // The server has stopped accepting this token: the member signed out
      // somewhere, or asked for deletion. Drop it here too — otherwise every
      // refresh for the next 180 days re-asks a question already answered — and
      // draw the prompt.
      await d.clearToken();
      draw(false, null);
      return;
    }

    // Unreachable: today's cached numbers if we have them, the invitation to
    // open the app if we do not.
    draw(true, await d.loadSnapshot());
  } catch {
    // Anything unexpected (a store that threw, a module that is not there) is
    // treated as "no fresh data": the same fallback as offline, never a throw
    // out of the task and never a blank tile.
    try {
      draw(true, await d.loadSnapshot());
    } catch {
      draw(true, null);
    }
  }
}

/** The handler registered by `expo/index.js`. */
export const widgetTaskHandler: WidgetTaskHandler = (props) =>
  handleWidgetTask(props);
