"use client"

import { useEffect, useRef, useState } from "react"
import { Separator, Spinner, Typography, toast } from "@heroui/react"
import ImageSwiper from "@/components/shared/ImageSwiper"
import { cn } from "@/lib/utils"
import { useInventory, type InventoryRowWithDetails } from "@/hooks/useInventory"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import PriceGrid from "./PriceGrid"

interface NestedInventoryTableProps {
  catalogId: string
  onAddInventory: (catalogId: string) => void
  onEditInventory: (catalogId: string, row: InventoryRowWithDetails) => void
  newRow?: InventoryRowWithDetails | null
  updatedRow?: InventoryRowWithDetails | null
  /** Whole product has been discontinued — dims out the pricing grid entirely. */
  isDiscontinued?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)

const TagIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
)

const LABEL_COL_WIDTH = 110
const ITEM_COL_WIDTH = 230
const ADD_COL_WIDTH = 72

export default function NestedInventoryTable({
  catalogId,
  onAddInventory,
  onEditInventory,
  newRow,
  updatedRow,
  isDiscontinued = false,
}: NestedInventoryTableProps) {
  const { rows, isLoading, error, fetchInventory, addRow, updateRow, toggleSold } = useInventory(catalogId)

  const handleToggleSold = async (row: InventoryRowWithDetails) => {
    try {
      await toggleSold(row.id, !row.is_sold)
      toast.success(row.is_sold ? "Marked as in stock" : "Marked as sold")
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "Failed to update sold status")
    }
  }

  // Resizable split between the inventory grid (left) and the pricing grid (right).
  const [leftWidthPct, setLeftWidthPct] = useState(62)
  const splitRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (!draggingRef.current || !splitRef.current) return
      const rect = splitRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setLeftWidthPct(Math.min(70, Math.max(30, pct)))
    }
    function handleUp() {
      draggingRef.current = false
    }
    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [])

  // Mounted only while the parent catalog row is expanded — fetch immediately.
  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  // Optimistically add new rows pushed from parent
  useEffect(() => {
    if (newRow) {
      addRow(newRow)
    }
  }, [newRow]) // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistically update existing rows pushed from parent
  useEffect(() => {
    if (updatedRow) {
      updateRow(updatedRow)
    }
  }, [updatedRow]) // eslint-disable-line react-hooks/exhaustive-deps

  const gridTemplateColumns = `${LABEL_COL_WIDTH}px repeat(${rows.length}, ${ITEM_COL_WIDTH}px) ${ADD_COL_WIDTH}px`

  return (
    <div className="border-t border-zinc-100/80 bg-zinc-50/50 border-l-3 border-l-indigo-500/80">
      <div className="pl-14 pr-6 py-3">
        {error ? (
          <div className="py-4 text-center">
            <Typography.Paragraph size="xs" className="text-red-500">Failed to load inventory</Typography.Paragraph>
          </div>
        ) : isLoading ? (
          <div className="py-6 flex items-center justify-center gap-2">
            <Spinner size="sm" color="accent" />
            <Typography.Paragraph size="xs" className="text-zinc-500 font-medium">Loading pieces…</Typography.Paragraph>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-4 text-center border border-zinc-200/50 rounded-xl bg-white">
            <Typography.Paragraph size="xs" className="text-zinc-400">
              No inventory pieces yet
            </Typography.Paragraph>
          </div>
        ) : (
          <div ref={splitRef} className="flex items-start w-full">
            <div className="overflow-x-auto shrink-0" style={{ width: `${leftWidthPct}%` }}>
              <div className="w-fit rounded-xl border border-zinc-200/50 bg-white">
                <div className="inline-grid" style={{ gridTemplateColumns }}>
              {/* Photo row */}
              <div
                className="sticky left-0 z-10 flex items-center bg-zinc-50/90 backdrop-blur-sm px-3 py-2 border-b border-r border-zinc-100"
                style={{ gridColumn: 1, gridRow: 1 }}
              >
                <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">Photo</Typography.Paragraph>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn("flex items-center justify-center p-2.5 border-b border-zinc-100", i < rows.length - 1 && "border-r")}
                  style={{ gridColumn: i + 2, gridRow: 1 }}
                >
                  <ImageSwiper
                    mode="natural"
                    images={(row.image_urls.length ? row.image_urls : row.first_image_url ? [row.first_image_url] : []).map(url => getThumbnailUrl(url, { width: 300, quality: 75 }))}
                    alt={row.serial_number}
                    autoPlayMs={4000}
                    progressPosition="bottom"
                    controlsSize="sm"
                    className="w-full rounded-lg overflow-hidden"
                    onImageClick={(url) => window.open(getThumbnailUrl(url), "_blank", "noopener,noreferrer")}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => onAddInventory(catalogId)}
                className="flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/60 transition-all cursor-pointer border-b border-l border-dashed border-zinc-200 hover:border-indigo-300"
                style={{ gridColumn: rows.length + 2, gridRow: "1 / span 5" }}
                aria-label="Add inventory piece"
              >
                <PlusIcon />
                <span className="text-[10px] font-medium [writing-mode:vertical-rl]">Add</span>
              </button>

              {/* SP Number row */}
              <div
                className="sticky left-0 z-10 flex items-center bg-zinc-50/90 backdrop-blur-sm px-3 py-2 border-b border-r border-zinc-100"
                style={{ gridColumn: 1, gridRow: 2 }}
              >
                <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">SP Number</Typography.Paragraph>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn("flex items-center justify-center px-3 py-2 border-b border-zinc-100", i < rows.length - 1 && "border-r")}
                  style={{ gridColumn: i + 2, gridRow: 2 }}
                >
                  <Typography.Code weight="medium" className="text-sm text-zinc-800">{row.serial_number}</Typography.Code>
                </div>
              ))}

              {/* Location row */}
              <div
                className="sticky left-0 z-10 flex items-center bg-zinc-50/90 backdrop-blur-sm px-3 py-2 border-b border-r border-zinc-100"
                style={{ gridColumn: 1, gridRow: 3 }}
              >
                <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">Location</Typography.Paragraph>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn("flex flex-col items-center justify-center px-3 py-2 border-b border-zinc-100 text-center", i < rows.length - 1 && "border-r")}
                  style={{ gridColumn: i + 2, gridRow: 3 }}
                >
                  <Typography.Paragraph size="sm" className="text-zinc-700">{row.location_name ?? "—"}</Typography.Paragraph>
                  {row.country && <Typography.Paragraph size="xs" className="text-zinc-400">{row.country}</Typography.Paragraph>}
                </div>
              ))}

              {/* Created row */}
              <div
                className="sticky left-0 z-10 flex items-center bg-zinc-50/90 backdrop-blur-sm px-3 py-2 border-b border-r border-zinc-100"
                style={{ gridColumn: 1, gridRow: 4 }}
              >
                <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">Created</Typography.Paragraph>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn("flex items-center justify-center px-3 py-2 border-b border-zinc-100", i < rows.length - 1 && "border-r")}
                  style={{ gridColumn: i + 2, gridRow: 4 }}
                >
                  <Typography.Paragraph size="xs" className="text-zinc-500">{formatDate(row.created_at)}</Typography.Paragraph>
                </div>
              ))}

              {/* Actions row */}
              <div
                className="sticky left-0 z-10 flex items-center bg-zinc-50/90 backdrop-blur-sm px-3 py-2 border-r border-zinc-100"
                style={{ gridColumn: 1, gridRow: 5 }}
              >
                <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">Actions</Typography.Paragraph>
              </div>
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className={cn("flex items-center justify-center px-3 py-2 border-zinc-100", i < rows.length - 1 && "border-r")}
                  style={{ gridColumn: i + 2, gridRow: 5 }}
                >
                  <button
                    type="button"
                    onClick={() => onEditInventory(catalogId, row)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all cursor-pointer"
                    aria-label="Edit inventory piece"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSold(row)}
                    className={cn(
                      "p-1.5 rounded-lg transition-all cursor-pointer",
                      row.is_sold ? "text-amber-600 hover:bg-amber-50" : "text-zinc-400 hover:text-amber-600 hover:bg-amber-50/50"
                    )}
                    aria-label={row.is_sold ? "Mark as in stock" : "Mark as sold"}
                    title={row.is_sold ? "Mark as in stock" : "Mark as sold"}
                  >
                    <TagIcon />
                  </button>
                </div>
              ))}
                </div>
              </div>
            </div>

            <Separator
              orientation="vertical"
              onPointerDown={() => { draggingRef.current = true }}
              className="w-1 shrink-0 self-stretch cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 transition-colors mx-2 rounded-full"
              aria-label="Resize inventory and pricing panels"
            />

            <div className="overflow-x-auto flex-1 min-w-0">
              <PriceGrid catalogId={catalogId} rows={rows} isDiscontinued={isDiscontinued} />
            </div>
          </div>
        )}

        {rows.length === 0 && !isLoading && !error && (
          <button
            type="button"
            onClick={() => onAddInventory(catalogId)}
            className="mt-2 mb-1 w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/60 transition-all text-xs font-medium border border-dashed border-zinc-200 hover:border-indigo-300 cursor-pointer bg-white"
          >
            <PlusIcon />
            Add Inventory
          </button>
        )}
      </div>
    </div>
  )
}
