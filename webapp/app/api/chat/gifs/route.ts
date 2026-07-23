// GET /api/chat/gifs?q=&offset= — GIF search/trending proxy (GIPHY).
// Keeps the API key server-side and normalizes the response for the picker.
// Auth required. Without GIPHY_API_KEY it returns 503 so the UI can degrade.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const LIMIT = 24
const RATING = 'pg-13'

interface GiphyImage { url: string; width: string; height: string }
interface GiphyItem {
  id: string
  title?: string
  images: {
    fixed_height: GiphyImage
    fixed_height_small?: GiphyImage
    downsized?: GiphyImage
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const key = (await getRuntimeConfig()).external.giphyApiKey
    if (!key) {
      return NextResponse.json({ error: 'GIF search not configured', gifs: [] }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

    const base = q
      ? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}&bundle=messaging_non_clips&`
      : `https://api.giphy.com/v1/gifs/trending?`
    const url = `${base}api_key=${key}&limit=${LIMIT}&offset=${offset}&rating=${RATING}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ error: 'GIF provider error', gifs: [] }, { status: 502 })
    }
    const data = (await res.json()) as { data: GiphyItem[] }
    const gifs = (data.data || []).map((g) => ({
      id: g.id,
      title: g.title || 'GIF',
      // What we send + render in the message:
      url: g.images.downsized?.url || g.images.fixed_height.url,
      // Lighter thumbnail for the picker grid:
      preview: g.images.fixed_height_small?.url || g.images.fixed_height.url,
      width: Number(g.images.fixed_height.width) || undefined,
      height: Number(g.images.fixed_height.height) || undefined,
    }))

    return NextResponse.json({ gifs })
  } catch (err) {
    console.error('GET /api/chat/gifs error:', err)
    return NextResponse.json({ error: 'GIF search failed', gifs: [] }, { status: 500 })
  }
}
