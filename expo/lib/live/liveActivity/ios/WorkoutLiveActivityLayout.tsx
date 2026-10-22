/**
 * THE LOCK SCREEN / DYNAMIC ISLAND LAYOUT for the live workout (NP-188).
 *
 * HOW IT REACHES THE EXTENSION. `WorkoutLiveActivityLayout` below carries the
 * `'widget'` directive, which `babel-preset-expo`'s widgets plugin
 * stringifies into the layout the native side evaluates in a bare
 * JavaScriptCore context (`node_modules/expo-widgets/ios/Widgets/
 * WidgetsJSRuntime.swift`). `createLiveActivity(name, WorkoutLiveActivityLayout)`
 * in `registerWorkoutLiveActivity.ts` registers it under
 * `WORKOUT_LIVE_ACTIVITY_NAME`; the extension's `WidgetLiveActivity` (shipped
 * inside `expo-widgets` itself — no bespoke Swift needed for this card)
 * renders whatever this function returns for the Lock Screen banner and
 * every Dynamic Island region.
 *
 * SELF-CONTAINED OR RED, same rule as `BecomeWidget.tsx`: the stringified
 * layout runs with only the `@expo/ui` views, the modifiers, `React`/jsx and
 * the JS language's own builtins (`Date` is one of those — it is a
 * JavaScriptCore global, not an import) in scope. No module-scope helper
 * reference survives, so every branch below is inline.
 *
 * THE DATE-BASED COUNTDOWN. `Text`'s `timerInterval` prop is SwiftUI's
 * `Text(timerInterval:countsDown:)` (`@expo/ui/swift-ui`'s `TextView.swift`):
 * the OS keeps it ticking on the Lock Screen with NO further JS wake-up or
 * push, exactly what the card asks for ("a date-based timer counts down
 * without further updates"). `restEndsAtMs` is `rest.endsAt` from
 * `useRestTimer`, carried in unchanged — the same instant the in-app
 * countdown uses.
 */
import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { font, frame, padding } from "@expo/ui/swift-ui/modifiers";
import type { LiveActivityLayout } from "expo-widgets";
import type { WorkoutLiveActivityProps } from "@/lib/live/liveActivity/workoutLiveActivity";

/**
 * Device review, 2026-10-22 (George's iPhone 15 Pro): the banner sat flush to
 * its top and bottom edges with an empty band on the left, the long-press
 * (expanded) island squeezed the workout title into a three-line column and
 * said "Set 1 of 1" twice, and the minimal island was a 🏋️ emoji. So:
 *
 *   • every region is padded (the banner 16 × 14, the expanded regions 6 – 10);
 *   • the Become arrow (`BecomeArrow`, a template image in the widget
 *     extension's asset catalog — `plugins/withWidgetAssets.js`) is the badge
 *     on the banner and in the compact, minimal and expanded islands;
 *   • the expanded island puts the words in the WIDE bottom region, one copy
 *     of each, and keeps the narrow leading/trailing slots for the mark and
 *     the rest countdown;
 *   • wide content is pinned leading with a large `maxWidth` frame — the
 *     props cross the bridge as JSON, which has no `Infinity`.
 */
export function WorkoutLiveActivityLayout(
  props: WorkoutLiveActivityProps,
): LiveActivityLayout {
  "widget";
  const resting = props.phase === "rest" && props.restEndsAtMs !== null;

  const banner = (
    <HStack
      spacing={12}
      modifiers={[
        padding({ horizontal: 16, vertical: 14 }),
        frame({ maxWidth: 10000, alignment: "leading" }),
      ]}
    >
      <Image assetName="BecomeArrow" />
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 12, weight: "medium" })]}>
          {props.workoutTitle}
        </Text>
        <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
          {props.exerciseName}
        </Text>
        <Text modifiers={[font({ size: 12 })]}>
          {resting ? `${props.setLabel} · Resting` : props.setLabel}
        </Text>
      </VStack>
      <Spacer />
      {resting ? (
        <Text
          timerInterval={{
            lower: new Date(),
            upper: new Date(props.restEndsAtMs as number),
          }}
          countsDown
          modifiers={[font({ size: 28, weight: "bold" })]}
        />
      ) : null}
    </HStack>
  );

  const compactLeading = (
    <Image assetName="BecomeArrow" modifiers={[padding({ leading: 4 })]} />
  );

  const compactTrailing = resting ? (
    <Text
      timerInterval={{
        lower: new Date(),
        upper: new Date(props.restEndsAtMs as number),
      }}
      countsDown
      modifiers={[font({ size: 13, weight: "semibold" }), padding({ trailing: 4 })]}
    />
  ) : (
    <Text modifiers={[font({ size: 13 }), padding({ trailing: 4 })]}>
      {props.setLabel}
    </Text>
  );

  const minimal = resting ? (
    <Text
      timerInterval={{
        lower: new Date(),
        upper: new Date(props.restEndsAtMs as number),
      }}
      countsDown
      modifiers={[font({ size: 11, weight: "semibold" })]}
    />
  ) : (
    <Image assetName="BecomeArrow" />
  );

  const expandedLeading = (
    <Image assetName="BecomeArrow" modifiers={[padding({ leading: 10, top: 6 })]} />
  );

  const expandedTrailing = resting ? (
    <Text
      timerInterval={{
        lower: new Date(),
        upper: new Date(props.restEndsAtMs as number),
      }}
      countsDown
      modifiers={[font({ size: 22, weight: "bold" }), padding({ trailing: 10, top: 6 })]}
    />
  ) : (
    <Text
      modifiers={[font({ size: 14, weight: "semibold" }), padding({ trailing: 10, top: 6 })]}
    >
      {props.setLabel}
    </Text>
  );

  const expandedBottom = (
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[
        padding({ horizontal: 10, bottom: 8 }),
        frame({ maxWidth: 10000, alignment: "leading" }),
      ]}
    >
      <Text modifiers={[font({ size: 12, weight: "medium" })]}>
        {props.workoutTitle}
      </Text>
      <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
        {props.exerciseName}
      </Text>
      {resting ? (
        <Text modifiers={[font({ size: 12 })]}>Resting</Text>
      ) : null}
    </VStack>
  );

  return {
    banner,
    compactLeading,
    compactTrailing,
    minimal,
    expandedLeading,
    expandedTrailing,
    expandedBottom,
  };
}
