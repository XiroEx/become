/**
 * Script to normalize program data to the new consistent schema
 * 
 * Run with: npx ts-node scripts/normalize_programs.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Types matching our new schema
type ExerciseType = 'strength' | 'conditioning' | 'warmup' | 'abs' | 'cooldown';
type TargetUserLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Beginner to Intermediate' | 'Intermediate to Advanced';

interface NormalizedExercise {
  name: string;
  type: ExerciseType;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
}

interface NormalizedWorkout {
  day: string;
  title: string;
  exercises: NormalizedExercise[];
}

interface NormalizedPhase {
  phase: string;
  weeks: string;
  focus: string;
  workouts: NormalizedWorkout[];
}

interface NormalizedProgram {
  program_id: string;
  name: string;
  description?: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: TargetUserLevel;
  equipment?: string[];
  phases: NormalizedPhase[];
}

// Helper to normalize exercise type
function normalizeExerciseType(exercise: Record<string, unknown>): ExerciseType {
  const type = exercise.type as string | undefined;
  if (type) {
    const lowerType = type.toLowerCase();
    if (['strength', 'conditioning', 'warmup', 'abs', 'cooldown'].includes(lowerType)) {
      return lowerType as ExerciseType;
    }
  }
  
  // Infer type from exercise properties or name
  const name = (exercise.name as string || '').toLowerCase();
  
  if (name.includes('warmup') || name.includes('warm-up') || name.includes('mobility') || 
      name.includes('stretch') || name.includes('flow')) {
    return 'warmup';
  }
  
  if (name.includes('plank') || name.includes('crunch') || name.includes('deadbug') || 
      name.includes('dead bug') || name.includes('leg raise') || name.includes('twist') ||
      name.includes('hollow') || name.includes('flutter') || name.includes('bicycle') ||
      name.includes('toe touch') || name.includes('v-up') || name.includes('heel tap') ||
      name.includes('woodchop')) {
    return 'abs';
  }
  
  if (name.includes('interval') || name.includes('hiit') || name.includes('circuit') ||
      name.includes('emom') || name.includes('amrap') || name.includes('tabata') ||
      name.includes('cardio') || name.includes('bike') || name.includes('treadmill') ||
      name.includes('row') && name.includes('sprint') || name.includes('walk') ||
      name.includes('conditioning') || name.includes('finisher')) {
    return 'conditioning';
  }
  
  // Default to strength for exercises with sets
  if (exercise.sets) {
    return 'strength';
  }
  
  // If no sets but has reps that look like a duration, might be conditioning
  const reps = exercise.reps as string || '';
  if (reps.includes('min') || reps.includes('sec') || reps.includes('round')) {
    return 'conditioning';
  }
  
  return 'strength';
}

// Helper to normalize target user
function normalizeTargetUser(target: string): TargetUserLevel {
  const lower = target.toLowerCase();
  
  if (lower.includes('beginner') && lower.includes('intermediate')) {
    return 'Beginner to Intermediate';
  }
  if (lower.includes('intermediate') && lower.includes('advanced')) {
    return 'Intermediate to Advanced';
  }
  if (lower.includes('beginner') || lower.includes('early')) {
    return 'Beginner';
  }
  if (lower.includes('advanced')) {
    return 'Advanced';
  }
  return 'Intermediate';
}

// Helper to normalize rest time format
function normalizeRest(rest: string | undefined): string | undefined {
  if (!rest) return undefined;
  
  // Already in good format
  if (/^\d+s$/.test(rest)) return rest;
  if (/^\d+-\d+s$/.test(rest)) return rest;
  
  // Convert "90 sec" -> "90s"
  const secMatch = rest.match(/(\d+)\s*sec/i);
  if (secMatch) return `${secMatch[1]}s`;
  
  // Convert "2 min" -> "120s"
  const minMatch = rest.match(/(\d+)\s*min/i);
  if (minMatch) return `${parseInt(minMatch[1]) * 60}s`;
  
  // Convert "1.5-2 min" or "60-90 sec" 
  const rangeSecMatch = rest.match(/(\d+)-(\d+)\s*sec/i);
  if (rangeSecMatch) return `${rangeSecMatch[1]}-${rangeSecMatch[2]}s`;
  
  const rangeMinMatch = rest.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s*min/i);
  if (rangeMinMatch) {
    const low = Math.round(parseFloat(rangeMinMatch[1]) * 60);
    const high = Math.round(parseFloat(rangeMinMatch[2]) * 60);
    return `${low}-${high}s`;
  }
  
  return rest;
}

// Helper to normalize day key (e.g., "Upper A" -> "Day 1")
function normalizeDayKey(key: string, index: number): string {
  // If already "Day N", return as is
  if (/^Day \d+$/i.test(key)) {
    return key;
  }
  // Otherwise assign based on order
  return `Day ${index + 1}`;
}

// Helper to extract equipment from exercises
function extractEquipment(phases: NormalizedPhase[]): string[] {
  const equipment = new Set<string>();
  
  for (const phase of phases) {
    for (const workout of phase.workouts) {
      for (const exercise of workout.exercises) {
        const name = exercise.name.toLowerCase();
        
        if (name.includes('dumbbell') || name.includes('db ')) equipment.add('Dumbbells');
        if (name.includes('barbell') || name.includes('bench press') || name.includes('squat') && !name.includes('goblet')) equipment.add('Barbell');
        if (name.includes('cable')) equipment.add('Cable Machine');
        if (name.includes('machine') || name.includes('lat pulldown') || name.includes('leg press') || name.includes('leg curl')) equipment.add('Machines');
        if (name.includes('kettlebell') || name.includes('kb ')) equipment.add('Kettlebell');
        if (name.includes('treadmill')) equipment.add('Treadmill');
        if (name.includes('bike') || name.includes('assault')) equipment.add('Stationary Bike');
        if (name.includes('pull-up') || name.includes('pullup') || name.includes('chin-up')) equipment.add('Pull-up Bar');
        if (name.includes('band')) equipment.add('Resistance Bands');
        if (name.includes('rowing machine') || name.includes('rower')) equipment.add('Rowing Machine');
      }
    }
  }
  
  if (equipment.size === 0) {
    equipment.add('Bodyweight');
  }
  
  return Array.from(equipment).sort();
}

// Main normalization function
function normalizeProgram(oldProgram: Record<string, unknown>): NormalizedProgram {
  const phases = oldProgram.phases as Array<Record<string, unknown>>;
  
  const normalizedPhases: NormalizedPhase[] = phases.map((phase) => {
    const workoutsObj = phase.workouts as Record<string, Record<string, unknown>>;
    const workoutKeys = Object.keys(workoutsObj);
    
    const normalizedWorkouts: NormalizedWorkout[] = workoutKeys.map((key, index) => {
      const workout = workoutsObj[key];
      const exercises = workout.exercises as Array<Record<string, unknown>>;
      
      const normalizedExercises: NormalizedExercise[] = exercises.map((ex) => {
        const normalized: NormalizedExercise = {
          name: ex.name as string,
          type: normalizeExerciseType(ex),
        };
        
        if (ex.sets) normalized.sets = ex.sets as number;
        if (ex.reps) normalized.reps = ex.reps as string;
        if (ex.rest) normalized.rest = normalizeRest(ex.rest as string);
        if (ex.details) normalized.details = ex.details as string;
        
        // If rest was in details, try to extract it
        if (!normalized.rest && ex.details) {
          const details = ex.details as string;
          const restMatch = details.match(/rest\s*[\d.-]+\s*(min|sec|s)/i);
          if (restMatch) {
            normalized.rest = normalizeRest(restMatch[0].replace(/rest\s*/i, ''));
          }
        }
        
        return normalized;
      });
      
      return {
        day: normalizeDayKey(key, index),
        title: workout.title as string,
        exercises: normalizedExercises,
      };
    });
    
    return {
      phase: phase.phase as string,
      weeks: phase.weeks as string,
      focus: phase.focus as string,
      workouts: normalizedWorkouts,
    };
  });
  
  const equipment = extractEquipment(normalizedPhases);
  
  return {
    program_id: oldProgram.program_id as string,
    name: oldProgram.name as string,
    description: generateDescription(oldProgram),
    duration_weeks: oldProgram.duration_weeks as number,
    training_days_per_week: oldProgram.training_days_per_week as number,
    goal: oldProgram.goal as string,
    target_user: normalizeTargetUser(oldProgram.target_user as string),
    equipment,
    phases: normalizedPhases,
  };
}

// Generate a short description from program data
function generateDescription(program: Record<string, unknown>): string {
  const weeks = program.duration_weeks;
  const days = program.training_days_per_week;
  const goal = (program.goal as string).split('.')[0]; // First sentence
  return `${weeks}-week, ${days}x/week program. ${goal}.`;
}

// Main execution
async function main() {
  const backupPath = path.join(__dirname, '../../db/backup_programs.json');
  const outputPath = path.join(__dirname, '../../db/normalized_programs.json');
  
  console.log('Reading backup file...');
  const rawData = fs.readFileSync(backupPath, 'utf-8');
  const programs = JSON.parse(rawData) as Array<Record<string, unknown>>;
  
  console.log(`Found ${programs.length} programs to normalize`);
  
  const normalizedPrograms = programs.map((program, index) => {
    console.log(`Normalizing: ${program.name}`);
    return normalizeProgram(program);
  });
  
  console.log('Writing normalized data...');
  fs.writeFileSync(outputPath, JSON.stringify(normalizedPrograms, null, 2));
  
  console.log(`\nNormalized ${normalizedPrograms.length} programs to: ${outputPath}`);
  
  // Print summary
  console.log('\n=== Summary ===');
  for (const program of normalizedPrograms) {
    console.log(`\n${program.name}`);
    console.log(`  ID: ${program.program_id}`);
    console.log(`  Duration: ${program.duration_weeks} weeks, ${program.training_days_per_week} days/week`);
    console.log(`  Target: ${program.target_user}`);
    console.log(`  Equipment: ${program.equipment?.join(', ')}`);
    console.log(`  Phases: ${program.phases.length}`);
    for (const phase of program.phases) {
      console.log(`    - ${phase.phase} (${phase.weeks}): ${phase.workouts.length} workouts`);
    }
  }
}

main().catch(console.error);
