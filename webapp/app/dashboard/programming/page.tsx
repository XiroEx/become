"use client"
import { useState } from 'react'

interface Program {
  id: number
  title: string
  weeks: number
  focus: string
  description: string
  exercises: string[]
}

const programs: Program[] = [
  {
    id: 1,
    title: "Week 1 — Strength Focus",
    weeks: 4,
    focus: "Compound Lifts",
    description: "Build foundational strength with heavy compound movements. Focus on progressive overload and proper form.",
    exercises: [
      "Barbell Back Squat: 5x5 @ 80% 1RM",
      "Bench Press: 5x5 @ 80% 1RM",
      "Deadlift: 3x5 @ 85% 1RM",
      "Overhead Press: 4x6 @ 75% 1RM",
      "Barbell Rows: 4x8 @ 70% 1RM"
    ]
  },
  {
    id: 2,
    title: "Week 2 — Hypertrophy Focus",
    weeks: 4,
    focus: "Muscle Building",
    description: "Higher volume training to maximize muscle growth. Time under tension and controlled reps are key.",
    exercises: [
      "Incline Dumbbell Press: 4x10-12",
      "Cable Flyes: 3x12-15",
      "Leg Press: 4x12-15",
      "Romanian Deadlifts: 4x10-12",
      "Lat Pulldowns: 4x12-15",
      "Bicep Curls: 3x12-15",
      "Tricep Pushdowns: 3x12-15"
    ]
  }
]

export default function ProgrammingPage() {
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null)

  return (
    <>
      <section className="pb-20">
        <h1 className="text-2xl font-bold">Programming</h1>
        <p className="mt-2 text-sm text-zinc-600">Your active programs and daily workouts will show here.</p>
        
        <div className="mt-6 space-y-4">
          {programs.map((program) => (
            <button
              key={program.id}
              onClick={() => setSelectedProgram(program)}
              className="group w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-zinc-300 hover:shadow-md active:scale-[0.98]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-black">
                    {program.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-600">{program.focus} • {program.weeks} weeks</p>
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
      </section>

      {/* Modal */}
      {selectedProgram && (
        <div 
          className="fixed inset-0 z-100 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setSelectedProgram(null)}
        >
          <div 
            className="w-full max-w-2xl rounded-t-2xl bg-white p-6 sm:rounded-2xl sm:max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-zinc-900">{selectedProgram.title}</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {selectedProgram.focus} • {selectedProgram.weeks} weeks
                </p>
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Description</h3>
              <p className="mt-2 text-zinc-700">{selectedProgram.description}</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Exercises</h3>
              <ul className="mt-3 space-y-3">
                {selectedProgram.exercises.map((exercise, index) => (
                  <li 
                    key={index}
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm text-zinc-800">{exercise}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setSelectedProgram(null)}
              className="mt-6 w-full cursor-pointer rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}

