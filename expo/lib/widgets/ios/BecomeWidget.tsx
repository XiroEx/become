/**
 * THE iOS WIDGET LAYOUT — one component, five home-screen tiles, five sizes.
 *
 * WidgetKit does NOT run our code at paint time: it renders a TIMELINE the app
 * pushed earlier (`updateTimeline([{ date, props }])` from `expo-widgets`), one
 * entry per date, showing the latest entry whose date has passed. So this file
 * draws `IosWidgetProps` (`iosTimeline.ts`) and nothing else — the feed's
 * strings and fractions, verbatim. No fetch, no SecureStore, no date math.
 *
 * HOW IT REACHES THE EXTENSION. `BecomeWidget` below carries the `'widget'`
 * directive, which `babel-preset-expo`'s widgets plugin stringifies into the
 * layout the native side evaluates (`__expoWidgetLayout`). `createWidget(name,
 * BecomeWidget)` in `lib/widgets/ios/widgets.ts` registers that layout under
 * one `widgets[].name` from the `expo-widgets` plugin block in `app.json` —
 * one registration per row of `IOS_WIDGETS`, so a name in one and not the
 * other is a widget that never paints.
 *
 * ONE REGISTRATION, FIVE SIZES. The extension evaluates the same layout once
 * per family the widget declares (`supportedFamilies` in `app.json`, mirrored
 * as `IOS_WIDGET_FAMILIES`), handing the family in as the layout's second
 * argument (`environment.widgetFamily`: `systemSmall`, `systemMedium`,
 * `accessoryCircular`, `accessoryRectangular`, `accessoryInline`). The layout
 * branches on it below — small is the tile NP-181 drew, medium adds the macro
 * rings, and the three accessory families are the Lock Screen: a number for
 * the circle, headline plus caption for the rectangle, one line for inline.
 * An unknown or missing family draws small, never nothing.
 *
 * SELF-CONTAINED OR RED. The stringified layout is evaluated in a bare
 * JavaScriptCore context whose only globals are the `@expo/ui` views, the
 * modifiers and the React/jsx runtimes — module-scope helpers do NOT survive.
 * So every word below is a literal and every branch is inline: a free
 * reference is a ReferenceError the extension renders as a red box, with no
 * error anywhere else. That includes the sign-in prompt: it is inlined as a
 * literal (kept equal to `IOS_WIDGET_SIGN_IN_PROMPT` by
 * `__tests__/iosBecomeWidget.test.tsx`), because importing the constant would
 * be exactly such a free reference.
 *
 * THE TAP. `expo-widgets` 57 exposes NO tap-URL API of its own (no `url` on
 * `updateTimeline`, no tap prop on `createWidget` — see
 * `node_modules/expo-widgets/build/Widgets.d.ts`). The tap target is
 * `props.url` carried two ways, both native: the `Link` view's `destination`
 * (SwiftUI `Link(destination:)`, rendered by `LinkView`) AND the `widgetURL`
 * modifier on the root `VStack` (SwiftUI `.widgetURL(_:)`, the one-tap-target
 * the OS fires when the member taps anywhere else on the tile). NP-219 owns
 * verifying the tap on a real device / simulator.
 *
 * PRIMITIVES ONLY. `@expo/ui/swift-ui` Text / VStack / HStack / Spacer /
 * ProgressView / Link — every one rendered by the extension's `DynamicView`
 * (`TextView`, `VStackView`, `HStackView`, `SpacerView`, `ProgressView`,
 * `LinkView`). Nothing else from `@expo/ui` may appear here: an unmapped view
 * is an `EmptyView` in release with no error anywhere.
 */
import {
  HStack,
  Link,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import { font, widgetURL } from "@expo/ui/swift-ui/modifiers";
import type { WidgetState } from "@become/api-client";
import type { IosWidgetProps } from "@/lib/widgets/iosTimeline";

/**
 * A state tint, as a named colour the extension resolves in any scheme.
 * `done` is the only lit state; `at-risk` is the only one asking the member
 * to do something before the day ends; `none` is resting, not a number.
 *
 * NOTE — read before inlining this into the layout: the `'widget'` directive
 * stringifies `BecomeWidget` into the layout the native side evaluates, and a
 * free function reference does NOT survive that (the extension evaluates the
 * layout source with only the `@expo/ui` views, the modifiers and the
 * React/jsx runtimes in scope). So the layout draws the state as its own
 * words below, and this helper exists for non-widget callers (tests,
 * previews) that want the same mapping without evaluating the layout.
 */
export function iosWidgetStateTint(state: WidgetState): string {
  if (state === "at-risk") return "orange";
  if (state === "done") return "green";
  if (state === "todo") return "blue";
  return "gray";
}

/**
 * One tile in every size. Signed in: the feed's numbers in the shape the
 * family asks for. Signed out: the gallery title and the sign-in prompt —
 * never a number, because a number on a signed-out tile is another member's
 * day.
 *
 * `environment` is WidgetKit's, handed in by the extension: `widgetFamily`
 * names the size being painted. It is untyped on purpose — the stringified
 * layout receives whatever the OS sent, and an unknown family draws small.
 */
export function BecomeWidget(
  props: IosWidgetProps,
  environment?: { widgetFamily?: string },
): React.JSX.Element {
  "widget";
  const family = environment?.widgetFamily;
  if (!props.signedIn) {
    if (family === "accessoryCircular") {
      return (
        <VStack alignment="center" spacing={0} modifiers={[widgetURL(props.url)]}>
          <Text modifiers={[font({ size: 13, weight: "semibold" })]}>
            {"Sign in"}
          </Text>
          <Link destination={props.url} label="Open Become" />
        </VStack>
      );
    }
    if (family === "accessoryInline") {
      return (
        <VStack alignment="leading" spacing={0} modifiers={[widgetURL(props.url)]}>
          <Text>{"Become: open the app to sign in"}</Text>
          <Link destination={props.url} label="Open Become" />
        </VStack>
      );
    }
    if (family === "accessoryRectangular") {
      return (
        <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.url)]}>
          <Text modifiers={[font({ size: 13, weight: "medium" })]}>
            {props.title}
          </Text>
          <Text modifiers={[font({ size: 13, weight: "semibold" })]}>
            {"Open Become to sign in"}
          </Text>
          <Link destination={props.url} label="Open Become" />
        </VStack>
      );
    }
    if (family === "systemMedium") {
      return (
        <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url)]}>
          <Text modifiers={[font({ size: 12, weight: "medium" })]}>
            {props.title}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 14, weight: "semibold" })]}>
            {"Open Become to sign in"}
          </Text>
          <Link destination={props.url} label="Open Become" />
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 12, weight: "medium" })]}>
          {props.title}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 14, weight: "semibold" })]}>
          {"Open Become to sign in"}
        </Text>
        <Link destination={props.url} label="Open Become" />
      </VStack>
    );
  }
  if (family === "accessoryCircular") {
    return (
      <VStack alignment="center" spacing={0} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 20, weight: "bold" })]}>
          {props.headline}
        </Text>
        {props.headlineUnit ? <Text>{props.headlineUnit}</Text> : null}
        <Link destination={props.url}>
          <Text>Open</Text>
        </Link>
      </VStack>
    );
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.url)]}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 18, weight: "bold" })]}>
            {props.headline}
          </Text>
          {props.headlineUnit ? <Text>{props.headlineUnit}</Text> : null}
        </HStack>
        <Text modifiers={[font({ size: 12 })]}>{props.caption}</Text>
        <Link destination={props.url}>
          <Text>Open</Text>
        </Link>
      </VStack>
    );
  }
  if (family === "accessoryInline") {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[widgetURL(props.url)]}>
        <Link destination={props.url}>
          <Text>
            {props.headlineUnit
              ? `${props.title}: ${props.headline} ${props.headlineUnit} · ${props.caption}`
              : `${props.title}: ${props.headline} · ${props.caption}`}
          </Text>
        </Link>
      </VStack>
    );
  }
  if (family === "systemMedium") {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 12, weight: "medium" })]}>
          {props.title}
        </Text>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 26, weight: "bold" })]}>
            {props.headline}
          </Text>
          {props.headlineUnit ? <Text>{props.headlineUnit}</Text> : null}
        </HStack>
        <Text modifiers={[font({ size: 12 })]}>{props.caption}</Text>
        {props.rings.map((ring) => (
          <HStack key={ring[0]} spacing={4}>
            <Text modifiers={[font({ size: 11 })]}>
              {`${ring[0]} ${ring[1]}${ring[3]}`}
            </Text>
            <Spacer />
            {ring[2] !== null ? (
              <ProgressView value={ring[2]} />
            ) : null}
          </HStack>
        ))}
        {props.progress !== null ? (
          <ProgressView value={props.progress} />
        ) : null}
        <Text modifiers={[font({ size: 10 })]}>
          {props.state === "at-risk"
            ? "Needs attention today"
            : props.state === "done"
              ? "Done"
              : props.state === "todo"
                ? "To do"
                : "Not set up yet"}
        </Text>
        <Link destination={props.url}>
          <Text>Open</Text>
        </Link>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[widgetURL(props.url)]}>
      <Text modifiers={[font({ size: 12, weight: "medium" })]}>
        {props.title}
      </Text>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 22, weight: "bold" })]}>
          {props.headline}
        </Text>
        {props.headlineUnit ? <Text>{props.headlineUnit}</Text> : null}
      </HStack>
      <Text modifiers={[font({ size: 12 })]}>{props.caption}</Text>
      {props.progress !== null ? (
        <ProgressView value={props.progress} />
      ) : null}
      <Text modifiers={[font({ size: 10 })]}>
        {props.state === "at-risk"
          ? "Needs attention today"
          : props.state === "done"
            ? "Done"
            : props.state === "todo"
              ? "To do"
              : "Not set up yet"}
      </Text>
      <Link destination={props.url}>
        <Text>Open</Text>
      </Link>
    </VStack>
  );
}
