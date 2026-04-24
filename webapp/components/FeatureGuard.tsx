"use client"

import { useEffect, useState, type ReactNode } from "react"
import PageTransition from "@/components/PageTransition"
import { Lock } from "lucide-react"

interface Props {
  feature: string
  description: string
  icon: ReactNode
  children: ReactNode
}

type Status = "loading" | "allowed" | "blocked"

export default function FeatureGuard({ feature, description, icon, children }: Props) {
  const [status, setStatus] = useState<Status>("loading")

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      setStatus("blocked")
      return
    }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setStatus(data?.user?.role === "admin" ? "allowed" : "blocked")
      })
      .catch(() => setStatus("blocked"))
  }, [])

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200" />
      </div>
    )
  }

  if (status === "blocked") {
    return (
      <PageTransition className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          {icon}
        </div>

        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <Lock className="h-3 w-3" />
          Coming Soon
        </div>

        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
          {feature}
        </h1>
        <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </PageTransition>
    )
  }

  return <>{children}</>
}
