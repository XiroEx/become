"use client"

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts'

export interface MetricData {
  date: string
  value: number
  label?: string
}

interface ProgressChartProps {
  weightData: MetricData[]
  bmiData: MetricData[]
  moodData: MetricData[]
}

type ChartType = 'weight' | 'bmi' | 'mood'

const chartConfig: Record<ChartType, { label: string; color: string; unit: string }> = {
  weight: { label: 'Weight', color: '#3b82f6', unit: 'lbs' },
  bmi: { label: 'BMI', color: '#10b981', unit: '' },
  mood: { label: 'Mood', color: '#f59e0b', unit: '' }
}

const moodLabels: Record<number, string> = {
  1: '😢',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊'
}

// Colors for each mood level
const moodColors: Record<number, string> = {
  1: '#f87171', // red-400 for bad
  2: '#fb923c', // orange-400 for not great
  3: '#fbbf24', // amber-400 for okay
  4: '#a3e635', // lime-400 for pretty good
  5: '#34d399'  // emerald-400 for great
}

export default function ProgressChart({ weightData, bmiData, moodData }: ProgressChartProps) {
  const [activeChart, setActiveChart] = useState<ChartType>('weight')

  const getData = () => {
    switch (activeChart) {
      case 'weight':
        return weightData
      case 'bmi':
        return bmiData
      case 'mood':
        return moodData
    }
  }

  const data = getData()
  const config = chartConfig[activeChart]

  // Calculate stats
  const getStats = () => {
    if (data.length === 0) return { current: 0, change: 0, trend: 'neutral' as const }
    
    const current = data[data.length - 1]?.value || 0
    const previous = data.length > 1 ? data[data.length - 2]?.value || current : current
    const change = current - previous
    const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    
    return { current, change, trend }
  }

  const stats = getStats()

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-6">
      {/* Chart Type Selector */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 sm:gap-2 sm:mb-6">
        {(Object.keys(chartConfig) as ChartType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActiveChart(type)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4 ${
              activeChart === type
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            {chartConfig[type].label}
          </button>
        ))}
      </div>

      {/* Stats Summary */}
      <div className="mb-4 flex items-baseline gap-3 sm:mb-6">
        {activeChart === 'mood' ? (
          <span className="text-3xl sm:text-4xl">
            {moodLabels[stats.current] || '—'}
          </span>
        ) : (
          <>
            <span className="text-3xl font-bold text-zinc-900 dark:text-white sm:text-4xl">
              {stats.current.toFixed(1)}
            </span>
            {config.unit && (
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{config.unit}</span>
            )}
          </>
        )}
        {stats.change !== 0 && activeChart !== 'mood' && (
          <span className={`flex items-center gap-1 text-sm font-medium ${
            activeChart === 'weight' 
              ? stats.trend === 'down' ? 'text-green-600' : 'text-red-500'
              : stats.trend === 'up' ? 'text-green-600' : 'text-red-500'
          }`}>
            {stats.trend === 'up' ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
            {Math.abs(stats.change).toFixed(1)}
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="h-48 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {activeChart === 'mood' ? (
            <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                domain={[0, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tickFormatter={(value) => moodLabels[value] || ''}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value) => [moodLabels[value as number] || value, 'Mood']}
              />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                name={config.label}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={moodColors[entry.value] || config.color}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id={`gradient-${activeChart}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 2', 'dataMax + 2']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                labelStyle={{ color: '#a1a1aa' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={config.color}
                strokeWidth={2}
                fill={`url(#gradient-${activeChart})`}
                name={config.label}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
