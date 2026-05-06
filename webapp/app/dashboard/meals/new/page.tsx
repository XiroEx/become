"use client"

import { useEffect, useState } from 'react'
import PageTransition from '@/components/PageTransition'
import MealForm from '@/components/meals/MealForm'

export default function NewMealPage() {
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: [], userTags: [],
  })

  useEffect(() => {
    let cancelled = false
    async function loadTags() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const headers: HeadersInit = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch('/api/tags', { headers })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            setTagsResp({
              defaults: Array.isArray(data.defaults) ? data.defaults : [],
              userTags: Array.isArray(data.userTags) ? data.userTags : [],
            })
          }
        }
      } catch {
        /* non-fatal */
      }
    }
    loadTags()
    return () => { cancelled = true }
  }, [])

  return (
    <PageTransition>
      <MealForm availableTags={tagsResp} />
    </PageTransition>
  )
}
