"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { getThumbnailUrl } from "@/lib/supabase/storage"

interface ImageSwiperProps {
  images: string[]
  alt: string
  /** "fill" sizes the image to the wrapper's own width/height (set via `className`). "natural" keeps the image's own aspect ratio (auto height). */
  mode?: "fill" | "natural"
  className?: string
  imageClassName?: string
  /** Auto-advance interval in ms. Pass null to disable auto-rotation. */
  autoPlayMs?: number | null
  progressPosition?: "top" | "bottom" | "none"
  controlsSize?: "sm" | "md"
  naturalSize?: number
  onImageClick?: (url: string, index: number) => void
  emptyIcon?: React.ReactNode
  children?: React.ReactNode
}

const ChevronLeftIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

const ChevronRightIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const PhotoPlaceholderIcon = ({ size = 24 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
)

/**
 * Reusable image carousel — manual arrow navigation + timer-based auto-rotation,
 * with lazy-loaded slides and progress dots. Originally built for the Gallery
 * tab's card view; also used for larger, fixed-size swipers (e.g. the Catalog
 * tab's nested inventory table).
 */
export default function ImageSwiper({
  images,
  alt,
  mode = "fill",
  className,
  imageClassName,
  autoPlayMs = 3000,
  progressPosition = "bottom",
  controlsSize = "md",
  naturalSize = 500,
  onImageClick,
  emptyIcon,
  children,
}: ImageSwiperProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [visitedIndices, setVisitedIndices] = useState<number[]>([0])
  const hasMultiple = images.length > 1
  const isEmpty = images.length === 0

  useEffect(() => {
    if (!hasMultiple || isPaused || !autoPlayMs) return
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % images.length)
    }, autoPlayMs)
    return () => clearInterval(interval)
  }, [hasMultiple, images.length, isPaused, autoPlayMs])

  useEffect(() => {
    setVisitedIndices((prev) => (prev.includes(activeIdx) ? prev : [...prev, activeIdx]))
  }, [activeIdx])

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveIdx((prev) => (prev - 1 + images.length) % images.length)
  }
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveIdx((prev) => (prev + 1) % images.length)
  }

  const arrowSizeClass = controlsSize === "sm" ? "w-6 h-6" : "w-8 h-8"
  const arrowIconSize = controlsSize === "sm" ? 12 : 16

  return (
    <div
      className={cn(
        "group/swiper relative overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-200",
        mode === "natural" && isEmpty && "aspect-square",
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {isEmpty ? (
        <div className="w-full h-full flex items-center justify-center text-zinc-300">
          {emptyIcon ?? <PhotoPlaceholderIcon size={mode === "fill" ? 24 : 40} />}
        </div>
      ) : (
        <>
          <div
            className={cn("flex flex-row items-center w-full transition-transform duration-500 ease-in-out [will-change:transform]", mode === "fill" && "h-full")}
            style={{ transform: `translate3d(-${activeIdx * 100}%, 0, 0)` }}
          >
            {images.map((img, i) => {
              const isLoaded = visitedIndices.includes(i)
              const proxiedUrl = getThumbnailUrl(img, { width: mode === "fill" ? 600 : naturalSize, quality: 75 })
              return (
                <div key={i} className={cn("shrink-0 relative", mode === "fill" ? "w-full h-full" : "w-full")}>
                  {isLoaded ? (
                    mode === "fill" ? (
                      <Image
                        src={proxiedUrl}
                        alt={alt}
                        fill
                        unoptimized
                        sizes="200px"
                        onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(img, i) } : undefined}
                        className={cn("object-cover", onImageClick && "cursor-zoom-in", imageClassName)}
                      />
                    ) : (
                      <Image
                        src={proxiedUrl}
                        alt={alt}
                        width={naturalSize}
                        height={naturalSize}
                        unoptimized
                        style={{ width: "100%", height: "auto" }}
                        onClick={onImageClick ? (e) => { e.stopPropagation(); onImageClick(img, i) } : undefined}
                        className={cn("block object-contain", onImageClick && "cursor-zoom-in", imageClassName)}
                      />
                    )
                  ) : (
                    <div className={cn("bg-zinc-50/50 animate-pulse", mode === "fill" ? "w-full h-full" : "w-full aspect-square")} />
                  )}
                </div>
              )
            })}
          </div>

          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className={cn(
                  "absolute left-1.5 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center transition-opacity opacity-0 group-hover/swiper:opacity-100 cursor-pointer backdrop-blur-xs border border-white/10",
                  arrowSizeClass
                )}
                aria-label="Previous image"
              >
                <ChevronLeftIcon size={arrowIconSize} />
              </button>
              <button
                type="button"
                onClick={goNext}
                className={cn(
                  "absolute right-1.5 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/35 hover:bg-black/50 text-white flex items-center justify-center transition-opacity opacity-0 group-hover/swiper:opacity-100 cursor-pointer backdrop-blur-xs border border-white/10",
                  arrowSizeClass
                )}
                aria-label="Next image"
              >
                <ChevronRightIcon size={arrowIconSize} />
              </button>

              {progressPosition !== "none" && (
                <div
                  className={cn(
                    "absolute left-1.5 right-1.5 flex gap-1 z-10 bg-black/10 p-1 rounded-md backdrop-blur-xs",
                    progressPosition === "top" ? "top-2" : "bottom-1.5"
                  )}
                >
                  {images.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-0.5 flex-1 rounded-full transition-all duration-300",
                        i === activeIdx ? "bg-white scale-y-125" : "bg-white/40"
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {children}
    </div>
  )
}
