/**
 * Seed 13 days of Nadine's history into the LOCAL scratch DB, then leave
 * "today" clean so it can be lived through the UI.
 *
 * Nadine, 36F, 178lb, busy, cardio-leaning, beginner. Her history is
 * deliberately imperfect: she misses days, under-eats protein, logs cardio far
 * more than lifting, and her weight moves slowly and non-monotonically — the
 * shape of a real person, so the progress surfaces get realistic input.
 */
import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI
if (!/localhost|127\.0\.0\.1/.test(URI || '')) throw new Error('local scratch DB only')
await mongoose.connect(URI)
const db = mongoose.connection.db

const UID = new mongoose.Types.ObjectId('6a73f4b9b1d73f4a3f8d5a70')
const TZ = 300 // US Eastern-style offset, matches a real member west of UTC

/** UTC-midnight day marker, N days before today — the app's storage convention. */
function dayMarker(daysAgo) {
  const now = new Date()
  const shifted = new Date(now.getTime() - TZ * 60_000 - daysAgo * 86_400_000)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}
function dayKey(daysAgo) {
  return dayMarker(daysAgo).toISOString().slice(0, 10)
}

await db.collection('users').deleteMany({ _id: UID })
await db.collection('users').insertOne({
  _id: UID,
  email: 'nadine@redbtn.io',
  name: 'Nadine',
  password: 'dummy-password-not-used',
  // Admin ONLY so the Mind section is reachable locally — on production this is
  // exactly the gate that hides Mindset from her.
  role: 'admin',
  tier: 'pro',
  onboardingCompleted: true,
  profile: {
    fitnessGoals: ['lose_weight', 'general_health'],
    fitnessGoal: 'lose_weight',
    equipmentAccess: ['dumbbells'],
    weightUnit: 'lbs',
    planPromoteMode: 'manual',
    age: 36,
    biologicalSex: 'female',
    experienceLevel: 'beginner',
    heightCm: 165.1,
    currentWeightKg: 80.74,
    targetWeightKg: 68.04,
    nutritionDirection: 'lose',
  },
  createdAt: dayMarker(13),
  updatedAt: new Date(),
})

await db.collection('nutritiongoals').deleteMany({ userId: UID })
await db.collection('nutritiongoals').insertOne({
  userId: UID, calories: 1648, protein: 178, carbs: 126, fats: 48,
  waterGoal: 89, goalType: 'lose', activityLevel: 'light',
  createdAt: dayMarker(13), updatedAt: new Date(), __v: 0,
})

// ── Weight + mood: she logs most days, skips a couple, weight drifts down ────
// 178.0 → 175.4 over 13 days, with a plateau and one bump. Realistic.
const weights = [178.0, 177.6, 177.8, 177.1, 176.9, 177.2, 176.6, 176.4, 176.5, 175.9, 175.7, 176.0, 175.4]
const moods   = [3,     4,     3,     2,     3,     4,     4,     3,     2,     3,     4,     3,     4]
const skipDays = new Set([9, 4]) // two days she logged nothing at all

const weightHistory = []
const moodHistory = []
for (let i = 0; i < 13; i++) {
  const daysAgo = 13 - i
  if (skipDays.has(daysAgo)) continue
  weightHistory.push({ date: dayMarker(daysAgo), weight: weights[i], unit: 'lbs' })
  moodHistory.push({ date: dayMarker(daysAgo), mood: moods[i] })
}

// ── Workouts: mostly cardio, only a few lifting sessions ────────────────────
const workoutLogs = []
for (const daysAgo of [12, 11, 9, 8, 6, 5, 3, 2]) {
  const lifting = [11, 6, 2].includes(daysAgo)
  workoutLogs.push({
    date: dayMarker(daysAgo),
    programId: 'quick',
    day: lifting ? 'Dumbbell full body' : 'Treadmill intervals',
    duration: lifting ? 38 : 45,
    completed: true,
    exercises: lifting
      ? [{ name: 'Goblet Squat', sets: [
          { setNumber: 1, reps: 10, weight: 25, completed: true },
          { setNumber: 2, reps: 10, weight: 25, completed: true },
          { setNumber: 3, reps: 8, weight: 25, completed: true }] }]
      : [],
  })
}

await db.collection('userprogresses').deleteMany({ userId: UID })
await db.collection('userprogresses').insertOne({
  userId: UID,
  weightHistory, moodHistory, moodChangeHistory: [], workoutLogs,
  activePrograms: [], exercisePRs: [],
  weightSkipTracking: { consecutiveSkips: 0, lastPromptDate: dayMarker(1), lastWeightDate: dayMarker(1) },
  streakDays: 4, longestStreak: 6, lastActivityDate: dayMarker(1),
  createdAt: dayMarker(13), updatedAt: new Date(), __v: 0,
})

// ── Nutrition: she logs breakfast/lunch reliably, dinner sometimes; protein low
await db.collection('daynutritions').deleteMany({ userId: UID })
const days = []
for (let d = 13; d >= 1; d--) {
  if (skipDays.has(d)) continue
  const loggedDinner = d % 3 !== 0
  days.push({
    userId: UID,
    date: dayMarker(d),
    calories: loggedDinner ? 1500 + ((d * 37) % 260) : 980 + ((d * 23) % 150),
    protein: loggedDinner ? 88 + ((d * 7) % 30) : 54 + ((d * 5) % 20),
    carbs: loggedDinner ? 165 + ((d * 11) % 50) : 118 + ((d * 9) % 30),
    fats: loggedDinner ? 55 + ((d * 3) % 18) : 38 + ((d * 3) % 12),
    water: 40 + ((d * 13) % 40),
    createdAt: dayMarker(d), updatedAt: dayMarker(d), __v: 0,
  })
}
if (days.length) await db.collection('daynutritions').insertMany(days)

// ── Mind: 9 completed sessions over 13 days, leaving today open ─────────────
await db.collection('mindsessions').deleteMany({ userId: UID })
const sessions = []
for (const d of [13, 12, 11, 9, 8, 6, 5, 3, 2]) {
  sessions.push({ userId: UID, dateKey: dayKey(d), completedAt: dayMarker(d), counted: true, createdAt: dayMarker(d), __v: 0 })
}
await db.collection('mindsessions').insertMany(sessions)

await db.collection('mindprogresses').deleteMany({ userId: UID })
await db.collection('mindprogresses').insertOne({
  userId: UID,
  mainSessionCount: 9, xp: 0, levelXp: 430, xpBank: 430,
  chapter: 2, streak: 2, longestStreak: 4,
  introducedSystems: ['state-shift', 'mission'],
  lastMainSessionAt: dayMarker(2),
  createdAt: dayMarker(13), updatedAt: dayMarker(2), __v: 0,
})

await db.collection('statelogs').deleteMany({ userId: UID })
const states = [['low_energy','Tired'],['distracted','Scattered'],['low_energy','Drained'],['stressed','Overwhelmed'],['distracted','Foggy'],['low_energy','Tired'],['locked_in','Motivated'],['distracted','Scattered'],['low_energy','Unmotivated']]
await db.collection('statelogs').insertMany(
  [13, 12, 11, 9, 8, 6, 5, 3, 2].map((d, i) => ({
    userId: UID, state: states[i][0], feeling: states[i][1],
    timestamp: dayMarker(d), createdAt: dayMarker(d), __v: 0,
  })),
)

console.log('Seeded 13 days for Nadine')
console.log('  weight logs   :', weightHistory.length, `(${weights[0]} → ${weights[12]} lbs)`)
console.log('  mood logs     :', moodHistory.length)
console.log('  workouts      :', workoutLogs.length, '(5 cardio, 3 lifting)')
console.log('  nutrition days:', days.length)
console.log('  mind sessions :', sessions.length, '— today left open')
await mongoose.disconnect()
