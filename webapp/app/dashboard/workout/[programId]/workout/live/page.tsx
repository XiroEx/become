import { Suspense } from "react";
import LiveWorkoutClient from "./LiveWorkoutClient";

export default function LiveWorkoutPage() {
  return (
    <Suspense>
      <LiveWorkoutClient />
    </Suspense>
  );
}
