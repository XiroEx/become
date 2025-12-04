import dbConnect from "@/lib/mongodb";
import ProgramModel from "@/models/Program";
import ProgrammingClient from "./ProgrammingClient";
import { Program } from "@/lib/data/programs";

export const dynamic = 'force-dynamic';

async function getPrograms(): Promise<Program[]> {
  await dbConnect();
  const programs = await ProgramModel.find({}).lean();
  return JSON.parse(JSON.stringify(programs));
}

export default async function ProgrammingPage() {
  const programs = await getPrograms();

  return <ProgrammingClient programs={programs} />;
}
