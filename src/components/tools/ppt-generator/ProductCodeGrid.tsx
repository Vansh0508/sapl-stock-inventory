"use client"

import { useEffect } from "react"
import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import { motion } from "motion/react"
import { Typography } from "@heroui/react"
import { useInView } from "@/hooks/useInView"
import type { PptProductCodeGroup } from "@/types/ppt.types"

interface ProductCodeGridProps {
  groups: PptProductCodeGroup[]
  isLoading: boolean
  onCardClick: (group: PptProductCodeGroup) => void
  /** Called (once) when a card scrolls near the viewport — triggers its lazy image fetch. */
  onVisible: (productCode: string) => void
  loadingImagesFor: Set<string>
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } },
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

function formatPriceRange(group: PptProductCodeGroup): string {
  if (group.minPrice == null) return "—"
  const symbol = group.currencySymbol ?? ""
  if (group.minPrice === group.maxPrice) return `${symbol}${group.minPrice.toLocaleString()}`
  return `${symbol}${group.minPrice.toLocaleString()} – ${symbol}${group.maxPrice?.toLocaleString()}`
}

interface ProductCodeCardProps {
  group: PptProductCodeGroup
  onCardClick: (group: PptProductCodeGroup) => void
  onVisible: (productCode: string) => void
  isLoadingImages: boolean
}

function ProductCodeCard({ group, onCardClick, onVisible, isLoadingImages }: ProductCodeCardProps) {
  const { ref, isInView } = useInView<HTMLDivElement>()
  const totalSerials = group.skus.reduce((sum, s) => sum + s.serials.length, 0)

  useEffect(() => {
    if (isInView) onVisible(group.productCode)
  }, [isInView, group.productCode, onVisible])

  return (
    <motion.div
      ref={ref}
      variants={cardVariant}
      whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.10)" }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      onClick={() => onCardClick(group)}
      className="group rounded-2xl border border-zinc-100 bg-white overflow-hidden cursor-pointer hover:border-zinc-200 transition-colors"
    >
      <div className="relative h-52 overflow-hidden bg-zinc-50">
        {group.coverImageUrl ? (
          <Image
            src={getThumbnailUrl(group.coverImageUrl, { width: 400, quality: 75 })}
            alt={group.productCode}
            fill
            unoptimized
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : isLoadingImages ? (
          <div className="w-full h-full animate-pulse bg-zinc-100" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" className="text-zinc-200" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21,15 16,10 5,21" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 right-2 inline-flex items-center justify-center h-5 px-2 rounded-full bg-black/60 text-white text-[10px] font-medium leading-none backdrop-blur-sm">
          {group.skus.length} size{group.skus.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-1 leading-tight">
          <Typography.Paragraph size="xs" weight="semibold" truncate className="font-mono text-zinc-900 flex-1 leading-tight">
            {group.productCode}
          </Typography.Paragraph>
          <span className="font-mono text-[10px] text-zinc-400 shrink-0 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded-sm">
            {totalSerials} pcs
          </span>
        </div>
        <Typography.Paragraph size="xs" truncate className="text-zinc-500 leading-tight">
          {[group.productName, group.designName].filter(Boolean).join(" · ") || "—"}
        </Typography.Paragraph>
        <Typography.Paragraph size="xs" truncate className="text-zinc-400">
          {group.qualityName ?? ""}
        </Typography.Paragraph>
        <Typography.Paragraph size="xs" weight="semibold" className="text-indigo-600 mt-0.5">
          {formatPriceRange(group)}
        </Typography.Paragraph>
      </div>
    </motion.div>
  )
}

export default function ProductCodeGrid({ groups, isLoading, onCardClick, onVisible, loadingImagesFor }: ProductCodeGridProps) {
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
      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        groups.map((group) => (
          <ProductCodeCard
            key={group.productCode}
            group={group}
            onCardClick={onCardClick}
            onVisible={onVisible}
            isLoadingImages={loadingImagesFor.has(group.productCode)}
          />
        ))
      )}
    </motion.div>
  )
}
