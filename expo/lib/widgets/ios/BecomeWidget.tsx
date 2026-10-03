/**
 * THE ONE iOS WIDGET LAYOUT — what all five WidgetKit widgets draw.
 *
 * WidgetKit does not run our code at paint time: it renders a TIMELINE the app
 * pushed earlier (`updateTimeline([{ date, props }])` from `expo-widgets`), one
 * entry per date, showing the latest entry whose date has passed. So this
 * component is a pure function of `IosWidgetProps` (`../iosTimeline.ts`):
 * today's numbers copied from the snapshot row as is, or the sign-in prompt.
 * The widget holds no business logic; it renders the feed's strings and
 * fractions.
 *
 * TWO THINGS IT KEEPS:
 *
 *  • **SwiftUI primitives only** (`@expo/ui/swift-ui`): `Text`, `VStack`,
 *    `HStack`, `Spacer` and `ProgressView` for the bar. The extension bundle
 *    renders these through the expo-widgets JS runtime — there is no style
 *    engine on the other side, so colours are named `Color` values the native
 *    side understands, not the app's RGB-triplet tokens.
 *  • **One tap target.** The whole tile links to `props.url`: a `Link` with
 *    `destination` renders the native SwiftUI `Link` view, and the `widgetURL`
 *    modifier on the root stack is WidgetKit's tap contract (SwiftUI's
 *    `View/widgetURL(_:)` — one per hierarchy). Both carry the same url, so the
 *    element tree asserts what the OS fires.
 *
 * The `'widget'` directive marks this file as a widget layout for the
 * expo-widgets bundler (see `widgets.ts`).
 */
"widget";

import type { WidgetState } from "@become/api-client";
import {
  HStack,
  Link,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import { foregroundStyle, tint, widgetURL } from "@expo/ui/swift-ui/modifiers";
import type { IosWidgetProps } from "@/lib/widgets/iosTimeline";
import { IOS_WIDGET_SIGN_IN_PROMPT } from "@/lib/widgets/iosTimeline";

/**
 * What a state looks like. `at-risk` is the only one that asks the member to
 * do something before the day ends, so it is the only one that changes the
 * headline colour; `none` dims it, because a hollow zero drawn in full white
 * reads as a number the member should recognise. Mirrors `render.tsx` on
 * purpose: the two surfaces must never disagree about what a state means.
 */
function headlineColorFor(state: WidgetState): "orange" | "secondary" | "primary" {
  if (state === "at-risk") return "orange";
  if (state === "none") return "secondary";
  return "primary";
}

/** The bar's tint follows the same rule as the headline. */
function progressTintFor(state: WidgetState): "orange" | "gray" | "green" {
  if (state === "at-risk") return "orange";
  if (state === "none") return "gray";
  return "green";
}

function SignedInWidget({
  props,
}: {
  props: Extract<IosWidgetProps, { signedIn: true }>;
}): React.JSX.Element {
  return (
    <Link destination={props.url}>
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.url)]}>
        <Text>{props.title}</Text>
        <HStack alignment="lastTextBaseline" spacing={4}>
          <Text modifiers={[foregroundStyle(headlineColorFor(props.state))]}>
            {props.headline}
          </Text>
          {props.headlineUnit ? <Text>{props.headlineUnit}</Text> : null}
        </HStack>
        <Text>{props.caption}</Text>
        {props.progress === null ? null : (
          <ProgressView
            value={props.progress}
            modifiers={[tint(progressTintFor(props.state))]}
          />
        )}
        <Spacer minLength={0} />
      </VStack>
    </Link>
  );
}

function SignedOutWidget({
  props,
}: {
  props: Extract<IosWidgetProps, { signedIn: false }>;
}): React.JSX.Element {
  return (
    <Link destination={props.url}>
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(props.url)]}>
        <Text>{props.title}</Text>
        <Text>{IOS_WIDGET_SIGN_IN_PROMPT}</Text>
        <Spacer minLength={0} />
      </VStack>
    </Link>
  );
}

/**
 * One layout for all five widgets. Signed out is the prompt and nothing about
 * the member's day — the decision is made on `signedIn`, so a snapshot row
 * left behind cannot leak through it.
 */
export function BecomeWidget(props: IosWidgetProps): React.JSX.Element {
  if (!props.signedIn) return <SignedOutWidget props={props} />;
  return <SignedInWidget props={props} />;
}
