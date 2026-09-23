"use client"

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button, Checkbox, Dropdown, Popover, ScrollShadow, Tooltip, toast } from "@heroui/react"
import type { RenderComponentProps } from "masonic"
import { supabase } from "@/lib/supabase/client"
import { uploadImage, moveImage, getPublicUrl, getThumbnailUrl, getOriginalPublicUrl, listFolder, type StorageListItem } from "@/lib/supabase/storage"
import SearchBar from "@/components/shared/SearchBar"
import SimilarItemsModal from "@/components/shared/SimilarItemsModal"
import { cn, getFolderForFilename } from "@/lib/utils"
import { type FolderKey, folderToSlug } from "@/lib/content-folders"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useContentViewsStore, type ContentFilterConfig } from "@/stores/contentViewsStore"
import ViewsBar from "./ViewsBar"
import { MasonryGrid } from "./MasonryGrid"
import BulkMoveParameterModal from "./BulkMoveParameterModal"
import FullPptGeneratorModal from "./FullPptGeneratorModal"

// ──────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────

const PAGE_SIZE = 60
// Best-effort dashboard counts — folders can hold thousands of assets, so we cap the
// count query and show "N+" rather than paying for an exact count on every visit.
const COUNT_CAP = 1000
const ORGANIZED_FOLDERS = ["Head", "Floor", "Corner", "Closeup", "Tag"] as const
type OrganizedFolder = (typeof ORGANIZED_FOLDERS)[number]

// Search scans the whole folder page by page rather than relying on Storage's own `search`
// filter — some self-hosted storage-api versions only match on a name *prefix*, which made
// search silently miss anything not yet loaded via "Load more". A cap still applies so a
// single search can't page through an unbounded folder forever; it's surfaced via a toast
// rather than failing silently.
const SEARCH_SCAN_BATCH = 500
const SEARCH_SCAN_CAP = 3000

// ──────────────────────────────────────────────────────────
// Helper formatters
// ──────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "—"
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function folderFromStoragePath(path: string): FolderKey {
  const segment = path.split("/")[1]
  return (ORGANIZED_FOLDERS as readonly string[]).includes(segment) ? (segment as OrganizedFolder) : "Unorganized"
}

interface FolderNameMatch {
  item: StorageListItem
  folder: FolderKey
  storagePath: string
}

/**
 * Pages through an entire folder (not just what's already been loaded via "Load more") and
 * filters by filename client-side, so search coverage never depends on how much of the
 * folder happens to be in local state, or on the storage backend's own `search` semantics.
 */
async function scanFolderForNameMatches(
  folder: FolderKey,
  query: string
): Promise<{ matches: FolderNameMatch[]; truncated: boolean }> {
  const path = folder === "Unorganized" ? "media" : `media/${folder}`
  const lowerQuery = query.toLowerCase()
  const matches: FolderNameMatch[] = []
  let offset = 0

  for (; ;) {
    const items = await listFolder("images", path, { limit: SEARCH_SCAN_BATCH, offset })
    if (items.length === 0) break

    for (const item of items) {
      if (item.id === null) continue // virtual subfolder entry
      if (item.name.toLowerCase().includes(lowerQuery)) {
        matches.push({
          item,
          folder,
          storagePath: folder === "Unorganized" ? `media/${item.name}` : `media/${folder}/${item.name}`,
        })
      }
    }

    offset += items.length
    if (items.length < SEARCH_SCAN_BATCH) break // reached the end of the folder
  }

  return { matches, truncated: false }
}

// ──────────────────────────────────────────────────────────
// Per-folder page cache — module-scoped (survives across route navigations within the
// same session, since goToFolder is a real route change that remounts this component).
// Lets re-entering a folder repaint instantly from cache instead of refetching page 1.
// ──────────────────────────────────────────────────────────

interface FolderCacheEntry {
  files: StorageFile[]
  offset: number
  hasMore: boolean
}

const folderPageCache = new Map<string, FolderCacheEntry>()

// ──────────────────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mr-1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)

const FolderIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
)


// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

interface InventoryDetails {
  serial_number: string | null
  sku: string | null
  product_name: string | null
  size_label: string | null
  quality_name: string | null
  design_name: string | null
  color_names: string | null
  collection_name: string | null
  construction_name: string | null
  location_name: string | null
  catalog_id?: string | null
  serial_count?: number
}

function matchesSerialCount(count: number, filters: string[]): boolean {
  if (!filters || filters.length === 0) return true
  return filters.some((f) => {
    const clean = f.trim()
    if (clean === "0" || clean.startsWith("0")) return count === 0
    if (clean === "1" || clean.startsWith("1")) return count === 1
    if (clean === "2-5" || clean.startsWith("2")) return count >= 2 && count <= 5
    if (clean === "6-10" || clean.startsWith("6")) return count >= 6 && count <= 10
    if (clean === ">10" || clean.startsWith(">")) return count > 10
    const n = parseInt(clean, 10)
    return !isNaN(n) && count === n
  })
}

interface StorageFile {
  name: string
  id: string | null
  created_at: string | null
  metadata?: {
    size: number
    mimetype: string
  }
  storagePath: string
  publicUrl: string
  folder: FolderKey
  details: InventoryDetails | null
}

interface ContentLibraryProps {
  /** The folder this instance was navigated to via its own URL — 'root' is the folder dashboard. */
  initialFolder: FolderKey | "root"
}

function matchesQuery(file: StorageFile, query: string): boolean {
  if (file.name.toLowerCase().includes(query)) return true
  const d = file.details
  if (!d) return false
  return [d.serial_number, d.sku, d.product_name, d.size_label, d.quality_name, d.design_name, d.location_name].some(
    (v) => typeof v === "string" && v.toLowerCase().includes(query)
  )
}

// ──────────────────────────────────────────────────────────
// Asset tile — memoized so a neighbor's image finishing (or failing) to load never
// re-renders this tile, keeping each tile's hover/tooltip state fully independent.
// ──────────────────────────────────────────────────────────

const TOOLTIP_PARAM_CONFIG = [
  { key: "product_name", label: "Product" },
  { key: "size_label", label: "Size" },
  { key: "quality_name", label: "Quality" },
  { key: "design_name", label: "Design" },
  { key: "collection_name", label: "Collection" },
  { key: "construction_name", label: "Construction" },
  { key: "location_name", label: "Location" },
  { key: "serial_count", label: "Pieces (Serial Count)" },
]

interface AssetTileProps {
  file: StorageFile
  index?: number
  isSelected: boolean
  showFolderBadge: boolean
  visibleTooltipParams: Set<string>
  onToggleSelect: (storagePath: string) => void
  onFindSimilar: (file: StorageFile) => void
}

const AssetTile = memo(
  function AssetTile({ file, index, isSelected, showFolderBadge, visibleTooltipParams, onToggleSelect, onFindSimilar }: AssetTileProps) {
    const [imageLoaded, setImageLoaded] = useState(false)
    const isVideo = file.metadata?.mimetype?.startsWith("video/")
    const isAboveTheFold = typeof index === "number" && index < 6

    return (
      <div
        className={cn(
          "group relative rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-3xs hover:shadow-sm hover:border-zinc-300 transition-all flex flex-col duration-200",
          isSelected && "ring-3 ring-indigo-500/35 border-indigo-400 bg-indigo-50/5"
        )}
      >
        {/* Checkbox Overlay */}
        <div className="absolute top-3 left-3 z-10">
          <Checkbox isSelected={isSelected} onChange={() => onToggleSelect(file.storagePath)} aria-label={`Select ${file.name}`}>
            <Checkbox.Content className="flex items-center justify-center cursor-pointer">
              <Checkbox.Control className="bg-white shadow-sm">
                <Checkbox.Indicator />
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
        </div>

        {/* Image Tooltip Container */}
        <Tooltip closeDelay={0} delay={0}>
          <Tooltip.Trigger>
            <div
              className="relative w-full aspect-[3/4] overflow-hidden bg-zinc-100"
            >
              {isVideo ? (
                <div className="flex items-center justify-center bg-zinc-950 aspect-video">
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="currentColor" viewBox="0 0 24 24" className="text-white opacity-80">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              ) : (
                <>
                  {!imageLoaded && <div className="absolute inset-0 animate-pulse bg-zinc-200" />}
                  <Image
                    src={getThumbnailUrl(file.publicUrl, { width: 500, quality: 90 })}
                    alt={file.name}
                    fill
                    loading={isAboveTheFold ? "eager" : "lazy"}
                    priority={isAboveTheFold}
                    decoding="async"
                    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                    className={cn(
                      "object-cover group-hover:scale-103 transition-transform duration-300",
                      imageLoaded ? "opacity-100 transition-opacity duration-200" : "opacity-0"
                    )}
                    onLoad={() => setImageLoaded(true)}
                  />
                  {/* Hidden per user request: Hover Sparkles Find Similar Badge Overlay */}
                  {/* <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5 transform group-hover:scale-105 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Find Similar
                    </span>
                  </div> */}
                </>
              )}
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content placement="right" className="p-3 text-xs bg-white border border-zinc-200/50 rounded-lg shadow-xl text-zinc-800 z-50">
            {file.details ? (
              <div className="flex flex-col gap-2 max-w-[280px]">
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100">
                  <span className="font-mono font-bold text-zinc-900">{file.details.serial_number}</span>
                  <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-sm font-bold text-[10px]">{file.details.sku}</span>
                </div>
                <div className="grid grid-cols-3 gap-y-1 text-zinc-500 font-medium leading-relaxed">
                  {visibleTooltipParams.has("product_name") && (
                    <>
                      <div>Product:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.product_name || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("size_label") && (
                    <>
                      <div>Size:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.size_label || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("quality_name") && (
                    <>
                      <div>Quality:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.quality_name || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("design_name") && (
                    <>
                      <div>Design:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.design_name || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("collection_name") && (
                    <>
                      <div>Collection:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.collection_name || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("construction_name") && (
                    <>
                      <div>Construction:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.construction_name || "—"}</div>
                    </>
                  )}
                  {visibleTooltipParams.has("location_name") && (
                    <>
                      <div>Location:</div>
                      <div className="col-span-2 text-zinc-800 font-semibold">{file.details.location_name || "—"}</div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-w-[220px]">
                <div className="font-semibold text-zinc-800 font-mono truncate">{file.name}</div>
                <div className="text-zinc-500 font-medium">Unused / Not connected to SKU</div>
                <div className="text-[10px] text-zinc-400 font-semibold mt-1">Size: {formatBytes(file.metadata?.size)}</div>
              </div>
            )}
          </Tooltip.Content>
        </Tooltip>

        {/* Title and Action bar */}
        <div className="p-3 bg-white flex items-center justify-between gap-2 shrink-0 border-t border-zinc-100">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono text-[11px] text-zinc-900 font-bold truncate leading-tight">{file.name}</span>
            {showFolderBadge && (
              <span className="text-[9px] bg-zinc-100 text-zinc-500 font-bold uppercase px-1.5 py-0.5 rounded-sm w-fit mt-1">{file.folder}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Hidden per user request: Similarity Search button */}
            {/* <button
              type="button"
              onClick={() => onFindSimilar(file)}
              className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
              title="Find similar pattern & data items"
              aria-label={`Find similar to ${file.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </button> */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const originalUrl = getOriginalPublicUrl(file.publicUrl)
                  const res = await fetch(originalUrl)
                  const blob = await res.blob()
                  const blobUrl = URL.createObjectURL(blob)
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
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer inline-flex items-center justify-center shrink-0"
              title="Download original size"
              aria-label={`Download original ${file.name}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5" />
              </svg>
            </button>

          </div>
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.file === next.file &&
    prev.isSelected === next.isSelected &&
    prev.showFolderBadge === next.showFolderBadge &&
    prev.visibleTooltipParams === next.visibleTooltipParams
)

interface MasonryItemContextValue {
  selectedNames: Set<string>
  hasQuery: boolean
  visibleTooltipParams: Set<string>
  onToggleSelect: (storagePath: string) => void
  onFindSimilar: (file: StorageFile) => void
}

const MasonryItemContext = createContext<MasonryItemContextValue | null>(null)

function AssetMasonryItem({ data, index }: RenderComponentProps<StorageFile>) {
  const ctx = useContext(MasonryItemContext)
  if (!ctx || !data) return null
  return (
    <AssetTile
      file={data}
      index={index}
      isSelected={data.storagePath ? ctx.selectedNames.has(data.storagePath) : false}
      showFolderBadge={ctx.hasQuery}
      visibleTooltipParams={ctx.visibleTooltipParams}
      onToggleSelect={ctx.onToggleSelect}
      onFindSimilar={ctx.onFindSimilar}
    />
  )
}

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────

export default function ContentLibrary({ initialFolder }: ContentLibraryProps) {
  const router = useRouter()
  // The active folder always mirrors the route this page was loaded at — navigating to a
  // different folder is a real route change (see goToFolder), so this never needs local mutation.
  const currentFolder = initialFolder

  // masonic's useResizeObserver() constructs a `ResizeObserver` during render, not inside an
  // effect — calling it during SSR (which "use client" components still go through on a hard
  // refresh, just not on a client-side route change) throws `ResizeObserver is not defined`
  // and blanks the whole page. Gating the grid on a post-mount flag keeps it out of any SSR pass.
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  // Paginated folder contents (drilldown view only — the root dashboard never holds full file lists).
  // currentFolder is fixed for this component's lifetime (see comment above), so it's safe to read
  // the module cache once, synchronously, as the lazy initial state rather than via an effect.
  const cachedEntry = currentFolder !== "root" ? folderPageCache.get(currentFolder) : undefined
  const [files, setFiles] = useState<StorageFile[]>(() => cachedEntry?.files ?? [])
  const [isLoading, setIsLoading] = useState(() => currentFolder !== "root" && !cachedEntry)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(() => cachedEntry?.hasMore ?? true)
  const offsetRef = useRef(cachedEntry?.offset ?? 0)

  // ── Resolve inventory details for a specific set of storage paths ──────────
  const resolveDetails = useCallback(async (paths: string[]): Promise<Record<string, InventoryDetails | null>> => {
    if (paths.length === 0) return {}

    const { data: imageRefs, error: imageRefsErr } = await (supabase
      .from("inventory_images" as any) as any)
      .select("storage_path, inventory_id")
      .in("storage_path", paths)

    if (imageRefsErr) {
      console.warn("Failed to fetch inventory_images:", imageRefsErr.message)
      return {}
    }

    const inventoryIds = [...new Set(((imageRefs as any[]) ?? []).map((r) => r.inventory_id).filter(Boolean))] as string[]
    if (inventoryIds.length === 0) return {}

    const { data: invData, error: invErr } = await (supabase
      .from("view_inventory_gallery" as any) as any)
      .select("id, serial_number, catalog_id, sku, product_name, size_label, quality_name, design_name, color_names, collection_name, construction_name, location_name")
      .in("id", inventoryIds)

    if (invErr) {
      console.warn("Failed to fetch inventory details from view:", invErr.message)
      return {}
    }

    const catalogIds = [...new Set(((invData as any[]) ?? []).map((i) => i.catalog_id).filter(Boolean))] as string[]
    const countMap = new Map<string, number>()

    if (catalogIds.length > 0) {
      const { data: countsData } = await (supabase
        .from("inventory" as any) as any)
        .select("catalog_id")
        .in("catalog_id", catalogIds)

      for (const row of (countsData as any[]) ?? []) {
        if (row.catalog_id) {
          countMap.set(row.catalog_id, (countMap.get(row.catalog_id) ?? 0) + 1)
        }
      }
    }

    const invMap = new Map<string, InventoryDetails>()
    for (const row of (invData as any[]) ?? []) {
      invMap.set(row.id, {
        serial_number: row.serial_number ?? null,
        catalog_id: row.catalog_id ?? null,
        sku: row.sku ?? null,
        product_name: row.product_name ?? null,
        size_label: row.size_label ?? null,
        quality_name: row.quality_name ?? null,
        design_name: row.design_name ?? null,
        color_names: row.color_names ?? null,
        collection_name: row.collection_name ?? null,
        construction_name: row.construction_name ?? null,
        location_name: row.location_name ?? null,
        serial_count: row.catalog_id ? (countMap.get(row.catalog_id) ?? 1) : 1,
      })
    }

    const result: Record<string, InventoryDetails | null> = {}
    for (const ref of (imageRefs as any[]) ?? []) {
      result[ref.storage_path] = ref.inventory_id ? (invMap.get(ref.inventory_id) ?? null) : null
    }
    return result
  }, [])

  // The ScrollShadow's real scrollable DOM node — the masonry grid virtualizes against this
  // (state, not just a ref, so MasonryGrid re-renders once it's actually attached on mount).
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)

  // Dashboard counts (root view only) — best-effort, capped
  const [folderCounts, setFolderCounts] = useState<Record<string, { count: number; capped: boolean }>>({})
  const [isCountsLoading, setIsCountsLoading] = useState(currentFolder === "root")

  // Search — the raw query drives an instant local pre-filter every keystroke (cheap, in-memory),
  // while the debounced value triggers the authoritative full search once typing settles.
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedQuery = useDebouncedValue(searchQuery, 250)
  const hasQuery = searchQuery.trim() !== ""
  const [searchResults, setSearchResults] = useState<StorageFile[] | null>(null)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const searchTokenRef = useRef(0)

  const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, StorageFile>>(new Map())
  const selectedNames = useMemo(() => new Set(selectedFilesMap.keys()), [selectedFilesMap])
  const [isMigrating, setIsMigrating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const goToFolder = useCallback((folder: FolderKey | "root") => {
    router.push(folder === "root" ? "/content" : `/content/${folderToSlug(folder)}`)
  }, [router])

  // ── Fetch one page of a single folder from storage + join details for that page only ──
  const fetchFolderPage = useCallback(async (folder: FolderKey, offset: number, search?: string): Promise<StorageFile[]> => {
    const path = folder === "Unorganized" ? "media" : `media/${folder}`
    const items = await listFolder("images", path, { limit: PAGE_SIZE, offset, search })
    const withPaths = items
      .filter((item) => item.id !== null) // skip virtual subfolder entries
      .map((item) => ({
        item,
        storagePath: folder === "Unorganized" ? `media/${item.name}` : `media/${folder}/${item.name}`,
      }))

    const details = await resolveDetails(withPaths.map((w) => w.storagePath))

    return withPaths.map(({ item, storagePath }) => ({
      name: item.name,
      id: item.id,
      created_at: item.created_at,
      metadata: item.metadata ? { size: item.metadata.size, mimetype: item.metadata.mimetype } : undefined,
      storagePath,
      publicUrl: getPublicUrl("images", storagePath),
      folder,
      details: details[storagePath] ?? null,
    }))
  }, [resolveDetails])

  // ── Initial page load — only runs on a genuine cache miss, since a cache hit is already
  //    reflected in the lazy initial state above. ─────────────────────────────────────────
  useEffect(() => {
    if (currentFolder === "root" || cachedEntry) return
    let cancelled = false

    fetchFolderPage(currentFolder, 0)
      .then((page) => {
        if (cancelled) return
        setFiles(page)
        offsetRef.current = page.length
        setHasMore(page.length === PAGE_SIZE)
      })
      .catch((e) => {
        if (cancelled) return
        console.error(e)
        toast.danger("Failed to load folder contents")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
    // cachedEntry is intentionally excluded — it's only relevant to the lazy initial state, and
    // must not re-trigger this effect every time the cache-sync effect below writes a new entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder, fetchFolderPage])

  // Keep the module cache in sync with whatever's currently loaded for this folder — covers
  // pagination, uploads, deletes and moves alike, since they all funnel through setFiles/setHasMore.
  useEffect(() => {
    if (currentFolder === "root") return
    folderPageCache.set(currentFolder, { files, offset: offsetRef.current, hasMore })
  }, [currentFolder, files, hasMore])

  // ── Load the next page — an explicit "Load more" press, not auto-triggered by scrolling,
  //    so scrolling itself never causes a network fetch or layout shift. Paused while a
  //    search is active, so search results always take priority over pagination. ──────────
  const loadMore = useCallback(async () => {
    if (currentFolder === "root" || isLoadingMore || !hasMore || hasQuery) return
    setIsLoadingMore(true)
    try {
      const page = await fetchFolderPage(currentFolder, offsetRef.current)
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.storagePath))
        return [...prev, ...page.filter((f) => !existing.has(f.storagePath))]
      })
      offsetRef.current += page.length
      setHasMore(page.length === PAGE_SIZE)
    } catch (e) {
      console.error(e)
      toast.danger("Failed to load more assets")
    } finally {
      setIsLoadingMore(false)
    }
  }, [currentFolder, fetchFolderPage, isLoadingMore, hasMore, hasQuery])

  // ── Dashboard folder counts (root view only) — isCountsLoading already starts true for
  //    the root case via its initial state above, so this effect only needs to flip it off. ──
  useEffect(() => {
    if (currentFolder !== "root") return
    let cancelled = false

    const allKeys: FolderKey[] = [...ORGANIZED_FOLDERS, "Unorganized"]
    Promise.all(
      allKeys.map(async (folder) => {
        const path = folder === "Unorganized" ? "media" : `media/${folder}`
        const items = await listFolder("images", path, { limit: COUNT_CAP })
        const count = folder === "Unorganized" ? items.filter((i) => i.id !== null).length : items.length
        return [folder, { count, capped: count === COUNT_CAP }] as const
      })
    )
      .then((entries) => {
        if (cancelled) return
        setFolderCounts(Object.fromEntries(entries))
      })
      .catch((e) => {
        if (cancelled) return
        console.error(e)
        toast.danger("Failed to load folder counts")
      })
      .finally(() => {
        if (!cancelled) setIsCountsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentFolder])

  const hasUnorganized = (folderCounts["Unorganized"]?.count ?? 0) > 0

  // ── Prioritized full search — server-scoped filename search + DB metadata search,
  //    merged and deduped. Runs debounced so it doesn't fire on every keystroke, but
  //    always supersedes/pauses background pagination the instant a query is typed. ──
  const runFullSearch = useCallback(async (query: string) => {
    const token = ++searchTokenRef.current
    setIsSearchLoading(true)
    try {
      const scopeFolders: FolderKey[] = currentFolder === "root" ? [...ORGANIZED_FOLDERS, "Unorganized"] : [currentFolder]

      // 1. Run parallel search queries across DB catalog metadata, DB image paths, and folder storage
      const [nameMatchResults, metaRes, imgPathRes] = await Promise.all([
        Promise.all(scopeFolders.map((folder) => scanFolderForNameMatches(folder, query))),
        (supabase.from("view_inventory_gallery" as any) as any)
          .select("id, serial_number, sku, product_name, size_label, quality_name, design_name, color_names, collection_name, construction_name, location_name")
          .or(
            `serial_number.ilike.%${query}%,sku.ilike.%${query}%,product_name.ilike.%${query}%,design_name.ilike.%${query}%,quality_name.ilike.%${query}%,collection_name.ilike.%${query}%,construction_name.ilike.%${query}%,location_name.ilike.%${query}%`
          )
          .limit(5000),
        (supabase.from("inventory_images" as any) as any)
          .select("storage_path, inventory_id")
          .ilike("storage_path", `%${query}%`)
          .limit(5000),
      ])

      const nameMatches = nameMatchResults.flatMap((r) => r.matches)
      const metaMatches: any[] = metaRes.data ?? []
      const imgPathMatches: any[] = imgPathRes.data ?? []

      if (metaRes.error) console.warn("Metadata search failed:", metaRes.error.message)
      if (imgPathRes.error) console.warn("Image path search failed:", imgPathRes.error.message)

      // Collect matched inventory IDs
      const matchedInventoryIds = [...new Set([
        ...metaMatches.map((m: any) => m.id),
        ...imgPathMatches.map((img: any) => img.inventory_id),
      ])].filter((id): id is string => Boolean(id))

      const metaFileMatches: typeof nameMatches = []

      // If we matched inventory IDs, fetch all image references for those pieces
      if (matchedInventoryIds.length > 0) {
        const { data: imageRefs } = await (supabase
          .from("inventory_images" as any) as any)
          .select("storage_path, inventory_id")
          .in("inventory_id", matchedInventoryIds)

        for (const ref of (imageRefs as any[]) ?? []) {
          const storagePath: string = ref.storage_path
          const folder = folderFromStoragePath(storagePath)
          if (!scopeFolders.includes(folder)) continue
          metaFileMatches.push({
            item: { name: storagePath.split("/").pop() ?? storagePath, id: storagePath, created_at: null },
            folder,
            storagePath,
          })
        }
      }

      // Also include direct image path matches from DB
      for (const ref of imgPathMatches) {
        const storagePath: string = ref.storage_path
        const folder = folderFromStoragePath(storagePath)
        if (!scopeFolders.includes(folder)) continue
        metaFileMatches.push({
          item: { name: storagePath.split("/").pop() ?? storagePath, id: storagePath, created_at: null },
          folder,
          storagePath,
        })
      }

      // Merge and deduplicate all match sources
      const byPath = new Map<string, (typeof nameMatches)[number]>()
      for (const match of [...nameMatches, ...metaFileMatches]) {
        if (!byPath.has(match.storagePath)) byPath.set(match.storagePath, match)
      }
      const unique = [...byPath.values()]

      const details = await resolveDetails(unique.map((u) => u.storagePath))
      const resolved: StorageFile[] = unique.map(({ item, folder, storagePath }) => ({
        name: item.name,
        id: item.id,
        created_at: item.created_at,
        metadata: item.metadata ? { size: item.metadata.size, mimetype: item.metadata.mimetype } : undefined,
        storagePath,
        publicUrl: getPublicUrl("images", storagePath),
        folder,
        details: details[storagePath] ?? null,
      }))

      if (token === searchTokenRef.current) {
        setSearchResults(resolved)
      }
    } catch (e) {
      if (token === searchTokenRef.current) {
        console.error(e)
        toast.danger("Search failed")
      }
    } finally {
      if (token === searchTokenRef.current) setIsSearchLoading(false)
    }
  }, [currentFolder, resolveDetails])

  // Note: when the query clears, displayFiles (below) stops reading searchResults entirely and
  // the "Searching…" indicator is gated on the live (undebounced) query — so a stale searchResults/
  // isSearchLoading value left over from before the clear is inert and needs no explicit reset.
  useEffect(() => {
    const query = debouncedQuery.trim()
    if (query === "") {
      searchTokenRef.current++ // invalidate any in-flight search so a stale response can't land
      return
    }
    runFullSearch(query)
  }, [debouncedQuery, runFullSearch])

  const activeView = useContentViewsStore((s) => s.getActiveView())
  const isCustomViewActive = Boolean(isMounted && activeView && !activeView.isDefault)

  const [rootViewFiles, setRootViewFiles] = useState<StorageFile[]>([])
  const [isRootViewLoading, setIsRootViewLoading] = useState(false)

  // Database-backed fetch for custom view configurations
  const fetchCustomViewFiles = useCallback(
    async (config: ContentFilterConfig): Promise<StorageFile[]> => {
      const { designs, qualities, colors, sizes, constructions, collections, folders, serialCounts } = config

      const hasDbFilter =
        (designs?.length ?? 0) > 0 ||
        (qualities?.length ?? 0) > 0 ||
        (colors?.length ?? 0) > 0 ||
        (sizes?.length ?? 0) > 0 ||
        (constructions?.length ?? 0) > 0 ||
        (collections?.length ?? 0) > 0

      if (hasDbFilter) {
        let query = supabase
          .from("view_inventory_gallery")
          .select("id, serial_number, sku, product_name, size_label, quality_name, design_name, color_names, collection_name, construction_name, location_name")

        if (designs && designs.length > 0) {
          query = query.in("design_name", designs)
        }
        if (qualities && qualities.length > 0) {
          query = query.in("quality_name", qualities)
        }
        if (sizes && sizes.length > 0) {
          query = query.in("size_label", sizes)
        }
        if (collections && collections.length > 0) {
          query = query.in("collection_name", collections)
        }
        if (colors && colors.length > 0) {
          const colorFilters = colors.map((c: string) => `color_names.ilike.%${c}%`)
          query = query.or(colorFilters.join(","))
        }

        const { data: invMatches, error: invErr } = await query.limit(500)
        if (invErr) {
          console.warn("View inventory query failed:", invErr.message)
          return []
        }

        if (!invMatches || (invMatches as any[]).length === 0) return []

        const invMap = new Map(((invMatches as any[]) ?? []).map((inv: any) => [inv.id, inv as InventoryDetails]))
        const inventoryIds = Array.from(invMap.keys()).filter((id): id is string => Boolean(id))

        if (inventoryIds.length === 0) return []

        const { data: imageRefs, error: imgErr } = await (supabase
          .from("inventory_images" as any) as any)
          .select("storage_path, inventory_id")
          .in("inventory_id", inventoryIds)

        if (imgErr || !imageRefs || (imageRefs as any[]).length === 0) return []

        let matchedFiles: StorageFile[] = ((imageRefs as any[]) ?? []).map((ref: any) => {
          const storagePath: string = ref.storage_path
          const folder = folderFromStoragePath(storagePath)
          const details = invMap.get(ref.inventory_id) ?? null
          const fileName = storagePath.split("/").pop() ?? storagePath

          return {
            name: fileName,
            id: storagePath,
            created_at: null,
            storagePath,
            publicUrl: getPublicUrl("images", storagePath),
            folder,
            details,
          }
        })

        if (folders && folders.length > 0) {
          matchedFiles = matchedFiles.filter((f) => folders.includes(f.folder))
        }

        if (serialCounts && serialCounts.length > 0) {
          matchedFiles = matchedFiles.filter((f) =>
            matchesSerialCount(f.details?.serial_count ?? 1, serialCounts)
          )
        }

        return matchedFiles
      } else {
        // Folder-only or serialCounts-only filter or empty config
        const targetFolders = (folders && folders.length > 0 ? folders : [...ORGANIZED_FOLDERS, "Unorganized"]) as FolderKey[]
        const pages = await Promise.all(targetFolders.map((f) => fetchFolderPage(f, 0)))
        let allFiles = pages.flat()

        if (serialCounts && serialCounts.length > 0) {
          allFiles = allFiles.filter((f) =>
            matchesSerialCount(f.details?.serial_count ?? 1, serialCounts)
          )
        }

        return allFiles
      }
    },
    [fetchFolderPage]
  )

  useEffect(() => {
    if (!isCustomViewActive || !activeView?.config) return
    let cancelled = false

    const loadViewData = async () => {
      setIsRootViewLoading(true)
      try {
        const res = await fetchCustomViewFiles(activeView.config)
        if (!cancelled) setRootViewFiles(res)
      } catch (e) {
        if (!cancelled) console.error("Failed to load view files:", e)
      } finally {
        if (!cancelled) setIsRootViewLoading(false)
      }
    }

    loadViewData()

    return () => {
      cancelled = true
    }
  }, [isCustomViewActive, activeView?.id, activeView?.config, fetchCustomViewFiles])

  // Files shown: instant local matches appear immediately (zero-lag), then get merged with
  // the authoritative full-search results once that request resolves.
  const displayFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const baseFiles = isCustomViewActive ? rootViewFiles : currentFolder === "root" ? [] : files

    if (query === "") return baseFiles

    const localMatches = baseFiles.filter((f) => matchesQuery(f, query))
    if (searchResults === null) return localMatches

    const byPath = new Map(searchResults.map((f) => [f.storagePath, f]))
    localMatches.forEach((f) => {
      if (!byPath.has(f.storagePath)) byPath.set(f.storagePath, f)
    })
    return [...byPath.values()]
  }, [files, rootViewFiles, searchQuery, searchResults, currentFolder, isCustomViewActive])

  // ── One-time migration to automatically classify Unorganized files by filename pattern.
  //    Pages through storage directly (independent of any loaded state) so it scales to
  //    folders holding thousands of files. ──────────────────────────────────────────────
  const runMigration = async () => {
    setIsMigrating(true)
    toast.success("Starting asset organisation…")
    let migratedCount = 0
    let skippedCount = 0

    try {
      for (; ;) {
        const items = await listFolder("images", "media", { limit: PAGE_SIZE, offset: 0 })
        const unorganized = items.filter((i) => i.id !== null)
        if (unorganized.length === 0) break

        let movedAny = false
        for (const item of unorganized) {
          const folder = getFolderForFilename(item.name)
          const oldPath = `media/${item.name}`
          const newPath = `media/${folder}/${item.name}`

          try {
            await moveImage("images", oldPath, newPath)

            const newPublicUrl = getPublicUrl("images", newPath)
            const { error: dbErr1 } = await (supabase
              .from("inventory_images" as any) as any)
              .update({ storage_path: newPath, public_url: newPublicUrl })
              .eq("storage_path", oldPath)

            if (dbErr1) {
              const { error: dbErr2 } = await (supabase
                .from("inventory_images" as any) as any)
                .update({ public_url: newPublicUrl })
                .eq("storage_path", newPath)
              if (dbErr2) console.warn(`DB update failed for ${item.name}:`, dbErr2.message)
            }

            migratedCount++
            movedAny = true
          } catch (storageEx) {
            console.error(`Move failed for ${item.name}:`, storageEx)
            skippedCount++
          }
        }

        // Nothing moved this pass — avoid spinning forever on files that persistently fail
        if (!movedAny) break
      }

      if (skippedCount > 0) {
        toast.warning(`Organised ${migratedCount} files. ${skippedCount} could not be moved.`)
      } else {
        toast.success(`Successfully organised ${migratedCount} files into folders!`)
      }

      // Refresh whatever's currently on screen — the migration may have changed it
      if (currentFolder === "root") {
        setIsCountsLoading(true)
        const allKeys: FolderKey[] = [...ORGANIZED_FOLDERS, "Unorganized"]
        const entries = await Promise.all(
          allKeys.map(async (folder) => {
            const path = folder === "Unorganized" ? "media" : `media/${folder}`
            const items = await listFolder("images", path, { limit: COUNT_CAP })
            const count = folder === "Unorganized" ? items.filter((i) => i.id !== null).length : items.length
            return [folder, { count, capped: count === COUNT_CAP }] as const
          })
        )
        setFolderCounts(Object.fromEntries(entries))
        setIsCountsLoading(false)
      } else {
        setIsLoading(true)
        setHasMore(true)
        offsetRef.current = 0
        const page = await fetchFolderPage(currentFolder, 0)
        setFiles(page)
        offsetRef.current = page.length
        setHasMore(page.length === PAGE_SIZE)
        setIsLoading(false)
      }
    } catch (err) {
      console.error(err)
      toast.danger("Migration failed — check the console for details")
    } finally {
      setIsMigrating(false)
    }
  }

  // ── Uploads — optimistic: the tile (or count) appears immediately via a local object-URL
  //    preview, then gets swapped for the real record once the upload completes. ───────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list || list.length === 0) return

    let uploadedCount = 0
    toast.success(`Uploading ${list.length} file(s)…`)

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      const folder = getFolderForFilename(file.name)
      const path = `media/${folder}/${file.name}`
      const tempId = `temp-${i}-${file.name}`
      const previewUrl = URL.createObjectURL(file)
      const showLocally = currentFolder === folder

      const optimisticFile: StorageFile = {
        name: file.name,
        id: tempId,
        created_at: null,
        metadata: { size: file.size, mimetype: file.type },
        storagePath: path,
        publicUrl: previewUrl,
        folder,
        details: null,
      }

      if (showLocally) setFiles((prev) => [optimisticFile, ...prev])
      if (currentFolder === "root") {
        setFolderCounts((prev) => ({
          ...prev,
          [folder]: { count: (prev[folder]?.count ?? 0) + 1, capped: prev[folder]?.capped ?? false },
        }))
      }

      try {
        await uploadImage("images", path, file)

        let attachedDetails: InventoryDetails | null = null
        try {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
          const baseSP = nameWithoutExt.replace(/__\d+_+$/, "").replace(/\s*\(\d+\)$/, "").replace(/_\d+$/, "").trim()

          const { data: inv } = await (supabase.from("inventory" as any) as any).select("id").eq("serial_number", baseSP).maybeSingle()

          if (inv) {
            const publicUrl = getPublicUrl("images", path)
            await (supabase.from("inventory_images" as any) as any).insert({
              inventory_id: (inv as any).id,
              storage_path: path,
              public_url: publicUrl,
            })
            attachedDetails = (await resolveDetails([path]))[path] ?? null
          }
        } catch (assignErr) {
          console.warn("Failed auto-assigning image row:", assignErr)
        }

        const finalUrl = getPublicUrl("images", path)
        if (showLocally) {
          setFiles((prev) =>
            prev.map((f) => (f.id === tempId ? { ...f, id: null, publicUrl: finalUrl, details: attachedDetails } : f))
          )
        }
        URL.revokeObjectURL(previewUrl)
        uploadedCount++
      } catch (err) {
        console.error("Upload failed for file:", file.name, err)
        toast.danger(`Failed to upload ${file.name}`)
        URL.revokeObjectURL(previewUrl)

        if (showLocally) setFiles((prev) => prev.filter((f) => f.id !== tempId))
        if (currentFolder === "root") {
          setFolderCounts((prev) => ({
            ...prev,
            [folder]: { count: Math.max(0, (prev[folder]?.count ?? 1) - 1), capped: prev[folder]?.capped ?? false },
          }))
        }
      }
    }

    if (uploadedCount > 0) toast.success(`Uploaded ${uploadedCount} file(s) successfully!`)
    e.target.value = ""
  }

  const clearSelection = useCallback(() => {
    setSelectedFilesMap(new Map())
  }, [])


  // ── Bulk move — optimistic: a moved-out file disappears from current view immediately ─────
  const handleBulkMove = async (targetFolder: OrganizedFolder) => {
    const selectedList = Array.from(selectedFilesMap.values())
    const toMove = selectedList.filter((f) => f.folder !== targetFolder)
    if (toMove.length === 0) {
      clearSelection()
      return
    }

    toast.success(`Moving ${toMove.length} file(s) to ${targetFolder}…`)
    setFiles((prev) => prev.filter((f) => !toMove.some((m) => m.storagePath === f.storagePath)))
    clearSelection()

    let movedCount = 0
    const failed: StorageFile[] = []

    for (const file of toMove) {
      const oldPath = file.storagePath
      const newPath = `media/${targetFolder}/${file.name}`
      try {
        await moveImage("images", oldPath, newPath)
        const newPublicUrl = getPublicUrl("images", newPath)
        await (supabase.from("inventory_images" as any) as any)
          .update({ storage_path: newPath, public_url: newPublicUrl })
          .eq("storage_path", oldPath)
        movedCount++
      } catch (err) {
        console.error(`Move failed for ${file.name}:`, err)
        failed.push(file)
      }
    }

    if (movedCount > 0) toast.success(`Moved ${movedCount} file(s) to ${targetFolder} successfully!`)
    if (failed.length > 0) {
      toast.danger(`Failed to move ${failed.length} file(s) — restoring`)
      setFiles((prev) => [...failed, ...prev])
    }
  }


  // Checkbox management — toggle current view files or add to selectedFilesMap
  const toggleSelectAll = () => {
    const currentPaths = displayFiles.map((f) => f.storagePath)
    const allCurrentSelected = currentPaths.length > 0 && currentPaths.every((p) => selectedFilesMap.has(p))

    setSelectedFilesMap((prev) => {
      const next = new Map(prev)
      if (allCurrentSelected) {
        currentPaths.forEach((p) => next.delete(p))
      } else {
        displayFiles.forEach((f) => next.set(f.storagePath, f))
      }
      return next
    })
  }

  const toggleSelectRow = useCallback((storagePath: string) => {
    setSelectedFilesMap((prev) => {
      const next = new Map(prev)
      if (next.has(storagePath)) {
        next.delete(storagePath)
      } else {
        const found = displayFiles.find((f) => f.storagePath === storagePath)
        if (found) {
          next.set(storagePath, found)
        } else {
          next.set(storagePath, {
            name: storagePath.split("/").pop() ?? storagePath,
            id: storagePath,
            created_at: null,
            storagePath,
            publicUrl: getPublicUrl("images", storagePath),
            folder: folderFromStoragePath(storagePath),
            details: null,
          })
        }
      }
      return next
    })
  }, [displayFiles])

  // Visible tooltip parameters selection state (Product, Size, Quality, Design, Collection, Construction, Location)
  const [visibleTooltipParams, setVisibleTooltipParams] = useState<Set<string>>(
    () => new Set(TOOLTIP_PARAM_CONFIG.map((p) => p.key))
  )

  // Vector Similarity Search modal state
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false)
  const [similarityTargetFile, setSimilarityTargetFile] = useState<StorageFile | null>(null)

  // Bulk Move to Parameter modal state
  const [isParamMoveModalOpen, setIsParamMoveModalOpen] = useState(false)

  // Bulk Generate PPT modal state
  const [isPptModalOpen, setIsPptModalOpen] = useState(false)

  const handleParamMoveSuccess = useCallback(() => {
    clearSelection()
    router.refresh()
  }, [clearSelection, router])

  const handleFindSimilar = useCallback((file: StorageFile) => {
    setSimilarityTargetFile(file)
    setSimilarityModalOpen(true)
  }, [])

  // Stable-identity context value for the masonic render component — see AssetMasonryItem above.
  const masonryContextValue = useMemo<MasonryItemContextValue>(
    () => ({
      selectedNames,
      hasQuery,
      visibleTooltipParams,
      onToggleSelect: toggleSelectRow,
      onFindSimilar: handleFindSimilar,
    }),
    [selectedNames, hasQuery, visibleTooltipParams, toggleSelectRow, handleFindSimilar]
  )

  const showResultsGrid = hasQuery || currentFolder !== "root" || isCustomViewActive
  const showDashboardLoading = !hasQuery && currentFolder === "root" && !isCustomViewActive && isCountsLoading
  const showSearchLoading = (hasQuery && isSearchLoading && displayFiles.length === 0) || (currentFolder === "root" && isCustomViewActive && isRootViewLoading && displayFiles.length === 0)
  const showFolderLoading = !hasQuery && currentFolder !== "root" && isLoading

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/30">
      {/* Header bar */}
      <div className="px-6 py-4 bg-white border-b border-zinc-200/60 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Files Library</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onPress={() => fileInputRef.current?.click()}
            className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold shadow-xs flex items-center"
          >
            <UploadIcon />
            Upload assets
          </Button>
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* Toolbar / Search & Tooltip Parameters Toggle */}
      <div className="px-6 py-3 border-b border-zinc-200/60 flex items-center justify-between shrink-0 bg-white shadow-2xs gap-4">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          disableShortcut
          placeholder="Search files globally (by name, serial or SKU)..."
          className="w-full max-w-md"
        />

        <div className="flex items-center gap-3">
          {hasQuery && isSearchLoading && (
            <span className="text-[11px] text-indigo-500 font-semibold flex items-center gap-1.5 animate-pulse">
              Searching everything…
            </span>
          )}

          {/* Tooltip Parameters Dropdown Switcher */}
          <Popover>
            <Popover.Trigger>
              <button
                type="button"
                className="px-3 py-1.5 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-3xs"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 12h9"
                  />
                </svg>
                <span>Tooltip Fields ({visibleTooltipParams.size})</span>
              </button>
            </Popover.Trigger>
            <Popover.Content className="p-3 min-w-[210px] bg-white border border-zinc-200 rounded-2xl shadow-xl z-50">
              <Popover.Dialog className="flex flex-col gap-2 outline-none">
                <div className="text-xs font-bold text-zinc-900 pb-1.5 border-b border-zinc-100 flex items-center justify-between">
                  <span>Tooltip Fields</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (visibleTooltipParams.size === TOOLTIP_PARAM_CONFIG.length) {
                        setVisibleTooltipParams(new Set())
                      } else {
                        setVisibleTooltipParams(new Set(TOOLTIP_PARAM_CONFIG.map((p) => p.key)))
                      }
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    {visibleTooltipParams.size === TOOLTIP_PARAM_CONFIG.length ? "Hide All" : "Show All"}
                  </button>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  {TOOLTIP_PARAM_CONFIG.map((param) => {
                    const isChecked = visibleTooltipParams.has(param.key)
                    return (
                      <label
                        key={param.key}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-zinc-700 hover:bg-zinc-50 cursor-pointer font-medium select-none"
                      >
                        <span>{param.label}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setVisibleTooltipParams((prev) => {
                              const next = new Set(prev)
                              if (next.has(param.key)) next.delete(param.key)
                              else next.add(param.key)
                              return new Set(next)
                            })
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                        />
                      </label>
                    )
                  })}
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
      </div>

      {/* Views Bar */}
      <div className="px-6 pt-3 shrink-0">
        <ViewsBar />
      </div>

      {/* Migration Alert banner if root files exist */}
      {hasUnorganized && !hasQuery && (
        <div className="mx-6 mt-4 p-4 bg-amber-50/80 border border-amber-200/60 rounded-xl flex items-center justify-between shadow-3xs animate-pulse">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-amber-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                Unorganized files detected ({folderCounts["Unorganized"]?.count ?? 0}
                {folderCounts["Unorganized"]?.capped ? "+" : ""})
              </h4>
              <p className="text-xs text-amber-700 mt-0.5 font-medium">Reorganise root files into folder structures based on their numeric naming patterns automatically.</p>
            </div>
          </div>
          <Button
            isDisabled={isMigrating}
            onPress={runMigration}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 h-9 rounded-xl transition-all cursor-pointer shadow-sm"
          >
            {isMigrating ? "Organising..." : "Organise assets"}
          </Button>
        </div>
      )}

      {/* Main Content View — a single ScrollShadow region so the whole library scrolls as
          one page, with HeroUI's fade shadows cueing when there's more content above/below. */}
      <ScrollShadow ref={setScrollElement} className="flex-1 py-6" offset={20}>
        {showDashboardLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-zinc-400 font-medium">Loading asset folders…</div>
        ) : !showResultsGrid ? (
          /* ────────────────────────────────────────────────────────── */
          /* Folder Overview Dashboard                                  */
          /* ────────────────────────────────────────────────────────── */
          <div className="px-6 flex flex-col gap-6">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Asset Folders</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Folder Cards */}
              {(
                [
                  { name: "Head", desc: "Head shot images (1)", color: "bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100/50" },
                  { name: "Floor", desc: "Floor shot images (2)", color: "bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100/50" },
                  { name: "Corner", desc: "Corner shot images (3)", color: "bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100/50" },
                  { name: "Closeup", desc: "Closeup details (4)", color: "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50" },
                  { name: "Tag", desc: "Original tag shots", color: "bg-purple-50 border-purple-100 text-purple-700 hover:bg-purple-100/50" },
                ] as const
              ).map((f) => (
                <div
                  key={f.name}
                  onClick={() => goToFolder(f.name)}
                  className={cn(
                    "p-5 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition-all cursor-pointer flex flex-col gap-4 shadow-3xs group select-none hover:-translate-y-0.5 duration-200"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border transition-colors", f.color)}>
                    <FolderIcon />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 group-hover:text-indigo-600 transition-colors leading-tight">{f.name}</h3>
                    <p className="text-[11px] text-zinc-400 font-semibold mt-1 uppercase tracking-wide">
                      {folderCounts[f.name]?.count ?? 0}
                      {folderCounts[f.name]?.capped ? "+" : ""} Assets
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{f.desc}</p>
                  </div>
                </div>
              ))}

              {/* Unorganized Folder - only show if there are files in it */}
              {hasUnorganized && (
                <div
                  onClick={() => goToFolder("Unorganized")}
                  className="p-5 rounded-2xl border border-amber-200 bg-amber-50/20 hover:border-amber-300 transition-all cursor-pointer flex flex-col gap-4 shadow-3xs group select-none hover:-translate-y-0.5 duration-200"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-amber-200 bg-amber-50 text-amber-700">
                    <FolderIcon />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 group-hover:text-amber-600 transition-colors leading-tight">Unorganized</h3>
                    <p className="text-[11px] text-amber-600 font-semibold mt-1 uppercase tracking-wide">
                      {folderCounts["Unorganized"]?.count ?? 0}
                      {folderCounts["Unorganized"]?.capped ? "+" : ""} Assets
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">Pending migration folder</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : !isMounted || showSearchLoading || showFolderLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-zinc-400 font-medium">
            {hasQuery ? "Searching…" : "Loading folder contents…"}
          </div>
        ) : (
          /* ────────────────────────────────────────────────────────── */
          /* Grid View (Folder drilldown / Search)                      */
          /* ────────────────────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            {/* Folder Header Breadcrumb */}
            <div className="px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                {currentFolder === "root" ? (
                  <span className="text-zinc-900 font-bold flex items-center gap-1.5">
                    {hasQuery ? (
                      `Search results for "${searchQuery}" (Global)`
                    ) : isCustomViewActive ? (
                      `View: "${activeView?.name}" (${displayFiles.length} item${displayFiles.length !== 1 ? "s" : ""})`
                    ) : (
                      "Folders"
                    )}
                  </span>
                ) : (
                  <>
                    <button onClick={() => goToFolder("root")} className="hover:text-indigo-600 transition-colors cursor-pointer">
                      Folders
                    </button>
                    <ChevronRightIcon />
                    <span className="text-zinc-900 font-bold">{currentFolder}</span>
                    {isCustomViewActive && (
                      <>
                        <ChevronRightIcon />
                        <span className="text-indigo-600 font-bold">View: &quot;{activeView?.name}&quot;</span>
                      </>
                    )}
                    {hasQuery && (
                      <>
                        <ChevronRightIcon />
                        <span className="text-zinc-900 font-bold">Search results for &quot;{searchQuery}&quot;</span>
                      </>
                    )}
                  </>
                )}
              </div>

              {currentFolder !== "root" && (
                <Button
                  onPress={() => goToFolder("root")}
                  className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-[11px] px-3 h-8 cursor-pointer font-bold shadow-3xs flex items-center gap-1.5"
                >
                  <ArrowLeftIcon />
                  Back to folders
                </Button>
              )}
            </div>

            {displayFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-sm text-zinc-400 py-12 font-medium">No images found matching criteria</div>
            ) : (
              <div className="px-6 flex flex-col gap-3">
                {/* Select All Control */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200/50">
                  <Checkbox isSelected={selectedNames.size === displayFiles.length && displayFiles.length > 0} onChange={toggleSelectAll} aria-label="Select all assets">
                    <Checkbox.Content className="flex items-center gap-2 cursor-pointer">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Select all</span>
                    </Checkbox.Content>
                  </Checkbox>
                  <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                    Showing {displayFiles.length} file{displayFiles.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Virtualized Pinterest-style masonry — only assets within the ScrollShadow's
                    visible range (+ overscan) are ever mounted, so tile count no longer drives
                    scroll cost, while each tile keeps its image's real, uncropped aspect ratio. */}
                <MasonryItemContext.Provider value={masonryContextValue}>
                  <MasonryGrid
                    items={displayFiles}
                    scrollElement={scrollElement}
                    itemKey={(file, index) => file?.storagePath || file?.name || `file_${index}`}
                    render={AssetMasonryItem}
                    columnWidth={230}
                    columnGutter={16}
                  />
                </MasonryItemContext.Provider>

                {!hasQuery && !isCustomViewActive && hasMore && displayFiles.length >= 60 && (
                  <div className="flex items-center justify-center pt-2">
                    <Button
                      onPress={loadMore}
                      isDisabled={isLoadingMore}
                      className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-5 h-9 cursor-pointer font-bold shadow-3xs"
                    >
                      {isLoadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollShadow>

      {/* Bulk Actions Panel at Bottom */}
      {selectedFilesMap.size > 0 && (
        <div className="border-t border-zinc-200 bg-zinc-900 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-lg z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {selectedFilesMap.size} File{selectedFilesMap.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer underline"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Move to... Dropdown with Two Main Categories */}
            <Dropdown>
              <Dropdown.Trigger className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-xl text-xs px-4 h-9 cursor-pointer font-bold transition-all shadow-xs flex items-center gap-1.5">
                <span>Move to...</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </Dropdown.Trigger>
              <Dropdown.Popover className="rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl p-1.5 z-50 text-white min-w-[220px]">
                <Dropdown.Menu aria-label="Select move target type">
                  <Dropdown.Item
                    id="move-to-parameter-dropdown-item"
                    onClick={() => setIsParamMoveModalOpen(true)}
                    onPress={() => setIsParamMoveModalOpen(true)}
                    className="hover:bg-indigo-600/40 text-indigo-200 hover:text-white px-3 py-2 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-2"
                  >
                    <span>🏷️ Product Parameter (Design, Collection, Location...)</span>
                  </Dropdown.Item>

                  <Dropdown.Item
                    id="content-folder-header"
                    isDisabled
                    className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-t border-zinc-800 mt-1"
                  >
                    <span>📂 Content Folder Destination:</span>
                  </Dropdown.Item>

                  {(
                    [
                      { key: "Head", label: "Head Shot" },
                      { key: "Floor", label: "Floor Shot" },
                      { key: "Corner", label: "Corner Shot" },
                      { key: "Closeup", label: "Closeup Detail" },
                      { key: "Tag", label: "Tag Shot" },
                    ] as const
                  ).map((dest) => (
                    <Dropdown.Item key={dest.key} onPress={() => handleBulkMove(dest.key)} className="hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer pl-6">
                      {dest.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            {/* Dedicated Shift Details / Move to Parameter Action Button */}
            <Button
              onPress={() => setIsParamMoveModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m-3-15L21 6m0 0l-4.5 4.5M21 6H7.5" />
              </svg>
              <span>Shift Details / Move ({selectedFilesMap.size})</span>
            </Button>

            {/* Generate PPT Action Button */}
            <Button
              onPress={() => setIsPptModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span>Generate PPT ({selectedFilesMap.size})</span>
            </Button>


          </div>
        </div>
      )}

      {/* Bulk Move to Parameter Modal */}
      <BulkMoveParameterModal
        isOpen={isParamMoveModalOpen}
        onClose={() => setIsParamMoveModalOpen(false)}
        selectedFiles={Array.from(selectedFilesMap.values())}
        onSuccess={handleParamMoveSuccess}
      />

      {/* Full Screen PPT Generator Modal Overlay */}
      <FullPptGeneratorModal
        isOpen={isPptModalOpen}
        onClose={() => setIsPptModalOpen(false)}
        selectedFiles={Array.from(selectedFilesMap.values())}
      />
      {/* Vector Similarity Modal */}
      <SimilarItemsModal
        isOpen={similarityModalOpen}
        onClose={() => setSimilarityModalOpen(false)}
        targetImageUrl={similarityTargetFile?.publicUrl}
        targetTitle={similarityTargetFile?.name}
        targetMetadata={
          similarityTargetFile?.details
            ? {
              product_name: similarityTargetFile.details.product_name,
              sku: similarityTargetFile.details.sku,
              quality_name: similarityTargetFile.details.quality_name,
              design_name: similarityTargetFile.details.design_name,
              size_label: similarityTargetFile.details.size_label,
              location_name: similarityTargetFile.details.location_name,
            }
            : undefined
        }
      />
    </div>
  )
}
