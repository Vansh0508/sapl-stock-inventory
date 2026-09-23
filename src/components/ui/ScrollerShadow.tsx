"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface ScrollerShadowProps {
  /** The scrollable content. */
  children: React.ReactNode
  /** Additional class names applied to the outer wrapper. */
  className?: string
  /** Direction of scroll and shadow: "vertical" (default) or "horizontal". */
  direction?: "vertical" | "horizontal"
  /** Tailwind max-height class e.g. "max-h-72". Applied to the scroll container. */
  size?: string
  /** Shadow gradient colour — should match the panel background. Defaults to white. */
  shadowColor?: string
}

/**
 * ScrollerShadow
 *
 * Wraps children in a hidden-scrollbar scroll container and shows
 * smooth gradient fade shadows at the scroll edges when there is
 * overflowed content in that direction.
 *
 * Usage:
 *   <ScrollerShadow size="max-h-72" className="flex flex-col gap-0.5">
 *     {items}
 *   </ScrollerShadow>
 */
const ScrollerShadow = ({
  children,
  className,
  direction = "vertical",
  size = "max-h-72",
  shadowColor = "white",
}: ScrollerShadowProps) => {
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const startSentinelRef = useRef<HTMLDivElement>(null)
  const endSentinelRef = useRef<HTMLDivElement>(null)

  const [showStartShadow, setShowStartShadow] = useState(false)
  const [showEndShadow, setShowEndShadow] = useState(false)

  const isVertical = direction === "vertical"

  useEffect(() => {
    const options: IntersectionObserverInit = {
      threshold: 0,
    }

    const startRef = isVertical ? topSentinelRef : startSentinelRef
    const endRef = isVertical ? bottomSentinelRef : endSentinelRef

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === startRef.current) {
          setShowStartShadow(!entry.isIntersecting)
        }
        if (entry.target === endRef.current) {
          setShowEndShadow(!entry.isIntersecting)
        }
      }
    }, options)

    if (startRef.current) observer.observe(startRef.current)
    if (endRef.current) observer.observe(endRef.current)

    return () => observer.disconnect()
  }, [isVertical])

  const gradientStart = isVertical
    ? `linear-gradient(to bottom, ${shadowColor}, transparent)`
    : `linear-gradient(to right, ${shadowColor}, transparent)`

  const gradientEnd = isVertical
    ? `linear-gradient(to top, ${shadowColor}, transparent)`
    : `linear-gradient(to left, ${shadowColor}, transparent)`

  return (
    <div className="relative">
      {/* Start shadow (top / left) */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute z-10 pointer-events-none transition-opacity duration-200",
          isVertical ? "inset-x-0 top-0 h-8" : "inset-y-0 left-0 w-8",
          showStartShadow ? "opacity-100" : "opacity-0"
        )}
        style={{ background: gradientStart }}
      />

      {/* Scroll container — scrollbar hidden */}
      <div
        className={cn(
          "scrollbar-hide",
          isVertical ? `overflow-y-auto ${size}` : `overflow-x-auto ${size}`,
          className
        )}
      >
        {/* Start sentinel */}
        <div
          ref={isVertical ? topSentinelRef : startSentinelRef}
          aria-hidden="true"
          className={cn(
            "shrink-0",
            isVertical ? "h-px w-full" : "w-px h-full"
          )}
        />

        {children}

        {/* End sentinel */}
        <div
          ref={isVertical ? bottomSentinelRef : endSentinelRef}
          aria-hidden="true"
          className={cn(
            "shrink-0",
            isVertical ? "h-px w-full" : "w-px h-full"
          )}
        />
      </div>

      {/* End shadow (bottom / right) */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute z-10 pointer-events-none transition-opacity duration-200",
          isVertical ? "inset-x-0 bottom-0 h-8" : "inset-y-0 right-0 w-8",
          showEndShadow ? "opacity-100" : "opacity-0"
        )}
        style={{ background: gradientEnd }}
      />
    </div>
  )
}

export default ScrollerShadow
