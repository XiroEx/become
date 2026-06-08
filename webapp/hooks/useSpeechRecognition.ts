'use client'

// Thin wrapper around the browser Web Speech API (SpeechRecognition /
// webkitSpeechRecognition). Streams interim + final transcripts as you speak.
// The Web Speech types aren't in the standard DOM lib, so we declare the minimal
// shape we use locally (no `any`). Auto-restarts on `onend` while we intend to be
// listening (some engines stop after a pause); stop() ends that intent cleanly.

import { useCallback, useEffect, useRef, useState } from 'react'

interface SRAlternative {
  transcript: string
  confidence: number
}
interface SRResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SRAlternative
}
interface SRResultList {
  readonly length: number
  [index: number]: SRResult
}
interface SREvent {
  readonly resultIndex: number
  readonly results: SRResultList
}
interface SRErrorEvent {
  readonly error: string
}
interface SRInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: SRErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
type SRCtor = new () => SRInstance

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export interface UseSpeechRecognition {
  /** Web Speech API available in this browser. */
  supported: boolean
  /** Which constructor backs it (for diagnostics). */
  api: 'SpeechRecognition' | 'webkitSpeechRecognition' | null
  listening: boolean
  /** Final + current interim transcript. */
  transcript: string
  error: string | null
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechRecognition(opts?: { lang?: string }): UseSpeechRecognition {
  const lang = opts?.lang ?? 'en-US'
  const [supported, setSupported] = useState(false)
  const [api, setApi] = useState<UseSpeechRecognition['api']>(null)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<SRInstance | null>(null)
  const finalRef = useRef('')
  const wantRef = useRef(false) // we intend to keep listening (drives auto-restart)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }
    if (w.SpeechRecognition) { setSupported(true); setApi('SpeechRecognition') }
    else if (w.webkitSpeechRecognition) { setSupported(true); setApi('webkitSpeechRecognition') }
  }, [])

  const stop = useCallback(() => {
    wantRef.current = false
    setListening(false)
    try { recRef.current?.stop() } catch { /* ignore */ }
  }, [])

  const reset = useCallback(() => {
    finalRef.current = ''
    setTranscript('')
    setError(null)
  }, [])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) { setError('not-supported'); return }
    // Fresh instance each start avoids stale-state quirks across engines.
    try { recRef.current?.abort() } catch { /* ignore */ }
    finalRef.current = ''
    setTranscript('')
    setError(null)

    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0]?.transcript ?? ''
        if (r.isFinal) finalRef.current += text + ' '
        else interim += text
      }
      setTranscript((finalRef.current + interim).trim())
    }
    rec.onerror = (e) => {
      // 'no-speech' / 'aborted' are benign; surface the rest.
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error)
    }
    rec.onend = () => {
      // Engines often stop after a silence — restart while we still want to listen.
      if (wantRef.current) {
        try { rec.start() } catch { setListening(false) }
      } else {
        setListening(false)
      }
    }

    recRef.current = rec
    wantRef.current = true
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('start-failed')
      setListening(false)
    }
  }, [lang])

  useEffect(() => {
    return () => {
      wantRef.current = false
      try { recRef.current?.abort() } catch { /* ignore */ }
    }
  }, [])

  return { supported, api, listening, transcript, error, start, stop, reset }
}
