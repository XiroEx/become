#!/usr/bin/env node

/**
 * Exercise Videos Seed Script
 * 
 * Seeds exercise videos with placeholder videos to a target MongoDB database.
 * 
 * Usage:
 *   node seed_exercise_videos.js <mongodb-uri>
 * 
 * Examples:
 *   # Seed to local MongoDB
 *   node seed_exercise_videos.js "mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin"
 * 
 *   # Seed to MongoDB Atlas (production)
 *   node seed_exercise_videos.js "mongodb+srv://user:password@cluster.mongodb.net/dbname"
 */

const { MongoClient } = require('mongodb');

// Parse command line arguments
const args = process.argv.slice(2);
const targetUri = args[0];
const clearData = args.includes('--clear');

if (!targetUri) {
  console.error(`
Usage: node seed_exercise_videos.js <mongodb-uri> [options]

Options:
  --clear   Clear existing exercise videos before seeding

Examples:
  node seed_exercise_videos.js "mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin"
  node seed_exercise_videos.js "mongodb+srv://user:pass@cluster.mongodb.net/dbname" --clear
`);
  process.exit(1);
}

// Placeholder video URLs - using local placeholder files
const PLACEHOLDER_VIDEO_1 = '/placeholder.mp4';
const PLACEHOLDER_VIDEO_2 = '/placeholder2.mp4';
const PLACEHOLDER_THUMBNAIL = '/icons/icon-192.png';

// Real videos mapping - exercises with actual video files
const REAL_VIDEOS = {
  'Back Squat': '/exercises/back-squat.mp4',
  'Bench Press': '/exercises/bench-press.mp4',
  'Seated Cable Row': '/exercises/cable-row.mp4',
  // Add more real videos here as they become available
};

// All exercise names from the programs
const exerciseNames = [
  // Chest exercises
  "Bench Press",
  "Incline Bench Press",
  "Incline Dumbbell Press",
  "Dumbbell Bench Press",
  "Dumbbell Flyes",
  "Cable Flyes",
  "Push-ups",
  "Chest Dips",
  "Machine Chest Press",
  
  // Back exercises
  "Seated Cable Row",
  "Lat Pulldown",
  "Bent Over Row",
  "Bent Over Barbell Row",
  "Barbell Row",
  "T-Bar Row",
  "Pull-ups",
  "Chin-ups",
  "Face Pulls",
  "Rope Face Pull",
  "Single Arm Dumbbell Row",
  "Chest Supported Row",
  "Deadlift",
  "Romanian Deadlift",
  
  // Shoulder exercises
  "Dumbbell Shoulder Press",
  "Machine Shoulder Press",
  "Overhead Press",
  "Lateral Raises",
  "Dumbbell Lateral Raise",
  "Cable Lateral Raise",
  "Front Raises",
  "Rear Delt Flyes",
  "Arnold Press",
  "Upright Row",
  
  // Arm exercises - Biceps
  "Bicep Curls",
  "Dumbbell Curls",
  "Barbell Curls",
  "Hammer Curls",
  "Preacher Curls",
  "Incline Dumbbell Curls",
  "Cable Curls",
  "Cable Curl",
  "EZ Bar Curl",
  
  // Arm exercises - Triceps
  "Tricep Pushdown",
  "Cable Tricep Pushdown",
  "Tricep Dips",
  "Skull Crushers",
  "Overhead Tricep Extension",
  "Close Grip Bench Press",
  "Diamond Push-ups",
  
  // Leg exercises - Quads
  "Back Squat",
  "Barbell Squat",
  "Squat",
  "Front Squat",
  "Leg Press",
  "Leg Extension",
  "Lunges",
  "Walking Lunges",
  "Walking Lunge",
  "Bulgarian Split Squat",
  "Goblet Squat",
  "Hack Squat",
  "Step Ups",
  
  // Leg exercises - Hamstrings
  "Leg Curl",
  "Leg Curl Machine",
  "Lying Leg Curl",
  "Seated Leg Curl",
  "Stiff Leg Deadlift",
  "Good Mornings",
  
  // Leg exercises - Glutes
  "Hip Thrust",
  "Glute Bridge",
  "Cable Kickbacks",
  "Sumo Deadlift",
  
  // Leg exercises - Calves
  "Calf Raises",
  "Seated Calf Raises",
  "Standing Calf Raises",
  
  // Core/Abs exercises
  "Plank",
  "Crunches",
  "Russian Twists",
  "Leg Raises",
  "Hanging Leg Raises",
  "Cable Crunches",
  "Ab Rollouts",
  "Mountain Climbers",
  "Dead Bug",
  "Bird Dog",
  "Side Plank",
  
  // Conditioning/Cardio exercises
  "Treadmill",
  "Rowing Machine",
  "Bike",
  "Stationary Bike",
  "Jump Rope",
  "Burpees",
  "Box Jumps",
  "Kettlebell Swings",
  "Battle Ropes",
  
  // Warmup exercises
  "Jumping Jacks",
  "Arm Circles",
  "Hip Circles",
  "Leg Swings",
  "Cat-Cow Stretch",
  "World's Greatest Stretch",
  "Inchworm",
  
  // Cooldown/Stretches
  "Hamstring Stretch",
  "Quad Stretch",
  "Hip Flexor Stretch",
  "Chest Stretch",
  "Shoulder Stretch",
  "Tricep Stretch",
  "Child's Pose",
  "Pigeon Pose",
  "Foam Rolling",
];

async function seedExerciseVideos(db) {
  console.log('\n📹 Seeding exercise videos with placeholders...\n');
  
  const collection = db.collection('exercisevideos');
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  if (clearData) {
    console.log('   🗑️  Clearing existing exercise videos...');
    await collection.deleteMany({});
  }

  for (let i = 0; i < exerciseNames.length; i++) {
    const exerciseName = exerciseNames[i];
    // Check if we have a real video for this exercise
    const hasRealVideo = REAL_VIDEOS.hasOwnProperty(exerciseName);
    const videoUrl = hasRealVideo ? REAL_VIDEOS[exerciseName] : (i % 2 === 0 ? PLACEHOLDER_VIDEO_1 : PLACEHOLDER_VIDEO_2);
    
    try {
      const result = await collection.updateOne(
        { exerciseName },
        {
          $set: {
            exerciseName,
            videoUrl,
            thumbnailUrl: PLACEHOLDER_THUMBNAIL,
            isPlaceholder: !hasRealVideo,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        inserted++;
      } else if (result.modifiedCount > 0) {
        updated++;
      }
    } catch (error) {
      console.error(`   ❌ Error seeding ${exerciseName}:`, error.message);
      errors++;
    }
  }

  console.log(`   ✅ Inserted: ${inserted}`);
  console.log(`   🔄 Updated: ${updated}`);
  if (errors > 0) {
    console.log(`   ❌ Errors: ${errors}`);
  }

  return { inserted, updated, errors };
}

async function main() {
  console.log('🏋️ Exercise Videos Seed Script');
  console.log('================================\n');
  console.log(`Target: ${targetUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  const client = new MongoClient(targetUri);

  try {
    console.log('\n🔌 Connecting to database...');
    await client.connect();
    console.log('   ✅ Connected successfully');

    const db = client.db();
    
    const result = await seedExerciseVideos(db);

    console.log('\n================================');
    console.log('📊 Summary:');
    console.log(`   Total exercises: ${exerciseNames.length}`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Errors: ${result.errors}`);
    console.log('================================\n');

    if (result.errors === 0) {
      console.log('✅ Seeding completed successfully!\n');
    } else {
      console.log('⚠️  Seeding completed with errors.\n');
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed.\n');
  }
}

main();
