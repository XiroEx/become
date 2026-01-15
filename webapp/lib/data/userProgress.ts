// Mock user progress data for seeding
export const mockUserProgress = {
  height: 70, // 5'10" in inches
  weightHistory: [
    { date: new Date('2024-11-01'), weight: 185, bodyFat: 22 },
    { date: new Date('2024-11-08'), weight: 183.5, bodyFat: 21.5 },
    { date: new Date('2024-11-15'), weight: 182, bodyFat: 21 },
    { date: new Date('2024-11-22'), weight: 181.5, bodyFat: 20.8 },
    { date: new Date('2024-11-29'), weight: 180, bodyFat: 20.5 },
    { date: new Date('2024-12-06'), weight: 179.5, bodyFat: 20.2 },
    { date: new Date('2024-12-13'), weight: 178, bodyFat: 19.8 },
  ],
  workoutLogs: [
    { 
      date: new Date('2024-11-04'), 
      programId: 'become-12-week', 
      phase: 1, 
      day: 'Day 1', 
      completed: true, 
      duration: 45,
      exercises: [
        { name: 'Bench Press', sets: 3, reps: '8-10', weight: 135 },
        { name: 'Seated Cable Row', sets: 3, reps: '10-12', weight: 90 },
        { name: 'Dumbbell Shoulder Press', sets: 3, reps: '10', weight: 30 }
      ]
    },
    { 
      date: new Date('2024-11-06'), 
      programId: 'become-12-week', 
      phase: 1, 
      day: 'Day 2', 
      completed: true, 
      duration: 50,
      exercises: [
        { name: 'Barbell Squat', sets: 3, reps: '8-10', weight: 155 },
        { name: 'Romanian Deadlift', sets: 3, reps: '10-12', weight: 115 },
        { name: 'Leg Press', sets: 3, reps: '12-15', weight: 200 }
      ]
    },
    { 
      date: new Date('2024-11-08'), 
      programId: 'become-12-week', 
      phase: 1, 
      day: 'Day 3', 
      completed: true, 
      duration: 40,
      exercises: [
        { name: 'Pull-ups', sets: 3, reps: '6-8', weight: 0 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', weight: 40 },
        { name: 'Face Pulls', sets: 3, reps: '15', weight: 30 }
      ]
    },
    { 
      date: new Date('2024-11-11'), 
      programId: 'become-12-week', 
      phase: 1, 
      day: 'Day 4', 
      completed: true, 
      duration: 55,
      exercises: [
        { name: 'Deadlift', sets: 3, reps: '5', weight: 185 },
        { name: 'Bulgarian Split Squat', sets: 3, reps: '10', weight: 25 },
        { name: 'Leg Curl', sets: 3, reps: '12', weight: 70 }
      ]
    },
    // Week 2
    { date: new Date('2024-11-13'), programId: 'become-12-week', phase: 1, day: 'Day 1', completed: true, duration: 48, exercises: [] },
    { date: new Date('2024-11-15'), programId: 'become-12-week', phase: 1, day: 'Day 2', completed: true, duration: 52, exercises: [] },
    { date: new Date('2024-11-18'), programId: 'become-12-week', phase: 1, day: 'Day 3', completed: true, duration: 45, exercises: [] },
    { date: new Date('2024-11-20'), programId: 'become-12-week', phase: 1, day: 'Day 4', completed: true, duration: 50, exercises: [] },
    // Week 3
    { date: new Date('2024-11-22'), programId: 'become-12-week', phase: 1, day: 'Day 1', completed: true, duration: 50, exercises: [] },
    { date: new Date('2024-11-25'), programId: 'become-12-week', phase: 1, day: 'Day 2', completed: true, duration: 48, exercises: [] },
    { date: new Date('2024-11-27'), programId: 'become-12-week', phase: 1, day: 'Day 3', completed: true, duration: 42, exercises: [] },
    // Week 4
    { date: new Date('2024-11-29'), programId: 'become-12-week', phase: 1, day: 'Day 4', completed: true, duration: 55, exercises: [] },
    { date: new Date('2024-12-02'), programId: 'become-12-week', phase: 1, day: 'Day 1', completed: true, duration: 45, exercises: [] },
    { date: new Date('2024-12-04'), programId: 'become-12-week', phase: 1, day: 'Day 2', completed: true, duration: 50, exercises: [] },
    // Week 5
    { date: new Date('2024-12-06'), programId: 'become-12-week', phase: 2, day: 'Day 1', completed: true, duration: 52, exercises: [] },
    { date: new Date('2024-12-09'), programId: 'become-12-week', phase: 2, day: 'Day 2', completed: true, duration: 48, exercises: [] },
    { date: new Date('2024-12-11'), programId: 'become-12-week', phase: 2, day: 'Day 3', completed: true, duration: 45, exercises: [] },
    { date: new Date('2024-12-13'), programId: 'become-12-week', phase: 2, day: 'Day 4', completed: true, duration: 55, exercises: [] },
    // Week 6
    { date: new Date('2024-12-16'), programId: 'become-12-week', phase: 2, day: 'Day 1', completed: true, duration: 50, exercises: [] },
    { date: new Date('2024-12-17'), programId: 'become-12-week', phase: 2, day: 'Day 2', completed: true, duration: 48, exercises: [] },
    { date: new Date('2024-12-18'), programId: 'become-12-week', phase: 2, day: 'Day 3', completed: true, duration: 45, exercises: [] },
  ],
  // Mood values now use 1-5 scale: 1=Bad, 2=Not Great, 3=Okay, 4=Pretty Good, 5=Great
  moodHistory: [
    { date: new Date('2024-12-12'), mood: 3 },
    { date: new Date('2024-12-13'), mood: 4 },
    { date: new Date('2024-12-14'), mood: 5 },
    { date: new Date('2024-12-15'), mood: 3 },
    { date: new Date('2024-12-16'), mood: 4 },
    { date: new Date('2024-12-17'), mood: 3 },
  ],
  currentProgram: {
    programId: 'become-12-week',
    startDate: new Date('2024-11-04'),
    currentPhase: 2,
    currentWeek: 6
  },
  streakDays: 12,
  totalWorkouts: 25
}

// Helper function to calculate BMI
export function calculateBMI(weight: number, heightInches: number): number {
  return (weight * 703) / (heightInches * heightInches)
}

// Calculate the next workout based on active program and workout logs
export function calculateNextWorkout(
  activeProgram: {
    programId: string
    programName: string
    currentPhase: number
    currentDay: string
    completedWorkouts: number
    totalWorkouts: number
    lastWorkoutDate?: Date
  },
  programDetails: {
    phases: Array<{
      phase: string
      workouts: Array<{ day: string; title: string }> | Record<string, { title: string }>
    }>
  },
  workoutLogs: Array<{ programId: string; phase: number; day: string; date: Date; completed: boolean }>
): string {
  // Find the last completed workout for this program
  const programLogs = workoutLogs
    .filter(log => log.programId === activeProgram.programId && log.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  
  const lastLog = programLogs[0]
  
  if (!lastLog || !programDetails.phases) {
    // No completed workouts yet - start at Day 1
    const firstPhase = programDetails.phases?.[0]
    if (firstPhase?.workouts) {
      const workouts = Array.isArray(firstPhase.workouts) 
        ? firstPhase.workouts 
        : Object.entries(firstPhase.workouts).map(([day, w]) => ({ day, ...w }))
      if (workouts[0]) {
        return `${workouts[0].day} - ${workouts[0].title || 'Training'}`
      }
    }
    return 'Day 1 - Start Training'
  }
  
  // Get the phase and calculate next workout
  const phaseIdx = (lastLog.phase || activeProgram.currentPhase || 1) - 1
  const phase = programDetails.phases[phaseIdx]
  
  if (!phase?.workouts) {
    return `${activeProgram.currentDay || 'Day 1'} - Training`
  }
  
  // Normalize workouts to array
  const workouts = Array.isArray(phase.workouts) 
    ? phase.workouts 
    : Object.entries(phase.workouts).map(([day, w]) => ({ day, ...w }))
  
  // Find current day index
  const currentDayIdx = workouts.findIndex(w => w.day === lastLog.day)
  
  if (currentDayIdx === -1) {
    // Day not found, start at Day 1
    return `${workouts[0]?.day || 'Day 1'} - ${workouts[0]?.title || 'Training'}`
  }
  
  // Calculate next day
  const nextDayIdx = currentDayIdx + 1
  
  if (nextDayIdx >= workouts.length) {
    // End of phase - check if there's another phase
    const nextPhaseIdx = phaseIdx + 1
    if (nextPhaseIdx < programDetails.phases.length) {
      const nextPhase = programDetails.phases[nextPhaseIdx]
      const nextPhaseWorkouts = Array.isArray(nextPhase.workouts) 
        ? nextPhase.workouts 
        : Object.entries(nextPhase.workouts).map(([day, w]) => ({ day, ...w }))
      return `${nextPhaseWorkouts[0]?.day || 'Day 1'} - ${nextPhaseWorkouts[0]?.title || 'Training'}`
    }
    // Restart from beginning of current phase (or program complete)
    return `${workouts[0]?.day || 'Day 1'} - ${workouts[0]?.title || 'Training'}`
  }
  
  const nextWorkout = workouts[nextDayIdx]
  return `${nextWorkout.day} - ${nextWorkout.title || 'Training'}`
}

// Format data for API response
export function formatProgressData(
  progress: typeof mockUserProgress, 
  programName: string = 'BECOME — 12 Week Fat-Loss Foundation',
  nextWorkout: string = 'Day 1 - Start Training'
) {
  const weightData = progress.weightHistory.map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: entry.weight
  }))

  const bmiData = progress.weightHistory.map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: Number(calculateBMI(entry.weight, progress.height).toFixed(1))
  }))

  // Format mood data
  const moodData = (progress.moodHistory || []).map(entry => ({
    date: new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: entry.mood
  }))

  // Calculate this week's workouts
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  
  const thisWeekWorkouts = progress.workoutLogs.filter(log => 
    new Date(log.date) >= startOfWeek
  ).length

  return {
    weightData,
    bmiData,
    moodData,
    currentProgram: progress.currentProgram ? {
      programId: progress.currentProgram.programId,
      name: programName,
      currentPhase: progress.currentProgram.currentPhase,
      currentWeek: progress.currentProgram.currentWeek,
      totalWeeks: 12,
      nextWorkout: nextWorkout
    } : null,
    stats: {
      streakDays: progress.streakDays,
      totalWorkouts: progress.totalWorkouts,
      thisWeekWorkouts,
      goalProgress: Math.round((progress.currentProgram?.currentWeek || 0) / 12 * 100)
    }
  }
}
