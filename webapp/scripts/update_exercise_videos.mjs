#!/usr/bin/env node
/**
 * Update Exercise Videos in MongoDB
 * 
 * Updates the ExerciseVideo collection with the new video URLs for exercises
 * that now have real videos.
 * 
 * Usage:
 *   node update_exercise_videos.mjs
 */

import { MongoClient } from 'mongodb';

// MongoDB URI from environment or default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://george8794:iLmYV8dMSgJoVEwx@jondonfit.ctp0tfj.mongodb.net/jondonfitdb?appName=jondonfit';

// Video URL mappings - exercise name -> video URL
const VIDEO_URLS = {
  // Back Squat video (barbell squat)
  'Back Squat': '/exercises/back-squat.mov',
  'Barbell Squat': '/exercises/back-squat.mov',
  'Squat': '/exercises/back-squat.mov',
  'Front Squat': '/exercises/back-squat.mov',
  
  // Bench Press video
  'Bench Press': '/exercises/bench-press.mov',
  'Barbell Bench Press': '/exercises/bench-press.mov',
  'Bench Press (DB/bar)': '/exercises/bench-press.mov',
  
  // Bicep Curls video
  'Bicep Curls': '/exercises/bicep-curls.mov',
  'DB Curls': '/exercises/bicep-curls.mov',
  'Cable Curl': '/exercises/bicep-curls.mov',
  'Bicep Cable Curl': '/exercises/bicep-curls.mov',
  'Dumbbell Curls': '/exercises/bicep-curls.mov',
  
  // Bodyweight squats
  'Bodyweight Squats × 20': '/exercises/bodyweight-squats-20.mov',
  'Squat to Tempo (3-1-1)': '/exercises/bodyweight-squats-20.mov',
  'Squat Hold × 20 sec': '/exercises/bodyweight-squats-20.mov',
  
  // Bulgarian Split Squat
  'Bulgarian Split Squat': '/exercises/bulgarian-split-squat.mov',
  'DB Bulgarian Split Squat': '/exercises/bulgarian-split-squat.mov',
  
  // Burpees
  'Burpees': '/exercises/burpees.mov',
  
  // Cable Row
  'Cable Row': '/exercises/cable-row.mov',
  'Seated Cable Row': '/exercises/seated-cable-row.mov',
  'Seated Row': '/exercises/seated-cable-row.mov',
  'Machine Row / Chest-Supported Row': '/exercises/seated-cable-row.mov',
  'Low Row Machine': '/exercises/cable-row.mov',
  
  // Chest Press Machine
  'Chest Press Machine': '/exercises/chest-press-machine.mov',
  'Machine Chest Press': '/exercises/chest-press-machine.mov',
  
  // Close Grip exercises
  'Close Grip DB Press': '/exercises/close-grip-db-press.mov',
  'Close Grip Lat Pulldown': '/exercises/close-grip-lat-pulldown.mov',
  'Incline Close Grip DB Press': '/exercises/incline-close-grip-db-press.mov',
  
  // DB Bench Press
  'DB Bench Press': '/exercises/db-bench-press.mov',
  'Dumbbell Bench Press': '/exercises/db-bench-press.mov',
  'Dumbbell Floor Press': '/exercises/db-bench-press.mov',
  'DB Floor Press or Bench Press': '/exercises/db-bench-press.mov',
  
  // DB Hammer Curls
  'DB Hammer Curls': '/exercises/db-hammer-curls.mov',
  'Dumbbell Biceps Curl': '/exercises/db-hammer-curls.mov',
  
  // DB Shoulder Press
  'DB Shoulder Press': '/exercises/db-shoulder-press.mov',
  'Seated Dumbbell Shoulder Press': '/exercises/db-shoulder-press.mov',
  
  // DB Single Arm Row
  'DB Single-Arm Row': '/exercises/db-single-arm-row.mov',
  'Dumbbell Single-Arm Row': '/exercises/db-single-arm-row.mov',
  'Dumbbell Row': '/exercises/db-single-arm-row.mov',
  'Dumbbell Bent Over Row': '/exercises/db-single-arm-row.mov',
  'DB Bent-Over Row': '/exercises/db-single-arm-row.mov',
  'Single Arm Dumbbell Row': '/exercises/db-single-arm-row.mov',
  
  // Decline Cable Chest Fly
  'Decline Cable Chest Fly': '/exercises/decline-cable-chest-fly.mov',
  'Machine Fly': '/exercises/decline-cable-chest-fly.mov',
  'DB Chest Fly (Floor or Bench)': '/exercises/decline-cable-chest-fly.mov',
  'Dumbbell Chest Fly on Floor': '/exercises/decline-cable-chest-fly.mov',
  'Cable Flyes': '/exercises/decline-cable-chest-fly.mov',
  'Dumbbell Flyes': '/exercises/decline-cable-chest-fly.mov',
  
  // Dumbbell Hip Thrust
  'Dumbbell Hip Thrust': '/exercises/dumbbell-hip-thrust.mov',
  'DB Hip Thrust': '/exercises/dumbbell-hip-thrust.mov',
  
  // Hip Thrust (barbell)
  'Hip Thrust': '/exercises/hip-thrust.mov',
  
  // Dumbbell Lateral Raise
  'Dumbbell Lateral Raise': '/exercises/dumbbell-lateral-raise.mov',
  'DB Lateral Raises': '/exercises/dumbbell-lateral-raise.mov',
  'Lateral Raises': '/exercises/dumbbell-lateral-raise.mov',
  'Dumbbell Lateral Raises': '/exercises/dumbbell-lateral-raise.mov',
  'Lateral Raise Machine': '/exercises/dumbbell-lateral-raise.mov',
  'Cable Lateral Raise': '/exercises/dumbbell-lateral-raise.mov',
  
  // Dumbbell RDL
  'Dumbbell RDL': '/exercises/dumbbell-rdl.mov',
  'DB Romanian Deadlift': '/exercises/dumbbell-rdl.mov',
  
  // Romanian Deadlift (barbell)
  'Romanian Deadlift': '/exercises/romanian-deadlift.mov',
  'RDL (Barbell or Dumbbell)': '/exercises/romanian-deadlift.mov',
  
  // Face Pulls
  'Face Pulls': '/exercises/face-pulls.mov',
  'Face Pull': '/exercises/face-pulls.mov',
  'Rope Face Pull': '/exercises/face-pulls.mov',
  
  // Glute Bridge
  'Glute Bridge': '/exercises/glute-bridge.mov',
  'Glute Bridge × 20': '/exercises/glute-bridge.mov',
  'Single-Leg Glute Bridge': '/exercises/glute-bridge.mov',
  
  // Goblet Squat
  'Goblet Squat': '/exercises/goblet-squat.mov',
  'DB Goblet Squat': '/exercises/goblet-squat.mov',
  
  // Hammer Curls
  'Hammer Curls': '/exercises/hammer-curls.mov',
  
  // Incline Dumbbell Press
  'Incline Dumbbell Press': '/exercises/incline-dumbbell-press.mov',
  'Incline DB Row or Cable Row': '/exercises/incline-dumbbell-press.mov',
  'Incline Bench Press': '/exercises/incline-dumbbell-press.mov',
  
  // Lat Pulldown
  'Lat Pulldown': '/exercises/lat-pulldown.mov',
  'Lat Pulldowns': '/exercises/lat-pulldown.mov',
  'Weighted Pull-Up or Pulldown': '/exercises/lat-pulldown.mov',
  
  // Pike Shoulder Press (from pike push ups)
  'Pike Shoulder Press': '/exercises/pike-shoulder-press.mov',
  
  // Preacher Curl Machine (from table top curls)
  'Preacher Curl Machine': '/exercises/preacher-curl-machine.mov',
  'EZ Bar Curl': '/exercises/preacher-curl-machine.mov',
  'EZ-Bar Curl': '/exercises/preacher-curl-machine.mov',
  'Preacher Curls': '/exercises/preacher-curl-machine.mov',
  
  // Push-Ups (from incline push up)
  'Push-Ups': '/exercises/push-ups.mov',
  'Push-ups': '/exercises/push-ups.mov',
  'Hand-Release Push-Ups': '/exercises/push-ups.mov',
  'Push-Ups × 10': '/exercises/push-ups.mov',
  'Slow Push-Ups × 10': '/exercises/push-ups.mov',
  'Scap Push-Ups × 12': '/exercises/push-ups.mov',
  'Scap Push-Ups × 15': '/exercises/push-ups.mov',
  
  // Pull-ups
  'Pull-ups': '/exercises/weighted-pull-up-or-pulldown.mov',
  'Pull-Ups': '/exercises/weighted-pull-up-or-pulldown.mov',
  'Chin-ups': '/exercises/weighted-pull-up-or-pulldown.mov',
  
  // Rear Delt Fly
  'Rear Delt Fly': '/exercises/rear-delt-fly.mov',
  'Rear Delt Fly Machine': '/exercises/rear-delt-fly.mov',
  'Rear Delt Flyes': '/exercises/rear-delt-fly.mov',
  
  // Shoulder Press
  'Shoulder Press': '/exercises/shoulder-press.mov',
  'Dumbbell Shoulder Press': '/exercises/shoulder-press.mov',
  'Push-Press': '/exercises/shoulder-press.mov',
  'Machine Shoulder Press': '/exercises/shoulder-press.mov',
  'Overhead Press': '/exercises/shoulder-press.mov',
  
  // Side Lateral Raises
  'Side Lateral Raises': '/exercises/side-lateral-raises.mov',
  
  // Single Arm Cable Row
  'Single Arm Cable Row': '/exercises/single-arm-cable-row.mov',
  'Single-Arm Row': '/exercises/single-arm-cable-row.mov',
  
  // Tricep Cable Kickbacks
  'Tricep Cable Kickbacks': '/exercises/tricep-cable-kickbacks.mov',
  'Single Arm Cable Kickbacks': '/exercises/tricep-cable-kickbacks.mov',
  'Overhead Triceps Extension': '/exercises/tricep-cable-kickbacks.mov',
  'DB Overhead Tricep Extension': '/exercises/tricep-cable-kickbacks.mov',
  'Overhead Tricep Extension': '/exercises/tricep-cable-kickbacks.mov',
  
  // Tricep Cable Pushdowns
  'Tricep Cable Pushdowns': '/exercises/tricep-cable-pushdowns.mov',
  'Tricep Pushdowns': '/exercises/tricep-cable-pushdowns.mov',
  'Cable Tricep Pushdown': '/exercises/tricep-cable-pushdowns.mov',
  'Cable Triceps Pressdown': '/exercises/tricep-cable-pushdowns.mov',
  'Tricep Pushdown': '/exercises/tricep-cable-pushdowns.mov',
  
  // Tricep Rope Pressdown
  'Tricep Rope Pressdown': '/exercises/tricep-rope-pressdown.mov',
};

async function updateExerciseVideos() {
  console.log('🎬 Exercise Videos Database Update');
  console.log('===================================\n');
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('   ✅ Connected successfully\n');
    
    const db = client.db();
    const collection = db.collection('exercisevideos');
    
    let updated = 0;
    let inserted = 0;
    let errors = 0;
    
    for (const [exerciseName, videoUrl] of Object.entries(VIDEO_URLS)) {
      try {
        const result = await collection.updateOne(
          { exerciseName },
          {
            $set: {
              exerciseName,
              videoUrl,
              thumbnailUrl: '/icons/icon-192.png',
              isPlaceholder: false,
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
          console.log(`   ➕ Inserted: ${exerciseName}`);
        } else if (result.modifiedCount > 0) {
          updated++;
          console.log(`   🔄 Updated: ${exerciseName}`);
        } else {
          console.log(`   ⏭️  No change: ${exerciseName}`);
        }
      } catch (error) {
        console.error(`   ❌ Error updating ${exerciseName}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n===================================');
    console.log('📊 Summary:');
    console.log(`   Total exercises: ${Object.keys(VIDEO_URLS).length}`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log('===================================\n');
    
    // Show statistics
    const totalVideos = await collection.countDocuments();
    const realVideos = await collection.countDocuments({ isPlaceholder: false });
    const placeholderVideos = await collection.countDocuments({ isPlaceholder: true });
    
    console.log('📈 Database Statistics:');
    console.log(`   Total exercise videos: ${totalVideos}`);
    console.log(`   Real videos: ${realVideos}`);
    console.log(`   Placeholders: ${placeholderVideos}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed.\n');
  }
}

updateExerciseVideos();
