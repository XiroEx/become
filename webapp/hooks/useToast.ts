import { useState, useCallback } from 'react'
import type { ToastData, ToastType } from '@/components/ui/Toast'

export function useToast(duration = 3500) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const showToast = useCallback(
    (message: string, type: ToastType = 'neutral') => {
      setToast({ message, type })
      setTimeout(() => setToast(null), duration)
    },
    [duration],
  )
  return { toast, showToast }
}
