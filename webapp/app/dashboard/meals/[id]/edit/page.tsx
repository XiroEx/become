"use client"

import { useEffect, useState, useCallback, use } from 'react'
import PageTransition from '@/components/PageTransition'
import MealForm, { type MealFormInitial } from '@/components/meals/MealForm'
import { Loader2, AlertCircle } from 'lucide-react'

export default function EditMealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [initial, setInitial] = useState<MealFormInitial | null>(null)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: [], userTags: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [mealRes, tagsRes] = await Promise.all([
          fetch(`/api/meals/${id}`, { headers: getHeaders() }),
          fetch('/api/tags', { headers: getHeaders() }),
        ])
        if (!cancelled && tagsRes.ok) {
          const data = await tagsRes.json()
          setTagsResp({
            defaults: Array.isArray(data.defaults) ? data.defaults : [],
            userTags: Array.isArray(data.userTags) ? data.userTags : [],
          })
        }
        if (mealRes.ok) {
          const data = await mealRes.json()
          if (!cancelled) {
            setInitial({
              name: data.meal.name,
              description: data.meal.description,
              imageUrl: data.meal.imageUrl,
              tags: data.meal.tags ?? [],
              defaultTag: data.meal.defaultTag,
              items: data.meal.items ?? [],
              recipe: data.meal.recipe,
            })
          }
        } else if (!cancelled) {
          setError(mealRes.status === 404 ? 'Meal not found.' : 'Failed to load meal.')
        }
      } catch {
        if (!cancelled) setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, getHeaders])

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </PageTransition>
    )
  }

  if (error || !initial) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <AlertCircle className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? 'Meal not found.'}</p>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <MealForm mealId={id} initial={initial} availableTags={tagsResp} />
    </PageTransition>
  )
}
