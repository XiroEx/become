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
import { Button, HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  background,
  buttonBorderShape,
  buttonStyle,
  clipped,
  controlSize,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
  resizable,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
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
 *     in the compact and minimal islands, and the placeholder inside the
 *     banner / expanded exercise tile — the tile draws the cached still
 *     (`props.imageUri`) when one exists;
 *   • the expanded island puts the words in the WIDE bottom region, one copy
 *     of each, and keeps the narrow leading/trailing slots for the mark and
 *     the rest countdown;
 *   • wide content is pinned leading with a large `maxWidth` frame — the
 *     props cross the bridge as JSON, which has no `Infinity`.
 *
 * INTERACTIVITY (the Lock Screen steppers). When `props.weightLabel` is
 * present the banner and the expanded bottom region also draw a control row —
 * `−` / `+` steppers around the load and a `Log set` button while lifting
 * (steppers only while resting, adjusting the next set). A press runs the
 * extension's `LiveActivityUserInteraction` intent, which only emits
 * `{ source, target }` to JS (`addUserInteractionListener` in
 * `useLiveActivityControls.ts`); the app then edits the live grid or
 * completes the set through the normal paths, and the next activity update
 * redraws the number. Timed / bodyweight-only sets (no `weightLabel`) draw
 * no controls.
 */
export function WorkoutLiveActivityLayout(
  props: WorkoutLiveActivityProps,
): LiveActivityLayout {
  "widget";
  // A PAUSED rest has no end instant, so it is "resting" by the flag rather
  // than by `restEndsAtMs`; its clock is drawn frozen, not counting.
  const paused = props.phase === "rest" && props.restPaused === true;
  const resting =
    props.phase === "rest" && (props.restEndsAtMs !== null || paused);
  const restClock = (
    size: number,
    weight: "bold" | "semibold",
    extra: ReturnType<typeof padding>[],
  ) =>
    paused ? (
      <Text modifiers={[font({ size, weight }), ...extra]}>
        {props.restRemainingLabel ?? "Paused"}
      </Text>
    ) : (
      <Text
        timerInterval={{
          lower: new Date(),
          upper: new Date(props.restEndsAtMs as number),
        }}
        countsDown
        modifiers={[font({ size, weight }), ...extra]}
      />
    );
  // THE CONTROLS ROW (Jon, 2026-10-29): weight − / + and reps − / + side by
  // side, then Log set while lifting, or Pause/Resume and Skip while resting.
  // Each group draws only when the set tracks it (no weight on bodyweight
  // work, no reps on timed work); the rest buttons draw whenever resting.
  const stepper = (down: string, label: string, up: string) => (
    <HStack spacing={4}>
      <Button
        target={down}
        modifiers={[
          buttonStyle("bordered"),
          buttonBorderShape("circle"),
          controlSize("small"),
        ]}
      >
        <Image systemName="minus" modifiers={[frame({ width: 14, height: 14 })]} />
      </Button>
      <Text modifiers={[font({ size: 14, weight: "semibold" })]}>{label}</Text>
      <Button
        target={up}
        modifiers={[
          buttonStyle("bordered"),
          buttonBorderShape("circle"),
          controlSize("small"),
        ]}
      >
        <Image systemName="plus" modifiers={[frame({ width: 14, height: 14 })]} />
      </Button>
    </HStack>
  );
  const showControls = !!props.weightLabel || !!props.repsLabel || resting;
  const weightControls = showControls ? (
    <HStack spacing={10} modifiers={[padding({ top: 10 })]}>
      {props.weightLabel
        ? stepper("weight-down", props.weightLabel, "weight-up")
        : null}
      {props.repsLabel ? stepper("reps-down", props.repsLabel, "reps-up") : null}
      <Spacer />
      {resting ? (
        <HStack spacing={6}>
          <Button
            target="rest-toggle"
            modifiers={[
              buttonStyle("bordered"),
              buttonBorderShape("circle"),
              controlSize("small"),
            ]}
          >
            <Image
              systemName={paused ? "play.fill" : "pause.fill"}
              modifiers={[frame({ width: 14, height: 14 })]}
            />
          </Button>
          <Button
            target="rest-skip"
            modifiers={[
              buttonStyle("bordered"),
              buttonBorderShape("circle"),
              controlSize("small"),
            ]}
          >
            <Image
              systemName="forward.end.fill"
              modifiers={[frame({ width: 14, height: 14 })]}
            />
          </Button>
        </HStack>
      ) : (
        <Button
          target="log-set"
          label="Log"
          systemImage="checkmark"
          modifiers={[buttonStyle("bordered"), controlSize("small")]}
        />
      )}
    </HStack>
  ) : null;

  // THE EXERCISE TILE. Live Activities cannot play video, so the Lock
  // Screen draws the current exercise's STILL frame when one is cached
  // (`props.imageUri`, a `file://` URI in the shared App Group — see
  // `exerciseFrameCache.ts`), else the Become arrow centred on a translucent
  // tile. Both are the same 44 pt rounded-10 tile so the layout never shifts
  // when a frame lands. Drawn in the banner and the expanded island's leading
  // slot (the compact/minimal islands keep the bare arrow — no room there);
  // the expanded slot adds the region's own outer padding.
  const exerciseTile = (padded: boolean) =>
    props.imageUri ? (
      <Image
        uiImage={props.imageUri}
        modifiers={[
          resizable(),
          aspectRatio({ contentMode: "fill", ratio: 1 }),
          frame({ width: 44, height: 44 }),
          ...(padded ? [padding({ leading: 10, top: 6 })] : []),
          clipped(),
          cornerRadius(10),
        ]}
      />
    ) : (
      <VStack
        alignment="center"
        spacing={0}
        modifiers={[
          frame({ width: 44, height: 44 }),
          ...(padded ? [padding({ leading: 10, top: 6 })] : []),
          // A hierarchical fill, not a material: inside the Dynamic Island
          // a material flattens to an opaque grey and the arrow vanished on
          // it (device review 2026-10-23).
          background(
            { type: "hierarchical", style: "quaternary" },
            shapes.roundedRectangle({ cornerRadius: 10 }),
          ),
        ]}
      >
        <Image assetName="BecomeArrow" modifiers={[foregroundStyle("white")]} />
      </VStack>
    );

  const banner = (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        padding({ horizontal: 16, vertical: 14 }),
        frame({ maxWidth: 10000, alignment: "leading" }),
      ]}
    >
      <HStack spacing={12}>
        {exerciseTile(false)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: "medium" })]}>
            {props.workoutTitle}
          </Text>
          <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
            {props.exerciseName}
          </Text>
          <Text modifiers={[font({ size: 12 })]}>
            {resting
              ? `${props.setLabel} · ${paused ? "Paused" : "Resting"}`
              : props.setLabel}
          </Text>
        </VStack>
        <Spacer />
        {resting ? (
          restClock(28, "bold", [])
        ) : null}
      </HStack>
      {weightControls}
    </VStack>
  );

  const compactLeading = (
    <Image assetName="BecomeArrow" modifiers={[padding({ leading: 4 })]} />
  );

  const compactTrailing = resting ? (
    restClock(13, "semibold", [padding({ trailing: 4 })])
  ) : (
    <Text modifiers={[font({ size: 13 }), padding({ trailing: 4 })]}>
      {props.setLabel}
    </Text>
  );

  const minimal = resting ? (
    restClock(11, "semibold", [])
  ) : (
    <Image assetName="BecomeArrow" />
  );

  // The tile sits BESIDE the words in the wide bottom region: stacked in the
  // narrow leading slot it pushed the title under it and the expanded island
  // ran out of height, clipping the steppers (device review 2026-10-23).
  const expandedLeading = (
    <Image assetName="BecomeArrow" modifiers={[padding({ leading: 10, top: 6 })]} />
  );

  const expandedTrailing = resting ? (
    restClock(22, "bold", [padding({ trailing: 10, top: 6 })])
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
      <HStack spacing={10}>
        {exerciseTile(false)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 12, weight: "medium" })]}>
            {props.workoutTitle}
          </Text>
          <Text modifiers={[font({ size: 18, weight: "semibold" })]}>
            {props.exerciseName}
          </Text>
          {resting ? (
            <Text modifiers={[font({ size: 12 })]}>{paused ? "Paused" : "Resting"}</Text>
          ) : null}
        </VStack>
      </HStack>
      {weightControls}
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
