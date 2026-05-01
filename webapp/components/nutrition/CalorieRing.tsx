"use client"

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Check, X } from 'lucide-react'
import MacroBar from './MacroBar'

interface MacroValues {
  current: number
  goal: number
}

interface CalorieRingProps {
  consumed: number
  goal: number
  protein: MacroValues
  carbs: MacroValues
  fats: MacroValues
  onGoalChange?: (calories: number) => Promise<void>
}

export default function CalorieRing({
  consumed,
  goal,
  protein,
  carbs,
  fats,
  onGoalChange,
}: CalorieRingProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(goal))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const remaining = goal - consumed
  const isOver = consumed > goal
  const percentage = Math.min(consumed / goal, 1)

  const size = 180
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - percentage * circumference

  useEffect(() => {
    if (editing) {
      setDraft(String(goal))
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [editing, goal])

  const handleSave = async () => {
    const val = parseInt(draft)
    if (!val || val < 500 || val > 10000 || !onGoalChange) {
      setEditing(false)
      return
    }
    setSaving(true)
    await onGoalChange(val)
    setSaving(false)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      {/* Ring */}
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <defs>
              <linearGradient id="calorie-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-zinc-200 dark:text-zinc-700"
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={isOver ? '#ef4444' : 'url(#calorie-ring-gradient)'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
            />
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className={`text-2xl font-bold tabular-nums ${
                isOver ? 'text-red-500' : 'text-zinc-900 dark:text-white'
              }`}
            >
              {Math.abs(remaining)}
            </motion.span>
            <span
              className={`text-xs font-medium ${
                isOver ? 'text-red-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {isOver ? 'over' : 'remaining'}
            </span>
          </div>
        </div>

        {/* Goal breakdown / inline edit */}
        {editing ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Goal</span>
            <input
              ref={inputRef}
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              min={500}
              max={10000}
              className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-center text-sm font-bold text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">kcal</span>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Goal {goal}</span>
              {' '}&minus;{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Food {consumed}</span>
              {' '}={' '}
              <span className={`font-semibold ${isOver ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {remaining} {isOver ? 'over' : 'remaining'}
              </span>
            </p>
            {onGoalChange && (
              <button
                onClick={() => setEditing(true)}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Edit calorie goal"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Macro bars */}
      <div className="mt-5 space-y-3">
        <MacroBar label="Protein" current={protein.current} goal={protein.goal} color="bg-blue-600" />
        <MacroBar label="Carbs" current={carbs.current} goal={carbs.goal} color="bg-green-600" />
        <MacroBar label="Fats" current={fats.current} goal={fats.goal} color="bg-amber-500" />
      </div>
    </div>
  )
}
