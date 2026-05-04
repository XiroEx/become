"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, KeyboardIcon } from 'lucide-react'

interface BarcodeScannerProps {
  onClose: () => void
  onDetected: (code: string) => void
}

type ScanState = 'initializing' | 'scanning' | 'error'

export default function BarcodeScanner({ onClose, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const detectedRef = useRef(false)

  const [scanState, setScanState] = useState<ScanState>('initializing')
  const [errorMsg, setErrorMsg] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualCode, setManualCode] = useState('')

  const handleDetected = useCallback((code: string) => {
    if (detectedRef.current) return
    detectedRef.current = true
    controlsRef.current?.stop()
    onDetected(code)
  }, [onDetected])

  useEffect(() => {
    let cancelled = false

    async function startScanner() {
      try {
        // Dynamic import keeps ZXing out of the initial bundle
        const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await import('@zxing/browser')

        if (cancelled) return

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)

        if (cancelled || !videoRef.current) return

        const controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width:  { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, err) => {
            if (result) {
              handleDetected(result.getText())
            } else if (err && !(err instanceof Error && err.name === 'NotFoundException')) {
              // Only log non-routine "not found in frame" errors
              console.warn('ZXing error:', err)
            }
          }
        )

        if (cancelled) {
          controls.stop()
          return
        }

        controlsRef.current = controls
        setScanState('scanning')
      } catch (err: unknown) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        const isPermission = msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('notallowed') ||
          msg.toLowerCase().includes('denied')
        setErrorMsg(
          isPermission
            ? 'Camera access was denied. Allow camera permission in your browser settings, or enter the barcode manually below.'
            : 'Could not start the camera. Try entering the barcode manually below.'
        )
        setScanState('error')
        setShowManual(true)
      }
    }

    startScanner()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [handleDetected])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    handleDetected(code)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        data-testid="barcode-scanner"
        className="fixed inset-0 z-[60] flex flex-col bg-black"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-white">Scan Barcode</span>
          <div className="flex items-center gap-2">
            {scanState === 'scanning' && !showManual && (
              <button
                onClick={() => setShowManual(true)}
                data-testid="manual-entry-toggle"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Enter barcode manually"
              >
                <KeyboardIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              data-testid="scanner-close"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Close scanner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Camera view */}
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            data-testid="scanner-video"
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />

          {/* Dark overlay with cutout effect */}
          {scanState === 'scanning' && (
            <>
              <div className="pointer-events-none absolute inset-0">
                {/* Top / bottom / side darkening */}
                <div className="absolute inset-x-0 top-0 h-[20%] bg-black/60" />
                <div className="absolute inset-x-0 bottom-0 h-[30%] bg-black/60" />
                <div className="absolute inset-y-[20%] left-0 w-[8%] h-[50%] bg-black/60" />
                <div className="absolute inset-y-[20%] right-0 w-[8%] h-[50%] bg-black/60" />

                {/* Viewfinder corners */}
                <div className="absolute left-[8%] top-[20%] h-[50%] w-[84%]">
                  {/* TL */}
                  <span className="absolute left-0 top-0 h-8 w-8 border-l-2 border-t-2 border-white rounded-tl-sm" />
                  {/* TR */}
                  <span className="absolute right-0 top-0 h-8 w-8 border-r-2 border-t-2 border-white rounded-tr-sm" />
                  {/* BL */}
                  <span className="absolute left-0 bottom-0 h-8 w-8 border-l-2 border-b-2 border-white rounded-bl-sm" />
                  {/* BR */}
                  <span className="absolute right-0 bottom-0 h-8 w-8 border-r-2 border-b-2 border-white rounded-br-sm" />

                  {/* Animated scan line */}
                  <motion.div
                    className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]"
                    initial={{ top: '5%' }}
                    animate={{ top: '95%' }}
                    transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
                  />
                </div>
              </div>

              <p className="pointer-events-none absolute bottom-[32%] inset-x-0 text-center text-xs font-medium text-white/70">
                Point the camera at a barcode
              </p>
            </>
          )}

          {/* Initializing spinner */}
          {scanState === 'initializing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <p className="text-sm text-white/70">Starting camera…</p>
            </div>
          )}

          {/* Error state */}
          {scanState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 px-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                <X className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-sm text-white/80">{errorMsg}</p>
            </div>
          )}
        </div>

        {/* Manual entry panel */}
        <AnimatePresence>
          {showManual && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-hidden bg-zinc-900"
            >
              <form
                onSubmit={handleManualSubmit}
                data-testid="manual-barcode-form"
                className="flex items-center gap-2 px-4 py-3"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  placeholder="Enter barcode number"
                  data-testid="manual-barcode-input"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  data-testid="manual-barcode-submit"
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
                >
                  Look up
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  )
}
