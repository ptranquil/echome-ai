import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 767px), (pointer: coarse)'

export function getIsMobile(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

/** Reliable mobile detection — used to disable heavy desktop-only UX. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobile)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isMobile
}
