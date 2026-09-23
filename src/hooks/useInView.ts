"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Reports once (and stays `true` forever after) when the returned ref's element
 * first scrolls within `rootMargin` of the viewport — used to defer expensive
 * per-card fetches (e.g. images) until a card is actually about to be seen.
 */
export function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || isInView) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [rootMargin, isInView])

  return { ref, isInView }
}
