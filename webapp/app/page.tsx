import type { Metadata } from "next"
import BecomeLanding from "@/components/landing/BecomeLanding"

export const metadata: Metadata = {
  description:
    "Coach-built training programs, photo-powered nutrition tracking, live workout logging, and daily mindset work — one app that keeps your whole plan organized.",
}

export default function Home() {
  return <BecomeLanding />
}
