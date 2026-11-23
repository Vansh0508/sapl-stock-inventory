"use client"

import Image from "next/image"
import { motion } from "motion/react"
import { Typography } from "@heroui/react"
import { cn } from "@/lib/utils"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import type { GalleryInventoryItem } from "@/hooks/useGalleryCatalog"
import type { RowHeight } from "@/types/app.types"
import { Picture } from "@gravity-ui/icons"

interface GridViewProps {
  items: GalleryInventoryItem[]
  isLoading: boolean
  rowHeight: RowHeight
  onCardClick: (item: GalleryInventoryItem) => void
}

const CARD_HEIGHT: Record<RowHeight, string> = {
  compact: "h-36",
  normal: "h-52",
  tall: "h-72",
}

const CARD_PADDING: Record<RowHeight, string> = {
  compact: "p-2",
  normal: "p-3",
  tall: "p-4",
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" as const } },
}

function ColorDots({ colorCodes, colorNames }: { colorCodes: string | null; colorNames: string | null }) {
  if (!colorNames) return null
  const names = colorNames.split(", ").slice(0, 4)
  const codes = (colorCodes || "").split(", ")

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {names.map((name, i) => {
        const code = codes[i]?.trim()
        const isHex = code && /^#[0-9A-Fa-f]{3,6}$/.test(code)
        return (
          <span
            key={i}
            title={name}
            className={cn(
              "inline-block w-3 h-3 rounded-full border border-black/10 shrink-0",
              !isHex && "bg-zinc-300"
            )}
            style={isHex ? { backgroundColor: code } : undefined}
          />
        )
      })}
      {names.length < (colorNames.split(", ").length) && (
        <Typography.Paragraph size="xs" className="text-zinc-400">+{colorNames.split(", ").length - 4}</Typography.Paragraph>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden animate-pulse">
      <div className="h-52 bg-zinc-100" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-zinc-100 rounded w-3/4" />
        <div className="h-3 bg-zinc-100 rounded w-1/2" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 select-none">
      <Picture width="40" height="40" className="mb-4 text-zinc-300" aria-hidden="true" />
      <Typography.Paragraph size="sm" weight="medium" className="text-zinc-500">No products found</Typography.Paragraph>
      <Typography.Paragraph size="xs" className="mt-1 text-zinc-400">Try adjusting your filters or search</Typography.Paragraph>
    </div>
  )
}

export default function GridView({ items, isLoading, rowHeight, onCardClick }: GridViewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 md:p-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 md:p-6"
    >
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        items.map((item) => (
          <motion.div
            key={item.id}
            variants={cardVariant}
            whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.10)" }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            onClick={() => onCardClick(item)}
            className="group rounded-2xl border border-zinc-100 bg-white overflow-hidden cursor-pointer hover:border-zinc-200 transition-colors"
          >
            {/* Image area */}
            <div className={cn("relative overflow-hidden bg-zinc-50", CARD_HEIGHT[rowHeight])}>
              {item.image_url ? (
                <Image
                  src={getThumbnailUrl(item.image_url, { width: 400, quality: 60 })}
                  alt={item.sku ?? "Product image"}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Picture width="32" height="32" className="text-zinc-200" aria-hidden="true" />
                </div>
              )}
              {/* Location badge */}
              {item.location_name && (
                <span className="absolute top-2 right-2 inline-flex items-center justify-center h-5 px-2 rounded-full bg-black/60 text-white text-[10px] font-medium leading-none backdrop-blur-sm">
                  {item.location_name}
                </span>
              )}
              {/* Discontinued overlay */}
              {item.is_active === false && (
                <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-end p-2">
                  <span className="text-[10px] font-semibold text-zinc-500 bg-white/80 px-1.5 py-0.5 rounded-full">Discontinued</span>
                </div>
              )}
            </div>

            {/* Card content */}
            <div className={cn("flex flex-col gap-1", CARD_PADDING[rowHeight])}>
              <div className="flex items-center justify-between gap-1 leading-tight">
                <Typography.Paragraph size="xs" weight="semibold" truncate className="font-mono text-zinc-900 flex-1 leading-tight">
                  {item.sku ?? "—"}
                </Typography.Paragraph>
                {item.serial_number && (
                  <span className="font-mono text-[10px] text-zinc-400 shrink-0 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded-sm">
                    {item.serial_number}
                  </span>
                )}
              </div>
              <Typography.Paragraph size="xs" truncate className="text-zinc-500 leading-tight">
                {[item.product_name, item.size_label].filter(Boolean).join(" · ") || "—"}
              </Typography.Paragraph>
              {rowHeight !== "compact" && (
                <Typography.Paragraph size="xs" truncate className="text-zinc-400">{item.quality_name ?? ""}</Typography.Paragraph>
              )}
              <ColorDots colorCodes={item.color_codes} colorNames={item.color_names} />
            </div>
          </motion.div>
        ))
      )}
    </motion.div>
  )
}
