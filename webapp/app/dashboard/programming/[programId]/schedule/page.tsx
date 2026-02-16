import dbConnect from "@/lib/mongodb";
import ProgramModel from "@/models/Program";
import { Program } from "@/lib/data/programs";
import ScheduleSetupClient from "./ScheduleSetupClient";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

async function getProgram(programId: string): Promise<Program | null> {
  await dbConnect();
  const program = await ProgramModel.findOne({ program_id: programId }).lean();
  if (!program) return null;
  return JSON.parse(JSON.stringify(program));
}

interface Props {
  params: Promise<{ programId: string }>;
}

export default async function ScheduleSetupPage({ params }: Props) {
  const { programId } = await params;
  const program = await getProgram(programId);

  if (!program) {
    notFound();
  }

  return (
    <ScheduleSetupClient
      programId={program.program_id}
      programName={program.name}
      trainingDaysPerWeek={program.training_days_per_week}
      durationWeeks={program.duration_weeks}
    />
  );
}
