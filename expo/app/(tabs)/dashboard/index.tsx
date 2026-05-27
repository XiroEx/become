import { DashboardScreen } from "@/components/DashboardScreen";

/**
 * Route shell — full data wiring (program + schedule + streak + mutation)
 * lands in P8 once the API hooks are bound to real endpoints. P7 ships the
 * tab structure + presentational layer; this index just mounts the screen
 * with placeholder data so the navigator compiles and renders.
 */
export default function DashboardRoute() {
  return (
    <DashboardScreen
      userName={null}
      streakDays={0}
      todayWorkout={null}
      onSubmitCheckIn={() => {
        /* wired in P8 */
      }}
    />
  );
}
