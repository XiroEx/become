/**
 * THE SURFACE — what an Android App Widget actually draws.
 *
 * This is not a React Native screen. `react-native-android-widget` turns the
 * tree below into a `RemoteViews` hierarchy that the LAUNCHER's process
 * inflates, which is why the vocabulary is `FlexWidget` / `TextWidget` and not
 * `View` / `Text`, why there is no NativeWind (there is no style engine on the
 * other side of that boundary), and why every colour is a literal hex string.
 *
 * FOUR RULES IT KEEPS:
 *
 *  1. **The server wrote the words.** `headline`, `headlineUnit` and `caption`
 *     are drawn exactly as the feed sent them. No pluralising, no rounding, no
 *     "at risk" logic — that all lives in `webapp/lib/widgets/feed.ts` so that
 *     the widget, the app-icon badge and the daily glance cannot disagree.
 *  2. **The colours are the app's tokens.** Taken from `darkTokens`
 *     (`lib/theme/tokens.ts`) at module load, not typed out again, so the tile
 *     moves with the theme.
 *
 *     ONE palette, and it is the dark one, even though the app itself follows
 *     the system now (NP-123). A widget is not a screen: this tree is turned
 *     into `RemoteViews` by a headless task and then owned by the launcher's
 *     process, so there is nothing mounted to re-render when the member flips
 *     the system setting — a light tile would keep drawing until the next
 *     30-minute refresh, and a phone on auto would have tiles from whichever
 *     scheme was live when the task last ran. Dark on the launcher's own
 *     wallpaper is the one that is always legible. The palette is `darkTokens`
 *     rather than a literal so it still cannot drift from the app's.
 *  3. **The typeface is Geist.** The app owns its Text for exactly this reason
 *     (NP-160) and a widget is no different: `app.json` hands the three faces
 *     below to the config plugin, which copies them into the Android assets
 *     where `fontFamily` finds them by file name. A tile in Roboto beside an app
 *     in Geist is the drift that rule exists to stop.
 *  4. **Every state is a drawing, never an empty tile.** Signed out is a
 *     prompt; no cached day is an invitation to open the app. A blank widget
 *     reads as a broken app and raises no error anywhere.
 */
import type { JSX, ReactNode } from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetState } from "@become/api-client";
import { GEIST_FACES } from "@/lib/theme/fonts";
import { darkTokens, type TokenName } from "@/lib/theme/tokens";
import type { AndroidWidgetDefinition } from "@/lib/widgets/androidWidgets";
import type { WidgetSnapshotRow } from "@/lib/widgets/snapshot";
import { widgetSignInUri, widgetTapUri } from "@/lib/widgets/taps";

/** `"10 10 10"` → `"#0a0a0a"`. The tokens are RGB triplets; RemoteViews wants hex. */
export function hexFromTriplet(triplet: string): `#${string}` {
  const parts = triplet.trim().split(/\s+/).slice(0, 3);
  const hex = parts
    .map((p) => Math.max(0, Math.min(255, Number(p) || 0)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex.padEnd(6, "0")}`;
}

function token(name: TokenName): `#${string}` {
  return hexFromTriplet(darkTokens[name]);
}

/** The app's dark palette, as hex. Derived — never retyped. */
export const WIDGET_COLORS = {
  surface: token("card"),
  border: token("border"),
  foreground: token("foreground"),
  muted: token("muted-foreground"),
  primary: token("primary"),
  accent: token("accent"),
} as const;

/** The three faces the widget draws in — the app's own (see `app.json` fonts). */
export const WIDGET_FONTS = {
  title: GEIST_FACES.sans[500],
  headline: GEIST_FACES.sans[700],
  caption: GEIST_FACES.sans[400],
} as const;

/**
 * What a state looks like. `at-risk` is the only one that changes the headline
 * colour, because it is the only one asking the member to do something before
 * the day ends; `none` dims it, because a hollow zero drawn in full white reads
 * as a number the member should recognise.
 */
function fillFor(state: WidgetState): `#${string}` {
  if (state === "at-risk") return WIDGET_COLORS.accent;
  if (state === "none") return WIDGET_COLORS.border;
  return WIDGET_COLORS.primary;
}

function headlineColorFor(state: WidgetState): `#${string}` {
  if (state === "at-risk") return WIDGET_COLORS.accent;
  if (state === "none") return WIDGET_COLORS.muted;
  return WIDGET_COLORS.foreground;
}

const RADIUS = 20;

interface ShellProps {
  tapUri: string;
  accessibilityLabel: string;
  children: ReactNode;
}

/**
 * The tile itself: dark card, rounded, and clickable as ONE target.
 *
 * `OPEN_URI` is handled natively by the library's provider — `ACTION_VIEW` with
 * `FLAG_ACTIVITY_NEW_TASK` — so the tap works whether or not the app is already
 * running, and never wakes the JS task just to navigate.
 */
function WidgetShell({ tapUri, accessibilityLabel, children }: ShellProps) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: tapUri }}
      accessibilityLabel={accessibilityLabel}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 14,
        backgroundColor: WIDGET_COLORS.surface,
        borderRadius: RADIUS,
      }}
    >
      {children}
    </FlexWidget>
  );
}

function WidgetTitle({ text }: { text: string }) {
  return (
    <TextWidget
      text={text}
      maxLines={1}
      truncate="END"
      style={{
        fontSize: 12,
        fontFamily: WIDGET_FONTS.title,
        letterSpacing: 0.4,
        color: WIDGET_COLORS.muted,
      }}
    />
  );
}

/**
 * The bar. Two integer weights out of 100, because the Java side reads `weight`
 * as an int (`BaseWidget.java`) — a fractional flex would be truncated — and an
 * empty segment is left out entirely rather than given weight 0, since a
 * `LinearLayout` child with weight 0 still claims its content width. Leaving it
 * out is `null`: the library drops falsy children when it builds the tree.
 */
function WidgetProgress({
  progress,
  state,
}: {
  progress: number;
  state: WidgetState;
}) {
  const filled = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const rest = 100 - filled;
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        height: 6,
        flexDirection: "row",
        borderRadius: 3,
        backgroundColor: WIDGET_COLORS.border,
      }}
    >
      {filled > 0 ? (
        <FlexWidget
          style={{
            flex: filled,
            height: "match_parent",
            borderRadius: 3,
            backgroundColor: fillFor(state),
          }}
        />
      ) : null}
      {rest > 0 ? (
        <FlexWidget style={{ flex: rest, height: "match_parent" }} />
      ) : null}
    </FlexWidget>
  );
}

/** A widget with a feed row behind it — the normal case. */
export function BecomeWidgetSurface({
  row,
}: {
  row: WidgetSnapshotRow;
}): JSX.Element {
  return (
    <WidgetShell
      tapUri={widgetTapUri(row.deepLink)}
      accessibilityLabel={`${row.title}: ${row.headline}${
        row.headlineUnit ? ` ${row.headlineUnit}` : ""
      }. ${row.caption}`}
    >
      <WidgetTitle text={row.title} />
      <FlexWidget
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          width: "match_parent",
        }}
      >
        <TextWidget
          text={row.headline}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 30,
            fontFamily: WIDGET_FONTS.headline,
            color: headlineColorFor(row.state),
          }}
        />
        {row.headlineUnit ? (
          <TextWidget
            text={row.headlineUnit}
            maxLines={1}
            style={{
              fontSize: 12,
              fontFamily: WIDGET_FONTS.caption,
              color: WIDGET_COLORS.muted,
              marginLeft: 4,
              marginBottom: 5,
            }}
          />
        ) : null}
      </FlexWidget>
      <TextWidget
        text={row.caption}
        maxLines={2}
        truncate="END"
        style={{
          fontSize: 12,
          fontFamily: WIDGET_FONTS.caption,
          color: WIDGET_COLORS.muted,
        }}
      />
      {row.progress === null ? null : (
        <WidgetProgress progress={row.progress} state={row.state} />
      )}
    </WidgetShell>
  );
}

/**
 * SIGNED OUT — the state the card calls for by name, and the same one the iOS
 * extension draws.
 *
 * It says nothing about the member's day, because after a sign-out this app no
 * longer has the right to: the token is gone from the device and revoked on the
 * server. The tap goes to the sign-in screen rather than Home, which is where a
 * guarded route would send them anyway.
 */
export function SignedOutWidgetSurface({
  definition,
}: {
  definition: AndroidWidgetDefinition;
}): JSX.Element {
  return (
    <WidgetShell
      tapUri={widgetSignInUri()}
      accessibilityLabel={`${definition.name}: sign in to Become`}
    >
      <WidgetTitle text="Become" />
      <TextWidget
        text="Sign in"
        maxLines={1}
        style={{
          fontSize: 24,
          fontFamily: WIDGET_FONTS.headline,
          color: WIDGET_COLORS.foreground,
        }}
      />
      <TextWidget
        text="Tap to sign in and see your day."
        maxLines={2}
        style={{
          fontSize: 12,
          fontFamily: WIDGET_FONTS.caption,
          color: WIDGET_COLORS.muted,
        }}
      />
    </WidgetShell>
  );
}

/**
 * SIGNED IN, BUT NOTHING TRUSTWORTHY TO DRAW — a first refresh with no network,
 * or a cached day that has since ended.
 *
 * Deliberately NOT yesterday's numbers and deliberately not an error: the member
 * is asked to open the app, which is the one action that fixes it (every open
 * hands the token over and redraws all four).
 */
export function UnavailableWidgetSurface({
  definition,
}: {
  definition: AndroidWidgetDefinition;
}): JSX.Element {
  return (
    <WidgetShell
      tapUri={widgetTapUri("/dashboard")}
      accessibilityLabel={`${definition.name}: open Become to update`}
    >
      <WidgetTitle text={definition.name} />
      <TextWidget
        text="—"
        maxLines={1}
        style={{
          fontSize: 30,
          fontFamily: WIDGET_FONTS.headline,
          color: WIDGET_COLORS.muted,
        }}
      />
      <TextWidget
        text="Open Become to update this."
        maxLines={2}
        style={{
          fontSize: 12,
          fontFamily: WIDGET_FONTS.caption,
          color: WIDGET_COLORS.muted,
        }}
      />
    </WidgetShell>
  );
}

/** Which of the three surfaces a widget is showing. */
export type WidgetSurfaceMode = "row" | "signed-out" | "unavailable";

/**
 * THE DECISION, IN ONE PLACE — read by both callers.
 *
 * The OS refresh (`lib/widgets/taskHandler.tsx`) and the app's own redraw at
 * open and at sign-out (`lib/widgets/handoff.ts`) must never draw a member two
 * different tiles from the same facts, so neither decides: they both ask here.
 */
export function widgetSurfaceMode({
  signedIn,
  row,
}: {
  signedIn: boolean;
  row: WidgetSnapshotRow | null;
}): WidgetSurfaceMode {
  if (!signedIn) return "signed-out";
  return row ? "row" : "unavailable";
}

export interface RenderWidgetArgs {
  definition: AndroidWidgetDefinition;
  /** The row for this widget, already checked against today. Null when none. */
  row: WidgetSnapshotRow | null;
  /** Is a widgets token being held for this member? */
  signedIn: boolean;
}

/** The whole tile, for one widget, in whichever state it is in. */
export function renderAndroidWidget({
  definition,
  row,
  signedIn,
}: RenderWidgetArgs): JSX.Element {
  const mode = widgetSurfaceMode({ signedIn, row });
  if (mode === "signed-out") {
    return <SignedOutWidgetSurface definition={definition} />;
  }
  if (mode === "row" && row) return <BecomeWidgetSurface row={row} />;
  return <UnavailableWidgetSurface definition={definition} />;
}
