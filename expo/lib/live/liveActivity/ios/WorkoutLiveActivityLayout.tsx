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
import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import type { LiveActivityLayout } from "expo-widgets";
import type { WorkoutLiveActivityProps } from "@/lib/live/liveActivity/workoutLiveActivity";

export function WorkoutLiveActivityLayout(
  props: WorkoutLiveActivityProps,
): LiveActivityLayout {
  "widget";
  const resting = props.phase === "rest" && props.restEndsAtMs !== null;

  const banner = resting ? (
    <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ size: 12, weight: "medium" })]}>
        {props.workoutTitle}
      </Text>
      <HStack spacing={8}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
            {props.exerciseName}
          </Text>
          <Text modifiers={[font({ size: 12 })]}>{props.setLabel}</Text>
        </VStack>
        <Spacer />
        <Text
          timerInterval={{
            lower: new Date(),
            upper: new Date(props.restEndsAtMs as number),
          }}
          countsDown
          modifiers={[font({ size: 28, weight: "bold" })]}
        />
      </HStack>
      <Text modifiers={[font({ size: 11, weight: "medium" })]}>Resting</Text>
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ size: 12, weight: "medium" })]}>
        {props.workoutTitle}
      </Text>
      <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
        {props.exerciseName}
      </Text>
      <Text modifiers={[font({ size: 12 })]}>{props.setLabel}</Text>
    </VStack>
  );

  const compactLeading = (
    <Text modifiers={[font({ size: 13, weight: "semibold" })]}>
      {props.exerciseName}
    </Text>
  );

  const compactTrailing = resting ? (
    <Text
      timerInterval={{
        lower: new Date(),
        upper: new Date(props.restEndsAtMs as number),
      }}
      countsDown
      modifiers={[font({ size: 13, weight: "semibold" })]}
    />
  ) : (
    <Text modifiers={[font({ size: 13 })]}>{props.setLabel}</Text>
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
    <Text modifiers={[font({ size: 11, weight: "semibold" })]}>
      {"🏋️"}
    </Text>
  );

  const expandedLeading = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ size: 12, weight: "medium" })]}>
        {props.workoutTitle}
      </Text>
      <Text modifiers={[font({ size: 16, weight: "semibold" })]}>
        {props.exerciseName}
      </Text>
    </VStack>
  );

  const expandedTrailing = resting ? (
    <Text
      timerInterval={{
        lower: new Date(),
        upper: new Date(props.restEndsAtMs as number),
      }}
      countsDown
      modifiers={[font({ size: 20, weight: "bold" })]}
    />
  ) : (
    <Text modifiers={[font({ size: 14, weight: "semibold" })]}>
      {props.setLabel}
    </Text>
  );

  const expandedBottom = (
    <Text modifiers={[font({ size: 12 })]}>
      {resting ? "Resting" : props.setLabel}
    </Text>
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
