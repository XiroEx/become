"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ChevronLeft, Calendar, Save, RefreshCw } from 'lucide-react'

interface ScheduleData {
  _id: string
  programId: string
  programName: string
  settings: {
    trainingDays: number[]
    startDate: string
    autoAdvance: boolean
  }
  scheduledWorkouts: Array<{
    status: string
  }>
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function CalendarSettingsPage() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<ScheduleData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSchedule, setEditingSchedule] = useState<string | null>(null)
  const [editDays, setEditDays] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function fetchSchedules() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await fetch('/api/schedule', {
          headers: { 'Authorization': `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          setSchedules(data.schedules || [])
        }
      } catch (error) {
        console.error('Failed to fetch schedules:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSchedules()
  }, [])

  const startEditing = (schedule: ScheduleData) => {
    setEditingSchedule(schedule.programId)
    setEditDays([...schedule.settings.trainingDays])
    setSuccessMessage('')
  }

  const toggleDay = (day: number) => {
    setEditDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    )
  }

  const handleSave = async (programId: string) => {
    setSaving(true)
    setSuccessMessage('')

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const res = await fetch('/api/schedule/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          programId,
          trainingDays: editDays,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setSuccessMessage(`Updated! ${data.schedule.futureWorkouts} future workouts regenerated.`)
        setEditingSchedule(null)

        // Refresh schedules
        const refreshRes = await fetch('/api/schedule', {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          setSchedules(refreshData.schedules || [])
        }
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-3 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">Schedule Settings</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage your training schedules</p>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="h-5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-3 h-4 w-60 rounded bg-zinc-100 dark:bg-zinc-800/50" />
            </div>
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No schedules to manage.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => {
            const isEditing = editingSchedule === schedule.programId
            const completedCount = schedule.scheduledWorkouts.filter(w => w.status === 'completed').length
            const totalCount = schedule.scheduledWorkouts.length

            return (
              <div key={schedule.programId} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{schedule.programName}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {completedCount}/{totalCount} workouts completed · 
                      Started {new Date(schedule.settings.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => startEditing(schedule)}
                      className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Edit Days
                    </button>
                  )}
                </div>

                {/* Current training days */}
                {!isEditing && (
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                      <div
                        key={day}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium ${
                          schedule.settings.trainingDays.includes(day)
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                        }`}
                      >
                        {DAY_LABELS[day]}
                      </div>
                    ))}
                  </div>
                )}

                {/* Edit mode */}
                {isEditing && (
                  <div>
                    <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Tap days to toggle. Future workouts will be regenerated.
                    </p>
                    <div className="mb-3 flex gap-1.5">
                      {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                        <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                            editDays.includes(day)
                              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                              : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-600 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>

                    <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {editDays.length} days: {editDays.map(d => DAY_FULL_LABELS[d]).join(', ')}
                    </p>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(schedule.programId)}
                        disabled={saving || editDays.length === 0}
                        className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? 'Saving...' : 'Save & Regenerate'}
                      </button>
                      <button
                        onClick={() => setEditingSchedule(null)}
                        className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageTransition>
  )
}
