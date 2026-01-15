import mongoose from 'mongoose';

const ATLAS_URI = 'mongodb+srv://george8794:iLmYV8dMSgJoVEwx@jondonfit.ctp0tfj.mongodb.net/?appName=jondonfit';

// Real videos mapping - exercises with actual video files
const REAL_VIDEOS = {
  'Back Squat': '/exercises/back-squat.mp4',
  'Bench Press': '/exercises/bench-press.mp4',
  'Seated Cable Row': '/exercises/cable-row.mp4',
  // Add more real videos here as they become available
};

const exercises = [
  // Chest exercises
  'Bench Press', 'Incline Bench Press', 'Incline Dumbbell Press', 'Dumbbell Bench Press',
  'Dumbbell Flyes', 'Cable Flyes', 'Push-ups', 'Chest Dips', 'Machine Chest Press',
  
  // Back exercises
  'Seated Cable Row', 'Lat Pulldown', 'Bent Over Row', 'Bent Over Barbell Row',
  'Barbell Row', 'T-Bar Row', 'Pull-ups', 'Chin-ups', 'Face Pulls', 'Rope Face Pull',
  'Single Arm Dumbbell Row', 'Chest Supported Row', 'Deadlift', 'Romanian Deadlift',
  
  // Shoulder exercises  
  'Dumbbell Shoulder Press', 'Machine Shoulder Press', 'Overhead Press',
  'Lateral Raises', 'Dumbbell Lateral Raise', 'Cable Lateral Raise',
  'Front Raises', 'Rear Delt Flyes', 'Arnold Press', 'Upright Row',
  
  // Arm exercises
  'Bicep Curls', 'Dumbbell Curls', 'Barbell Curls', 'Hammer Curls',
  'Preacher Curls', 'Incline Dumbbell Curls', 'Cable Curls', 'Cable Curl', 'EZ Bar Curl',
  'Tricep Pushdown', 'Cable Tricep Pushdown', 'Tricep Dips', 'Skull Crushers',
  'Overhead Tricep Extension', 'Close Grip Bench Press', 'Diamond Push-ups',
  
  // Leg exercises
  'Back Squat', 'Barbell Squat', 'Squat', 'Front Squat', 'Leg Press', 'Leg Extension',
  'Lunges', 'Walking Lunges', 'Walking Lunge', 'Bulgarian Split Squat',
  'Goblet Squat', 'Hack Squat', 'Step Ups',
  'Leg Curl', 'Leg Curl Machine', 'Lying Leg Curl', 'Seated Leg Curl',
  'Stiff Leg Deadlift', 'Good Mornings',
  'Hip Thrust', 'Glute Bridge', 'Cable Kickbacks', 'Sumo Deadlift',
  'Calf Raises', 'Seated Calf Raises', 'Standing Calf Raises',
  
  // Core exercises
  'Plank', 'Crunches', 'Russian Twists', 'Leg Raises', 'Hanging Leg Raises',
  'Cable Crunches', 'Ab Rollouts', 'Mountain Climbers', 'Dead Bug', 'Bird Dog', 'Side Plank',
  
  // Conditioning
  'Treadmill', 'Rowing Machine', 'Bike', 'Stationary Bike', 'Jump Rope',
  'Burpees', 'Box Jumps', 'Kettlebell Swings', 'Battle Ropes',
  
  // Warmup/Stretches
  'Jumping Jacks', 'Arm Circles', 'Hip Circles', 'Leg Swings',
  'Cat-Cow Stretch', 'Worlds Greatest Stretch', 'Inchworm',
  'Hamstring Stretch', 'Quad Stretch', 'Hip Flexor Stretch',
  'Chest Stretch', 'Shoulder Stretch', 'Tricep Stretch',
  'Childs Pose', 'Pigeon Pose', 'Foam Rolling'
];

console.log('Connecting to Atlas...');
await mongoose.connect(ATLAS_URI);

const collection = mongoose.connection.db.collection('exercisevideos');

let inserted = 0;
let updated = 0;
for (let i = 0; i < exercises.length; i++) {
  const name = exercises[i];
  const hasRealVideo = REAL_VIDEOS.hasOwnProperty(name);
  const videoUrl = hasRealVideo ? REAL_VIDEOS[name] : (i % 2 === 0 ? '/placeholder.mp4' : '/placeholder2.mp4');
  
  const existing = await collection.findOne({ exerciseName: name });
  if (!existing) {
    await collection.insertOne({
      exerciseName: name,
      videoUrl,
      thumbnailUrl: '/icons/icon-192.png',
      isPlaceholder: !hasRealVideo,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    inserted++;
    console.log(`  Inserted: ${name}${hasRealVideo ? ' (real video)' : ''}`);
  } else if (hasRealVideo && existing.isPlaceholder) {
    // Update to real video if we have one
    await collection.updateOne(
      { exerciseName: name },
      { $set: { videoUrl, isPlaceholder: false, updatedAt: new Date() } }
    );
    updated++;
    console.log(`  Updated: ${name} (now has real video)`);
  }
}

console.log(`\nInserted ${inserted} exercise videos`);
console.log(`Updated ${updated} exercise videos`);

const realVideoCount = Object.keys(REAL_VIDEOS).length;
console.log(`\nReal videos available: ${realVideoCount}`);
Object.entries(REAL_VIDEOS).forEach(([name, url]) => {
  console.log(`  - ${name}: ${url}`);
});

const backSquat = await collection.findOne({ exerciseName: 'Back Squat' });
console.log('\nBack Squat entry:', JSON.stringify(backSquat, null, 2));

const total = await collection.countDocuments();
console.log('\nTotal videos in Atlas:', total);

await mongoose.disconnect();
console.log('Done!');
