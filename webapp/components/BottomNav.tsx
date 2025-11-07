"use client"
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function BottomNav() {
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const t = localStorage.getItem('token')
    setLoggedIn(!!t)
  }, [])

  function handleLogout() {
    localStorage.removeItem('token')
    setLoggedIn(false)
    router.push('/login')
  }

  if (!loggedIn) return null

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 w-[min(680px,92%)] -translate-x-1/2 rounded-full bg-white/95 shadow-lg">
      <ul className="mx-2 flex items-center justify-between p-2">
        <li>
          <Link href="/dashboard/programming" className="px-4 py-2">Programs</Link>
        </li>
        <li>
          <Link href="/dashboard/nutrition" className="px-4 py-2">Nutrition</Link>
        </li>
        <li>
          <Link href="/dashboard/chat" className="px-4 py-2">Chat</Link>
        </li>
        <li>
          <Link href="/dashboard/progress" className="px-4 py-2">Progress</Link>
        </li>
        <li>
          <button onClick={handleLogout} className="rounded-full bg-red-600 px-3 py-1 text-sm text-white">Log out</button>
        </li>
      </ul>
    </nav>
  )
}
