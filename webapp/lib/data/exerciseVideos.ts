// Exercise video utilities - fetches from database API
// Videos are stored in database and fetched via API

// Placeholder video URLs (only used when video not in database)
const PLACEHOLDER_VIDEO_1 = '/placeholder.mp4';
const PLACEHOLDER_VIDEO_2 = '/placeholder2.mp4';
const PLACEHOLDER_THUMBNAIL = '/icons/icon-192.png';

// Cache for fetched videos from database
let videoCache: Map<string, { videoUrl: string; thumbnailUrl: string | null; isPlaceholder: boolean }> | null = null;
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
            thumbnailUrl: video.thumbnailUrl || null,
            isPlaceholder: video.isPlaceholder ?? true,
          });
        }
        console.log('[ExerciseVideos] Cache initialized with', videoCache.size, 'videos');
      }
    } catch (error) {
      console.error('Failed to fetch exercise videos:', error);
      videoCache = new Map(); // Empty cache on error
    }
  })();

  await cachePromise;
}

// Get video URL for an exercise (synchronous - uses cache or fallback)
export function getExerciseVideoUrl(exerciseName: string): string {
  const lowerName = exerciseName.toLowerCase();
  
  // If cache is available, try to get from cache
  if (videoCache) {
    // Exact match
    const cached = videoCache.get(lowerName);
    if (cached) {
      console.log('[ExerciseVideos] Found exact match for', exerciseName, '->', cached.videoUrl);
      return cached.videoUrl;
    }
    
    // Try partial match (e.g., "Back Squat" matches "back squat")
    for (const [key, value] of videoCache.entries()) {
      if (lowerName.includes(key) || key.includes(lowerName)) {
        console.log('[ExerciseVideos] Found partial match for', exerciseName, 'via', key, '->', value.videoUrl);
        return value.videoUrl;
      }
    }
    
    console.log('[ExerciseVideos] No match found for', exerciseName, '- using placeholder');
  } else {
    console.log('[ExerciseVideos] Cache not initialized yet for', exerciseName);
  }
  
  // Fallback to placeholder based on hash
  const hash = lowerName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return hash % 2 === 0 ? PLACEHOLDER_VIDEO_1 : PLACEHOLDER_VIDEO_2;
}

// Get thumbnail for an exercise
export function getExerciseThumbnail(exerciseName: string): string {
  const lowerName = exerciseName.toLowerCase();
  
  // If cache is available, try to get from cache
  if (videoCache) {
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

// Legacy exports for compatibility
export function getVideoId(exerciseName: string): string | null {
  return null;
}

export const exerciseVideos: Record<string, string> = {};
