'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import VisionBuilder from '@/components/mind/VisionBuilder'
import VisionBoard from '@/components/mind/VisionBoard'

interface VisionData {
  habits: string
  mind: string
  body: string
  relationships: string
  environment: string
  identityStatement: string
  alignmentHistory?: { date: string; score: number }[]
  completedAt?: string
}

interface Props {
  streak?: number
}

export default function VisionTab({ streak = 0 }: Props) {
  const [vision, setVision] = useState<VisionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const token = getToken()
        const res = await fetch('/api/mind/vision', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setVision(data.vision)
          // If no completed vision, go straight to builder
          if (!data.vision?.completedAt) setEditing(true)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (!vision?.completedAt || editing) {
    return (
      <VisionBuilder
        onComplete={(newVision) => {
          setVision({ ...newVision, completedAt: new Date().toISOString() })
          setEditing(false)
        }}
      />
    )
  }

  return (
    <VisionBoard
      vision={vision}
      streak={streak}
      onEdit={() => setEditing(true)}
    />
  )
}
