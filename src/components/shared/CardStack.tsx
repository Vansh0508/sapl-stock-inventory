"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"

interface CardStackProps {
  count: number
  className?: string
  isDragging?: boolean
  children: React.ReactNode
  images?: string[]
}

export default function CardStack({
  count,
  className,
  isDragging = false,
  children,
  images = [],
}: CardStackProps) {
  const showLayers = count > 1 && isDragging

  // Define stack layers configurations (rotation, translate, scale, opacity)
  const layers = [
    { rotate: 6, x: 4, y: 2, scale: 0.98, opacity: 0.95 },
    { rotate: -8, x: -6, y: -4, scale: 0.96, opacity: 0.9 },
    { rotate: 12, x: 8, y: 4, scale: 0.94, opacity: 0.85 },
    { rotate: -12, x: -10, y: -6, scale: 0.92, opacity: 0.8 },
  ]

  return (
    <div className={cn("relative", className)}>
      {showLayers && (
        <>
          {layers.slice(0, Math.min(count - 1, 4)).map((layer, index) => {
            const imageUrl = images[index] || null

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95, rotate: 0, x: 0, y: 0 }}
                animate={{
                  opacity: layer.opacity,
                  scale: layer.scale,
                  rotate: layer.rotate,
                  x: layer.x,
                  y: layer.y,
                }}
                className="absolute inset-0 bg-white border border-zinc-200 rounded-xl overflow-hidden pointer-events-none shadow-md"
                style={{ zIndex: -(index + 1) }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                {imageUrl ? (
                  <Image
                    src={getThumbnailUrl(imageUrl, { width: 320, quality: 70 })}
                    alt="stack-layer"
                    fill
                    unoptimized
                    sizes="280px"
                    className="object-cover opacity-80 pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-100" />
                )}
              </motion.div>
            )
          })}
        </>
      )}
      {children}
    </div>
  )
}
