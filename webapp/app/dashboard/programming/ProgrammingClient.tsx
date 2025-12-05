"use client"
import { useState } from 'react'
import { Program } from '@/lib/data/programs'

interface ProgrammingClientProps {
  programs: Program[]
}

import PageTransition from '@/components/PageTransition'

export default function ProgrammingClient({ programs }: ProgrammingClientProps) {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(0)
  const [selectedDayKey, setSelectedDayKey] = useState<string>("Day 1")

  const currentPhase = selectedProgram?.phases[selectedPhaseIndex]
  const currentWorkout = currentPhase?.workouts[selectedDayKey]

  return (
    <>
      <PageTransition className="pb-20">
        <h1 className="text-2xl font-bold">Programming</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Your active programs and daily workouts will show here.</p>
        
        <div className="mt-6 space-y-4">
          {programs.map((program) => (
            <button
              key={program.program_id}
              onClick={() => {
                setSelectedProgram(program)
                setSelectedPhaseIndex(0)
                setSelectedDayKey("Day 1")
              }}
              className="group w-full cursor-pointer rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white group-hover:text-black dark:group-hover:text-white">
                    {program.name}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{program.goal} • {program.duration_weeks} weeks</p>
                </div>
                <svg 
                  className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </PageTransition>

      {/* Modal */}
      {selectedProgram && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center p-4"
          onClick={() => setSelectedProgram(null)}
        >
          <div 
            className="w-full max-w-4xl rounded-2xl bg-white dark:bg-zinc-900 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between bg-white dark:bg-zinc-900 sticky top-0 z-10">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">{selectedProgram.name}</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {selectedProgram.target_user}
                </p>
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Phase Selector */}
              <div className="mb-8">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {selectedProgram.phases.map((phase, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setSelectedPhaseIndex(index)
                        // Reset day when phase changes if needed, or keep if exists
                        const firstDay = Object.keys(phase.workouts)[0]
                        if (!phase.workouts[selectedDayKey]) {
                            setSelectedDayKey(firstDay)
                        }
                      }}
                      className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        selectedPhaseIndex === index
                          ? 'bg-zinc-900 dark:bg-white text-white dark:text-black'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {phase.phase} ({phase.weeks})
                    </button>
                  ))}
                </div>
                {currentPhase && (
                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                        <span className="font-semibold text-zinc-900 dark:text-white">Focus:</span> {currentPhase.focus}
                    </p>
                )}
              </div>

              {/* Day Selector */}
              {currentPhase && (
                <div className="mb-6">
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(currentPhase.workouts).map((dayKey) => (
                      <button
                        key={dayKey}
                        onClick={() => setSelectedDayKey(dayKey)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                          selectedDayKey === dayKey
                            ? 'border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-black shadow-md'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {dayKey}
                      </button>>
                    ))}
                  </div>
                </div>
              )}

              {/* Workout Display */}
              {currentWorkout ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{currentWorkout.title}</h3>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-1">
                    {currentWorkout.exercises.map((exercise, index) => (
                      <div 
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
                      >
                        <div className="flex items-start gap-4">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-white shadow-sm">
                            {index + 1}
                          </span>
                          <div>
                            <h4 className="font-semibold text-zinc-900 dark:text-white">{exercise.name}</h4>
                            {exercise.type === 'conditioning' ? (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{exercise.details}</p>
                            ) : (
                                <div className="flex gap-4 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                    {exercise.sets && <span>{exercise.sets} sets</span>}
                                    {exercise.reps && <span>{exercise.reps} reps</span>}
                                </div>
                            )}
                          </div>
                        </div>
                        
                        {exercise.rest && (
                            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-100 dark:border-zinc-800 shadow-sm self-start sm:self-center">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Rest: {exercise.rest}
                            </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                    Select a day to view the workout
                </div>
              )}
            </div>

            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <button
                onClick={() => setSelectedProgram(null)}
                className="w-full cursor-pointer rounded-xl bg-zinc-900 dark:bg-white py-3 font-semibold text-white dark:text-black transition-colors hover:bg-black dark:hover:bg-zinc-200 shadow-lg shadow-zinc-900/10"
                >
                Close Program
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
