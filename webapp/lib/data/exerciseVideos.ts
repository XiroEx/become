// Exercise video utilities - now using placeholder videos
// Videos are stored in database and fetched via API

// Placeholder video URLs
const PLACEHOLDER_VIDEO_1 = '/placeholder.mp4';
const PLACEHOLDER_VIDEO_2 = '/placeholder2.mp4';
const PLACEHOLDER_THUMBNAIL = '/icons/icon-192.png';

// Cache for fetched videos from database
let videoCache: Map<string, { videoUrl: string; thumbnailUrl: string | null }> | null = null;
let cachePromise: Promise<void> | null = null;

// Initialize cache from API (for client-side use)
async function initializeCache(): Promise<void> {
  if (videoCache) return;
  if (cachePromise) {
    await cachePromise;
    return;
  }

  cachePromise = (async () => {
    try {
      const response = await fetch('/api/exercise-videos');
      if (response.ok) {
        const data = await response.json();
        videoCache = new Map();
        for (const video of data.videos || []) {
          videoCache.set(video.exerciseName.toLowerCase(), {
            videoUrl: video.videoUrl,
            thumbnailUrl: video.thumbnailUrl,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch exercise videos:', error);
      videoCache = new Map(); // Empty cache on error
    }
  })();

  await cachePromise;
}

// All known exercise names for fallback
const exerciseNames = [
  "Bench Press", "Incline Bench Press", "Incline Dumbbell Press", "Dumbbell Flyes",
  "Cable Flyes", "Push-ups", "Chest Dips", "Seated Cable Row", "Lat Pulldown",
  "Bent Over Row", "Barbell Row", "T-Bar Row", "Pull-ups", "Chin-ups", "Face Pulls",
  "Single Arm Dumbbell Row", "Deadlift", "Romanian Deadlift", "Dumbbell Shoulder Press",
  "Overhead Press", "Lateral Raises", "Front Raises", "Rear Delt Flyes", "Arnold Press",
  "Upright Row", "Bicep Curls", "Dumbbell Curls", "Barbell Curls", "Hammer Curls",
  "Preacher Curls", "Incline Dumbbell Curls", "Cable Curls", "Tricep Pushdown",
  "Tricep Dips", "Skull Crushers", "Overhead Tricep Extension", "Close Grip Bench Press",
  "Diamond Push-ups", "Barbell Squat", "Squat", "Front Squat", "Leg Press",
  "Leg Extension", "Lunges", "Walking Lunges", "Bulgarian Split Squat", "Goblet Squat",
  "Hack Squat", "Leg Curl", "Lying Leg Curl", "Seated Leg Curl", "Stiff Leg Deadlift",
  "Good Mornings", "Hip Thrust", "Glute Bridge", "Cable Kickbacks", "Sumo Deadlift",
  "Calf Raises", "Seated Calf Raises", "Standing Calf Raises", "Plank", "Crunches",
  "Russian Twists", "Leg Raises", "Hanging Leg Raises", "Cable Crunches", "Ab Rollouts",
  "Mountain Climbers", "Dead Bug", "Bird Dog", "Side Plank", "Treadmill", "Rowing Machine",
  "Bike", "Stationary Bike", "Jump Rope", "Burpees", "Box Jumps", "Kettlebell Swings",
  "Battle Ropes", "Jumping Jacks", "Arm Circles", "Hip Circles", "Leg Swings",
  "Cat-Cow Stretch", "World's Greatest Stretch", "Inchworm", "Hamstring Stretch",
  "Quad Stretch", "Hip Flexor Stretch", "Chest Stretch", "Shoulder Stretch",
  "Tricep Stretch", "Child's Pose", "Pigeon Pose", "Foam Rolling",
];

// Create a quick lookup index for fallback placeholder assignment
const exerciseIndex = new Map<string, number>();
exerciseNames.forEach((name, idx) => {
  exerciseIndex.set(name.toLowerCase(), idx);
});

// Get placeholder video URL based on exercise name (alternates between placeholders)
function getPlaceholderVideo(exerciseName: string): string {
  const lowerName = exerciseName.toLowerCase();
  const idx = exerciseIndex.get(lowerName);
  if (idx !== undefined) {
    return idx % 2 === 0 ? PLACEHOLDER_VIDEO_1 : PLACEHOLDER_VIDEO_2;
  }
  // For unknown exercises, use hash of name to pick placeholder
  const hash = lowerName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? PLACEHOLDER_VIDEO_1 : PLACEHOLDER_VIDEO_2;
}

// Get video URL for an exercise (synchronous - uses cache or fallback)
export function getExerciseVideoUrl(exerciseName: string): string {
  // If cache is available, try to get from cache
  if (videoCache) {
    const lowerName = exerciseName.toLowerCase();
    const cached = videoCache.get(lowerName);
    if (cached) {
      return cached.videoUrl;
    }
    // Try partial match
    for (const [key, value] of videoCache.entries()) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        return value.videoUrl;
      }
    }
  }
  
  // Fallback to placeholder
  return getPlaceholderVideo(exerciseName);
}

// Get thumbnail for an exercise
export function getExerciseThumbnail(exerciseName: string): string {
  // If cache is available, try to get from cache
  if (videoCache) {
    const lowerName = exerciseName.toLowerCase();
    const cached = videoCache.get(lowerName);
    if (cached?.thumbnailUrl) {
      return cached.thumbnailUrl;
    }
  }
  
  // Fallback to placeholder thumbnail
  return PLACEHOLDER_THUMBNAIL;
}

// Async version that ensures cache is loaded first
export async function getExerciseVideoUrlAsync(exerciseName: string): Promise<string> {
  await initializeCache();
  return getExerciseVideoUrl(exerciseName);
}

// Async version for thumbnail
export async function getExerciseThumbnailAsync(exerciseName: string): Promise<string> {
  await initializeCache();
  return getExerciseThumbnail(exerciseName);
}

// Initialize cache on module load (non-blocking)
if (typeof window !== 'undefined') {
  initializeCache().catch(() => {});
}

// Legacy export for compatibility - now just returns placeholder index
export function getVideoId(exerciseName: string): string | null {
  const idx = exerciseIndex.get(exerciseName.toLowerCase());
  return idx !== undefined ? `placeholder-${idx}` : null;
}

// Legacy export - no longer used but kept for compatibility
export const exerciseVideos: Record<string, string> = {};
