/**
 * Script to normalize workout data in the database from object format to array format
 * 
 * This fixes the issue where workouts are stored as:
 *   { "Day 1": { title: "...", exercises: [...] }, "Day 2": {...} }
 * 
 * And converts them to the expected array format:
 *   [{ day: "Day 1", title: "...", exercises: [...] }, { day: "Day 2", ... }]
 * 
 * Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/normalize_db_workouts.ts
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin';

interface WorkoutObject {
  title: string;
  exercises: unknown[];
}

interface NormalizedWorkout {
  day: string;
  title: string;
  exercises: unknown[];
}

interface Phase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: NormalizedWorkout[] | Record<string, WorkoutObject>;
}

interface ProgramDocument {
  _id: mongoose.Types.ObjectId;
  program_id: string;
  name: string;
  phases: Phase[];
}

function isObjectFormat(workouts: unknown): workouts is Record<string, WorkoutObject> {
  return workouts !== null && 
         typeof workouts === 'object' && 
         !Array.isArray(workouts);
}

function normalizeWorkouts(workouts: NormalizedWorkout[] | Record<string, WorkoutObject>): NormalizedWorkout[] {
  if (Array.isArray(workouts)) {
    return workouts;
  }
  
  // Convert object format to array format
  return Object.entries(workouts).map(([day, workout]) => ({
    day,
    title: workout.title,
    exercises: workout.exercises,
  }));
}

async function normalizeDatabase() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const collection = db.collection('programs');
  
  // Fetch all programs
  const programs = await collection.find({}).toArray() as unknown as ProgramDocument[];
  console.log(`Found ${programs.length} programs to check`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const program of programs) {
    let needsUpdate = false;
    const updatedPhases: Phase[] = [];

    for (const phase of program.phases) {
      if (isObjectFormat(phase.workouts)) {
        needsUpdate = true;
        const normalizedWorkouts = normalizeWorkouts(phase.workouts);
        updatedPhases.push({
          ...phase,
          workouts: normalizedWorkouts,
        });
        console.log(`  - ${program.name} / ${phase.phase}: Converting ${Object.keys(phase.workouts).length} workouts from object to array`);
      } else {
        updatedPhases.push(phase);
      }
    }

    if (needsUpdate) {
      await collection.updateOne(
        { _id: program._id },
        { $set: { phases: updatedPhases } }
      );
      updatedCount++;
      console.log(`✓ Updated: ${program.name}`);
    } else {
      skippedCount++;
      console.log(`- Skipped (already normalized): ${program.name}`);
    }
  }

  console.log('\n========================================');
  console.log(`Normalization complete!`);
  console.log(`  Updated: ${updatedCount} programs`);
  console.log(`  Skipped: ${skippedCount} programs (already normalized)`);
  console.log('========================================');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

normalizeDatabase().catch((error) => {
  console.error('Error normalizing database:', error);
  process.exit(1);
});
