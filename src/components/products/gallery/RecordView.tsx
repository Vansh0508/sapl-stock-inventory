"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Modal, Typography, Dropdown, Disclosure, DisclosureGroup, Button, ScrollShadow } from "@heroui/react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { getThumbnailUrl, getOriginalPublicUrl } from "@/lib/supabase/storage"
import type { GalleryInventoryItem } from "@/hooks/useGalleryCatalog"

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryPiece {
  id: string
  serial_number: string | null
  location_name: string | null
  created_at: string | null
}

interface RecordImage {
  id: string
  public_url: string
  sort_order: number
}

interface PriceEntry {
  id: string
  serial_number: string | null
  sku: string | null
  location_name: string | null
  currency_symbol: string | null
  price: number
}

interface RecordDetailData {
  images: RecordImage[]
  pieces: InventoryPiece[]
  colors: { name: string; code: string }[]
  fibers: { name: string; percentage: number }[]
  allPieces: GalleryInventoryItem[]
  imagesByPiece: Record<string, RecordImage[]>
  prices: PriceEntry[]
}

// ─── Price fetch helper ────────────────────────────────────────────────────────

async function fetchPrices(filter: { catalogIds?: string[]; inventoryId?: string }): Promise<PriceEntry[]> {
  let query = (supabase.from("prices" as any) as any)
    .select("id, price, catalog_id, inventory_id, locations(location_name), currencies(symbol), inventory(serial_number), catalog(sku)")
    .is("valid_to", null)

  if (filter.inventoryId) {
    query = query.eq("inventory_id", filter.inventoryId)
  } else if (filter.catalogIds && filter.catalogIds.length > 0) {
    query = query.in("catalog_id", filter.catalogIds)
  } else {
    return []
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching prices:", error)
    return []
  }

  return ((data as any[]) ?? []).map((row: any) => ({
    id: row.id,
    serial_number: (row.inventory as { serial_number: string | null } | null)?.serial_number ?? null,
    sku: (row.catalog as { sku: string | null } | null)?.sku ?? null,
    location_name: (row.locations as { location_name: string } | null)?.location_name ?? null,
    currency_symbol: (row.currencies as { symbol: string } | null)?.symbol ?? null,
    price: row.price,
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFibers(fiberConfig: string | null): { name: string; percentage: number }[] {
  if (!fiberConfig) return []
  return fiberConfig.split(", ").flatMap((part) => {
    const m = part.match(/^(\d+(?:\.\d+)?)%\s+(.+)$/)
    return m ? [{ percentage: parseFloat(m[1]), name: m[2] }] : []
  })
}

function parseColors(colorNames: string | null, colorCodes: string | null): { name: string; code: string }[] {
  if (!colorNames) return []
  const names = colorNames.split(", ")
  const codes = (colorCodes || "").split(", ")
  return names.map((name, i) => ({ name, code: codes[i]?.trim() ?? "" }))
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const FIBER_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6",
]

// ─── Data hook ────────────────────────────────────────────────────────────────

// ─── Data hook ────────────────────────────────────────────────────────────────

function mapDbRowToInventoryItem(row: any, imagesMap: Record<string, RecordImage[]>): GalleryInventoryItem {
  const pieceImages = imagesMap[row.id] || []
  const urls = pieceImages.map((img) => img.public_url)
  return {
    id: row.id ?? "",
    serial_number: row.serial_number ?? null,
    catalog_id: row.catalog_id ?? null,
    location_id: row.location_id ?? null,
    location_name: row.location_name ?? null,
    location_state: row.location_state ?? null,
    location_country: row.location_country ?? null,
    currency_symbol: row.currency_symbol ?? null,
    sku: row.sku ?? null,
    product_code: row.product_code ?? null,
    quality_code: row.quality_code ?? null,
    design_code: row.design_code ?? null,
    is_active: row.is_active ?? null,
    product_name: row.product_name ?? null,
    size_label: row.size_label ?? null,
    so_number: row.so_number ?? null,
    quality_name: row.quality_name ?? null,
    quality_prefix: row.quality_prefix ?? null,
    design_name: row.design_name ?? null,
    collection_name: row.collection_name ?? null,
    construction_name: row.construction_name ?? null,
    color_names: row.color_names ?? null,
    color_codes: row.color_codes ?? null,
    fiber_configuration: row.fiber_configuration ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    image_url: urls[0] ?? null,
    image_urls: urls,
    product_type_id: row.product_type_id ?? null,
    quality_id: row.quality_id ?? null,
    design_id: row.design_id ?? null,
    collection_id: row.collection_id ?? null,
    construction_id: row.construction_id ?? null,
    size_id: row.size_id ?? null,
  }
}

function useRecordDetail(
  item: GalleryInventoryItem | null,
  viewMode: "serial" | "sku" | "product_code" = "sku",
  selectedSku: string | null = null,
  selectedProductCode: string | null = null
) {
  const [data, setData] = useState<RecordDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Yield to the next microtask so setState calls happen after effect body exits
      await Promise.resolve()
      if (cancelled) return

      setIsLoading(true)
      setData(null)

      try {
        if (viewMode === "serial") {
          if (!item) {
            setIsLoading(false)
            return
          }

          const [{ data: pieces }, { data: imgRows }, priceRows] = await Promise.all([
            (supabase.from("view_inventory_gallery" as any) as any)
              .select("id, serial_number, location_name, created_at")
              .eq("catalog_id", item.catalog_id ?? ""),
            (supabase.from("inventory_images" as any) as any)
              .select("id, public_url, sort_order")
              .eq("inventory_id", item.id)
              .order("sort_order", { ascending: true }),
            fetchPrices({ inventoryId: item.id }),
          ])

          if (cancelled) return

          setData({
            images: (imgRows || []) as RecordImage[],
            pieces: (((pieces as any[]) || []).map((p: any) => ({
              id: p.id ?? "",
              serial_number: p.serial_number,
              location_name: p.location_name,
              created_at: p.created_at,
            }))),
            colors: parseColors(item.color_names, item.color_codes),
            fibers: parseFibers(item.fiber_configuration),
            allPieces: [],
            imagesByPiece: {},
            prices: priceRows,
          })
        } else if (viewMode === "sku") {
          const skuToFetch = selectedSku || item?.sku
          if (!skuToFetch) {
            setIsLoading(false)
            return
          }

          // Fetch all pieces for this SKU
          const { data: allPieces, error: piecesErr } = await (supabase
            .from("view_inventory_gallery" as any) as any)
            .select("*")
            .eq("sku", skuToFetch)

          if (piecesErr) throw piecesErr
          if (cancelled) return

          const rawPieces = (allPieces as any[]) || []

          let imagesList: any[] = []
          if (rawPieces.length > 0) {
            const pieceIds = rawPieces.map((p) => p.id).filter((id): id is string => !!id)
            const chunkSize = 100
            const chunkPromises = []
            for (let i = 0; i < pieceIds.length; i += chunkSize) {
              const chunk = pieceIds.slice(i, i + chunkSize)
              chunkPromises.push(
                (supabase.from("inventory_images" as any) as any)
                  .select("id, inventory_id, public_url, sort_order")
                  .in("inventory_id", chunk)
                  .order("sort_order", { ascending: true })
              )
            }
            const chunkResults = await Promise.all(chunkPromises)
            for (const res of chunkResults) {
              if (res.error) throw res.error
              if (res.data) {
                imagesList.push(...res.data)
              }
            }
          }

          if (cancelled) return

          const imagesMap: Record<string, RecordImage[]> = {}
          for (const img of imagesList) {
            if (!imagesMap[img.inventory_id]) {
              imagesMap[img.inventory_id] = []
            }
            imagesMap[img.inventory_id].push({
              id: img.id,
              public_url: img.public_url,
              sort_order: img.sort_order,
            })
          }

          const piecesList = rawPieces.map((p) => mapDbRowToInventoryItem(p, imagesMap))
          const firstPiece = piecesList[0]

          const skuCatalogIds = Array.from(new Set(piecesList.map((p) => p.catalog_id).filter((id): id is string => !!id)))
          const priceRows = await fetchPrices({ catalogIds: skuCatalogIds })
          if (cancelled) return

          setData({
            images: [],
            pieces: [],
            colors: firstPiece ? parseColors(firstPiece.color_names, firstPiece.color_codes) : [],
            fibers: firstPiece ? parseFibers(firstPiece.fiber_configuration) : [],
            allPieces: piecesList,
            imagesByPiece: imagesMap,
            prices: priceRows,
          })
        } else if (viewMode === "product_code") {
          const codeToFetch = selectedProductCode || item?.product_code
          if (!codeToFetch) {
            setIsLoading(false)
            return
          }

          // Fetch all pieces for this Product Code
          const { data: allPieces, error: piecesErr } = await (supabase
            .from("view_inventory_gallery" as any) as any)
            .select("*")
            .eq("product_code", codeToFetch)

          if (piecesErr) throw piecesErr
          if (cancelled) return

          const rawPieces = (allPieces as any[]) || []

          let imagesList: any[] = []
          if (rawPieces.length > 0) {
            const pieceIds = rawPieces.map((p) => p.id).filter((id): id is string => !!id)
            const chunkSize = 100
            const chunkPromises = []
            for (let i = 0; i < pieceIds.length; i += chunkSize) {
              const chunk = pieceIds.slice(i, i + chunkSize)
              chunkPromises.push(
                (supabase.from("inventory_images" as any) as any)
                  .select("id, inventory_id, public_url, sort_order")
                  .in("inventory_id", chunk)
                  .order("sort_order", { ascending: true })
              )
            }
            const chunkResults = await Promise.all(chunkPromises)
            for (const res of chunkResults) {
              if (res.error) throw res.error
              if (res.data) {
                imagesList.push(...res.data)
              }
            }
          }

          if (cancelled) return

          const imagesMap: Record<string, RecordImage[]> = {}
          for (const img of imagesList) {
            if (!imagesMap[img.inventory_id]) {
              imagesMap[img.inventory_id] = []
            }
            imagesMap[img.inventory_id].push({
              id: img.id,
              public_url: img.public_url,
              sort_order: img.sort_order,
            })
          }

          const piecesList = rawPieces.map((p) => mapDbRowToInventoryItem(p, imagesMap))
          const firstPiece = piecesList[0]

          const productCodeCatalogIds = Array.from(new Set(piecesList.map((p) => p.catalog_id).filter((id): id is string => !!id)))
          const priceRows = await fetchPrices({ catalogIds: productCodeCatalogIds })
          if (cancelled) return

          setData({
            images: [],
            pieces: [],
            colors: firstPiece ? parseColors(firstPiece.color_names, firstPiece.color_codes) : [],
            fibers: firstPiece ? parseFibers(firstPiece.fiber_configuration) : [],
            allPieces: piecesList,
            imagesByPiece: imagesMap,
            prices: priceRows,
          })
        }
      } catch (err) {
        console.error("Error fetching record details:", err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [item, viewMode, selectedSku, selectedProductCode])

  return { data, isLoading }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FiberBar({ fibers }: { fibers: { name: string; percentage: number }[] }) {
  if (fibers.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 rounded-full overflow-hidden w-full">
        {fibers.map((f, i) => (
          <div
            key={f.name}
            title={`${f.name}: ${f.percentage}%`}
            style={{ width: `${f.percentage}%`, backgroundColor: FIBER_COLORS[i % FIBER_COLORS.length] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {fibers.map((f, i) => (
          <span key={f.name} className="flex items-center gap-1 text-xs text-zinc-600">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: FIBER_COLORS[i % FIBER_COLORS.length] }}
            />
            {f.percentage}% {f.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function PriceTable({ prices, showSku = false }: { prices: PriceEntry[]; showSku?: boolean }) {
  if (prices.length === 0) {
    return (
      <Typography.Paragraph size="xs" className="text-zinc-400 italic">
        No prices recorded yet
      </Typography.Paragraph>
    )
  }
  return (
    <div className="rounded-xl border border-zinc-100 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-100">
            {showSku && <th className="text-left px-3 py-2 text-zinc-500 font-medium">SKU</th>}
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Serial No.</th>
            <th className="text-left px-3 py-2 text-zinc-500 font-medium">Location</th>
            <th className="text-right px-3 py-2 text-zinc-500 font-medium">Price</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p, i) => (
            <tr key={p.id} className={cn("border-b border-zinc-50 last:border-0", i % 2 === 0 ? "bg-white" : "bg-zinc-50/50")}>
              {showSku && <td className="px-3 py-2 font-mono text-zinc-800">{p.sku ?? "—"}</td>}
              <td className="px-3 py-2 font-mono text-zinc-800">{p.serial_number ?? "—"}</td>
              <td className="px-3 py-2 text-zinc-600">{p.location_name ?? "—"}</td>
              <td className="px-3 py-2 text-right font-semibold text-zinc-900">
                {p.currency_symbol} {p.price.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ColorSwatches({ colors }: { colors: { name: string; code: string }[] }) {
  if (colors.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map(({ name, code }) => {
        const isHex = /^#[0-9A-Fa-f]{3,6}$/.test(code)
        return (
          <div key={name} className="flex items-center gap-1.5">
            <span
              title={name}
              className={cn(
                "inline-block w-4 h-4 rounded-full border border-black/10 shrink-0",
                !isHex && "bg-zinc-300"
              )}
              style={isHex ? { backgroundColor: code } : undefined}
            />
            <Typography.Paragraph size="xs" className="text-zinc-600">{name}</Typography.Paragraph>
          </div>
        )
      })}
    </div>
  )
}

function ImageGallery({ images, sku }: { images: RecordImage[]; sku: string | null }) {
  // Tracks rendered heights of each image once loaded, so we can normalize to the tallest.
  const containerRef = useRef<HTMLDivElement>(null)
  const loadedHeights = useRef<Map<string, number>>(new Map())
  const [uniformHeight, setUniformHeight] = useState<number | null>(null)

  // Reset measurements whenever the image list changes
  useEffect(() => {
    loadedHeights.current = new Map()
    setUniformHeight(null)
  }, [images])

  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const containerWidth = containerRef.current?.clientWidth ?? 480
    // Compute the height this image would occupy when displayed at full container width
    const renderedHeight = (img.naturalHeight / img.naturalWidth) * containerWidth
    loadedHeights.current.set(id, renderedHeight)
    // Once every image in the list has reported its dimensions, lock in the tallest
    if (loadedHeights.current.size === images.length) {
      const max = Math.max(...Array.from(loadedHeights.current.values()))
      setUniformHeight(Math.round(max))
    }
  }

  const handleDownload = async (e: React.MouseEvent, url: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const originalUrl = getOriginalPublicUrl(url)
      const res = await fetch(originalUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const filename = originalUrl.split("/").pop()?.split("?")[0] || `${sku ?? "image"}.jpg`
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error("Failed to download image:", err)
    }
  }

  if (images.length === 0) {
    return (
      <div className="w-full rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-150 flex items-center justify-center shrink-0 shadow-xs py-16">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" className="text-zinc-200" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21,15 16,10 5,21" />
        </svg>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4 shrink-0 [transform:translate3d(0,0,0)]">
      {images.map((img) => (
        <div
          key={img.id}
          className="group/image relative w-full rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-150 shrink-0 shadow-xs flex items-center justify-center [transform:translate3d(0,0,0)] transition-[height] duration-300"
          style={uniformHeight ? { height: uniformHeight } : {}}
        >
          <a
            href={getOriginalPublicUrl(img.public_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="contents cursor-zoom-in"
            title="Open image in a new tab"
          >
            <Image
              src={getThumbnailUrl(img.public_url, { width: 1000, quality: 80 })}
              alt={sku ?? "Product image"}
              width={0}
              height={0}
              unoptimized
              sizes="100vw"
              onLoad={(e) => handleImageLoad(img.id, e)}
              className="hover:scale-[1.01] transition-transform duration-300 [will-change:transform]"
              style={uniformHeight
                ? { width: "100%", height: "100%", objectFit: "contain" }
                : { width: "100%", height: "auto", objectFit: "contain" }
              }
            />
          </a>
          <button
            type="button"
            onClick={(e) => handleDownload(e, img.public_url)}
            title="Download full-size image"
            className="absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-lg bg-black/50 text-white opacity-0 group-hover/image:opacity-100 hover:bg-black/70 transition-opacity backdrop-blur-sm cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

function SkuInventoryList({
  pieces,
  imagesByPiece,
}: {
  pieces: GalleryInventoryItem[]
  imagesByPiece: Record<string, RecordImage[]>
}) {
  if (pieces.length === 0) {
    return (
      <Typography.Paragraph size="xs" className="text-zinc-400 italic py-4 text-center">
        No pieces recorded
      </Typography.Paragraph>
    )
  }

  return (
    <DisclosureGroup className="space-y-3 w-full">
      {pieces.map((piece) => {
        const images = imagesByPiece[piece.id] || []
        
        return (
          <Disclosure
            key={piece.id}
            id={piece.id}
            className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-xs"
          >
            <Disclosure.Heading>
              <Button
                slot="trigger"
                variant="tertiary"
                className="w-full h-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-4 hover:bg-zinc-50/70 transition-colors text-left cursor-pointer border-none rounded-none bg-transparent"
              >
                <span className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/50">
                    Serial: {piece.serial_number ?? "—"}
                  </span>
                  
                  {piece.location_name && (
                    <span className="text-xs font-semibold text-indigo-700 bg-indigo-50/50 px-2.5 py-0.5 rounded border border-indigo-100/50">
                      Location: {piece.location_name} {piece.location_country ? `(${piece.location_country})` : ""}
                    </span>
                  )}
                  
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    piece.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                  )}>
                    {piece.is_active ? "Active" : "Discontinued"}
                  </span>
                </span>
                
                <span className="flex items-center gap-3 text-xs text-zinc-400 self-end sm:self-auto pr-6">
                  <span>Added: {formatDate(piece.created_at)}</span>
                  <Disclosure.Indicator />
                </span>
              </Button>
            </Disclosure.Heading>
            
            <Disclosure.Content>
              <Disclosure.Body className="p-4 bg-zinc-50/20 border-t border-zinc-100">
                <ScrollShadow orientation="horizontal" hideScrollBar className="flex items-center gap-4 pb-2">
                  {images.length === 0 ? (
                    <div className="h-32 w-32 rounded-lg border border-zinc-200 border-dashed flex flex-col items-center justify-center bg-zinc-50 shrink-0 text-zinc-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21,15 16,10 5,21" />
                      </svg>
                      <span className="text-[10px] mt-1 font-medium">No Images</span>
                    </div>
                  ) : (
                    images.map((img) => (
                      <div
                        key={img.id}
                        className="rounded-lg overflow-hidden border border-zinc-150 shrink-0 shadow-xs hover:scale-[1.01] transition-transform duration-200 bg-white max-w-xs"
                      >
                        <Image
                          src={getThumbnailUrl(img.public_url, { width: 320, quality: 60 })}
                          alt={`Piece ${piece.serial_number}`}
                          width={0}
                          height={0}
                          unoptimized
                          sizes="320px"
                          className="w-full h-auto object-contain"
                        />
                      </div>
                    ))
                  )}
                </ScrollShadow>
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        )
      })}
    </DisclosureGroup>
  )
}

function RecordDetail({
  item,
  data,
  isLoading,
  allItems,
  onNavigate,
  viewMode = "serial",
}: {
  item: GalleryInventoryItem
  data: RecordDetailData | null
  isLoading: boolean
  allItems: GalleryInventoryItem[]
  onNavigate: (id: string) => void
  viewMode?: "serial" | "sku" | "product_code"
}) {
  const currentIdx = allItems.findIndex((i) => i.id === item.id)
  const hasPrev = currentIdx > 0
  const hasNext = currentIdx < allItems.length - 1

  // ─── SKU or Product Code Views (Full Width layout) ──────────────────────────
  if (viewMode !== "serial") {
    // Group pieces by SKU for Product Code mode
    const skuGroups = (data?.allPieces ?? []).reduce((acc, piece) => {
      if (piece.sku) {
        if (!acc[piece.sku]) acc[piece.sku] = []
        acc[piece.sku].push(piece)
      }
      return acc
    }, {} as Record<string, GalleryInventoryItem[]>)
    const skuKeys = Object.keys(skuGroups)

    return (
      <div className="h-full overflow-y-auto scrollbar-thin p-6">
        {isLoading ? (
          <div className="flex flex-col gap-4 animate-pulse max-w-4xl mx-auto">
            {[75, 55, 90, 65, 80, 50].map((w, i) => (
              <div key={i} className="h-4 bg-zinc-100 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Header section */}
            {viewMode === "sku" ? (
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-150 pb-4">
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Active SKU</Typography.Paragraph>
                  <Typography.Paragraph weight="bold" className="font-mono text-2xl text-zinc-900 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-100/50 inline-block">
                    {item.sku ?? "—"}
                  </Typography.Paragraph>
                </div>
                {item.size_label && (
                  <div>
                    <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Size</Typography.Paragraph>
                    <Typography.Paragraph weight="semibold" className="text-lg text-zinc-800">{item.size_label}</Typography.Paragraph>
                  </div>
                )}
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Total Pieces</Typography.Paragraph>
                  <Typography.Paragraph weight="semibold" className="text-lg text-zinc-800">{data?.allPieces.length ?? 0}</Typography.Paragraph>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-150 pb-4">
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Product Code</Typography.Paragraph>
                  <Typography.Paragraph weight="bold" className="font-mono text-2xl text-zinc-900 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-100/50 inline-block">
                    {item.product_code ?? "—"}
                  </Typography.Paragraph>
                </div>
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Product Type</Typography.Paragraph>
                  <Typography.Paragraph weight="semibold" className="text-lg text-zinc-800">{item.product_name ?? "—"}</Typography.Paragraph>
                </div>
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Total Pieces</Typography.Paragraph>
                  <Typography.Paragraph weight="semibold" className="text-lg text-zinc-800">{data?.allPieces.length ?? 0}</Typography.Paragraph>
                </div>
              </div>
            )}

            {/* General Product Details */}
            <div className="bg-zinc-50/50 border border-zinc-200/80 rounded-2xl p-5 flex flex-col gap-5">
              <Typography.Paragraph size="xs" weight="bold" className="uppercase tracking-wider text-zinc-400">
                Product Details
              </Typography.Paragraph>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                {[
                  { label: "Product Type", value: item.product_name },
                  { label: "Quality", value: item.quality_name },
                  { label: "Design", value: item.design_name },
                  { label: "Collection", value: item.collection_name },
                  { label: "Construction", value: item.construction_name },
                  viewMode === "sku" ? { label: "Size", value: item.size_label } : null,
                ].map((attr) => {
                  if (!attr || !attr.value) return null
                  return (
                    <div key={attr.label}>
                      <Typography.Paragraph size="xs" weight="semibold" className="uppercase tracking-wider text-zinc-400 mb-0.5">{attr.label}</Typography.Paragraph>
                      <Typography.Paragraph size="sm" weight="medium" className="text-zinc-800">{attr.value}</Typography.Paragraph>
                    </div>
                  )
                })}
              </div>

              {/* Colors */}
              {(data?.colors ?? []).length > 0 && (
                <div className="border-t border-zinc-200/60 pt-4">
                  <Typography.Paragraph size="xs" weight="semibold" className="uppercase tracking-wider text-zinc-400 mb-2">Colors</Typography.Paragraph>
                  <ColorSwatches colors={data?.colors ?? []} />
                </div>
              )}

              {/* Fiber Configuration */}
              {(data?.fibers ?? []).length > 0 && (
                <div className="border-t border-zinc-200/60 pt-4">
                  <Typography.Paragraph size="xs" weight="semibold" className="uppercase tracking-wider text-zinc-400 mb-2">Fiber Configuration</Typography.Paragraph>
                  <FiberBar fibers={data?.fibers ?? []} />
                </div>
              )}
            </div>

            {/* Pricing */}
            <div className="flex flex-col gap-3">
              <Typography.Paragraph size="xs" weight="bold" className="uppercase tracking-wider text-zinc-400">
                Pricing {viewMode === "product_code" ? "(All SKUs)" : ""}
              </Typography.Paragraph>
              <PriceTable prices={data?.prices ?? []} showSku={viewMode === "product_code"} />
            </div>

            {/* Dynamic underneath elements based on SKU or Product Code wise */}
            {viewMode === "sku" ? (
              <div className="flex flex-col gap-4 mt-2">
                <Typography.Paragraph size="xs" weight="bold" className="uppercase tracking-wider text-zinc-400">
                  Serial Numbers ({data?.allPieces.length ?? 0})
                </Typography.Paragraph>
                <SkuInventoryList
                  pieces={data?.allPieces ?? []}
                  imagesByPiece={data?.imagesByPiece ?? {}}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4 mt-2">
                <Typography.Paragraph size="xs" weight="bold" className="uppercase tracking-wider text-zinc-400">
                  SKUs under this Product Code ({skuKeys.length})
                </Typography.Paragraph>
                <DisclosureGroup defaultExpandedKeys={skuKeys[0] ? [skuKeys[0]] : undefined} className="space-y-4">
                  {Object.entries(skuGroups).map(([skuCode, pieces]) => {
                    const firstPiece = pieces[0]
                    const sizeLabel = firstPiece?.size_label ?? "—"
                    
                    return (
                      <Disclosure
                        key={skuCode}
                        id={skuCode}
                        className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-xs"
                      >
                        <Disclosure.Heading>
                          <Button
                            slot="trigger"
                            variant="tertiary"
                            className="w-full h-auto flex items-center justify-between py-3 px-4 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left cursor-pointer border-none rounded-none bg-transparent"
                          >
                            <span className="flex flex-wrap items-center gap-3">
                              <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100/50">
                                SKU: {skuCode}
                              </span>
                              <span className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                                Size: {sizeLabel}
                              </span>
                              <span className="text-xs text-zinc-400 font-semibold">
                                ({pieces.length} {pieces.length === 1 ? "Piece" : "Pieces"})
                              </span>
                            </span>
                            <span className="flex items-center gap-3 text-xs text-zinc-400 pr-6">
                              <Disclosure.Indicator />
                            </span>
                          </Button>
                        </Disclosure.Heading>
                        
                        <Disclosure.Content>
                          <Disclosure.Body className="p-4 bg-zinc-50/10 border-t border-zinc-100">
                            <SkuInventoryList
                              pieces={pieces}
                              imagesByPiece={data?.imagesByPiece ?? {}}
                            />
                          </Disclosure.Body>
                        </Disclosure.Content>
                      </Disclosure>
                    )
                  })}
                </DisclosureGroup>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Serial Number View (Original Layout: 2 Columns) ───────────────────────
  return (
    <div className="flex flex-col md:flex-row gap-0 h-full">
      {/* Left: image gallery */}
      <ScrollShadow hideScrollBar className="md:w-[45%] md:max-w-sm p-5 md:border-r md:border-zinc-100 [transform:translate3d(0,0,0)] [backface-visibility:hidden] [webkit-overflow-scrolling:touch]">
        <ImageGallery key={item.id} images={data?.images ?? []} sku={item.sku} />

        {/* Navigation arrows */}
        {allItems.length > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={() => hasPrev && onNavigate(allItems[currentIdx - 1].id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                hasPrev ? "text-indigo-600 hover:bg-indigo-50" : "text-zinc-300 cursor-not-allowed"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Prev
            </button>
            <Typography.Paragraph size="xs" className="text-zinc-400">{currentIdx + 1} / {allItems.length}</Typography.Paragraph>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => hasNext && onNavigate(allItems[currentIdx + 1].id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                hasNext ? "text-indigo-600 hover:bg-indigo-50" : "text-zinc-300 cursor-not-allowed"
              )}
            >
              Next
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
      </ScrollShadow>

      {/* Right: detail */}
      <ScrollShadow hideScrollBar className="flex-1 p-5">
        {isLoading ? (
          <div className="flex flex-col gap-3 animate-pulse">
            {[75, 55, 90, 65, 80, 50].map((w, i) => (
              <div key={i} className="h-4 bg-zinc-100 rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* SKU, Serial Number, Location */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">SKU</Typography.Paragraph>
                <Typography.Paragraph weight="bold" className="font-mono text-xl text-zinc-900">{item.sku ?? "—"}</Typography.Paragraph>
              </div>
              {item.serial_number && (
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Serial Number</Typography.Paragraph>
                  <p className="font-mono text-xl font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200/50 inline-block">{item.serial_number}</p>
                </div>
              )}
              {item.location_name && (
                <div>
                  <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">Current Location</Typography.Paragraph>
                  <p className="text-sm font-semibold text-zinc-800 bg-indigo-50/50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100/50 inline-block">
                    {item.location_name} {item.location_country ? `(${item.location_country})` : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Primary attributes */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                { label: "Product Type", value: item.product_name },
                { label: "Quality", value: item.quality_name },
                { label: "Design", value: item.design_name },
                { label: "Collection", value: item.collection_name },
                { label: "Construction", value: item.construction_name },
                { label: "Size", value: item.size_label },
              ].map(({ label, value }) => (
                value ? (
                  <div key={label}>
                    <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-0.5">{label}</Typography.Paragraph>
                    <Typography.Paragraph size="sm" weight="medium" className="text-zinc-800">{value}</Typography.Paragraph>
                  </div>
                ) : null
              ))}
            </div>

            {/* Colors */}
            {(data?.colors ?? []).length > 0 && (
              <div>
                <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-2">Colors</Typography.Paragraph>
                <ColorSwatches colors={data?.colors ?? []} />
              </div>
            )}

            {/* Fiber configuration */}
            {(data?.fibers ?? []).length > 0 && (
              <div>
                <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-2">Fiber Configuration</Typography.Paragraph>
                <FiberBar fibers={data?.fibers ?? []} />
              </div>
            )}

            {/* Status */}
            <div>
              <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-1">Status</Typography.Paragraph>
              <span className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
              )}>
                {item.is_active ? "Active" : "Discontinued"}
              </span>
            </div>

            {/* Pricing */}
            <div>
              <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400 mb-2">
                Pricing
              </Typography.Paragraph>
              <PriceTable prices={data?.prices ?? []} />
            </div>

            {/* Inventory Pieces of Same SKU */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Typography.Paragraph size="xs" weight="medium" className="uppercase tracking-wider text-zinc-400">
                  Other Pieces of this SKU ({(data?.pieces ?? []).length})
                </Typography.Paragraph>
              </div>
              {(data?.pieces ?? []).length === 0 ? (
                <Typography.Paragraph size="sm" className="text-zinc-400 italic">No other pieces recorded</Typography.Paragraph>
              ) : (
                <div className="rounded-xl border border-zinc-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-100">
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">Serial No.</th>
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">Location</th>
                        <th className="text-left px-3 py-2 text-zinc-500 font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.pieces ?? []).map((piece, i) => {
                        const isCurrent = piece.id === item.id;
                        return (
                          <tr
                            key={piece.id}
                            onClick={() => {
                              if (!isCurrent) onNavigate(piece.id)
                            }}
                            className={cn(
                              "border-b border-zinc-50 last:border-0 transition-colors cursor-pointer",
                              isCurrent
                                ? "bg-indigo-50/40 text-indigo-900 font-medium"
                                : i % 2 === 0
                                ? "bg-white hover:bg-zinc-50/70"
                                : "bg-zinc-50/50 hover:bg-zinc-50/70"
                            )}
                          >
                            <td className="px-3 py-2 font-mono text-zinc-800 flex items-center gap-1.5">
                              {piece.serial_number ?? "—"}
                              {isCurrent && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded font-semibold leading-none">
                                  Current
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-zinc-600">{piece.location_name ?? "—"}</td>
                            <td className="px-3 py-2 text-zinc-400">{formatDate(piece.created_at)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-100">
              <button
                type="button"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z" /></svg>
                Edit
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-zinc-200 text-zinc-700 text-sm font-medium hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" /></svg>
                Add Inventory
              </button>
            </div>
          </div>
        )}
      </ScrollShadow>
    </div>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

interface RecordViewProps {
  items: GalleryInventoryItem[]
  isLoading: boolean
  selectedId: string | null
  onSelectId: (id: string) => void
  /** When true, renders as a full-screen modal overlay instead of two-panel layout */
  asModal?: boolean
  modalItem?: GalleryInventoryItem | null
  onClose?: () => void
}

export default function RecordView({
  items,
  isLoading,
  selectedId,
  onSelectId,
  asModal = false,
  modalItem,
  onClose,
}: RecordViewProps) {
  // State for arrangement view mode
  const [viewMode, setViewMode] = useState<"serial" | "sku" | "product_code">("sku")
  const [selectedSku, setSelectedSku] = useState<string | null>(null)
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null)

  const activeItem = asModal
    ? modalItem ?? null
    : (items.find((i) => i.id === selectedId) ?? items[0] ?? null)

  const { data, isLoading: detailLoading } = useRecordDetail(
    activeItem,
    asModal ? "serial" : viewMode,
    selectedSku,
    selectedProductCode
  )

  // Synchronize view selection when items change or mode changes
  useEffect(() => {
    if (items.length === 0) return

    const currentActiveItem = items.find((i) => i.id === selectedId) ?? items[0]
    if (!currentActiveItem) return

    if (viewMode === "sku") {
      const currentSkus = new Set(items.map((i) => i.sku).filter(Boolean))
      if (!selectedSku || !currentSkus.has(selectedSku)) {
        setSelectedSku(currentActiveItem.sku)
      }
    } else if (viewMode === "product_code") {
      const currentProductCodes = new Set(items.map((i) => i.product_code).filter(Boolean))
      if (!selectedProductCode || !currentProductCodes.has(selectedProductCode)) {
        setSelectedProductCode(currentActiveItem.product_code)
      }
    }
  }, [items, selectedId, viewMode, selectedSku, selectedProductCode])

  // ── Modal mode ─────────────────────────────────────────────────────────────
  if (asModal) {
    return (
      <Modal
        isOpen={!!modalItem}
        onOpenChange={(open) => { if (!open) onClose?.() }}
      >
        <Modal.Backdrop>
          <Modal.Container size="full">
            <Modal.Dialog className="bg-white w-full max-w-4xl h-full max-h-[92dvh] rounded-2xl overflow-hidden flex flex-col mx-auto">
              {({ close }) => (
                <>
                  {/* Modal header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
                    <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-700">Inventory Piece Record</Typography.Paragraph>
                    <button
                      type="button"
                      onClick={close}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  {/* Modal body */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="flex-1 overflow-hidden"
                  >
                    {activeItem ? (
                      <RecordDetail
                        item={activeItem}
                        data={data}
                        isLoading={detailLoading}
                        allItems={items}
                        viewMode="serial"
                        onNavigate={(id) => {
                          const found = items.find((i) => i.id === id)
                          if (found) onSelectId(id)
                        }}
                      />
                    ) : null}
                  </motion.div>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    )
  }

  // ── Two-panel standalone mode ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full">
        <div className="w-72 border-r border-zinc-100 p-4 flex flex-col gap-2 shrink-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="flex-1 p-6 flex flex-col gap-3 animate-pulse">
          {[60, 80, 45, 70, 55, 85].map((w, i) => (
            <div key={i} className="h-4 bg-zinc-100 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 select-none">
        <Typography.Paragraph size="sm" weight="medium" className="text-zinc-500">No products found</Typography.Paragraph>
        <Typography.Paragraph size="xs" className="mt-1 text-zinc-400">Try adjusting your filters</Typography.Paragraph>
      </div>
    )
  }

  // ── Groupings calculations ──────────────────────────────────────────────────

  // Group items by SKU
  const skuGroups = items.reduce((acc, item) => {
    if (item.sku) {
      if (!acc[item.sku]) acc[item.sku] = []
      acc[item.sku].push(item)
    }
    return acc
  }, {} as Record<string, GalleryInventoryItem[]>)

  const uniqueSkus = Object.entries(skuGroups).map(([sku, list]) => {
    const firstItem = list[0]
    return {
      sku,
      firstItem,
      count: list.length,
    }
  })

  // Group items by Product Code
  const productCodeGroups = items.reduce((acc, item) => {
    if (item.product_code) {
      if (!acc[item.product_code]) acc[item.product_code] = []
      acc[item.product_code].push(item)
    }
    return acc
  }, {} as Record<string, GalleryInventoryItem[]>)

  const uniqueProductCodes = Object.entries(productCodeGroups).map(([prodCode, list]) => {
    const firstItem = list[0]
    const skus = new Set(list.map((i) => i.sku).filter(Boolean))
    return {
      productCode: prodCode,
      firstItem,
      skuCount: skus.size,
      piecesCount: list.length,
    }
  })

  // Resolve details active item
  let activeDetailsItem = activeItem
  if (viewMode === "sku" && selectedSku) {
    activeDetailsItem = skuGroups[selectedSku]?.[0] ?? activeItem
  } else if (viewMode === "product_code" && selectedProductCode) {
    activeDetailsItem = productCodeGroups[selectedProductCode]?.[0] ?? activeItem
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left list panel */}
      <div className="w-72 shrink-0 border-r border-zinc-150 flex flex-col bg-zinc-50/50">
        
        {/* Dropdown switch at the top */}
        <div className="p-3 border-b border-zinc-150 bg-white shrink-0">
          <Typography.Paragraph size="xs" weight="bold" className="text-zinc-400 uppercase tracking-wider mb-1">
            Arrange List By
          </Typography.Paragraph>
          <Dropdown>
            <Dropdown.Trigger
              className="w-full flex items-center justify-between h-9 px-3 rounded-lg border border-zinc-200 text-zinc-700 text-xs font-semibold hover:bg-zinc-50 hover:border-zinc-300 transition-all cursor-pointer bg-white"
            >
              <span className="w-full flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {viewMode === "serial" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16" /></svg>
                      Serial Numbers
                    </>
                  )}
                  {viewMode === "sku" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      SKUs
                    </>
                  )}
                  {viewMode === "product_code" && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
                      Product Codes
                    </>
                  )}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </span>
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom start" className="min-w-[200px]">
              <Dropdown.Menu
                aria-label="Select list arrangement"
                selectedKeys={new Set([viewMode])}
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as "serial" | "sku" | "product_code" | undefined
                  if (val) setViewMode(val)
                }}
              >
                <Dropdown.Item id="sku">
                  SKUs
                </Dropdown.Item>
                <Dropdown.Item id="product_code">
                  Product Codes
                </Dropdown.Item>
                <Dropdown.Item id="serial">
                  Serial Numbers
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        {/* Scrollable list items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {viewMode === "serial" &&
            items.map((item) => {
              const isSelected = item.id === (selectedId ?? items[0]?.id)
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectId(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-zinc-100/50",
                    isSelected ? "bg-indigo-50 border-r-3 border-r-indigo-500" : "hover:bg-zinc-100/40 bg-white"
                  )}
                >
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/60 shadow-xs">
                    {item.image_url ? (
                      <Image src={getThumbnailUrl(item.image_url, { width: 80, quality: 55 })} alt="" fill unoptimized sizes="36px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-50 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("font-mono text-xs font-semibold truncate flex-1", isSelected ? "text-indigo-700" : "text-zinc-900")}>
                        {item.sku ?? "—"}
                      </p>
                      {item.serial_number && (
                        <span className="font-mono text-[9px] text-zinc-500 shrink-0 font-bold bg-zinc-100 px-1 rounded-sm border border-zinc-200/50">
                          {item.serial_number}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {item.location_name ?? ""}
                    </p>
                  </div>
                </div>
              )
            })}

          {viewMode === "sku" &&
            uniqueSkus.map(({ sku, firstItem, count }) => {
              const isSelected = sku === selectedSku
              return (
                <div
                  key={sku}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedSku(sku)
                    if (firstItem) onSelectId(firstItem.id)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-zinc-100/50",
                    isSelected ? "bg-indigo-50 border-r-3 border-r-indigo-500" : "hover:bg-zinc-100/40 bg-white"
                  )}
                >
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/60 shadow-xs">
                    {firstItem?.image_url ? (
                      <Image src={getThumbnailUrl(firstItem.image_url, { width: 80, quality: 55 })} alt="" fill unoptimized sizes="36px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-50 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("font-mono text-xs font-bold truncate flex-1", isSelected ? "text-indigo-700" : "text-zinc-900")}>
                        {sku}
                      </p>
                      <span className="text-[9px] text-zinc-500 shrink-0 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded-sm border border-zinc-200/50 leading-none">
                        {count} {count === 1 ? "pc" : "pcs"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {firstItem?.product_name ?? "—"}
                    </p>
                  </div>
                </div>
              )
            })}

          {viewMode === "product_code" &&
            uniqueProductCodes.map(({ productCode, firstItem, skuCount, piecesCount }) => {
              const isSelected = productCode === selectedProductCode
              return (
                <div
                  key={productCode}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedProductCode(productCode)
                    if (firstItem) onSelectId(firstItem.id)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-zinc-100/50",
                    isSelected ? "bg-indigo-50 border-r-3 border-r-indigo-500" : "hover:bg-zinc-100/40 bg-white"
                  )}
                >
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/60 shadow-xs">
                    {firstItem?.image_url ? (
                      <Image src={getThumbnailUrl(firstItem.image_url, { width: 80, quality: 55 })} alt="" fill unoptimized sizes="36px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-50 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-zinc-300">
                          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("font-mono text-xs font-bold truncate flex-1", isSelected ? "text-indigo-700" : "text-zinc-900")}>
                        {productCode}
                      </p>
                      <span className="text-[9px] text-zinc-500 shrink-0 font-semibold bg-zinc-100 px-1.5 py-0.5 rounded-sm border border-zinc-200/50 leading-none">
                        {piecesCount} {piecesCount === 1 ? "pc" : "pcs"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-zinc-400 truncate flex-1">
                        {firstItem?.product_name ?? "—"}
                      </p>
                      <span className="text-[9px] text-indigo-500 shrink-0 font-bold bg-indigo-50/50 px-1 rounded-sm border border-indigo-100/30">
                        {skuCount} {skuCount === 1 ? "SKU" : "SKUs"}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Right detail panel */}
      <div className="flex-1 overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          {activeDetailsItem && (
            <motion.div
              key={viewMode === "serial" ? activeDetailsItem.id : viewMode === "sku" ? selectedSku : selectedProductCode}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="h-full"
            >
              <RecordDetail
                item={activeDetailsItem}
                data={data}
                isLoading={detailLoading}
                allItems={items}
                viewMode={viewMode}
                onNavigate={onSelectId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
