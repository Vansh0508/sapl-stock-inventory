"use client"

import { motion } from "motion/react"
import { Typography } from "@heroui/react"
import ImageSwiper from "@/components/shared/ImageSwiper"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import type { GalleryInventoryItem } from "@/hooks/useGalleryCatalog"
import type { RowHeight } from "@/types/app.types"

interface GalleryViewProps {
  items: GalleryInventoryItem[]
  isLoading: boolean
  rowHeight: RowHeight
  onCardClick: (item: GalleryInventoryItem) => void
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse bg-zinc-100 h-80 animate-infinite" />
  )
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 select-none">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="mb-4 text-zinc-300" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
      <Typography.Paragraph size="sm" weight="medium" className="text-zinc-500">No products found</Typography.Paragraph>
      <Typography.Paragraph size="xs" className="mt-1 text-zinc-400">Try adjusting your filters or search</Typography.Paragraph>
    </div>
  )
}

function GalleryCard({
  item,
  onCardClick,
}: {
  item: GalleryInventoryItem
  onCardClick: (item: GalleryInventoryItem) => void
}) {
  const images = (item.image_urls?.length ? item.image_urls : item.image_url ? [item.image_url] : []).map((url) =>
    getThumbnailUrl(url, { width: 500, quality: 65 })
  )

  return (
    <motion.div
      variants={cardVariant}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      onClick={() => onCardClick(item)}
      className="group relative rounded-3xl overflow-hidden cursor-pointer bg-zinc-100 shadow-sm hover:shadow-lg transition-shadow inline-block w-full break-inside-avoid mb-4"
    >
      {/* Image — dominant (dynamic aspect ratio & swipe slider) */}
      <ImageSwiper
        mode="natural"
        images={images}
        alt={item.sku ?? "Product image"}
        autoPlayMs={3000}
        progressPosition="top"
        controlsSize="md"
        className="w-full [transform:translate3d(0,0,0)]"
        imageClassName="group-hover:scale-105 transition-transform duration-700 [will-change:transform]"
      >
        {/* Location badge */}
        {item.location_name && (
          <div className="absolute top-3 right-3 inline-flex items-center justify-center h-6 px-2 rounded-full bg-black/50 text-white text-xs font-semibold backdrop-blur-sm z-35">
            {item.location_name}
          </div>
        )}
      </ImageSwiper>

      {/* Hover overlay — additional info + bottom details fade in together */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[1.5px] flex flex-col justify-between p-4 pt-12 pointer-events-none z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        {/* Center/Top hover details */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          <Typography.Paragraph size="xs" weight="bold" className="text-center tracking-wide uppercase text-indigo-300">
            {item.collection_name ?? "—"}
          </Typography.Paragraph>
          <Typography.Paragraph size="xs" weight="medium" className="text-white/90 text-center">
            Size: {item.size_label ?? "—"}
          </Typography.Paragraph>
          {item.color_names && (
            <Typography.Paragraph size="xs" className="text-white/70 text-center line-clamp-2 px-2">
              Colors: {item.color_names}
            </Typography.Paragraph>
          )}
          {item.is_active === false && (
            <span className="mt-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[9px] font-semibold border border-red-500/30">
              Discontinued
            </span>
          )}
        </div>

        {/* Bottom details (visible only on hover) */}
        <div className="flex flex-col gap-0.5 w-full border-t border-white/10 pt-3 mt-auto">
          <div className="flex items-center justify-between gap-2">
            <Typography.Paragraph size="sm" weight="bold" truncate className="font-mono text-white leading-tight drop-shadow-sm flex-1">
              {item.sku ?? "—"}
            </Typography.Paragraph>
            {item.serial_number && (
              <span className="font-mono text-[10px] text-white/90 bg-white/20 backdrop-blur-xs px-1.5 py-0.5 rounded font-semibold shrink-0">
                {item.serial_number}
              </span>
            )}
          </div>
          <Typography.Paragraph size="xs" truncate className="text-white/80 leading-tight">
            {item.quality_name ?? ""}
          </Typography.Paragraph>
        </div>
      </div>
    </motion.div>
  )
}

export default function GalleryView({ items, isLoading, onCardClick }: GalleryViewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-4 md:p-6">
        {Array.from({ length: 9 }).map((_, i) => (
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
      className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 gap-4 p-4 md:p-6 [column-fill:balance]"
    >
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        items.map((item) => (
          <GalleryCard key={item.id} item={item} onCardClick={onCardClick} />
        ))
      )}
    </motion.div>
  )
}
