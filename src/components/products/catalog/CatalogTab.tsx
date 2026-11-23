"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { Button, ButtonGroup, Chip, Dropdown, Modal, Spinner, toast, Typography } from "@heroui/react"
import type { ColumnDef } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import Toolbar from "@/components/shared/Toolbar"
import DataTable from "@/components/shared/DataTable"
import { useViewStore } from "@/stores/viewStore"
import { useCatalogStore } from "@/stores/catalogStore"
import { useCatalog, type CatalogRow } from "@/hooks/useCatalog"
import NestedInventoryTable from "./NestedInventoryTable"
import ProductModal from "./ProductModal"
import InventoryModal from "./InventoryModal"
import BulkUploadModal from "./BulkUploadModal"
import BulkSerialUploadModal from "./BulkSerialUploadModal"
import * as XLSX from "xlsx"
import { autoMapMediaImagesToSerials } from "@/lib/autoMapImages"
import { supabase } from "@/lib/supabase/client"
import type { InventoryRowWithDetails } from "@/hooks/useInventory"
import { ROW_HEIGHT_OPTIONS, type RowHeight, type ToolbarColumn } from "@/types/app.types"
import SerialNumberView from "./SerialNumberView"
import ConvertSerialsModal from "./ConvertSerialsModal"
import { ArrowDownToLine, ArrowUpFromLine, ArrowsExpandVertical, ArrowsRotateRight, Ban, ChevronDown, ChevronRight, Cube, EllipsisVertical, FilePlus, Hashtag, LayoutColumns3, Pencil, Plus, TriangleExclamation, Xmark } from "@gravity-ui/icons"

// ──────────────────────────────────────────────────────────
// Column definitions
// ──────────────────────────────────────────────────────────

const CATALOG_COLUMNS: ToolbarColumn[] = [
  { id: "sku", label: "SKU", type: "text" },
  { id: "product_name", label: "Product Type", type: "text" },
  { id: "quality_name", label: "Quality", type: "text" },
  { id: "design_name", label: "Design", type: "text" },
  { id: "collection_name", label: "Collection", type: "text" },
  { id: "construction_name", label: "Construction", type: "text" },
  { id: "color_names", label: "Colors", type: "text", groupable: false },
  { id: "fiber_configuration", label: "Fiber Config", type: "text", groupable: false },
  { id: "size_label", label: "Size", type: "text" },
  { id: "is_verified", label: "Verification", type: "boolean" },
  { id: "is_active", label: "Status", type: "boolean" },
]

const hideableColumns = CATALOG_COLUMNS.filter((c) => c.hideable !== false)

// Matches the row-actions menu items further down
const menuItemClass =
  "flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 whitespace-nowrap rounded-lg cursor-pointer outline-hidden hover:bg-indigo-50 hover:text-indigo-700 data-[focused]:bg-indigo-50 data-[focused]:text-indigo-700 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"

// Checkable items (row height / column visibility). HeroUI absolutely positions the checkmark in a left
// gutter; pin it to the same 12px column as the icons above and start the label where icon-item text starts
// (12px pad + 15px icon + 8px gap), since px-3 would otherwise override HeroUI's gutter padding.
const menuCheckItemClass = cn(
  menuItemClass,
  "pl-[35px] [&_[data-slot=menu-item-indicator]]:start-3 [&_[data-slot=menu-item-indicator]]:text-indigo-600"
)

// Submenu triggers. HeroUI absolutely positions the chevron at the right edge and pads for it, but px-3
// overrides that padding; reserve the gutter again (pr-8) and pin the chevron 12px in, mirroring the left pad.
const menuSubmenuItemClass = cn(
  menuItemClass,
  "pr-8 [&_[data-slot=submenu-indicator]]:end-3 [&_[data-slot=submenu-indicator]]:text-zinc-400"
)

// Split-button halves: ButtonGroup rounds the outer corners, so no rounded-* here
const splitButtonClass = "bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium h-9 cursor-pointer"

const COL_MIN_WIDTHS: Record<string, number> = {
  sku: 140,
  product_name: 120,
  quality_name: 110,
  design_name: 120,
  collection_name: 120,
  construction_name: 120,
  color_names: 140,
  fiber_configuration: 160,
  size_label: 90,
  is_verified: 110,
  is_active: 100,
}

function getCellText(columnId: string, row: CatalogRow): string {
  if (columnId === "is_verified") {
    return row.is_verified ? "Verified" : "Unverified"
  }
  if (columnId === "is_active") {
    return row.is_active ? "Active" : "Discontinued"
  }
  if (columnId === "sku") {
    return row.sku ?? "—"
  }
  const value = row[columnId as keyof CatalogRow]
  if (value === true) return "Yes"
  if (value === false) return "No"
  if (value === null || value === undefined) return "—"
  return String(value)
}

function getColumnWidth(columnId: string, label: string, rows: CatalogRow[]): number {
  const headerLen = label.length
  let maxLen = headerLen
  for (const r of rows) {
    const text = getCellText(columnId, r)
    if (text.length > maxLen) {
      maxLen = text.length
    }
  }
  const charWidth = 8.2
  const padding = 32
  const headerIconPadding = 24
  
  const minWidth = COL_MIN_WIDTHS[columnId] ?? 100
  const calculated = maxLen * charWidth + padding + headerIconPadding
  
  return Math.ceil(Math.max(calculated, minWidth))
}

const ROW_HEIGHT_PX: Record<string, string> = {
  compact: "h-9",
  normal: "h-14",
  tall: "h-20",
}

// ──────────────────────────────────────────────────────────
// Inline icons
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// Condition chip
// ──────────────────────────────────────────────────────────

const ConditionChip = ({
  tone,
  children,
  onRemove,
}: {
  tone: "indigo" | "amber" | "emerald"
  children: React.ReactNode
  onRemove: () => void
}) => {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  } as const
  return (
    <span className={cn("inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full border text-xs font-medium whitespace-nowrap", tones[tone])}>
      {children}
      <button type="button" onClick={onRemove} className="p-0.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer">
        <Xmark width="13" height="13" />
      </button>
    </span>
  )
}

// ──────────────────────────────────────────────────────────
// Cell renderer
// ──────────────────────────────────────────────────────────

function CellValue({ columnId, row }: { columnId: string; row: CatalogRow }) {
  if (columnId === "is_active") {
    return (
      <Chip color={row.is_active ? "success" : "default"} variant="soft" size="sm">
        <Chip.Label>{row.is_active ? "Active" : "Discontinued"}</Chip.Label>
      </Chip>
    )
  }
  if (columnId === "sku") {
    return <Typography.Code weight="semibold" truncate className="text-zinc-900">{row.sku ?? "—"}</Typography.Code>
  }
  const value = row[columnId as keyof CatalogRow]
  if (typeof value === "string" && value.trim()) return <Typography.Paragraph size="sm" truncate className="text-zinc-700">{value}</Typography.Paragraph>
  return <Typography.Paragraph size="sm" className="text-zinc-300">—</Typography.Paragraph>
}

// ──────────────────────────────────────────────────────────
// Group header row
// ──────────────────────────────────────────────────────────

interface GroupHeaderProps {
  label: string
  count: number
  isCollapsed: boolean
  onToggle: () => void
}

function GroupHeader({ label, count, isCollapsed, onToggle }: GroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 bg-zinc-100/80 border-b border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 transition-colors cursor-pointer text-left"
    >
      <motion.span animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
        <ChevronRight width="14" height="14" />
      </motion.span>
      <span>{label}</span>
      <span className="text-zinc-400 font-normal ml-1">({count})</span>
    </button>
  )
}

// ──────────────────────────────────────────────────────────
// Main CatalogTab
// ──────────────────────────────────────────────────────────

export default function CatalogTab() {
  const router = useRouter()
  const { rows, isLoading, error, refetch, addRow, updateRow } = useCatalog()
  const { selectedIds, selectedCount, deselectAll, setBulkEditing, setSelected } = useCatalogStore()
  const [catalogView, setCatalogView] = useState<"sku" | "serial">("sku")
  const sorts = useViewStore((s) => s.sorts)
  const groupBy = useViewStore((s) => s.groupBy)
  const hiddenColumns = useViewStore((s) => s.hiddenColumns)
  const rowHeight = useViewStore((s) => s.rowHeight)
  const setRowHeight = useViewStore((s) => s.setRowHeight)
  const setHiddenColumns = useViewStore((s) => s.setHiddenColumns)
  const showAllColumns = useViewStore((s) => s.showAllColumns)
  const openSearch = useViewStore((s) => s.openSearch)
  const removeSort = useViewStore((s) => s.removeSort)
  const setGroupBy = useViewStore((s) => s.setGroupBy)

  // Modal states
  const [bulkUploadModalOpen, setBulkUploadModalOpen] = useState(false)
  const [bulkSerialUploadModalOpen, setBulkSerialUploadModalOpen] = useState(false)
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [productModalMode, setProductModalMode] = useState<"add" | "edit">("add")
  const [editingRow, setEditingRow] = useState<CatalogRow | null>(null)

  const [inventoryModalOpen, setInventoryModalOpen] = useState(false)
  const [inventoryModalMode, setInventoryModalMode] = useState<"add" | "edit">("add")
  const [editingInventoryRow, setEditingInventoryRow] = useState<InventoryRowWithDetails | null>(null)
  const [inventoryTargetId, setInventoryTargetId] = useState<string>("")
  const [pendingInventoryRows, setPendingInventoryRows] = useState<Record<string, InventoryRowWithDetails>>({})
  const [updatedInventoryRows, setUpdatedInventoryRows] = useState<Record<string, InventoryRowWithDetails>>({})

  const [discontinueTarget, setDiscontinueTarget] = useState<CatalogRow | null>(null)
  const [isDiscontinuing, setIsDiscontinuing] = useState(false)

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const colLabel = (id: string) => CATALOG_COLUMNS.find((c) => c.id === id)?.label ?? id

  const visibleColumns = useMemo(
    () => CATALOG_COLUMNS.filter((c) => !hiddenColumns.includes(c.id)),
    [hiddenColumns]
  )

  const hasConditions = sorts.length > 0 || groupBy !== null

  // ── Grouping logic ──
  const grouped = useMemo(() => {
    if (!groupBy) return [{ key: "__all__", label: null, rows }]

    const map = new Map<string, CatalogRow[]>()
    for (const row of rows) {
      const val = String(row[groupBy as keyof CatalogRow] ?? "(Empty)")
      if (!map.has(val)) map.set(val, [])
      map.get(val)!.push(row)
    }
    return Array.from(map.entries()).map(([key, groupRows]) => ({
      key,
      label: `${colLabel(groupBy)}: ${key}`,
      rows: groupRows,
    }))
  }, [rows, groupBy]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ── Row handlers ──
  const handleOpenAddProduct = useCallback(() => {
    setProductModalMode("add")
    setEditingRow(null)
    setProductModalOpen(true)
  }, [])

  // Ctrl+F / Shift+N handlers
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        openSearch()
        return
      }

      if (
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "n" &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault()
        handleOpenAddProduct()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openSearch, handleOpenAddProduct])

  const handleEditRow = useCallback((row: CatalogRow) => {
    setProductModalMode("edit")
    setEditingRow(row)
    setProductModalOpen(true)
  }, [])

  const handleDiscontinue = useCallback((row: CatalogRow) => {
    setDiscontinueTarget(row)
  }, [])

  const confirmDiscontinue = async () => {
    if (!discontinueTarget) return
    const targetId = discontinueTarget.id

    // Optimistically update the UI state immediately
    updateRow(targetId, { is_active: false })
    toast.success("Product discontinued")
    setDiscontinueTarget(null)

    // Trigger the database update in the background
    try {
      const { error: err } = await (supabase
        .from("catalog" as any) as any)
        .update({ is_active: false })
        .eq("id", targetId)
      if (err) throw err
    } catch (e) {
      // Revert the UI state if the background request fails
      updateRow(targetId, { is_active: true })
      toast.danger(e instanceof Error ? e.message : "Failed to discontinue product")
    }
  }

  const handleOpenAddInventory = useCallback((catalogId: string) => {
    setInventoryTargetId(catalogId)
    setEditingInventoryRow(null)
    setInventoryModalMode("add")
    setInventoryModalOpen(true)
  }, [])

  const handleOpenEditInventory = useCallback((catalogId: string, row: InventoryRowWithDetails) => {
    setInventoryTargetId(catalogId)
    setEditingInventoryRow(row)
    setInventoryModalMode("edit")
    setInventoryModalOpen(true)
  }, [])

  const handleInventorySaved = useCallback((row: InventoryRowWithDetails, isEdit: boolean) => {
    if (!row.catalog_id) return
    if (isEdit) {
      setUpdatedInventoryRows((prev) => ({ ...prev, [row.catalog_id!]: row }))
    } else {
      setPendingInventoryRows((prev) => ({ ...prev, [row.catalog_id!]: row }))
    }
  }, [])

  const handleProductSaved = useCallback(
    (savedRow: CatalogRow) => {
      if (productModalMode === "add") {
        addRow(savedRow)
      } else {
        updateRow(savedRow.id, savedRow)
      }
      setProductModalOpen(false)
    },
    [productModalMode, addRow, updateRow]
  )

  const handleBulkEdit = () => {
    setBulkEditing(true)
    router.push("/products/bulk-edit")
  }

  // ── Selection bridge: each group's DataTable owns selection over its own rows only;
  //    changes are merged back into the global selectedIds set in catalogStore. ──
  const handleGroupSelectionChange = useCallback(
    (groupRows: CatalogRow[]) => (keys: Set<string> | "all") => {
      const groupIds = groupRows.map((r) => r.id)
      const nextGroupIds = keys === "all" ? groupIds : Array.from(keys)
      const others = Array.from(selectedIds).filter((id) => !groupIds.includes(id))
      setSelected([...others, ...nextGroupIds])
    },
    [selectedIds, setSelected]
  )

  // ── Nested inventory (rendered as an internal DataTable inside the expanded row) ──
  const renderCatalogSubRow = useCallback(
    (row: CatalogRow) => (
      <NestedInventoryTable
        catalogId={row.id}
        onAddInventory={handleOpenAddInventory}
        onEditInventory={handleOpenEditInventory}
        newRow={pendingInventoryRows[row.id] ?? null}
        updatedRow={updatedInventoryRows[row.id] ?? null}
        isDiscontinued={!row.is_active}
      />
    ),
    [handleOpenAddInventory, handleOpenEditInventory, pendingInventoryRows, updatedInventoryRows]
  )

  // ── Catalog DataTable column definitions ──
  const catalogColumns = useMemo<ColumnDef<CatalogRow, unknown>[]>(() => {
    const dataColumns: ColumnDef<CatalogRow, unknown>[] = visibleColumns.map((col) => ({
      id: col.id,
      accessorKey: col.id,
      header: col.label,
      // No static size — DataTable computes per-page widths via getCellText
      cell: ({ row }) => (
        <div className={cn("flex items-center overflow-hidden truncate", ROW_HEIGHT_PX[rowHeight] ?? "h-14")}>
          <CellValue columnId={col.id} row={row.original} />
        </div>
      ),
    }))

    const actionsColumn: ColumnDef<CatalogRow, unknown> = {
      id: "row_actions",
      header: "",
      enableSorting: false,
      size: 44,
      cell: ({ row }) => (
        <div
          className="flex justify-end items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown>
            <Dropdown.Trigger
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
              aria-label="Row actions"
            >
              <EllipsisVertical />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="min-w-[160px]">
              <Dropdown.Menu aria-label="Product actions">
                <Dropdown.Item
                  id="edit"
                  onAction={() => handleEditRow(row.original)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-indigo-50 hover:text-indigo-700 data-[focused]:bg-indigo-50 data-[focused]:text-indigo-700"
                >
                  <Pencil width="15" height="15" />
                  Edit
                </Dropdown.Item>
                {row.original.is_active && (
                  <Dropdown.Item
                    id="discontinue"
                    onAction={() => handleDiscontinue(row.original)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg cursor-pointer outline-hidden hover:bg-red-50 data-[focused]:bg-red-50"
                  >
                    <Ban width="15" height="15" />
                    Discontinue
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      ),
    }

    return [...dataColumns, actionsColumn]
  }, [visibleColumns, rowHeight, handleEditRow, handleDiscontinue])

  const [isMappingImages, setIsMappingImages] = useState(false)

  const handleAutoMapImages = async () => {
    try {
      setIsMappingImages(true)
      const res = await autoMapMediaImagesToSerials()
      if (res.mappedCount > 0) {
        toast.success(`Successfully mapped ${res.mappedCount} images to matching serial numbers!`)
        refetch()
      } else {
        toast.info(res.message || "No new images mapped.")
      }
    } catch (e: any) {
      console.error("Auto map images failed:", e)
      toast.danger(e.message || "Failed to map images automatically")
    } finally {
      setIsMappingImages(false)
    }
  }

  const [isExporting, setIsExporting] = useState(false)

  const handleExportCatalog = async () => {
    if (!rows || rows.length === 0) {
      toast.danger("No catalog rows to export")
      return
    }

    setIsExporting(true)
    try {
      // Fetch all inventory serial numbers mapped to catalog items
      let allInventory: Array<{ catalog_id: string | null; sku: string | null; serial_number: string }> = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await (supabase
          .from("inventory" as any) as any)
          .select("catalog_id, sku, serial_number")
          .order("created_at", { ascending: true })
          .range(from, from + 999)

        if (error) throw error
        if (!data || data.length === 0) {
          hasMore = false
        } else {
          allInventory = allInventory.concat(data)
          if (data.length < 1000) {
            hasMore = false
          } else {
            from += 1000
          }
        }
      }

      // Group serial numbers by catalog_id and by normalized sku
      const serialsByCatId = new Map<string, string[]>()
      const serialsBySku = new Map<string, string[]>()

      for (const inv of allInventory) {
        if (!inv.serial_number) continue
        const sp = String(inv.serial_number).trim()

        if (inv.catalog_id) {
          if (!serialsByCatId.has(inv.catalog_id)) {
            serialsByCatId.set(inv.catalog_id, [])
          }
          serialsByCatId.get(inv.catalog_id)!.push(sp)
        }

        if (inv.sku) {
          const normSku = String(inv.sku).trim()
          if (!serialsBySku.has(normSku)) {
            serialsBySku.set(normSku, [])
          }
          serialsBySku.get(normSku)!.push(sp)
        }
      }

      const exportData = rows.map((r) => {
        const serialsList =
          serialsByCatId.get(r.id) ||
          (r.sku ? serialsBySku.get(r.sku) : []) ||
          []

        return {
          "SKU": r.sku || "—",
          "Serial Numbers": serialsList.length > 0 ? serialsList.join(", ") : "—",
          "Serial Count": serialsList.length,
          "Product Type": r.product_name || "—",
          "Product Code": r.product_code || "—",
          "Quality": r.quality_name || "—",
          "Quality Code": r.quality_code || "—",
          "Quality Prefix": r.quality_prefix || "—",
          "Design": r.design_name || "—",
          "Design Code": r.design_code || "—",
          "Colors": r.color_names || "—",
          "Color Codes": r.color_codes || "—",
          "Size": r.size_label || "—",
          "SO Number": r.so_number !== null && r.so_number !== undefined ? `SO${r.so_number}` : "—",
          "Collection": r.collection_name || "—",
          "Construction": r.construction_name || "—",
          "Fibers": r.fiber_configuration || "—",
          "Status": r.is_active ? "Active" : "Discontinued",
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Catalog_Master")
      XLSX.writeFile(wb, `shyam_ahuja_catalog_export_${Date.now()}.xlsx`)
      toast.success(`Exported ${rows.length} catalog products with serial numbers!`)
    } catch (err: any) {
      console.error("Export error:", err)
      toast.danger(`Export failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsExporting(false)
    }
  }

  // ── Serial-number bulk actions (moved here from the Serial Numbers pages) ──
  const [isSyncingSerials, setIsSyncingSerials] = useState(false)
  const [isConvertingSerials, setIsConvertingSerials] = useState(false)
  const [convertConfirmOpen, setConvertConfirmOpen] = useState(false)
  // Bumped after a sync/convert so the Serial Number View (which loads its own data) remounts fresh
  const [serialViewKey, setSerialViewKey] = useState(0)
  const [isExportingSerials, setIsExportingSerials] = useState(false)
  const isMenuBusy = isExporting || isExportingSerials || isSyncingSerials || isConvertingSerials

  /** Exports every serial number with its resolved catalog details to Excel (the lib shows its own result toasts). */
  const handleExportSerials = async () => {
    setIsExportingSerials(true)
    try {
      const { exportSerialOrdersToExcel } = await import("@/lib/exportSerialOrders")
      await exportSerialOrdersToExcel()
    } catch (err: any) {
      console.error("Export serials error:", err)
      toast.danger(`Export failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsExportingSerials(false)
    }
  }

  /** 1-click sync: copies catalog parameters and SKUs onto every inventory piece. */
  const handleSyncAllSerials = async () => {
    setIsSyncingSerials(true)
    try {
      const { error } = await (supabase.rpc as any)("copy_catalog_to_inventory", {
        p_inventory_ids: null,
      })

      if (error) throw error
      toast.success("Successfully synchronized catalog data to inventory pieces!")
      refetch()
      setSerialViewKey((k) => k + 1)
    } catch (err: any) {
      console.error("Sync error:", err)
      toast.danger(`Sync failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsSyncingSerials(false)
    }
  }

  /** Copy & convert: rebuilds SKUs from every serial number and nests the pieces under them. */
  const handleConvertSerialsToSku = async () => {
    setIsConvertingSerials(true)
    setConvertConfirmOpen(false)
    try {
      const { convertSerialOrdersToSku } = await import("@/lib/convertSerialOrdersToSku")
      const result = await convertSerialOrdersToSku()
      toast.success(result.message)
      refetch()
      setSerialViewKey((k) => k + 1)
    } catch (err: any) {
      console.error("Convert serial orders error:", err)
      toast.danger(`Conversion failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsConvertingSerials(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-zinc-50/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-zinc-200/70">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto md:overflow-x-visible scrollbar-none">
          <div className="flex-1 min-w-0 flex items-center">
            <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 shrink-0">
              <button
                type="button"
                onClick={() => setCatalogView("sku")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                  catalogView === "sku"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                SKU View
              </button>
              <button
                type="button"
                onClick={() => setCatalogView("serial")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                  catalogView === "serial"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Serial Number View
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Toolbar columns={CATALOG_COLUMNS} context="catalog" className="justify-end" showViewControls={false} />
            {/* Split button: New Product + chevron menu (data actions and view settings) */}
            <ButtonGroup variant="primary" className="shrink-0">
              <Button onPress={handleOpenAddProduct} className={cn(splitButtonClass, "px-3.5")}>
                <Plus className="mr-1.5" />
                <span className="hidden sm:inline">New Product</span>
                <span className="sm:hidden">New</span>
              </Button>
              <Dropdown>
                <Button
                  isIconOnly
                  variant="primary"
                  aria-label="More catalog actions"
                  className={cn(splitButtonClass, "w-9 min-w-9 relative")}
                >
                  <ButtonGroup.Separator />
                  {isMenuBusy ? <Spinner size="sm" color="current" /> : <ChevronDown />}
                </Button>
                <Dropdown.Popover placement="bottom end" className="min-w-[220px]">
                  <Dropdown.Menu aria-label="Catalog actions">
                    <Dropdown.Section aria-label="Import and export">
                      {/* Import ▸ SKUs / Serials */}
                      <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="import" textValue="Import" className={menuSubmenuItemClass}>
                          <ArrowUpFromLine width="15" height="15" />
                          <span className="flex-1">Import</span>
                          <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover className="min-w-[180px]">
                          <Dropdown.Menu aria-label="Import">
                            <Dropdown.Item id="import-skus" textValue="Import SKUs" onAction={() => setBulkUploadModalOpen(true)} className={menuItemClass}>
                              <Cube width="15" height="15" />
                              Import SKUs
                            </Dropdown.Item>
                            <Dropdown.Item id="import-serials" textValue="Import serials" onAction={() => setBulkSerialUploadModalOpen(true)} className={menuItemClass}>
                              <Hashtag width="15" height="15" />
                              Import serials
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown.SubmenuTrigger>

                      {/* Export ▸ SKUs / Serials */}
                      <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="export" textValue="Export" className={menuSubmenuItemClass}>
                          <ArrowDownToLine width="15" height="15" />
                          <span className="flex-1">Export</span>
                          {(isExporting || isExportingSerials) && <Spinner size="sm" color="current" />}
                          <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover className="min-w-[180px]">
                          <Dropdown.Menu aria-label="Export">
                            <Dropdown.Item
                              id="export-skus"
                              textValue={isExporting ? "Exporting SKUs" : "Export SKUs"}
                              isDisabled={isExporting}
                              onAction={handleExportCatalog}
                              className={menuItemClass}
                            >
                              <Cube width="15" height="15" />
                              {isExporting ? "Exporting SKUs…" : "Export SKUs"}
                            </Dropdown.Item>
                            <Dropdown.Item
                              id="export-serials"
                              textValue={isExportingSerials ? "Exporting serials" : "Export serials"}
                              isDisabled={isExportingSerials}
                              onAction={handleExportSerials}
                              className={menuItemClass}
                            >
                              <Hashtag width="15" height="15" />
                              {isExportingSerials ? "Exporting serials…" : "Export serials"}
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown.SubmenuTrigger>
                    </Dropdown.Section>

                    <Dropdown.Section aria-label="Serial numbers" className="mt-1 pt-1 border-t border-zinc-100">
                      <Dropdown.Item
                        id="sync-serials"
                        textValue={isSyncingSerials ? "Syncing serials" : "Sync all serials to inventory"}
                        isDisabled={isSyncingSerials || isConvertingSerials}
                        onAction={handleSyncAllSerials}
                        className={menuItemClass}
                      >
                        <ArrowsRotateRight width="15" height="15" />
                        {isSyncingSerials ? "Syncing…" : "1-click sync all serials"}
                      </Dropdown.Item>
                      <Dropdown.Item
                        id="convert-serials"
                        textValue={isConvertingSerials ? "Converting serials" : "Copy and convert serials to SKUs"}
                        isDisabled={isConvertingSerials || isSyncingSerials || isLoading}
                        onAction={() => setConvertConfirmOpen(true)}
                        className={menuItemClass}
                      >
                        <FilePlus width="15" height="15" />
                        {isConvertingSerials ? "Converting to SKUs…" : "Copy & convert serials to SKUs"}
                      </Dropdown.Item>
                    </Dropdown.Section>

                    <Dropdown.Section aria-label="View" className="mt-1 pt-1 border-t border-zinc-100">
                      {/* Row height — single-select submenu */}
                      <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="row-height" textValue="Row height" className={menuSubmenuItemClass}>
                          <ArrowsExpandVertical width="15" height="15" />
                          <span className="flex-1">Row height</span>
                          <span className="text-xs text-zinc-400 leading-none">{ROW_HEIGHT_OPTIONS.find((o) => o.value === rowHeight)?.label}</span>
                          <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover className="min-w-[180px]">
                          <Dropdown.Menu
                            aria-label="Row height"
                            selectionMode="single"
                            disallowEmptySelection
                            selectedKeys={[rowHeight]}
                            onSelectionChange={(keys) => {
                              const [next] = Array.from(keys as Set<RowHeight>)
                              if (next) setRowHeight(next)
                            }}
                          >
                            {ROW_HEIGHT_OPTIONS.map((opt) => (
                              <Dropdown.Item key={opt.value} id={opt.value} textValue={opt.label} className={menuCheckItemClass}>
                                <Dropdown.ItemIndicator />
                                <span className="flex-1">{opt.label}</span>
                                <span className="text-[11px] text-zinc-400 tabular-nums">{opt.px}px</span>
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown.SubmenuTrigger>

                      {/* Hide columns — multi-select submenu of the visible columns */}
                      <Dropdown.SubmenuTrigger>
                        <Dropdown.Item id="hide-columns" textValue="Hide columns" className={menuSubmenuItemClass}>
                          <LayoutColumns3 width="15" height="15" />
                          <span className="flex-1">Hide columns</span>
                          {hiddenColumns.length > 0 && (
                            <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5 leading-none tabular-nums">
                              {hiddenColumns.length} hidden
                            </span>
                          )}
                          <Dropdown.SubmenuIndicator />
                        </Dropdown.Item>
                        <Dropdown.Popover className="min-w-[200px] max-h-80 overflow-y-auto">
                          <Dropdown.Menu aria-label="Visible columns" shouldCloseOnSelect={false}>
                            <Dropdown.Section
                              aria-label="Columns"
                              selectionMode="multiple"
                              selectedKeys={hideableColumns.filter((c) => !hiddenColumns.includes(c.id)).map((c) => c.id)}
                              onSelectionChange={(keys) => {
                                const visible = keys === "all" ? null : new Set(Array.from(keys, String))
                                setHiddenColumns(visible ? hideableColumns.filter((c) => !visible.has(c.id)).map((c) => c.id) : [])
                              }}
                            >
                              {hideableColumns.map((c) => (
                                <Dropdown.Item key={c.id} id={c.id} textValue={c.label} className={menuCheckItemClass}>
                                  <Dropdown.ItemIndicator />
                                  {c.label}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Section>
                            {hiddenColumns.length > 0 ? (
                              <Dropdown.Section aria-label="Reset columns" className="mt-1 pt-1 border-t border-zinc-100">
                                <Dropdown.Item id="show-all-columns" textValue="Show all columns" onAction={showAllColumns} className={cn(menuItemClass, "pl-[35px] text-indigo-600")}>
                                  Show all columns
                                </Dropdown.Item>
                              </Dropdown.Section>
                            ) : null}
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown.SubmenuTrigger>
                    </Dropdown.Section>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </ButtonGroup>
          </div>
        </div>

        {/* Active conditions chips */}
        <AnimatePresence initial={false}>
          {hasConditions && (
            <motion.div
              key="chips"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-4 md:px-6 pb-3 pt-0.5 overflow-x-auto scrollbar-none">
                {groupBy && (
                  <ConditionChip tone="emerald" onRemove={() => setGroupBy(null)}>
                    Grouped by <strong className="font-semibold">{colLabel(groupBy)}</strong>
                  </ConditionChip>
                )}
                {sorts.map((r) => (
                  <ConditionChip key={r.id} tone="amber" onRemove={() => removeSort(r.id)}>
                    <strong className="font-semibold">{colLabel(r.field)}</strong>{" "}
                    {r.direction === "asc" ? "↑ A–Z" : "↓ Z–A"}
                  </ConditionChip>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main scrollable grid */}
      <div className="flex-1 overflow-hidden bg-white px-4 md:px-6 py-5">
        {catalogView === "serial" ? (
          <SerialNumberView key={serialViewKey} />
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Spinner size="md" color="accent" />
            <Typography.Paragraph size="sm" className="text-zinc-500 font-medium">Loading catalog…</Typography.Paragraph>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Typography.Paragraph size="sm" className="text-red-500">{error}</Typography.Paragraph>
            <Button variant="outline" onPress={refetch} className="text-xs rounded-lg cursor-pointer">
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Typography.Paragraph size="sm" className="text-zinc-400">No products yet — add your first product to get started</Typography.Paragraph>
            <Button
              variant="primary"
              onPress={handleOpenAddProduct}
              className="bg-indigo-600 text-white rounded-xl text-sm px-4 h-9 cursor-pointer"
            >
              <Plus className="mr-1.5" />Add Product
            </Button>
          </div>
        ) : (
          <div>
            {grouped.map(({ key, label, rows: groupRows }) => (
              <div key={key}>
                {/* Group header */}
                {label && (
                  <GroupHeader
                    label={label}
                    count={groupRows.length}
                    isCollapsed={collapsedGroups.has(key)}
                    onToggle={() => toggleGroup(key)}
                  />
                )}

                {/* Group rows — a reusable DataTable instance per group */}
                <AnimatePresence initial={false}>
                  {!collapsedGroups.has(key) && (
                    <motion.div
                      key={key + "_rows"}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <DataTable
                        data={groupRows}
                        columns={catalogColumns}
                        ariaLabel={label ?? "Catalog"}
                        emptyMessage="No products"
                        entityName="product"
                        pageSize={20}
                        enableRowSelection
                        selectedKeys={new Set(groupRows.filter((r) => selectedIds.has(r.id)).map((r) => r.id))}
                        onSelectionChange={handleGroupSelectionChange(groupRows)}
                        renderSubRow={renderCatalogSubRow}
                        stickyActions={false}
                        maxHeight="calc(100vh - 290px)"
                        getCellText={getCellText}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bulk action bar ── */}
      <AnimatePresence>
        {selectedCount() > 0 && (
          <motion.div
            key="bulk-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 text-white shadow-2xl border-t border-zinc-700"
          >
            <Typography.Paragraph size="sm" weight="medium">
              {selectedCount()} row{selectedCount() !== 1 ? "s" : ""} selected
            </Typography.Paragraph>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onPress={deselectAll}
                className="h-8 px-3 text-xs rounded-lg text-white border-zinc-600 hover:border-zinc-400 cursor-pointer"
              >
                Deselect All
              </Button>
              <Button
                variant="primary"
                onPress={handleBulkEdit}
                className="h-8 px-3 text-xs rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white cursor-pointer"
              >
                Bulk Edit
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Discontinue confirmation modal ── */}
      <Modal isOpen={!!discontinueTarget} onOpenChange={(open) => !open && setDiscontinueTarget(null)}>
        <Modal.Backdrop className="z-[200]">
          <Modal.Container size="sm" className="z-[200]">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="flex gap-2 items-center text-amber-700 border-b border-zinc-100">
                    <TriangleExclamation width="18" height="18" className="text-amber-500" />
                    Discontinue Product?
                  </Modal.Header>
                  <Modal.Body className="py-5">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      Mark{" "}
                      <Typography.Code weight="semibold" className="text-zinc-900">{discontinueTarget?.sku}</Typography.Code>
                      {" "}as discontinued? It will no longer appear as active but its data is preserved.
                    </Typography.Paragraph>
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button
                      variant="outline"
                      onPress={close}
                      isDisabled={isDiscontinuing}
                      className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      onPress={confirmDiscontinue}
                      isDisabled={isDiscontinuing}
                      className="bg-amber-600 text-white rounded-xl cursor-pointer font-medium"
                    >
                      {isDiscontinuing ? "Updating…" : "Discontinue"}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Product modal (add / edit) ── */}
      <ProductModal
        mode={productModalMode}
        catalogId={editingRow?.id}
        existingRow={editingRow ?? undefined}
        isOpen={productModalOpen}
        onOpenChange={setProductModalOpen}
        onSaved={handleProductSaved}
      />

      {/* ── Inventory modal ── */}
      <InventoryModal
        catalogId={inventoryTargetId}
        isOpen={inventoryModalOpen}
        onOpenChange={setInventoryModalOpen}
        onSaved={handleInventorySaved}
        mode={inventoryModalMode}
        existingRow={editingInventoryRow}
      />
      {/* ── Copy & convert serials → SKUs confirmation ── */}
      <ConvertSerialsModal
        isOpen={convertConfirmOpen}
        onOpenChange={setConvertConfirmOpen}
        onConfirm={handleConvertSerialsToSku}
      />

      {/* ── Bulk Upload SKUs modal ── */}
      <BulkUploadModal
        isOpen={bulkUploadModalOpen}
        onOpenChange={setBulkUploadModalOpen}
        onSuccess={refetch}
      />
      {/* ── Bulk Upload Serials modal ── */}
      <BulkSerialUploadModal
        isOpen={bulkSerialUploadModalOpen}
        onOpenChange={setBulkSerialUploadModalOpen}
        onSuccess={refetch}
      />
    </div>
  )
}
