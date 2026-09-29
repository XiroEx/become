/**
 * Reading the feed with the widgets token — `GET /api/widgets/summary`.
 *
 * One request for all of it, because a home screen refreshes its widgets
 * TOGETHER: four separate calls would be four auth round-trips and four copies
 * of the same `UserProgress` read, per member, on a background timer. The four
 * Android widgets therefore share one fetch, and each picks its row by `key`.
 *
 * NOTHING IS DECIDED HERE. `headline`, `headlineUnit` and `caption` arrive as
 * finished strings and `progress` as a 0..1 fraction (`webapp/lib/widgets/feed.ts`),
 * so the renderer draws what the server said. A widget that re-derived "at
 * risk", or re-formatted a calorie count, would be a second opinion about the
 * member's day sitting on their home screen next to the first one.
 *
 * `tz` IS sent, though it is optional on this route: the task handler runs on
 * the member's own device, so the cheapest correct offset is right there
 * (`currentTzOffsetMinutes()`, minutes WEST — the wire format the whole client
 * uses). Without it the server falls back to the zone stored at the member's
 * last app open, which for a quiet member across a DST change is an hour wrong
 * in exactly the direction that moves the day boundary.
 */
import {
  WidgetFeedSchema,
  appendTz,
  currentTzOffsetMinutes,
  type BecomeWidget,
  type WidgetFeed,
  type WidgetKey,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

export type WidgetFeedResult =
  /** A feed, parsed. */
  | { kind: "ok"; feed: WidgetFeed }
  /**
   * The token is no longer accepted — the member signed out (or asked for
   * deletion) and `User.widgetTokenVersion` moved past it. There is no retry
   * for this one: the widget shows the sign-in prompt and the stored token goes.
   */
  | { kind: "revoked" }
  /** Offline, a 5xx, a body we could not parse. Keep the token, keep painting. */
  | { kind: "unreachable" };

export interface FetchWidgetFeedDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Minutes WEST of UTC. Injectable so a test is not the machine's zone. */
  tzOffsetMinutes?: number | undefined;
}

/**
 * Read the feed with a widgets token. Never throws — an OS refresh that threw
 * would be a widget stuck on whatever it drew last, with nothing to read.
 */
export async function fetchWidgetFeed(
  widgetsToken: string,
  deps: FetchWidgetFeedDeps = {},
): Promise<WidgetFeedResult> {
  const baseUrl = deps.baseUrl ?? WEBAPP_BASE_URL;
  const send = deps.fetchImpl ?? fetch;
  const tz =
    deps.tzOffsetMinutes === undefined
      ? currentTzOffsetMinutes()
      : deps.tzOffsetMinutes;
  const path = appendTz("/api/widgets/summary", tz);

  let response: Response;
  try {
    response = await send(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${widgetsToken}` },
    });
  } catch {
    return { kind: "unreachable" };
  }

  // The summary route answers 401 both for a token it does not accept at all
  // and for one whose `widgetTokenVersion` is behind the stored counter — which
  // is what a sign-out leaves behind. Either way this credential is finished.
  if (response.status === 401 || response.status === 403) {
    return { kind: "revoked" };
  }
  if (!response.ok) return { kind: "unreachable" };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "unreachable" };
  }

  const parsed = WidgetFeedSchema.safeParse(body);
  // A shape we did not expect is NOT a revocation: throwing the token away over
  // a server change would sign every widget out of a working account.
  if (!parsed.success) return { kind: "unreachable" };

  return { kind: "ok", feed: parsed.data };
}

/** The row a given widget draws, or null when the feed did not carry it. */
export function feedRow(
  feed: WidgetFeed,
  key: WidgetKey,
): BecomeWidget | null {
  return feed.widgets.find((w) => w.key === key) ?? null;
}
