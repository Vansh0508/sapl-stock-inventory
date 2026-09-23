"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Checkbox, Modal, Switch, toast, Select, ListBox, ListBoxItem, ScrollShadow, Typography, Popover, SearchField, EmptyState } from "@heroui/react"
import Image from "next/image"
import { supabase } from "@/lib/supabase/client"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import { useCatalogStore } from "@/stores/catalogStore"
import { useViewStore } from "@/stores/viewStore"
import ToolbarControl from "@/components/ui/ToolbarControl"
import { HideColumnsPanel, ColumnsIcon } from "@/components/shared/Toolbar"
import { cn } from "@/lib/utils"
import type { Database } from "@/types/database.types"
import type { ToolbarColumn } from "@/types/app.types"

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type CatalogFullRow = Database["public"]["Views"]["view_catalog_full"]["Row"] & {
  id: string
  collection_id?: string | null
  construction_id?: string | null
}

interface InventoryItem {
  id: string
  serial_number: string
  catalog_id: string
  location_id: string
  created_at: string
  location_name: string | null
  country: string | null
  first_image_url: string | null
}

interface CatalogEdits {
  collection_id?: string | null
  construction_id?: string | null
  is_active?: boolean
  is_verified?: boolean
}

interface InventoryEdits {
  serial_number?: string
  location_id?: string
}

interface BulkEdits {
  catalog: Record<string, CatalogEdits>
  inventory: Record<string, InventoryEdits>
}

interface OptionItem {
  id: string
  label: string
}

interface ColumnConfig {
  id: string
  label: string
  editableFor: "parent" | "child" | "none"
  width: number
}

interface GridRow {
  type: "parent" | "child"
  id: string // catalogId or inventoryId
  parentId?: string // catalogId of the parent
  sku: string
  displayTitle: string
  parentData?: CatalogFullRow
  childData?: InventoryItem
}

// ──────────────────────────────────────────────────────────
// Icons / Placeholders
// ──────────────────────────────────────────────────────────

const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
)

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
  </svg>
)

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
)

const PhotoPlaceholderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
  </svg>
)

const StrikethroughIcon = () => (
  <div className="w-10 h-3 bg-zinc-200/70 rounded-full mx-auto" title="Not Applicable / Empty" />
)

const ALL_COLUMNS: ColumnConfig[] = [
  // Parent read-only metadata columns
  { id: "product_name", label: "Product Type", editableFor: "none", width: 140 },
  { id: "quality_name", label: "Quality", editableFor: "none", width: 120 },
  { id: "design_name", label: "Design", editableFor: "none", width: 120 },
  { id: "color_names", label: "Colors", editableFor: "none", width: 160 },
  { id: "size_label", label: "Size", editableFor: "none", width: 100 },
  { id: "fiber_configuration", label: "Fiber Config", editableFor: "none", width: 180 },
  
  // Parent editable columns
  { id: "is_active", label: "Status", editableFor: "parent", width: 120 },
  { id: "is_verified", label: "Verification", editableFor: "parent", width: 130 },
  { id: "collection_id", label: "Collection", editableFor: "parent", width: 180 },
  { id: "construction_id", label: "Construction", editableFor: "parent", width: 180 },
  
  // Child editable columns
  { id: "serial_number", label: "SP Number", editableFor: "child", width: 140 },
  { id: "location_id", label: "Location", editableFor: "child", width: 200 },
]

const BULK_EDIT_TOOLBAR_COLUMNS: ToolbarColumn[] = ALL_COLUMNS.map((col) => ({
  id: col.id,
  label: col.label,
  type: col.id === "is_active" || col.id === "is_verified" ? "boolean" : "text",
  hideable: true,
}))

// ──────────────────────────────────────────────────────────
// Reusable Hero UI Cell Select component
// ──────────────────────────────────────────────────────────

interface GridSelectProps {
  value: string | null
  onChange: (val: string | null) => void
  options: OptionItem[]
  placeholder?: string
  className?: string
  triggerClassName?: string
}

function GridSelect({
  value,
  onChange,
  options,
  placeholder = "— None —",
  className,
  triggerClassName,
}: GridSelectProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options
    const query = searchQuery.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(query))
  }, [options, searchQuery])

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.id === value)?.label || placeholder
  }, [options, value, placeholder])

  return (
    <Popover>
      <Popover.Trigger>
        <button
          type="button"
          className={cn(
            "w-full h-full bg-transparent border-0 outline-hidden flex items-center justify-between text-xs px-0.5 py-1 text-left cursor-pointer hover:bg-zinc-50/40 rounded-none shadow-none focus:bg-white min-h-[36px]",
            triggerClassName
          )}
        >
          <span className="truncate flex-1 text-zinc-800">{selectedLabel}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-zinc-400 shrink-0 ml-1"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Content className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[200px] z-50 p-0">
        <Popover.Dialog className="outline-hidden flex flex-col">
          <SearchField
            autoFocus
            aria-label="Search options"
            value={searchQuery}
            onChange={setSearchQuery}
            className="border-b border-zinc-100"
          >
            <SearchField.Group className="px-2.5 py-2 flex items-center gap-1.5">
              <SearchField.Input placeholder="Search…" className="text-xs outline-hidden" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ScrollShadow hideScrollBar className="max-h-60 py-1">
            <ListBox
              selectionMode="single"
              selectedKeys={value ? new Set([value]) : new Set()}
              onSelectionChange={(keys) => {
                const arr = Array.from(keys).map(String)
                onChange(arr[0] || null)
              }}
              renderEmptyState={() => (
                <EmptyState className="px-3 py-4 text-xs text-zinc-400 text-center">No results</EmptyState>
              )}
              aria-label="Selector dropdown list"
            >
              {filteredOptions.map((o) => (
                <ListBoxItem
                  key={o.id}
                  id={o.id}
                  textValue={o.label}
                  className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
                >
                  {o.label}
                </ListBoxItem>
              ))}
            </ListBox>
          </ScrollShadow>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

// ──────────────────────────────────────────────────────────
// Reusable Status Dropdown switcher component
// ──────────────────────────────────────────────────────────

interface StatusSelectProps {
  value: boolean
  onChange: (val: boolean) => void
  placeholder?: string
  className?: string
  triggerClassName?: string
}

function StatusSelect({
  value,
  onChange,
  placeholder = "Select status",
  className,
  triggerClassName,
}: StatusSelectProps) {
  return (
    <Select
      selectedKey={value ? "true" : "false"}
      onSelectionChange={(key) => onChange(key === "true")}
      placeholder={placeholder}
      className={cn("w-full h-full", className)}
      aria-label="Status select"
    >
      <Select.Trigger
        className={cn(
          "w-full bg-transparent border-0 outline-hidden flex items-center justify-between text-xs px-2 py-1 text-left cursor-pointer hover:bg-zinc-100/40 rounded-none shadow-none focus:bg-white h-full min-h-[36px]",
          triggerClassName
        )}
      >
        <Select.Value className="text-zinc-800 truncate flex-1 block">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border",
              value
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                : "bg-zinc-100 text-zinc-500 border-zinc-200/60"
            )}
          >
            {value ? "Active" : "Discontinued"}
          </span>
        </Select.Value>
        <Select.Indicator className="text-zinc-400 shrink-0 ml-1.5" />
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[140px] z-50">
        <ScrollShadow hideScrollBar className="py-1">
          <ListBox aria-label="Status options">
            <ListBoxItem
              key="true"
              id="true"
              className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
            >
              Active
            </ListBoxItem>
            <ListBoxItem
              key="false"
              id="false"
              className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
            >
              Discontinued
            </ListBoxItem>
          </ListBox>
        </ScrollShadow>
      </Select.Popover>

    </Select>
  )
}

// ──────────────────────────────────────────────────────────
// Reusable Verification Dropdown switcher component
// ──────────────────────────────────────────────────────────

function VerifiedSelect({
  value,
  onChange,
  className,
  triggerClassName,
}: StatusSelectProps) {
  return (
    <Select
      selectedKey={value ? "true" : "false"}
      onSelectionChange={(key) => onChange(key === "true")}
      className={cn("w-full h-full", className)}
      aria-label="Verification select"
    >
      <Select.Trigger
        className={cn(
          "w-full bg-transparent border-0 outline-hidden flex items-center justify-between text-xs px-2 py-1 text-left cursor-pointer hover:bg-zinc-100/40 rounded-none shadow-none focus:bg-white h-full min-h-[36px]",
          triggerClassName
        )}
      >
        <Select.Value className="text-zinc-800 truncate flex-1 block">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border",
              value
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                : "bg-zinc-100 text-zinc-500 border-zinc-200/60"
            )}
          >
            {value ? "Verified" : "Unverified"}
          </span>
        </Select.Value>
        <Select.Indicator className="text-zinc-400 shrink-0 ml-1.5" />
      </Select.Trigger>
      <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[140px] z-50">
        <ScrollShadow hideScrollBar className="py-1">
          <ListBox aria-label="Verification options">
            <ListBoxItem
              key="true"
              id="true"
              className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
            >
              Verified
            </ListBoxItem>
            <ListBoxItem
              key="false"
              id="false"
              className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
            >
              Unverified
            </ListBoxItem>
          </ListBox>
        </ScrollShadow>
      </Select.Popover>
    </Select>
  )
}

// ──────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────

export default function BulkEditPage() {
  const router = useRouter()
  const { selectedIds, deselectAll } = useCatalogStore()
  
  // Zustand column visibility bindings
  const hiddenColumns = useViewStore((s) => s.hiddenColumns)
  const setHiddenColumns = useViewStore((s) => s.setHiddenColumns)

  const [rows, setRows] = useState<CatalogFullRow[]>([])
  const [inventories, setInventories] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set())

  // Dictionaries
  const [collections, setCollections] = useState<OptionItem[]>([])
  const [constructions, setConstructions] = useState<OptionItem[]>([])
  const [locations, setLocations] = useState<OptionItem[]>([])

  // Collapsed parents state
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set())

  // Excel-like edits state
  const initialEdits: BulkEdits = { catalog: {}, inventory: {} }
  const [edits, setEdits] = useState<BulkEdits>(initialEdits)

  // Undo/Redo stack
  const [history, setHistory] = useState<BulkEdits[]>([initialEdits])
  const [historyIndex, setHistoryIndex] = useState(0)

  // Active Focused cell state
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; rowType: "parent" | "child"; colId: string } | null>(null)

  // Drag to Fill state
  const [dragState, setDragState] = useState<{
    isDragging: boolean
    startRowId: string
    startRowType: "parent" | "child"
    colId: string
    currentRowId: string
    currentRowType: "parent" | "child"
  } | null>(null)

  // Local Copy state
  const [copiedValue, setCopiedValue] = useState<{
    value: any
    colId: string
    rowType: "parent" | "child"
  } | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const hasUnsavedChanges = Object.keys(edits.catalog).length > 0 || Object.keys(edits.inventory).length > 0

  // Hide read-only metadata columns by default on entering bulk edit page to keep layout clean
  useEffect(() => {
    const defaultHidden = ["product_name", "quality_name", "design_name", "color_names", "size_label", "fiber_configuration"]
    const nextHidden = new Set(useViewStore.getState().hiddenColumns)
    let updated = false
    for (const h of defaultHidden) {
      if (!nextHidden.has(h)) {
        nextHidden.add(h)
        updated = true
      }
    }
    if (updated) {
      setHiddenColumns(Array.from(nextHidden))
    }
  }, [setHiddenColumns])

  // Column widths are local to this page (not shared/persisted via Zustand) —
  // resizing here must not bleed into other tables' column widths elsewhere.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  // Resolve visible columns using Zustand hiddenColumns and local columnWidths
  const visibleCols = useMemo(() => {
    return ALL_COLUMNS.filter((col) => !hiddenColumns.includes(col.id)).map((col) => ({
      ...col,
      width: columnWidths[col.id] ?? col.width
    }))
  }, [hiddenColumns, columnWidths])

  const visibleColIds = useMemo(() => {
    return visibleCols.map((c) => c.id)
  }, [visibleCols])

  // Resizing state for columns in spreadsheet
  const [resizingCol, setResizingCol] = useState<{ colId: string; startX: number; startWidth: number } | null>(null)

  const handleResizeStart = (e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const colDef = visibleCols.find((c) => c.id === colId)
    const currentWidth = colDef?.width ?? 120
    setResizingCol({
      colId,
      startX: e.clientX,
      startWidth: currentWidth
    })
  }

  useEffect(() => {
    if (!resizingCol) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizingCol.startX
      const nextWidth = Math.max(60, resizingCol.startWidth + delta)
      setColumnWidths((prev) => ({ ...prev, [resizingCol.colId]: nextWidth }))
    }

    const handleMouseUp = () => {
      setResizingCol(null)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizingCol])

  // Total table minWidth calculation
  const totalTableWidth = useMemo(() => {
    // 256px is the width of sticky left column
    const colsWidth = visibleCols.reduce((sum, col) => sum + (col.width ?? 120), 0)
    return colsWidth + 256
  }, [visibleCols])

  // Redirect if no selection
  useEffect(() => {
    if (selectedIds.size === 0) {
      router.replace("/products")
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load rows + child inventory pieces + dictionary lookups
  useEffect(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    setIncludedIds(new Set(ids))

    const chunkSize = 100
    const catalogPromises = []
    const catalogRawPromises = []
    const inventoryPromises = []

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      catalogPromises.push((supabase.from("view_catalog_full" as any) as any).select("*").in("id", chunk))
      catalogRawPromises.push((supabase.from("catalog" as any) as any).select("id, collection_id, construction_id").in("id", chunk))
      inventoryPromises.push(
        (supabase.from("inventory" as any) as any).select(`
          id,
          serial_number,
          catalog_id,
          location_id,
          created_at,
          locations(location_name, country),
          inventory_images(public_url, sort_order)
        `).in("catalog_id", chunk)
      )
    }

    Promise.all([
      Promise.all(catalogPromises),
      Promise.all(catalogRawPromises),
      Promise.all(inventoryPromises),
      supabase.from("collections").select("id, collection_name").order("collection_name"),
      supabase.from("constructions").select("id, construction_name").order("construction_name"),
      supabase.from("locations").select("id, location_name, country").order("location_name"),
    ]).then(([catalogResults, catalogRawResults, inventoryResults, colData, conData, locData]) => {
      const catalogData = { data: [] as any[] }
      for (const res of catalogResults) {
        if (res.error) throw res.error
        if (res.data) catalogData.data.push(...res.data)
      }

      const catalogRaw = { data: [] as any[] }
      for (const res of catalogRawResults) {
        if (res.error) throw res.error
        if (res.data) catalogRaw.data.push(...res.data)
      }

      const inventoryData = { data: [] as any[] }
      for (const res of inventoryResults) {
        if (res.error) throw res.error
        if (res.data) inventoryData.data.push(...res.data)
      }

      const catalogMap = new Map((catalogRaw.data ?? []).map((c) => [c.id, c]))
      const loadedCatalog = ((catalogData.data ?? []) as CatalogFullRow[]).filter((r) => r.id !== null).map((r) => {
        const raw = catalogMap.get(r.id)
        return {
          ...r,
          collection_id: raw?.collection_id ?? null,
          construction_id: raw?.construction_id ?? null,
        }
      })
      
      const loadedInventory: InventoryItem[] = (inventoryData.data ?? []).map((row: any) => {
        const images = [...(row.inventory_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)
        const loc = row.locations as { location_name: string; country: string } | null
        return {
          id: row.id,
          serial_number: row.serial_number,
          catalog_id: row.catalog_id,
          location_id: row.location_id,
          created_at: row.created_at,
          location_name: loc?.location_name ?? null,
          country: loc?.country ?? null,
          first_image_url: images[0]?.public_url ?? null,
        }
      })

      setRows(loadedCatalog)
      setInventories(loadedInventory)

      setCollections(((colData.data as any[]) ?? []).map((c) => ({ id: c.id, label: c.collection_name })))
      setConstructions(((conData.data as any[]) ?? []).map((c) => ({ id: c.id, label: c.construction_name })))
      setLocations(((locData.data as any[]) ?? []).map((l) => ({
        id: l.id,
        label: l.country ? `${l.location_name} (${l.country})` : l.location_name
      })))

      setIsLoading(false)
    }).catch((e) => {
      console.error("Bulk edit data loading failed:", e)
      toast.danger(e instanceof Error ? e.message : "Failed to load bulk editor data")
      setIsLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to toggle parent checkbox (include/exclude SKU)
  const toggleIncluded = useCallback((id: string) => {
    setIncludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Toggle expand/collapse
  const toggleParentCollapse = useCallback((id: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Flat list of visible rows based on collapse & inclusions
  const visibleRows = useMemo<GridRow[]>(() => {
    const list: GridRow[] = []
    for (const p of rows) {
      if (!includedIds.has(p.id)) continue
      list.push({
        type: "parent",
        id: p.id,
        sku: p.sku ?? "",
        displayTitle: p.sku ?? "",
        parentData: p
      })

      if (!collapsedParents.has(p.id)) {
        const children = inventories.filter((inv) => inv.catalog_id === p.id)
        for (const c of children) {
          list.push({
            type: "child",
            id: c.id,
            parentId: p.id,
            sku: p.sku ?? "",
            displayTitle: c.serial_number,
            childData: c
          })
        }
      }
    }
    return list
  }, [rows, inventories, collapsedParents, includedIds])

  // Get current active cell value
  const getCellVal = useCallback((rowId: string, rowType: "parent" | "child", colId: string) => {
    if (rowType === "parent") {
      if (edits.catalog[rowId] && colId in edits.catalog[rowId]) {
        return edits.catalog[rowId][colId as keyof CatalogEdits]
      }
      const parentRow = rows.find((r) => r.id === rowId)
      if (parentRow) {
        if (colId === "collection_id") return parentRow.collection_id
        if (colId === "construction_id") return parentRow.construction_id
        if (colId === "is_active") return parentRow.is_active
        if (colId === "is_verified") return parentRow.is_verified
        return (parentRow as any)[colId] ?? ""
      }
    } else {
      if (edits.inventory[rowId] && colId in edits.inventory[rowId]) {
        return edits.inventory[rowId][colId as keyof InventoryEdits]
      }
      const childRow = inventories.find((i) => i.id === rowId)
      if (childRow) {
        if (colId === "serial_number") return childRow.serial_number
        if (colId === "location_id") return childRow.location_id
      }
    }
    return ""
  }, [edits, rows, inventories])

  // Apply edits to history and local state
  const applyEdits = useCallback((newEdits: BulkEdits) => {
    setEdits(newEdits)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newEdits)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }, [history, historyIndex])

  // Update cell handler
  const handleCellChange = useCallback((rowId: string, rowType: "parent" | "child", colId: string, value: any) => {
    const next = {
      catalog: { ...edits.catalog },
      inventory: { ...edits.inventory }
    }
    if (rowType === "parent") {
      next.catalog[rowId] = {
        ...(next.catalog[rowId] ?? {}),
        [colId]: value
      }
    } else {
      next.inventory[rowId] = {
        ...(next.inventory[rowId] ?? {}),
        [colId]: value
      }
    }
    applyEdits(next)
  }, [edits, applyEdits])

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1
      setHistoryIndex(prevIndex)
      setEdits(history[prevIndex])
      toast.success("Undo")
    }
  }, [history, historyIndex])

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1
      setHistoryIndex(nextIndex)
      setEdits(history[nextIndex])
      toast.success("Redo")
    }
  }, [history, historyIndex])

  // Clipboard copy
  const handleCopy = useCallback((rowId: string, rowType: "parent" | "child", colId: string) => {
    const val = getCellVal(rowId, rowType, colId)
    setCopiedValue({ value: val, colId, rowType })
    navigator.clipboard.writeText(String(val ?? "")).catch(() => {})
    toast.success("Copied value")
  }, [getCellVal])

  // Clipboard paste
  const handlePaste = useCallback(async (rowId: string, rowType: "parent" | "child", colId: string) => {
    let valToPaste: any = null
    let hasValue = false

    try {
      const text = await navigator.clipboard.readText()
      if (text !== undefined && text !== null) {
        valToPaste = text
        hasValue = true
      }
    } catch {
      if (copiedValue) {
        valToPaste = copiedValue.value
        hasValue = true
      }
    }

    if (!hasValue) return

    const columnDef = ALL_COLUMNS.find((c) => c.id === colId)
    if (!columnDef || columnDef.editableFor !== rowType) return

    // Parse options for relational switchers
    if (colId === "collection_id") {
      const matched = collections.find((c) => c.id === valToPaste || c.label.toLowerCase() === String(valToPaste).toLowerCase())
      valToPaste = matched ? matched.id : null
    } else if (colId === "construction_id") {
      const matched = constructions.find((c) => c.id === valToPaste || c.label.toLowerCase() === String(valToPaste).toLowerCase())
      valToPaste = matched ? matched.id : null
    } else if (colId === "location_id") {
      const matched = locations.find((l) => l.id === valToPaste || l.label.toLowerCase() === String(valToPaste).toLowerCase())
      valToPaste = matched ? matched.id : null
    } else if (colId === "is_active") {
      valToPaste = valToPaste === "true" || valToPaste === "Active" || valToPaste === "active" || valToPaste === true
    } else if (colId === "is_verified") {
      valToPaste = valToPaste === "true" || valToPaste === "Verified" || valToPaste === "verified" || valToPaste === true
    }

    handleCellChange(rowId, rowType, colId, valToPaste)
    toast.success("Pasted value")
  }, [copiedValue, handleCellChange, collections, constructions, locations])

  // Column "Apply to all"
  const applyColumnToAll = useCallback((colId: string, value: any, targetType: "parent" | "child") => {
    const next = {
      catalog: { ...edits.catalog },
      inventory: { ...edits.inventory }
    }
    let changed = false

    if (targetType === "parent") {
      for (const p of rows) {
        if (includedIds.has(p.id)) {
          next.catalog[p.id] = {
            ...(next.catalog[p.id] ?? {}),
            [colId]: value
          }
          changed = true
        }
      }
    } else {
      for (const inv of inventories) {
        if (includedIds.has(inv.catalog_id)) {
          next.inventory[inv.id] = {
            ...(next.inventory[inv.id] ?? {}),
            [colId]: value
          }
          changed = true
        }
      }
    }

    if (changed) {
      applyEdits(next)
      toast.success(`Applied to all ${targetType}s`)
    }
  }, [rows, inventories, includedIds, edits, applyEdits])

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditingInput = target.tagName === "INPUT" || target.tagName === "SELECT" || target.getAttribute("role") === "combobox"

      if (isEditingInput && e.key === "Escape") {
        target.blur()
        return
      }

      if (!focusedCell) return

      const isCtrl = e.ctrlKey || e.metaKey

      // Shortcuts
      if (isCtrl && e.key.toLowerCase() === "c") {
        e.preventDefault()
        handleCopy(focusedCell.rowId, focusedCell.rowType, focusedCell.colId)
        return
      }
      if (isCtrl && e.key.toLowerCase() === "v") {
        e.preventDefault()
        handlePaste(focusedCell.rowId, focusedCell.rowType, focusedCell.colId)
        return
      }
      if (isCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault()
        handleUndo()
        return
      }
      if (isCtrl && e.key.toLowerCase() === "y") {
        e.preventDefault()
        handleRedo()
        return
      }

      // Arrows for spreadsheet grid movement
      if (isEditingInput) return

      const colIndex = visibleColIds.indexOf(focusedCell.colId)
      const rowIndex = visibleRows.findIndex((r) => r.id === focusedCell.rowId && r.type === focusedCell.rowType)

      if (rowIndex === -1) return

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (rowIndex > 0) {
          const nextRow = visibleRows[rowIndex - 1]
          setFocusedCell({ rowId: nextRow.id, rowType: nextRow.type, colId: focusedCell.colId })
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (rowIndex < visibleRows.length - 1) {
          const nextRow = visibleRows[rowIndex + 1]
          setFocusedCell({ rowId: nextRow.id, rowType: nextRow.type, colId: focusedCell.colId })
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (colIndex > 0) {
          setFocusedCell({ rowId: focusedCell.rowId, rowType: focusedCell.rowType, colId: visibleColIds[colIndex - 1] })
        } else if (colIndex === 0) {
          setFocusedCell({ rowId: focusedCell.rowId, rowType: focusedCell.rowType, colId: "sku_sp" })
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        if (focusedCell.colId === "sku_sp") {
          setFocusedCell({ rowId: focusedCell.rowId, rowType: focusedCell.rowType, colId: visibleColIds[0] })
        } else if (colIndex < visibleColIds.length - 1) {
          setFocusedCell({ rowId: focusedCell.rowId, rowType: focusedCell.rowType, colId: visibleColIds[colIndex + 1] })
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [focusedCell, visibleColIds, visibleRows, handleCopy, handlePaste, handleUndo, handleRedo])

  // Drag corner cell-drag-fill handlers
  const handleDragStart = (e: React.MouseEvent, rowId: string, rowType: "parent" | "child", colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      isDragging: true,
      startRowId: rowId,
      startRowType: rowType,
      colId,
      currentRowId: rowId,
      currentRowType: rowType
    })
  }

  const handleCellMouseEnter = (rowId: string, rowType: "parent" | "child", colId: string) => {
    if (!dragState || !dragState.isDragging || dragState.colId !== colId) return
    setDragState((prev) => {
      if (!prev) return null
      return {
        ...prev,
        currentRowId: rowId,
        currentRowType: rowType
      }
    })
  }

  const isCellInDragRange = useCallback((rowId: string, rowType: "parent" | "child", colId: string) => {
    if (!dragState || !dragState.isDragging || dragState.colId !== colId) return false
    const startIdx = visibleRows.findIndex((r) => r.id === dragState.startRowId && r.type === dragState.startRowType)
    const endIdx = visibleRows.findIndex((r) => r.id === dragState.currentRowId && r.type === dragState.currentRowType)
    const curIdx = visibleRows.findIndex((r) => r.id === rowId && r.type === rowType)
    if (startIdx === -1 || endIdx === -1 || curIdx === -1) return false
    const minIdx = Math.min(startIdx, endIdx)
    const maxIdx = Math.max(startIdx, endIdx)
    return curIdx >= minIdx && curIdx <= maxIdx
  }, [dragState, visibleRows])

  // Double click corner handle to fill down the whole column
  const handleCornerDoubleClick = useCallback((rowId: string, rowType: "parent" | "child", colId: string) => {
    const startIdx = visibleRows.findIndex((r) => r.id === rowId && r.type === rowType)
    if (startIdx === -1) return
    
    const sourceVal = getCellVal(rowId, rowType, colId)
    const next = {
      catalog: { ...edits.catalog },
      inventory: { ...edits.inventory }
    }
    
    let changed = false
    const columnDef = ALL_COLUMNS.find((c) => c.id === colId)
    if (!columnDef) return

    for (let i = startIdx + 1; i < visibleRows.length; i++) {
      const row = visibleRows[i]
      if (columnDef.editableFor === row.type) {
        changed = true
        if (row.type === "parent") {
          next.catalog[row.id] = {
            ...(next.catalog[row.id] ?? {}),
            [colId]: sourceVal
          }
        } else {
          next.inventory[row.id] = {
            ...(next.inventory[row.id] ?? {}),
            [colId]: sourceVal
          }
        }
      }
    }
    
    if (changed) {
      applyEdits(next)
      toast.success("Filled values down the column")
    }
  }, [visibleRows, edits, getCellVal, applyEdits])

  // Global mouse up for completing cell corner drag-fill
  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragState || !dragState.isDragging) return
      
      const startIdx = visibleRows.findIndex((r) => r.id === dragState.startRowId && r.type === dragState.startRowType)
      const endIdx = visibleRows.findIndex((r) => r.id === dragState.currentRowId && r.type === dragState.currentRowType)
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx)
        const maxIdx = Math.max(startIdx, endIdx)
        const rangeRows = visibleRows.slice(minIdx, maxIdx + 1)
        
        const sourceVal = getCellVal(dragState.startRowId, dragState.startRowType, dragState.colId)
        
        const next = {
          catalog: { ...edits.catalog },
          inventory: { ...edits.inventory }
        }
        
        let changed = false
        const columnDef = ALL_COLUMNS.find((c) => c.id === dragState.colId)
        if (columnDef) {
          for (const row of rangeRows) {
            if (columnDef.editableFor === row.type) {
              changed = true
              if (row.type === "parent") {
                next.catalog[row.id] = {
                  ...(next.catalog[row.id] ?? {}),
                  [dragState.colId]: sourceVal
                }
              } else {
                next.inventory[row.id] = {
                  ...(next.inventory[row.id] ?? {}),
                  [dragState.colId]: sourceVal
                }
              }
            }
          }
        }
        
        if (changed) {
          applyEdits(next)
          toast.success("Copied values across rows")
        }
      }
      setDragState(null)
    }
    
    if (dragState?.isDragging) {
      window.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [dragState, visibleRows, edits, getCellVal, applyEdits])

  // Database Save changes
  const handleSave = async () => {
    const catalogUpdates = Object.entries(edits.catalog).filter(([id]) => includedIds.has(id))
    const inventoryUpdates = Object.entries(edits.inventory).filter(([id]) => {
      const item = inventories.find((inv) => inv.id === id)
      return item && includedIds.has(item.catalog_id)
    })

    if (catalogUpdates.length === 0 && inventoryUpdates.length === 0) {
      toast.success("No changes to save.")
      router.push("/products")
      return
    }

    setIsSaving(true)
    try {
      await Promise.all([
        // Batch catalog rows
        ...catalogUpdates.map(([id, changes]) =>
          (supabase.from("catalog") as any).update({
            ...(("collection_id" in changes) ? { collection_id: changes.collection_id } : {}),
            ...(("construction_id" in changes) ? { construction_id: changes.construction_id } : {}),
            ...(("is_active" in changes) ? { is_active: changes.is_active } : {}),
            ...(("is_verified" in changes) ? { is_verified: changes.is_verified } : {}),
          }).eq("id", id)
        ),
        // Batch inventory rows
        ...inventoryUpdates.map(([id, changes]) =>
          (supabase.from("inventory") as any).update({
            ...(("serial_number" in changes) ? { serial_number: changes.serial_number } : {}),
            ...(("location_id" in changes) ? { location_id: changes.location_id } : {}),
          }).eq("id", id)
        )
      ])

      toast.success("Bulk edits saved successfully!")
      deselectAll()
      router.push("/products")
    } catch (e) {
      toast.danger(e instanceof Error ? e.message : "Failed to save changes")
    } finally {
      setIsSaving(false)
    }
  }

  // Cancel handler
  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowCancelConfirm(true)
    } else {
      router.push("/products")
    }
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white">
        <Typography.Paragraph size="sm" className="text-zinc-400">Loading bulk editor…</Typography.Paragraph>
      </div>
    )
  }

  const totalCatalogSelected = rows.length
  const totalInventoryRows = inventories.length

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-50 text-zinc-800">
      {/* Header bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 md:px-6 py-3 border-b border-zinc-200 bg-white shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer transition-colors"
          >
            <BackIcon />
          </button>
          <div>
            <Typography.Heading level={1} className="text-sm text-zinc-900">Editing {totalCatalogSelected} products</Typography.Heading>
            <Typography.Paragraph size="xs" weight="medium" className="text-zinc-400">
              {totalCatalogSelected} master SKU{totalCatalogSelected !== 1 ? "s" : ""} · {totalInventoryRows} pieces
            </Typography.Paragraph>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Reused Column Selector Component from catalog tab */}
          <ToolbarControl
            icon={<ColumnsIcon />}
            label="Columns"
            badge={hiddenColumns.length}
            active={hiddenColumns.length > 0}
            align="end"
            panelClassName="w-56"
          >
            {() => <HideColumnsPanel columns={BULK_EDIT_TOOLBAR_COLUMNS} />}
          </ToolbarControl>

          <Button
            variant="outline"
            onPress={handleCancel}
            isDisabled={isSaving}
            className="h-9 px-3 text-xs rounded-xl bg-zinc-100 text-zinc-800 cursor-pointer font-medium"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={handleSave}
            isDisabled={isSaving || !hasUnsavedChanges}
            className="h-9 px-4 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer font-semibold shadow-xs"
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Spreadsheet view with horizontal ScrollShadow wrapper and visible scrollbar */}
        <div className="flex-1 overflow-hidden px-4 md:px-6 py-5">
          <ScrollShadow
            orientation="horizontal"
            className="w-full h-full overflow-auto border border-zinc-200 rounded-xl relative shadow-sm"
          >
            <table 
              className="w-full border-collapse select-text table-fixed" 
              style={{ minWidth: totalTableWidth }}
            >
              <thead>
                <tr className="bg-zinc-50/80 sticky top-0 z-10 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(228,228,231,1)]">
                  {/* Sticky Left Title Column Header */}
                  <th className="w-64 min-w-[256px] px-3 py-2.5 text-[11px] font-bold text-zinc-400 text-left border-r border-zinc-200 sticky left-0 bg-zinc-50 z-20">
                    Item SKU / Piece SP Number
                  </th>

                  {/* Visible Column Headers */}
                  {visibleCols.map((col) => (
                    <th
                      key={col.id}
                      style={{ width: col.width }}
                      className="px-3 py-3 text-[11px] font-bold text-zinc-700 text-left border-r border-zinc-200 bg-zinc-50/80 relative select-none"
                    >
                      <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-700">{col.label}</Typography.Paragraph>
                      {/* Drag Resizer Handle */}
                      <div
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/50 hover:w-1.5 transition-all z-20"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const isParent = row.type === "parent"
                  const rowId = row.id
                  const rowType = row.type

                  return (
                    <tr
                      key={`${rowType}-${rowId}`}
                      className={cn(
                        "group border-b border-zinc-200/70",
                        isParent ? "bg-zinc-50/80 hover:bg-zinc-100/50" : "bg-white hover:bg-zinc-50/40"
                      )}
                    >
                      {/* Sticky Left Row Title Cell */}
                      <td className="px-3 py-1.5 border-r border-zinc-200 sticky left-0 bg-inherit z-10 flex items-center gap-2 overflow-hidden w-64 min-w-[256px]">
                        {isParent ? (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleParentCollapse(rowId)}
                              className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
                            >
                              {collapsedParents.has(rowId) ? <ChevronRightIcon /> : <ChevronDownIcon />}
                            </button>
                            {(() => {
                              const firstChild = inventories.find((inv) => inv.catalog_id === rowId)
                              return firstChild?.first_image_url ? (
                                <div className="relative w-8 h-8 rounded bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0">
                                  <Image
                                    src={getThumbnailUrl(firstChild.first_image_url, { width: 64, quality: 80 })}
                                    alt={row.sku}
                                    fill
                                    sizes="32px"
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                                  <PhotoPlaceholderIcon />
                                </div>
                              )
                            })()}
                            <div className="min-w-0 flex flex-col justify-center py-0.5">
                              <Typography.Code weight="bold" truncate className="text-zinc-900 leading-tight text-xs" title={row.sku}>
                                {row.sku}
                              </Typography.Code>
                              <Typography.Paragraph size="xs" weight="semibold" truncate className="text-zinc-500 leading-tight mt-0.5">
                                {row.parentData?.quality_name} · {row.parentData?.design_name}
                              </Typography.Paragraph>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 pl-6 overflow-hidden">
                            {row.childData?.first_image_url ? (
                              <div className="relative w-7 h-7 rounded bg-zinc-100 border border-zinc-200 overflow-hidden shrink-0">
                                <Image
                                  src={getThumbnailUrl(row.childData.first_image_url, { width: 64, quality: 80 })}
                                  alt={row.childData.serial_number}
                                  fill
                                  sizes="28px"
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 shrink-0">
                                <PhotoPlaceholderIcon />
                              </div>
                            )}
                            <Typography.Code weight="medium" truncate className="text-zinc-700" title={row.displayTitle}>
                              {row.displayTitle}
                            </Typography.Code>
                          </div>
                        )}
                      </td>

                      {/* Visible columns cells */}
                      {visibleCols.map((col) => {
                        const isFocused = focusedCell?.rowId === rowId && focusedCell?.rowType === rowType && focusedCell?.colId === col.id
                        const inDragRange = isCellInDragRange(rowId, rowType, col.id)
                        const isEditable = col.editableFor === rowType
                        const val = getCellVal(rowId, rowType, col.id)

                        return (
                          <td
                            key={col.id}
                            onMouseEnter={() => handleCellMouseEnter(rowId, rowType, col.id)}
                            onClick={() => setFocusedCell({ rowId, rowType, colId: col.id })}
                            className={cn(
                              "px-0 py-0 border-r border-zinc-200 relative align-middle transition-all select-none text-xs min-h-[38px] group/cell",
                              isFocused && "ring-2 ring-indigo-500 ring-inset z-20 outline-hidden",
                              inDragRange && "bg-blue-50/60",
                              !isEditable && "bg-zinc-100/30 text-center"
                            )}
                          >
                            {/* Inner element container */}
                            <div className="w-full h-full min-h-[36px] flex items-center px-2">
                              {isEditable ? (
                                col.id === "is_active" ? (
                                  <StatusSelect
                                    value={Boolean(val)}
                                    onChange={(v: boolean) => handleCellChange(rowId, rowType, col.id, v)}
                                  />
                                ) : col.id === "is_verified" ? (
                                  <VerifiedSelect
                                    value={Boolean(val)}
                                    onChange={(v: boolean) => handleCellChange(rowId, rowType, col.id, v)}
                                  />
                                ) : col.id === "collection_id" ? (
                                  <GridSelect
                                    value={val ?? null}
                                    onChange={(v) => handleCellChange(rowId, rowType, col.id, v)}
                                    options={collections}
                                    placeholder="— None —"
                                  />
                                ) : col.id === "construction_id" ? (
                                  <GridSelect
                                    value={val ?? null}
                                    onChange={(v) => handleCellChange(rowId, rowType, col.id, v)}
                                    options={constructions}
                                    placeholder="— None —"
                                  />
                                ) : col.id === "location_id" ? (
                                  <GridSelect
                                    value={val ?? null}
                                    onChange={(v) => handleCellChange(rowId, rowType, col.id, v)}
                                    options={locations}
                                    placeholder="— None —"
                                  />
                                ) : col.id === "serial_number" ? (
                                  <input
                                    type="text"
                                    value={val ?? ""}
                                    onChange={(e) => handleCellChange(rowId, rowType, col.id, e.target.value)}
                                    className="w-full bg-transparent border-0 outline-hidden text-xs focus:bg-white font-mono px-0.5 py-1.5 h-full"
                                  />
                                ) : null
                              ) : (
                                // Invalid / Read-only not applicable field (render gray strikethrough pill)
                                <div className="w-full flex justify-center items-center">
                                  {(val !== null && val !== undefined && val !== "") ? (
                                    <Typography.Paragraph size="xs" weight="medium" truncate align="start" className="w-full text-zinc-700">
                                      {val}
                                    </Typography.Paragraph>
                                  ) : (
                                    <StrikethroughIcon />
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Cell Corner Drag Handle Square */}
                            {isEditable && isFocused && (
                              <div
                                onMouseDown={(e) => handleDragStart(e, rowId, rowType, col.id)}
                                onDoubleClick={() => handleCornerDoubleClick(rowId, rowType, col.id)}
                                title="Double click to fill down, or drag to paste across rows"
                                className="absolute bottom-[-4px] right-[-4px] w-2 h-2 bg-indigo-600 border border-white cursor-crosshair z-30 select-none shadow-xs rounded-full hover:scale-125 transition-transform"
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollShadow>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal isOpen={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="border-b border-zinc-100 text-zinc-900 text-sm font-semibold">
                    Discard unsaved changes?
                  </Modal.Header>
                  <Modal.Body className="py-4">
                    <Typography.Paragraph size="xs" className="text-zinc-500 leading-relaxed">
                      You have unsaved changes. Leaving now will discard all edit states. Are you sure you want to exit?
                    </Typography.Paragraph>
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button
                      variant="outline"
                      onPress={close}
                      className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer text-xs font-semibold"
                    >
                      Keep Editing
                    </Button>
                    <Button
                      onPress={() => router.push("/products")}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-xl cursor-pointer text-xs font-semibold"
                    >
                      Discard
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
