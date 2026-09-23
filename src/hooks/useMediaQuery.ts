"use client"

import { useEffect, useState } from "react"

/**
 * Subscribes to a CSS media query. SSR-safe: returns `false` on the server and
 * first client render, then updates after mount to avoid hydration mismatches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const timer = setTimeout(() => setMatches(mql.matches), 0)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener("change", onChange)
    return () => {
      clearTimeout(timer)
      mql.removeEventListener("change", onChange)
    }
  }, [query])

  return matches
}

/** True below Tailwind's `md` breakpoint (≤767px) — i.e. the mobile layout. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)")
}
