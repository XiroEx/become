#!/usr/bin/env node
/**
 * Video Processing Script
 * Analyzes video files in the videos folder and matches them to exercises
 * in the database, then moves and renames them accordingly.
 */

import fs from 'fs';
import path from 'path';

// Source and destination directories
const VIDEOS_DIR = '/workspaces/jondonfit/webapp/public/videos';
const EXERCISES_DIR = '/workspaces/jondonfit/webapp/public/exercises';

// Video file mappings - video filename (without extension) -> exercise name(s) in DB
const VIDEO_MAPPINGS = {
  // Exact or close matches
  'Barbell Hipthrust': ['Hip Thrust', 'DB Hip Thrust', 'Dumbbell Hip Thrust'],
  'Barbell RDL': ['Romanian Deadlift', 'RDL (Barbell or Dumbbell)', 'Dumbbell RDL', 'DB Romanian Deadlift'],
  'Barbell Squat': ['Back Squat', 'Barbell Squat', 'Squat', 'Front Squat'],
  'Bench Press': ['Bench Press', 'Barbell Bench Press', 'Bench Press (DB/bar)'],
  'Bicep Curls': ['Bicep Curls', 'DB Curls', 'Cable Curl', 'Bicep Cable Curl'],
  'Body Weight Hipthrust ': ['Glute Bridge', 'Glute Bridge × 20', 'Single-Leg Glute Bridge'],
  'Body weight squats': ['Bodyweight Squats × 20', 'Squat to Tempo (3-1-1)', 'Squat Hold × 20 sec'],
  'Bulgarian Split Squat': ['Bulgarian Split Squat', 'DB Bulgarian Split Squat'],
  'Burpee': ['Burpees'],
  'Cable Row': ['Seated Cable Row', 'Seated Row', 'Machine Row / Chest-Supported Row'],
  'Chest Press Machine': ['Chest Press Machine', 'Machine Chest Press'],
  'Close Grip Cable Row': ['Close Grip Lat Pulldown', 'Single Arm Cable Row'],
  'Close Grip Flat Bench': ['Close Grip DB Press'],
  'Close Grip Incine DB Press': ['Incline Close Grip DB Press', 'Close Grip DB Press'],
  'DB Curl to Hammer': ['DB Hammer Curls', 'Hammer Curls', 'Dumbbell Biceps Curl'],
  'DB Flat Bench': ['DB Bench Press', 'Dumbbell Bench Press', 'Dumbbell Floor Press', 'DB Floor Press or Bench Press'],
  'DB Incline Bench': ['Incline Dumbbell Press', 'Incline DB Row or Cable Row'],
  'DB Should Press': ['DB Shoulder Press', 'Dumbbell Shoulder Press', 'Seated Dumbbell Shoulder Press', 'Shoulder Press'],
  'Dumbbell Hipthrust': ['Dumbbell Hip Thrust', 'DB Hip Thrust', 'Hip Thrust'],
  'Dumbbell Lateral Raises ': ['Dumbbell Lateral Raise', 'DB Lateral Raises', 'Side Lateral Raises', 'Lateral Raise Machine', 'Cable Lateral Raise'],
  'Dumbbell RDL': ['Dumbbell RDL', 'DB Romanian Deadlift', 'Romanian Deadlift'],
  'Face Pulls': ['Face Pulls', 'Face Pull', 'Rope Face Pull'],
  'Goblet Squat': ['Goblet Squat', 'DB Goblet Squat'],
  'Hammer Curls': ['Hammer Curls', 'DB Hammer Curls'],
  'High to Low Cable Chest Press': ['Decline Cable Chest Fly', 'Machine Fly', 'DB Chest Fly (Floor or Bench)'],
  'IMG_2385': null, // Unknown - need to identify
  'Incline Push Up': ['Push-Ups', 'Push-ups', 'Hand-Release Push-Ups', 'Push-Ups × 10'],
  'Lat Pull downs': ['Lat Pulldown', 'Lat Pulldowns', 'Close Grip Lat Pulldown', 'Weighted Pull-Up or Pulldown'],
  'Overhead Cable Tricep Kickbacks ': ['Tricep Cable Kickbacks', 'Single Arm Cable Kickbacks', 'Overhead Triceps Extension', 'DB Overhead Tricep Extension'],
  'Pike Push ups': ['Pike Shoulder Press', 'Push-Ups'],
  'Pronated Cable Row ': ['Cable Row', 'Seated Cable Row', 'Low Row Machine'],
  'Pull ups': ['Weighted Pull-Up or Pulldown', 'Pull-ups'],
  'Push Up': ['Push-Ups', 'Push-ups', 'Hand-Release Push-Ups', 'Slow Push-Ups × 10', 'Push-Ups × 10', 'Scap Push-Ups × 12'],
  'Rear Delts': ['Rear Delt Fly', 'Rear Delt Fly Machine'],
  'Rope Cable Press ': ['Tricep Rope Pressdown', 'Tricep Pushdowns', 'Tricep Cable Pushdowns'],
  'Side Lateral Raises': ['Side Lateral Raises', 'Dumbbell Lateral Raise', 'DB Lateral Raises', 'Cable Lateral Raise'],
  'Single Arm Cable Row': ['Single Arm Cable Row', 'Single-Arm Row'],
  'Single Arm DB Row': ['DB Single-Arm Row', 'Dumbbell Single-Arm Row', 'Dumbbell Row', 'Dumbbell Bent Over Row', 'DB Bent-Over Row'],
  'Standing Shoulder Press': ['Shoulder Press', 'DB Shoulder Press', 'Dumbbell Shoulder Press', 'Push-Press'],
  'Straight Bar Cable Press': ['Tricep Cable Pushdowns', 'Tricep Pushdowns', 'Cable Tricep Pushdown', 'Cable Triceps Pressdown'],
  'Table Top Curls': ['Preacher Curl Machine', 'EZ Bar Curl', 'EZ-Bar Curl'],
};

// Convert video name to a clean filename (kebab-case)
function toKebabCase(str) {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Get the primary exercise name for the video
function getPrimaryExerciseName(videoName) {
  const exercises = VIDEO_MAPPINGS[videoName];
  if (!exercises || exercises.length === 0) return null;
  return exercises[0]; // Return the first (primary) exercise
}

// Get list of video files
function getVideoFiles() {
  try {
    const files = fs.readdirSync(VIDEOS_DIR);
    return files.filter(f => /\.(mov|mp4|MOV|MP4)$/i.test(f));
  } catch (error) {
    console.error('Error reading videos directory:', error.message);
    return [];
  }
}

// Main processing function
function processVideos() {
  console.log('🎬 Video Processing Script');
  console.log('==========================\n');
  
  const videoFiles = getVideoFiles();
  console.log(`Found ${videoFiles.length} video files:\n`);
  
  const results = {
    matched: [],
    unmatched: [],
    alreadyExists: [],
    errors: []
  };
  
  for (const videoFile of videoFiles) {
    const ext = path.extname(videoFile).toLowerCase();
    const baseName = path.basename(videoFile, path.extname(videoFile));
    const primaryExercise = getPrimaryExerciseName(baseName);
    
    console.log(`📹 ${videoFile}`);
    
    if (!primaryExercise) {
      console.log(`   ❓ No matching exercise found`);
      results.unmatched.push({ file: videoFile, baseName });
      continue;
    }
    
    const newFileName = toKebabCase(primaryExercise) + ext;
    const sourcePath = path.join(VIDEOS_DIR, videoFile);
    const destPath = path.join(EXERCISES_DIR, newFileName);
    
    console.log(`   ✅ Matched to: ${primaryExercise}`);
    console.log(`   📁 New name: ${newFileName}`);
    
    // Check if destination already exists
    if (fs.existsSync(destPath)) {
      console.log(`   ⚠️  Destination already exists, skipping`);
      results.alreadyExists.push({ file: videoFile, exercise: primaryExercise, newName: newFileName });
      continue;
    }
    
    // Copy the file
    try {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`   ✅ Copied successfully`);
      results.matched.push({
        file: videoFile,
        exercise: primaryExercise,
        newName: newFileName,
        allExercises: VIDEO_MAPPINGS[baseName]
      });
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.errors.push({ file: videoFile, error: error.message });
    }
    
    console.log('');
  }
  
  // Print summary
  console.log('\n==========================');
  console.log('📊 SUMMARY');
  console.log('==========================\n');
  
  console.log(`✅ Successfully processed: ${results.matched.length}`);
  for (const item of results.matched) {
    console.log(`   ${item.file} → ${item.newName}`);
    if (item.allExercises && item.allExercises.length > 1) {
      console.log(`      Also matches: ${item.allExercises.slice(1).join(', ')}`);
    }
  }
  
  if (results.alreadyExists.length > 0) {
    console.log(`\n⚠️  Already exists (skipped): ${results.alreadyExists.length}`);
    for (const item of results.alreadyExists) {
      console.log(`   ${item.file} → ${item.newName}`);
    }
  }
  
  if (results.unmatched.length > 0) {
    console.log(`\n❓ Unmatched: ${results.unmatched.length}`);
    for (const item of results.unmatched) {
      console.log(`   ${item.file}`);
    }
  }
  
  if (results.errors.length > 0) {
    console.log(`\n❌ Errors: ${results.errors.length}`);
    for (const item of results.errors) {
      console.log(`   ${item.file}: ${item.error}`);
    }
  }
  
  // Output video mapping for database update
  console.log('\n==========================');
  console.log('📝 DATABASE UPDATE MAPPINGS');
  console.log('==========================\n');
  
  const dbMappings = {};
  for (const item of results.matched) {
    for (const exercise of item.allExercises) {
      dbMappings[exercise] = `/exercises/${item.newName}`;
    }
  }
  
  console.log('const VIDEO_URLS = {');
  for (const [exercise, url] of Object.entries(dbMappings).sort()) {
    console.log(`  '${exercise}': '${url}',`);
  }
  console.log('};');
  
  return results;
}

// Run the script
processVideos();
