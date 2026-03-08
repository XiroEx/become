"use client"

import { motion } from 'framer-motion'
import { Droplets } from 'lucide-react'

interface WaterTrackerProps {
  current: number
  goal: number
  onAddWater: (amount: number) => void
}

const quickAmounts = [
  { label: '+8 oz', sublabel: 'Glass', amount: 8 },
  { label: '+16 oz', sublabel: 'Bottle', amount: 16 },
  { label: '+32 oz', sublabel: 'Large', amount: 32 },
]

export default function WaterTracker({ current, goal, onAddWater }: WaterTrackerProps) {
  const percentage = Math.min((current / goal) * 100, 100)
  const isComplete = current >= goal

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            isComplete
              ? 'bg-blue-100 dark:bg-blue-900/30'
              : 'bg-zinc-100 dark:bg-zinc-800'
          }`}>
            <Droplets className={`h-4 w-4 ${
              isComplete ? 'text-blue-500' : 'text-zinc-500 dark:text-zinc-400'
            }`} />
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">Water</span>
        </div>
        <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
          <span className={`font-semibold ${isComplete ? 'text-blue-500' : 'text-zinc-900 dark:text-white'}`}>
            {current}
          </span>
          {' / '}
          {goal} oz
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full bg-blue-400"
        />
      </div>

      {/* Quick-add buttons */}
      <div className="grid grid-cols-3 gap-2">
        {quickAmounts.map((item) => (
          <button
            key={item.amount}
            onClick={() => onAddWater(item.amount)}
            className="flex flex-col items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 transition-all hover:border-blue-300 hover:bg-blue-50 active:scale-95 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20"
          >
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              {item.label}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              {item.sublabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
