import { TabStack } from "@/components/navigation/TabStack";
import { IMMERSIVE_WORKOUT_ROUTES } from "@/lib/navigation/immersiveRoutes";

/**
 * The programming tab's own Stack. Program, phase, workout overview and
 * the live workout all push here, so Back walks them in reverse and the
 * tab bar never moves.
 *
 * The live workout is the one exception, and it is deliberate (NP-381): it is
 * the web's full-screen takeover, so the glass bar hides itself while it is
 * focused and the screen keeps the bottom of the phone instead of reserving a
 * band for a bar that is not there.
 */
export default function ProgrammingTabLayout() {
  return <TabStack fullScreenRoutes={IMMERSIVE_WORKOUT_ROUTES} />;
}
