import { Metadata } from "next";
import ExerciseLibraryClient from "./ExerciseLibraryClient";

export const metadata: Metadata = { title: "Exercise Library" };

export default function ExerciseLibraryPage() {
  return <ExerciseLibraryClient />;
}
