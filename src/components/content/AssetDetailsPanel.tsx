"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { motion } from "motion/react"
import { Disclosure, DisclosureGroup, Spinner } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { getThumbnailUrl, getOriginalPublicUrl, getPublicUrl, listFolder } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"
import {
  FABRIC_FOLDER_KEYS,
  MEDIA_FOLDER_KEYS,
  type FolderKey,
  folderFromStoragePath,
  getFolderDisplayName,
  getFolderFullLabel,
  getFolderStoragePath,
  isFabricFolder,
  isVisibleStorageItem,
} from "@/lib/content-folders"
import type { StorageFile } from "./UploadSummaryModal"
import { ArrowDownToLine, ChevronLeft, ChevronRight, Xmark } from "@gravity-ui/icons"

// ──────────────────────────────────────────────────────────
// Types — rows as read from the views (the generated DB types predate the
// location_state / location_country columns on view_inventory_gallery).
// ──────────────────────────────────────────────────────────

interface PieceRow {
  id: string
  serial_number: string | null
  catalog_id: string | null
  sku: string | null
  product_code: string | null
  quality_code: string | null
  design_code: string | null
  so_number: string | null
  is_active: boolean | null
  product_name: string | null
  size_label: string | null
  quality_name: string | null
  design_name: string | null
  collection_name: string | null
  construction_name: string | null
  color_names: string | null
  color_codes: string | null
  fiber_configuration: string | null
  location_id: string | null
  location_name: string | null
  location_state: string | null
  location_country: string | null
  currency_symbol: string | null
  created_at: string | null
}

interface SiblingRow {
  id: string
  location_id: string | null
  location_name: string | null
  location_state: string | null
  location_country: string | null
}

interface PriceRow {
  location_id: string | null
  location_name: string | null
  price: number | null
  currency_symbol: string | null
}

interface AssetDetailData {
  piece: PieceRow
  siblings: SiblingRow[]
  prices: PriceRow[]
}

interface RelatedItem {
  inventoryId: string
  serial: string | null
  sku: string | null
  file: StorageFile
}

type RelatedCriteria =
  | { kind: "design"; design: string }
  | { kind: "size"; size: string }
  | { kind: "colors"; colors: string[]; mode: "all" | "any" }

const PIECE_COLUMNS =
  "id, serial_number, catalog_id, sku, product_code, quality_code, design_code, so_number, is_active, product_name, size_label, quality_name, design_name, collection_name, construction_name, color_names, color_codes, fiber_configuration, location_id, location_name, location_state, location_country, currency_symbol, created_at"

// Related groups: how many candidate pieces to look at, and how many with images to show
const RELATED_CANDIDATES = 80
const RELATED_LIMIT = 24
// Groups this small fit in one carousel row; larger ones use two
const ONE_ROW_MAX = 4

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "—"
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const formatPrice = (price: number | null, symbol: string | null) =>
  price == null ? "—" : `${symbol ?? ""}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(price)}`

const joinParts = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ")

const withCode = (name: string | null, code: string | null) => (name && code ? `${name} (${code})` : (name ?? code))

function parseColors(names: string | null, codes: string | null) {
  if (!names) return []
  const codeList = (codes ?? "").split(",").map((c) => c.trim())
  return names
    .split(",")
    .map((name, i) => ({ name: name.trim(), code: codeList[i] ?? "" }))
    .filter((c) => c.name)
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** "SA-123 (2).jpg" → { base: "SA-123", count: 2 }; files without a "(n)" have count null. */
function parseSerialName(name: string): { base: string; count: number | null } {
  const stem = name.replace(/\.[^/.]+$/, "")
  const m = stem.match(/^(.*?)\s*\((\d+)\)$/)
  return m ? { base: m[1].trim(), count: Number(m[2]) } : { base: stem.trim(), count: null }
}

function storageFileFromPath(storagePath: string, publicUrl?: string): StorageFile {
  return {
    name: storagePath.split("/").pop() ?? storagePath,
    id: null,
    created_at: null,
    storagePath,
    publicUrl: publicUrl ?? getPublicUrl("images", storagePath),
    folder: folderFromStoragePath(storagePath),
    details: null,
  }
}

async function downloadOriginal(file: StorageFile) {
  try {
    const res = await fetch(getOriginalPublicUrl(file.publicUrl))
    const blobUrl = URL.createObjectURL(await res.blob())
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch (e) {
    console.error("Failed to download original image:", e)
  }
}

// ──────────────────────────────────────────────────────────
// Data hooks
// ──────────────────────────────────────────────────────────

/** Resolves the inventory piece behind a storage file, plus its location, prices and sibling stock. */
function useAssetDetails(storagePath: string) {
  const [data, setData] = useState<AssetDetailData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const { data: refs, error: refErr } = await (supabase.from("inventory_images" as any) as any)
          .select("inventory_id")
          .eq("storage_path", storagePath)
          .not("inventory_id", "is", null)
          .limit(1)
        if (refErr) throw refErr

        const inventoryId = ((refs as { inventory_id: string }[] | null) ?? [])[0]?.inventory_id
        if (!inventoryId) return // unlinked asset — the panel shows file info only

        const { data: pieceData, error: pieceErr } = await (supabase.from("view_inventory_gallery" as any) as any)
          .select(PIECE_COLUMNS)
          .eq("id", inventoryId)
          .maybeSingle()
        if (pieceErr) throw pieceErr
        const piece = pieceData as PieceRow | null
        if (!piece) return

        const [siblingsRes, pricesRes] = await Promise.all([
          piece.catalog_id
            ? (supabase.from("view_inventory_gallery" as any) as any)
                .select("id, location_id, location_name, location_state, location_country")
                .eq("catalog_id", piece.catalog_id)
            : Promise.resolve({ data: [], error: null }),
          piece.catalog_id
            ? (supabase.from("view_active_prices" as any) as any)
                .select("location_id, location_name, price, currency_symbol")
                .eq("catalog_id", piece.catalog_id)
            : Promise.resolve({ data: [], error: null }),
        ])
        // Supplementary sections degrade to empty rather than failing the whole panel
        for (const res of [siblingsRes, pricesRes]) {
          if (res.error) console.warn("Asset details lookup failed:", res.error)
        }

        if (cancelled) return
        setData({
          piece,
          siblings: (siblingsRes.data as SiblingRow[] | null) ?? [],
          prices: (pricesRes.data as PriceRow[] | null) ?? [],
        })
      } catch (err) {
        console.error("Failed to load asset details:", err)
        if (!cancelled) setError("Couldn't load the details for this image.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [storagePath])

  return { data, isLoading, error }
}

/**
 * Finds the file's numbered variants — same name, different "(n)" — which upload routing
 * spreads across folders ((1) → Head, (2) → Floor, …), so every folder is searched.
 */
function useSerialVariants(file: StorageFile) {
  const [variants, setVariants] = useState<StorageFile[]>([file])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const { base } = parseSerialName(file.name)
    const matcher = new RegExp(`^${escapeRegExp(base)}\\s*(\\(\\d+\\))?\\.[a-z0-9]+$`, "i")

    const run = async () => {
      const folders: readonly FolderKey[] = isFabricFolder(file.folder) ? FABRIC_FOLDER_KEYS : MEDIA_FOLDER_KEYS
      const results = await Promise.all(
        folders.map(async (folder) => {
          const path = getFolderStoragePath(folder)
          try {
            // Storage search matches on (at least) a name prefix; the regex then keeps exact variants only
            const items = await listFolder("images", path, { search: base, limit: 100 })
            return items
              .filter((item) => isVisibleStorageItem(item) && matcher.test(item.name))
              .map<StorageFile>((item) => {
                const storagePath = `${path}/${item.name}`
                return {
                  name: item.name,
                  id: item.id,
                  created_at: item.created_at,
                  metadata: item.metadata ? { size: item.metadata.size, mimetype: item.metadata.mimetype } : undefined,
                  storagePath,
                  publicUrl: getPublicUrl("images", storagePath),
                  folder,
                  details: null,
                }
              })
          } catch (e) {
            console.warn(`Variant lookup failed in ${path}:`, e)
            return []
          }
        })
      )
      if (cancelled) return

      const byPath = new Map<string, StorageFile>()
      for (const f of results.flat()) byPath.set(f.storagePath, f)
      // Keep the opened file even if search missed it, preferring its listed (richer) metadata
      if (!byPath.has(file.storagePath)) byPath.set(file.storagePath, file)

      const sorted = Array.from(byPath.values()).sort((a, b) => {
        const ca = parseSerialName(a.name).count ?? Number.MAX_SAFE_INTEGER
        const cb = parseSerialName(b.name).count ?? Number.MAX_SAFE_INTEGER
        return ca - cb || a.name.localeCompare(b.name)
      })
      setVariants(sorted)
      setIsLoading(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [file])

  return { variants, isLoading }
}

async function fetchRelated(pieceId: string, criteria: RelatedCriteria, preferCount: number | null): Promise<RelatedItem[]> {
  let query = (supabase.from("view_inventory_gallery" as any) as any)
    .select("id, serial_number, sku")
    .neq("id", pieceId)
    .limit(RELATED_CANDIDATES)

  if (criteria.kind === "design") query = query.eq("design_name", criteria.design)
  if (criteria.kind === "size") query = query.eq("size_label", criteria.size)
  if (criteria.kind === "colors") {
    if (criteria.colors.length === 0) return []
    if (criteria.mode === "all") {
      for (const c of criteria.colors) query = query.ilike("color_names", `%${c}%`)
    } else {
      const quoted = criteria.colors.map((c) => `color_names.ilike."%${c.replace(/["\\]/g, "\\$&")}%"`)
      query = query.or(quoted.join(","))
    }
  }

  const { data: pieces, error } = await query
  if (error) throw error
  const pieceRows = (pieces as { id: string; serial_number: string | null; sku: string | null }[] | null) ?? []
  if (pieceRows.length === 0) return []

  const { data: images, error: imgErr } = await (supabase.from("inventory_images" as any) as any)
    .select("inventory_id, storage_path, public_url, sort_order")
    .in("inventory_id", pieceRows.map((p) => p.id))
    .not("storage_path", "is", null)
    .order("sort_order", { ascending: true })
  if (imgErr) throw imgErr

  // One image per piece — the same "(n)" view as the opened file when there is one, so shots compare like for like
  const imagesByPiece = new Map<string, { storage_path: string; public_url: string }[]>()
  for (const img of (images as { inventory_id: string; storage_path: string; public_url: string }[] | null) ?? []) {
    const list = imagesByPiece.get(img.inventory_id) ?? []
    list.push(img)
    imagesByPiece.set(img.inventory_id, list)
  }

  const items: RelatedItem[] = []
  for (const p of pieceRows) {
    const list = imagesByPiece.get(p.id)
    if (!list?.length) continue
    const preferred =
      (preferCount != null && list.find((img) => parseSerialName(img.storage_path.split("/").pop() ?? "").count === preferCount)) ||
      list[0]
    items.push({ inventoryId: p.id, serial: p.serial_number, sku: p.sku, file: storageFileFromPath(preferred.storage_path, preferred.public_url) })
    if (items.length >= RELATED_LIMIT) break
  }
  return items
}

function useRelated(pieceId: string, criteria: RelatedCriteria | null, preferCount: number | null) {
  const [items, setItems] = useState<RelatedItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // Serialized so an equivalent criteria object doesn't refetch
  const criteriaKey = criteria ? JSON.stringify(criteria) : null

  useEffect(() => {
    if (!criteriaKey) return
    let cancelled = false
    const run = async () => {
      // Yield first so the state resets below happen after the effect body exits
      await Promise.resolve()
      if (cancelled) return
      setIsLoading(true)
      try {
        const result = await fetchRelated(pieceId, JSON.parse(criteriaKey) as RelatedCriteria, preferCount)
        if (!cancelled) setItems(result)
      } catch (e) {
        console.warn("Related files lookup failed:", e)
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pieceId, criteriaKey, preferCount])

  return { items: criteriaKey ? items : [], isLoading }
}

// ──────────────────────────────────────────────────────────
// Presentational pieces
// ──────────────────────────────────────────────────────────

const iconButton =
  "inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer disabled:text-zinc-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"

const SectionTitle = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-2 mb-2">
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{children}</h3>
    {aside}
  </div>
)

/** Horizontal carousel track with edge arrow buttons; children lay out in 1 or 2 rows. */
function CarouselTrack({ rows, children }: { rows: 1 | 2; children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }
  return (
    <div className="relative group/track">
      <div
        ref={trackRef}
        className={cn(
          "grid grid-flow-col auto-cols-[104px] gap-2 overflow-x-auto scrollbar-none scroll-smooth snap-x pb-1",
          rows === 2 ? "grid-rows-2" : "grid-rows-1"
        )}
      >
        {children}
      </div>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => scroll(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? "Scroll left" : "Scroll right"}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/95 border border-zinc-200 shadow-sm text-zinc-600 hover:text-zinc-900 flex items-center justify-center cursor-pointer opacity-0 group-hover/track:opacity-100 focus-visible:opacity-100 transition-opacity",
            side === "left" ? "left-1" : "right-1"
          )}
        >
          {side === "left" ? <ChevronLeft width={14} height={14} /> : <ChevronRight width={14} height={14} />}
        </button>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Serial-variant carousel — the opened file plus its "(1)", "(2)", … siblings
// ──────────────────────────────────────────────────────────

function VariantCarousel({
  variants,
  activeIndex,
  onChange,
  isLoading,
}: {
  variants: StorageFile[]
  activeIndex: number
  onChange: (index: number) => void
  isLoading: boolean
}) {
  const active = variants[activeIndex]
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const isVideo = active.metadata?.mimetype?.startsWith("video/")
  const hasPrev = activeIndex > 0
  const hasNext = activeIndex < variants.length - 1
  const thumbStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    thumbStripRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
  }, [activeIndex])

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100 group/main">
        {isVideo ? (
          <div className="flex items-center justify-center bg-zinc-950 aspect-video text-white text-xs">Video file</div>
        ) : (
          <a href={getOriginalPublicUrl(active.publicUrl)} target="_blank" rel="noopener noreferrer" className="block cursor-zoom-in" title="Open original in a new tab">
            {loadedPath !== active.storagePath && <div className="absolute inset-0 animate-pulse bg-zinc-200" />}
            <Image
              key={active.storagePath}
              src={getThumbnailUrl(active.publicUrl, { width: 1000, quality: 85 })}
              alt={active.name}
              width={0}
              height={0}
              unoptimized
              sizes="640px"
              onLoad={() => setLoadedPath(active.storagePath)}
              className={cn(
                "w-full h-auto max-h-[460px] object-contain transition-opacity duration-200",
                loadedPath === active.storagePath ? "opacity-100" : "opacity-0"
              )}
            />
          </a>
        )}
        {variants.length > 1 && (
          <>
            {(["left", "right"] as const).map((side) => {
              const enabled = side === "left" ? hasPrev : hasNext
              return (
                <button
                  key={side}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onChange(activeIndex + (side === "left" ? -1 : 1))}
                  aria-label={side === "left" ? "Previous variant" : "Next variant"}
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 border border-zinc-200 shadow-sm text-zinc-700 flex items-center justify-center cursor-pointer transition-opacity disabled:hidden",
                    "opacity-70 group-hover/main:opacity-100",
                    side === "left" ? "left-2" : "right-2"
                  )}
                >
                  {side === "left" ? <ChevronLeft /> : <ChevronRight />}
                </button>
              )
            })}
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5 tabular-nums">
              {activeIndex + 1} / {variants.length}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip — one per numbered variant */}
      <div ref={thumbStripRef} className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {variants.map((v, i) => {
          const { count } = parseSerialName(v.name)
          const isActive = i === activeIndex
          return (
            <button
              key={v.storagePath}
              type="button"
              aria-current={isActive}
              onClick={() => onChange(i)}
              title={v.name}
              className={cn(
                "shrink-0 w-[72px] rounded-lg overflow-hidden border-2 bg-white text-left transition-colors cursor-pointer",
                isActive ? "border-zinc-900" : "border-transparent hover:border-zinc-300"
              )}
            >
              <div className="relative w-full aspect-square bg-zinc-100">
                <Image src={getThumbnailUrl(v.publicUrl, { width: 160, quality: 60 })} alt="" fill unoptimized sizes="72px" className="object-cover" />
              </div>
              <div className="px-1 py-0.5 text-[10px] font-semibold text-zinc-600 truncate">
                {count != null ? `(${count})` : "—"} {getFolderDisplayName(v.folder)}
              </div>
            </button>
          )
        })}
        {isLoading && (
          <div className="shrink-0 w-[72px] aspect-square rounded-lg bg-zinc-100 animate-pulse flex items-center justify-center">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Related files — collapsible groups of same design / colors / size
// ──────────────────────────────────────────────────────────

function RelatedGroup({
  id,
  title,
  subtitle,
  items,
  isLoading,
  emptyMessage,
  controls,
  onSelectFile,
}: {
  id: string
  title: string
  subtitle?: string | null
  items: RelatedItem[]
  isLoading: boolean
  emptyMessage: string
  controls?: React.ReactNode
  onSelectFile: (file: StorageFile) => void
}) {
  return (
    <Disclosure id={id} className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      <Disclosure.Heading>
        <Disclosure.Trigger className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-zinc-50 transition-colors cursor-pointer text-left">
          <span className="min-w-0 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-zinc-800 shrink-0">{title}</span>
            {subtitle && <span className="text-xs text-zinc-400 truncate">{subtitle}</span>}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 rounded-full px-2 py-0.5 tabular-nums">
              {isLoading ? "…" : items.length}
            </span>
            <Disclosure.Indicator />
          </span>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="px-3 pb-3 pt-1 flex flex-col gap-3">
          {controls}
          {isLoading ? (
            <div className="grid grid-flow-col auto-cols-[104px] gap-2 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-lg bg-zinc-100 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-zinc-400 py-2">{emptyMessage}</p>
          ) : (
            <CarouselTrack rows={items.length > ONE_ROW_MAX ? 2 : 1}>
              {items.map((item) => (
                <button
                  key={item.inventoryId}
                  type="button"
                  onClick={() => onSelectFile(item.file)}
                  title={item.file.name}
                  className="snap-start rounded-lg overflow-hidden border border-zinc-200 bg-white hover:border-zinc-400 transition-colors text-left cursor-pointer"
                >
                  <div className="relative w-full aspect-[4/5] bg-zinc-100">
                    <Image src={getThumbnailUrl(item.file.publicUrl, { width: 220, quality: 60 })} alt="" fill unoptimized sizes="104px" className="object-cover" />
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="font-mono text-[10px] font-bold text-zinc-800 truncate">{item.serial ?? "—"}</p>
                    <p className="font-mono text-[9px] text-zinc-400 truncate">{item.sku ?? ""}</p>
                  </div>
                </button>
              ))}
            </CarouselTrack>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}

function RelatedFiles({
  piece,
  preferCount,
  onSelectFile,
}: {
  piece: PieceRow
  preferCount: number | null
  onSelectFile: (file: StorageFile) => void
}) {
  const pieceColors = useMemo(() => parseColors(piece.color_names, piece.color_codes), [piece.color_names, piece.color_codes])
  const [selectedColors, setSelectedColors] = useState<string[]>(() => pieceColors.map((c) => c.name))
  const [colorMode, setColorMode] = useState<"all" | "any">("all")

  const design = useRelated(piece.id, piece.design_name ? { kind: "design", design: piece.design_name } : null, preferCount)
  const colors = useRelated(
    piece.id,
    selectedColors.length > 0 ? { kind: "colors", colors: [...selectedColors].sort(), mode: colorMode } : null,
    preferCount
  )
  const size = useRelated(piece.id, piece.size_label ? { kind: "size", size: piece.size_label } : null, preferCount)

  const toggleColor = (name: string) =>
    setSelectedColors((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]))

  const colorControls =
    pieceColors.length > 0 ? (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {pieceColors.map(({ name, code }) => {
            const isOn = selectedColors.includes(name)
            return (
              <button
                key={name}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggleColor(name)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer",
                  isOn ? "bg-zinc-900 border-zinc-900 text-white" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
                )}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full border border-white/40 bg-zinc-300"
                  style={/^#[0-9a-f]{3,8}$/i.test(code) ? { backgroundColor: code } : undefined}
                />
                {name}
              </button>
            )
          })}
        </div>
        <div className="inline-flex self-start rounded-lg border border-zinc-200 p-0.5 bg-zinc-50" role="radiogroup" aria-label="Color match">
          {(["all", "any"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={colorMode === mode}
              onClick={() => setColorMode(mode)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                colorMode === mode ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              {mode === "all" ? "Contains all" : "Contains any"}
            </button>
          ))}
        </div>
      </div>
    ) : null

  return (
    <section>
      <SectionTitle>Related Files</SectionTitle>
      <DisclosureGroup allowsMultipleExpanded defaultExpandedKeys={["design", "colors", "size"]} className="flex flex-col gap-2">
        <RelatedGroup
          id="design"
          title="Same Design"
          subtitle={piece.design_name}
          items={design.items}
          isLoading={design.isLoading}
          emptyMessage={piece.design_name ? "No other pieces with this design." : "This piece has no design set."}
          onSelectFile={onSelectFile}
        />
        <RelatedGroup
          id="colors"
          title="Same Colors"
          subtitle={selectedColors.length ? selectedColors.join(", ") : null}
          items={colors.items}
          isLoading={colors.isLoading}
          emptyMessage={
            pieceColors.length === 0
              ? "This piece has no colors set."
              : selectedColors.length === 0
                ? "Select at least one color."
                : "No other pieces match these colors."
          }
          controls={colorControls}
          onSelectFile={onSelectFile}
        />
        <RelatedGroup
          id="size"
          title="Same Size"
          subtitle={piece.size_label}
          items={size.items}
          isLoading={size.isLoading}
          emptyMessage={piece.size_label ? "No other pieces in this size." : "This piece has no size set."}
          onSelectFile={onSelectFile}
        />
      </DisclosureGroup>
    </section>
  )
}

// ──────────────────────────────────────────────────────────
// Panel body — keyed by the opened file, so all local state resets per file
// ──────────────────────────────────────────────────────────

function PanelBody({ file, onSelectFile }: { file: StorageFile; onSelectFile: (file: StorageFile) => void }) {
  const { data, isLoading, error } = useAssetDetails(file.storagePath)
  const { variants, isLoading: variantsLoading } = useSerialVariants(file)
  const [activePath, setActivePath] = useState(file.storagePath)

  const activeIndex = Math.max(0, variants.findIndex((v) => v.storagePath === activePath))
  const activeFile = variants[activeIndex] ?? file
  const piece = data?.piece ?? null
  const colors = useMemo(() => parseColors(piece?.color_names ?? null, piece?.color_codes ?? null), [piece])
  const currentPrice = data?.prices.find((p) => p.location_id === piece?.location_id) ?? null

  // Stock of this SKU per location, current location first, then by piece count
  const stockByLocation = useMemo(() => {
    if (!data) return []
    const priceByLocation = new Map(data.prices.map((p) => [p.location_id, p]))
    const groups = new Map<string, { id: string | null; name: string; region: string; pieces: number; price: PriceRow | undefined }>()
    for (const s of data.siblings) {
      const key = s.location_id ?? "unassigned"
      const entry = groups.get(key) ?? {
        id: s.location_id,
        name: s.location_name ?? "Unassigned",
        region: joinParts(s.location_state, s.location_country),
        pieces: 0,
        price: priceByLocation.get(s.location_id),
      }
      entry.pieces += 1
      groups.set(key, entry)
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === data.piece.location_id) return -1
      if (b.id === data.piece.location_id) return 1
      return b.pieces - a.pieces
    })
  }, [data])

  const pieceRows: { group: string; rows: [string, React.ReactNode, boolean?][] }[] = piece
    ? [
        {
          group: "Product",
          rows: [
            ["Serial Number", piece.serial_number, true],
            ["SKU", piece.sku, true],
            [
              "Status",
              <span
                key="status"
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  piece.is_active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                )}
              >
                {piece.is_active ? "Active" : "Discontinued"}
              </span>,
            ],
            ["Product Type", piece.product_name],
            ["Size", piece.size_label],
            ["Quality", withCode(piece.quality_name, piece.quality_code)],
            ["Design", withCode(piece.design_name, piece.design_code)],
            ["Collection", piece.collection_name],
            ["Construction", piece.construction_name],
            [
              "Colors",
              colors.length > 0 ? (
                <span key="colors" className="flex flex-wrap gap-x-3 gap-y-1">
                  {colors.map(({ name, code }) => (
                    <span key={name} className="inline-flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full border border-zinc-200 bg-zinc-200"
                        style={/^#[0-9a-f]{3,8}$/i.test(code) ? { backgroundColor: code } : undefined}
                      />
                      {name}
                    </span>
                  ))}
                </span>
              ) : null,
            ],
            ["Fiber Configuration", piece.fiber_configuration],
            ["Product Code", piece.product_code, true],
            ["SO Number", piece.so_number, true],
          ],
        },
        {
          group: "Warehouse",
          rows: [
            ["Current Location", piece.location_name ?? "Unassigned"],
            ["Region", joinParts(piece.location_state, piece.location_country)],
            ["Price Here", formatPrice(currentPrice?.price ?? null, currentPrice?.currency_symbol ?? piece.currency_symbol)],
            ["Added On", formatDate(piece.created_at)],
          ],
        },
      ]
    : []

  const fileGroup: { group: string; rows: [string, React.ReactNode, boolean?][] } = {
    group: "File",
    rows: [
      ["File Name", activeFile.name, true],
      ["Folder", getFolderFullLabel(activeFile.folder)],
      ["File Size", formatBytes(activeFile.metadata?.size)],
      ["Type", activeFile.metadata?.mimetype],
      ["Uploaded", formatDate(activeFile.created_at)],
      ["Storage Path", activeFile.storagePath, true],
    ],
  }

  return (
    <div className="flex flex-col gap-6">
      <VariantCarousel
        variants={variants}
        activeIndex={activeIndex}
        onChange={(i) => setActivePath(variants[i].storagePath)}
        isLoading={variantsLoading}
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Spinner size="sm" /> Loading details…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : !piece ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
          This image isn&apos;t linked to an inventory piece yet, so there are no product or warehouse details.
        </p>
      ) : null}

      {/* Details — one zebra table, grouped by Product / Warehouse / File */}
      <section>
        <SectionTitle>Details</SectionTitle>
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            {[...pieceRows, fileGroup].map(({ group, rows }) => (
              <tbody key={group}>
                <tr className="bg-zinc-100/80">
                  <th colSpan={2} scope="colgroup" className="text-left px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {group}
                  </th>
                </tr>
                {rows.map(([label, value, mono]) => (
                  <tr key={label} className="even:bg-zinc-50/80 odd:bg-white">
                    <th scope="row" className="w-[38%] text-left align-top px-3 py-2 text-xs font-medium text-zinc-500">
                      {label}
                    </th>
                    <td className={cn("px-3 py-2 text-zinc-800 font-medium break-words", mono && "font-mono text-xs")}>{value || "—"}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {/* Stock of this SKU across warehouses */}
      {stockByLocation.length > 0 && (
        <section>
          <SectionTitle aside={<span className="text-[11px] text-zinc-400 tabular-nums">{data?.siblings.length ?? 0} pcs of this SKU</span>}>
            Stock Across Warehouses
          </SectionTitle>
          <div className="rounded-xl border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-100/80 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="text-left px-3 py-1.5">Location</th>
                  <th className="text-right px-3 py-1.5">Pieces</th>
                  <th className="text-right px-3 py-1.5">Price</th>
                </tr>
              </thead>
              <tbody>
                {stockByLocation.map((loc) => {
                  const isCurrent = loc.id === piece?.location_id
                  return (
                    <tr key={loc.id ?? "unassigned"} className={cn("even:bg-zinc-50/80 odd:bg-white", isCurrent && "!bg-indigo-50/60")}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-zinc-800">
                          {loc.name}
                          {isCurrent && <span className="ml-1.5 text-[9px] font-bold uppercase text-indigo-600">This piece</span>}
                        </p>
                        {loc.region && <p className="text-[11px] text-zinc-400">{loc.region}</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-800">{loc.pieces}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                        {formatPrice(loc.price?.price ?? null, loc.price?.currency_symbol ?? null)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {piece && <RelatedFiles piece={piece} preferCount={parseSerialName(file.name).count} onSelectFile={onSelectFile} />}
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Panel width — user-resizable on desktop, clamped so neither panel nor grid gets cramped
// ──────────────────────────────────────────────────────────

const PANEL_WIDTH_KEY = "sapl_content_details_panel_width"
const PANEL_MIN_WIDTH = 380
const PANEL_DEFAULT_WIDTH = 540
/** Fraction of the window the panel may take; the CSS clamp below enforces the same limit on window resize. */
const PANEL_MAX_VIEWPORT_FRACTION = 0.65
const PANEL_KEYBOARD_STEP = 24

const clampPanelWidth = (w: number) =>
  Math.round(Math.min(Math.max(w, PANEL_MIN_WIDTH), Math.max(PANEL_MIN_WIDTH, window.innerWidth * PANEL_MAX_VIEWPORT_FRACTION)))

function readStoredPanelWidth(): number {
  try {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    if (stored > 0) return clampPanelWidth(stored)
  } catch {}
  return PANEL_DEFAULT_WIDTH
}

function storePanelWidth(w: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(w))
  } catch {}
}

/** Width state + a drag/keyboard-operable handle for the panel's left edge. */
function usePanelResize() {
  // The panel only mounts after a click (never during SSR), so reading storage here is hydration-safe
  const [width, setWidth] = useState(readStoredPanelWidth)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number; raf: number; latest: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startWidth: width, raf: 0, latest: width }
    setIsDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // Dragging left widens the panel; batch to one update per frame since the grid reflows on each
    drag.latest = clampPanelWidth(drag.startWidth + (drag.startX - e.clientX))
    if (!drag.raf) {
      drag.raf = requestAnimationFrame(() => {
        drag.raf = 0
        setWidth(drag.latest)
      })
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    cancelAnimationFrame(drag.raf)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
    setWidth(drag.latest)
    storePanelWidth(drag.latest)
    setIsDragging(false)
  }

  const commit = (w: number) => {
    const next = clampPanelWidth(w)
    setWidth(next)
    storePanelWidth(next)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") commit(width + PANEL_KEYBOARD_STEP)
    else if (e.key === "ArrowRight") commit(width - PANEL_KEYBOARD_STEP)
    else if (e.key === "Home") commit(PANEL_MIN_WIDTH)
    else if (e.key === "End") commit(Number.MAX_SAFE_INTEGER)
    else return
    // Don't let the panel's own ← / → grid navigation also fire
    e.preventDefault()
    e.stopPropagation()
  }

  // Keep the whole page in "resizing" mode while dragging, even when the pointer leaves the handle
  useEffect(() => {
    if (!isDragging) return
    const { cursor, userSelect } = document.body.style
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = cursor
      document.body.style.userSelect = userSelect
    }
  }, [isDragging])

  const handleProps = {
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-label": "Resize details panel",
    "aria-valuemin": PANEL_MIN_WIDTH,
    "aria-valuenow": width,
    tabIndex: 0,
    title: "Drag to resize · double-click to reset",
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown,
    onDoubleClick: () => commit(PANEL_DEFAULT_WIDTH),
  }

  return { width, isDragging, handleProps }
}

// ──────────────────────────────────────────────────────────
// Panel shell — docked beside the grid on desktop, full-screen on phones
// ──────────────────────────────────────────────────────────

interface AssetDetailsPanelProps {
  file: StorageFile
  onClose: () => void
  /** Opens another file in the panel (variant carousel stays local; related files call this). */
  onSelectFile: (file: StorageFile) => void
  /** Prev/next walk the files currently shown in the grid. */
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

export default function AssetDetailsPanel({ file, onClose, onSelectFile, onPrev, onNext, hasPrev, hasNext }: AssetDetailsPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { width, isDragging, handleProps } = usePanelResize()

  // Esc closes; ← / → step through the grid
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, [contenteditable='true']")) return
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft" && hasPrev) onPrev?.()
      if (e.key === "ArrowRight" && hasNext) onNext?.()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hasPrev, hasNext, onPrev, onNext, onClose])

  // Each newly opened file starts at the top of the panel
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [file.storagePath])

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      aria-label="Image details"
      style={{ "--panel-w": `${width}px` } as React.CSSProperties}
      className={cn(
        "flex flex-col bg-white",
        // Phones: full-screen sheet. Desktop: docked column the grid reflows beside, at the user's
        // chosen width — the clamp re-applies the limits whenever the window itself resizes.
        "fixed inset-0 z-[60] lg:relative lg:inset-auto lg:z-auto",
        "lg:w-[clamp(380px,var(--panel-w),65vw)] lg:shrink-0 lg:border-l lg:border-zinc-200"
      )}
    >
      {/* Resize handle — straddles the left border; desktop only */}
      <div
        {...handleProps}
        className="hidden lg:flex absolute inset-y-0 -left-1.5 w-3 z-20 cursor-col-resize items-center justify-center group/resize outline-none"
      >
        <span
          className={cn(
            "h-full w-px transition-colors",
            isDragging ? "bg-indigo-500 w-0.5" : "bg-transparent group-hover/resize:bg-indigo-400 group-focus-visible/resize:bg-indigo-500"
          )}
        />
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 h-10 w-1.5 rounded-full border border-zinc-300 bg-white shadow-xs transition-opacity",
            isDragging ? "opacity-100 border-indigo-400" : "opacity-0 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100"
          )}
        />
      </div>

      <header className="flex items-center gap-1 px-4 py-3 border-b border-zinc-150 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-sm font-bold text-zinc-900 truncate" title={file.name}>
            {file.name}
          </h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{getFolderFullLabel(file.folder)}</span>
        </div>
        <button type="button" onClick={() => downloadOriginal(file)} className={iconButton} aria-label="Download original" title="Download original">
          <ArrowDownToLine />
        </button>
        <button type="button" onClick={onPrev} disabled={!hasPrev} className={iconButton} aria-label="Previous image in grid" title="Previous (←)">
          <ChevronLeft />
        </button>
        <button type="button" onClick={onNext} disabled={!hasNext} className={iconButton} aria-label="Next image in grid" title="Next (→)">
          <ChevronRight />
        </button>
        <button type="button" onClick={onClose} className={iconButton} aria-label="Close details" title="Close (Esc)">
          <Xmark />
        </button>
      </header>

      <div ref={bodyRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
        <PanelBody key={file.storagePath} file={file} onSelectFile={onSelectFile} />
      </div>
    </motion.aside>
  )
}
