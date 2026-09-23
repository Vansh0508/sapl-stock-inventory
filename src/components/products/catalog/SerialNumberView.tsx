"use client"

import { useCallback, useEffect, useMemo, useState, useRef, memo } from "react"
import { Button, Checkbox, Select, ListBox, ListBoxItem, Popover, Dropdown, ScrollShadow, Spinner, toast, Typography, SearchField, EmptyState, Modal } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { useCatalogStore } from "@/stores/catalogStore"
import { useViewStore } from "@/stores/viewStore"

// ──────────────────────────────────────────────────────────
// Types & Column Configuration
// ──────────────────────────────────────────────────────────

interface SerialInventoryRow {
  id: string // inventory ID
  serial_number: string
  catalog_id: string
  location_id: string
  location_name: string | null
  location_state: string | null
  location_country: string | null
  currency_symbol: string | null
  sku: string
  is_active: boolean
  product_name: string
  size_label: string
  quality_name: string
  design_name: string
  collection_name: string | null
  construction_name: string | null
  color_names: string | null
  fiber_configuration: string | null
  product_type_id: string
  quality_id: string
  design_id: string
  collection_id: string | null
  construction_id: string | null
  size_id: string
  is_sold: boolean
  // local color IDs
  color_ids: string[]
}

interface OptionItem {
  id: string
  label: string
}

interface ColumnConfig {
  id: keyof SerialInventoryRow | "colors" | "actions"
  label: string
  editableFor: "parent" | "child" | "none"
  width: number
}

const ALL_COLUMNS: ColumnConfig[] = [
  // Read-only parent SKU metadata
  { id: "sku", label: "Parent SKU", editableFor: "none", width: 140 },
  
  // Editable parent SKU details
  { id: "product_type_id", label: "Product Type", editableFor: "parent", width: 150 },
  { id: "quality_id", label: "Quality", editableFor: "parent", width: 130 },
  { id: "design_id", label: "Design", editableFor: "parent", width: 130 },
  { id: "colors", label: "Colors", editableFor: "parent", width: 180 },
  { id: "size_id", label: "Size", editableFor: "parent", width: 100 },
  { id: "is_active", label: "Status", editableFor: "parent", width: 120 },
  { id: "collection_id", label: "Collection", editableFor: "parent", width: 160 },
  { id: "construction_id", label: "Construction", editableFor: "parent", width: 160 },
  
  // Editable child serial details
  { id: "location_id", label: "Location", editableFor: "child", width: 180 },
  { id: "actions", label: "Actions", editableFor: "none", width: 100 },
]

// ──────────────────────────────────────────────────────────
// Custom Switched Selectors
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
    let result = options
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = options.filter((o) => o.label.toLowerCase().includes(query))
    }
    // Bubble selected option to the top
    if (value) {
      const selected = result.find((o) => o.id === value)
      if (selected) {
        return [selected, ...result.filter((o) => o.id !== value)]
      }
    }
    return result
  }, [options, searchQuery, value])

  const selectedLabel = useMemo(() => {
    return options.find((o) => o.id === value)?.label || placeholder
  }, [options, value, placeholder])

  return (
    <Popover>
      <Popover.Trigger>
        <button
          type="button"
          className={cn(
            "w-full h-full bg-transparent border-0 outline-hidden flex items-center justify-between text-xs px-2 py-1 text-left cursor-pointer hover:bg-zinc-100/40 rounded-none shadow-none focus:bg-white min-h-[36px]",
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

function GridMultiSelect({
  value,
  onChange,
  options,
  placeholder = "— None —",
  className,
  triggerClassName,
}: {
  value: string[]
  onChange: (val: string[]) => void
  options: OptionItem[]
  placeholder?: string
  className?: string
  triggerClassName?: string
}) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    let result = options
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = options.filter((o) => o.label.toLowerCase().includes(query))
    }
    // Bubble all selected items to the top
    if (value && value.length > 0) {
      const selectedItems = result.filter((o) => value.includes(o.id))
      const unselectedItems = result.filter((o) => !value.includes(o.id))
      return [...selectedItems, ...unselectedItems]
    }
    return result
  }, [options, searchQuery, value])

  const displayLabel = useMemo(() => {
    if (!value || value.length === 0) return placeholder
    return value.map((val) => options.find((o) => o.id === val)?.label || "").filter(Boolean).join(", ")
  }, [value, options, placeholder])

  return (
    <Popover>
      <Popover.Trigger>
        <button
          type="button"
          className={cn(
            "w-full bg-transparent border-0 outline-hidden flex items-center justify-between text-xs px-2 py-1 text-left cursor-pointer hover:bg-zinc-100/40 rounded-none shadow-none focus:bg-white h-full min-h-[36px]",
            triggerClassName
          )}
        >
          <span className="truncate flex-1 text-zinc-800">{displayLabel}</span>
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
              selectionMode="multiple"
              selectedKeys={new Set(value)}
              onSelectionChange={(keys) => {
                const arr = Array.from(keys).map(String)
                onChange(arr)
              }}
              renderEmptyState={() => (
                <EmptyState className="px-3 py-4 text-xs text-zinc-400 text-center">No results</EmptyState>
              )}
              aria-label="Dropdown options"
            >
              {filteredOptions.map((o) => (
                <ListBoxItem
                  key={o.id}
                  id={o.id}
                  textValue={o.label}
                  className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 rounded-lg"
                >
                  {({ isSelected }) => (
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className={cn(
                          "flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0 transition-colors",
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-300 bg-white"
                        )}
                      >
                        {isSelected && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="8"
                            height="8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="white"
                            strokeWidth="4"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={cn("text-xs truncate", isSelected ? "text-indigo-900 font-semibold" : "text-zinc-700")}>
                        {o.label}
                      </span>
                    </div>
                  )}
                </ListBoxItem>
              ))}
            </ListBox>
          </ScrollShadow>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

function StatusSelect({
  value,
  onChange,
  placeholder = "Select status",
  className,
  triggerClassName,
}: {
  value: boolean
  onChange: (val: boolean) => void
  placeholder?: string
  className?: string
  triggerClassName?: string
}) {
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

// Leaf-level Selection Components to keep parent rendering performance absolute
const SelectionAllCheckbox = memo(({ items }: { items: SerialInventoryRow[] }) => {
  const selectedInventoryIds = useCatalogStore((s) => s.selectedInventoryIds)
  const selectManyInventory = useCatalogStore((s) => s.selectManyInventory)
  const setSelectedInventory = useCatalogStore((s) => s.setSelectedInventory)

  const isAllSelected = items.length > 0 && items.every((item) => selectedInventoryIds.has(item.id))
  const isSomeSelected = items.some((item) => selectedInventoryIds.has(item.id)) && !isAllSelected

  const handleToggleAll = () => {
    if (isAllSelected) {
      const itemIds = items.map((i) => i.id)
      const nextIds = new Set(selectedInventoryIds)
      itemIds.forEach((id) => nextIds.delete(id))
      setSelectedInventory(Array.from(nextIds))
    } else {
      const itemIds = items.map((i) => i.id)
      selectManyInventory(itemIds)
    }
  }

  return (
    <div className="flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        isSelected={isAllSelected}
        isIndeterminate={isSomeSelected}
        onChange={handleToggleAll}
        aria-label="Select all rows"
      />
    </div>
  )
})
SelectionAllCheckbox.displayName = "SelectionAllCheckbox"

const RowSelectionCheckbox = memo(({ rowId }: { rowId: string }) => {
  const isSelected = useCatalogStore((s) => s.selectedInventoryIds.has(rowId))
  const toggleInventorySelected = useCatalogStore((s) => s.toggleInventorySelected)

  return (
    <div className="flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
      <Checkbox
        isSelected={isSelected}
        onChange={() => toggleInventorySelected(rowId)}
        aria-label="Select row"
      />
    </div>
  )
})
RowSelectionCheckbox.displayName = "RowSelectionCheckbox"

// ──────────────────────────────────────────────────────────
// Shift SKU Modal Content Component (Extract hooks to respect Rules of Hooks)
// ──────────────────────────────────────────────────────────

interface ShiftSkuModalContentProps {
  shiftTarget: SerialInventoryRow
  catalogOptions: { id: string; sku: string }[]
  onClose: () => void
  onShiftCompleted: (targetCatalogId: string, targetSku: string, updatedPieceDetails: any, newColorIds: string[]) => void
}

function ShiftSkuModalContent({
  shiftTarget,
  catalogOptions,
  onClose,
  onShiftCompleted,
}: ShiftSkuModalContentProps) {
  const [selectedCatId, setSelectedCatId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  const filteredCatalog = useMemo(() => {
    return catalogOptions.filter((c) =>
      c.sku.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [catalogOptions, searchQuery])

  const handleShift = async () => {
    if (!selectedCatId) return
    const targetSkuObj = catalogOptions.find((c) => c.id === selectedCatId)
    if (!targetSkuObj) return

    try {
      // Update inventory row in Supabase
      const { error } = await (supabase
        .from("inventory" as any) as any)
        .update({ catalog_id: selectedCatId })
        .eq("id", shiftTarget.id)

      if (error) throw error

      // Get details of the newly updated inventory piece directly from the view
      const { data: updatedPiece, error: viewErr } = await (supabase
        .from("view_inventory_gallery" as any) as any)
        .select("*")
        .eq("id", shiftTarget.id)
        .maybeSingle()

      if (viewErr) throw viewErr
      if (!updatedPiece) throw new Error("Could not load updated piece details")

      // Load colors for the new SKU
      const { data: newColors } = await (supabase
        .from("catalog_colors" as any) as any)
        .select("color_id")
        .eq("catalog_id", selectedCatId)

      const newColorIds = ((newColors as any[]) ?? []).map((c: any) => c.color_id)

      onShiftCompleted(selectedCatId, targetSkuObj.sku, updatedPiece, newColorIds)
      onClose()
    } catch (err: any) {
      console.error("Failed to shift SKU:", err)
      toast.danger(`Failed to shift SKU: ${err.message || String(err)}`)
    }
  }

  return (
    <div className="flex flex-col bg-white rounded-2xl overflow-hidden p-6 max-h-[80vh]">
      <Modal.Header className="text-zinc-900 font-semibold text-sm border-b border-zinc-100 pb-3 flex justify-between items-center">
        <span>Shift SKU: {shiftTarget.serial_number}</span>
      </Modal.Header>
      <div className="flex flex-col gap-4 py-4 flex-1 overflow-hidden">
        <Typography.Paragraph size="xs" className="text-zinc-500">
          Select the destination SKU. Shifting will update all associated attributes for this physical piece.
        </Typography.Paragraph>
        
        <div className="flex flex-col gap-2 flex-1 overflow-hidden">
          <SearchField
            aria-label="Search SKUs"
            value={searchQuery}
            onChange={setSearchQuery}
            className="border border-zinc-200 rounded-xl overflow-hidden bg-white"
          >
            <SearchField.Group className="px-2.5 py-2 flex items-center gap-1.5">
              <SearchField.Input placeholder="Search SKUs…" className="text-xs outline-hidden w-full bg-transparent" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          
          <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-xl mt-2 max-h-60">
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-6 text-xs text-zinc-400">No matching SKUs</div>
            ) : (
              <ListBox
                selectionMode="single"
                selectedKeys={new Set([selectedCatId])}
                onSelectionChange={(keys) => {
                  const arr = Array.from(keys).map(String)
                  setSelectedCatId(arr[0] || "")
                }}
                aria-label="SKU options list"
              >
                {filteredCatalog.map((c) => (
                  <ListBoxItem
                    key={c.id}
                    id={c.id}
                    textValue={c.sku}
                    className="text-xs px-3 py-2 cursor-pointer outline-hidden hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-semibold rounded-lg"
                  >
                    {c.sku}
                  </ListBoxItem>
                ))}
              </ListBox>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex justify-end gap-2 border-t border-zinc-100 pt-3 shrink-0">
        <Button
          variant="secondary"
          onPress={onClose}
          className="text-xs px-3.5 h-9 rounded-xl border border-zinc-200 text-zinc-700 font-medium hover:bg-zinc-50 cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          isDisabled={!selectedCatId}
          onPress={handleShift}
          className="text-xs px-3.5 h-9 rounded-xl bg-zinc-900 text-white font-medium hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
        >
          Confirm Shift
        </Button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function SerialNumberView() {
  const [items, setItems] = useState<SerialInventoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isMoreLoading, setIsMoreLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Lookups dictionaries
  const [collections, setCollections] = useState<OptionItem[]>([])
  const [constructions, setConstructions] = useState<OptionItem[]>([])
  const [locations, setLocations] = useState<OptionItem[]>([])
  const [productTypes, setProductTypes] = useState<OptionItem[]>([])
  const [qualities, setQualities] = useState<OptionItem[]>([])
  const [designs, setDesigns] = useState<OptionItem[]>([])
  const [colors, setColors] = useState<OptionItem[]>([])
  const [sizes, setSizes] = useState<OptionItem[]>([])
  const [shiftTarget, setShiftTarget] = useState<SerialInventoryRow | null>(null)
  const [catalogOptions, setCatalogOptions] = useState<{ id: string; sku: string }[]>([])

  // Focused cell state for spreadsheet actions
  const [focusedCell, setFocusedCell] = useState<{ rowId: string; colId: string } | null>(null)

  // Cell drag state
  const [dragState, setDragState] = useState<{
    isDragging: boolean
    startRowId: string
    colId: string
    currentRowId: string
  } | null>(null)

  const searchQuery = useViewStore((s) => s.searchQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load progressive serial numbers + dictionaries
  useEffect(() => {
    let active = true
    setIsLoading(true)
    setItems([])

    async function loadData() {
      try {
        // 1. Fetch lookups in parallel
        const [colRes, conRes, locRes, ptRes, qualRes, desRes, colrRes, sizeRes, catRes] = await Promise.all([
          (supabase.from("collections" as any) as any).select("id, collection_name").order("collection_name"),
          (supabase.from("constructions" as any) as any).select("id, construction_name").order("construction_name"),
          (supabase.from("locations" as any) as any).select("id, location_name, country").order("location_name"),
          (supabase.from("product_types" as any) as any).select("id, product_name").order("product_name"),
          (supabase.from("qualities" as any) as any).select("id, quality_name").order("quality_name"),
          (supabase.from("designs" as any) as any).select("id, design_name").order("design_name"),
          (supabase.from("colors" as any) as any).select("id, color_name").order("color_name"),
          (supabase.from("sizes" as any) as any).select("id, size_label").order("size_label"),
          (supabase.from("catalog" as any) as any).select("id, sku").order("sku"),
        ])

        if (!active) return

        setCollections(((colRes.data as any[]) ?? []).map((c: any) => ({ id: c.id, label: c.collection_name })))
        setConstructions(((conRes.data as any[]) ?? []).map((c: any) => ({ id: c.id, label: c.construction_name })))
        setLocations(((locRes.data as any[]) ?? []).map((l: any) => ({
          id: l.id,
          label: l.country ? `${l.location_name} (${l.country})` : l.location_name
        })))
        setProductTypes(((ptRes.data as any[]) ?? []).map((p: any) => ({ id: p.id, label: p.product_name })))
        setQualities((q) => ((qualRes.data as any[]) ?? []).map((x: any) => ({ id: x.id, label: x.quality_name })))
        setDesigns((d) => ((desRes.data as any[]) ?? []).map((x: any) => ({ id: x.id, label: x.design_name })))
        setColors(((colrRes.data as any[]) ?? []).map((c: any) => ({ id: c.id, label: c.color_name })))
        setSizes((s) => ((sizeRes.data as any[]) ?? []).map((x: any) => ({ id: x.id, label: x.size_label })))
        setCatalogOptions(((catRes.data as any[]) ?? []).map((c: any) => ({ id: c.id, sku: c.sku })))

        // 2. Fetch inventory progressively in chunks of 100
        let hasMore = true
        let offset = 0
        const limit = 100
        let accumulated: SerialInventoryRow[] = []

        while (hasMore && active) {
          setIsMoreLoading(offset > 0)
          
          let query = (supabase.from("view_inventory_gallery" as any) as any)
            .select("*")

          const searchActive = debouncedSearch.trim().length > 0
          if (searchActive) {
            const q = `%${debouncedSearch.trim()}%`
            query = query.or(
              `sku.ilike.${q},serial_number.ilike.${q},product_name.ilike.${q},design_name.ilike.${q},quality_name.ilike.${q},location_name.ilike.${q},color_names.ilike.${q}`
            )
          }

          const { data: chunkData, error: err } = await query
            .order("sku", { ascending: true })
            .order("serial_number", { ascending: true })
            .range(offset, offset + limit - 1)

          if (err) throw err

          if (!chunkData || (chunkData as any[]).length === 0) {
            hasMore = false
            break
          }

          const chunkIds = ((chunkData as any[]) ?? []).map((d: any) => d.catalog_id).filter(Boolean) as string[]

          // Load junction table colors in parallel for these catalog records
          let colorMap: Record<string, string[]> = {}
          if (chunkIds.length > 0) {
            const { data: colorRows } = await (supabase
              .from("catalog_colors" as any) as any)
              .select("catalog_id, color_id")
              .in("catalog_id", chunkIds)

            if (colorRows) {
              for (const r of (colorRows as any[]) ?? []) {
                if (!colorMap[r.catalog_id]) colorMap[r.catalog_id] = []
                colorMap[r.catalog_id].push(r.color_id)
              }
            }
          }

          const mappedChunk: SerialInventoryRow[] = ((chunkData as any[]) ?? []).map((row: any) => ({
            id: row.id!,
            serial_number: row.serial_number!,
            catalog_id: row.catalog_id!,
            location_id: row.location_id!,
            location_name: row.location_name ?? null,
            location_state: row.location_state ?? null,
            location_country: row.location_country ?? null,
            currency_symbol: row.currency_symbol ?? null,
            sku: row.sku!,
            is_active: row.is_active ?? true,
            product_name: row.product_name!,
            size_label: row.size_label!,
            quality_name: row.quality_name!,
            design_name: row.design_name!,
            collection_name: row.collection_name ?? null,
            construction_name: row.construction_name ?? null,
            color_names: row.color_names ?? null,
            fiber_configuration: row.fiber_configuration ?? null,
            product_type_id: row.product_type_id!,
            quality_id: row.quality_id!,
            design_id: row.design_id!,
            collection_id: row.collection_id ?? null,
            construction_id: row.construction_id ?? null,
            size_id: row.size_id!,
            is_sold: row.is_sold ?? false,
            color_ids: colorMap[row.catalog_id!] || [],
          }))

          accumulated = [...accumulated, ...mappedChunk]
          setItems([...accumulated])
          setIsLoading(false)

          if (chunkData.length < limit) {
            hasMore = false
          } else {
            offset += limit
            // Yield execution to thread
            await new Promise((resolve) => setTimeout(resolve, 80))
          }
        }
        setIsMoreLoading(false)
      } catch (err: any) {
        if (active) {
          setError(err.message || String(err))
          setIsLoading(false)
          setIsMoreLoading(false)
        }
      }
    }

    loadData()
    return () => { active = false }
  }, [debouncedSearch])

  // ──────────────────────────────────────────────────────────
  // Cell Modification & Optimistic SKU Sync
  // ──────────────────────────────────────────────────────────

  const saveCellUpdate = useCallback(async (
    rowId: string,
    catalogId: string,
    colId: string,
    value: any,
    previousItems: SerialInventoryRow[]
  ) => {
    try {
      const colDef = ALL_COLUMNS.find((c) => c.id === colId) || { editableFor: "none" }
      
      if (colDef.editableFor === "parent") {
        if (colId === "colors") {
          const colorList = value as string[]
          // Delete & Insert in catalog_colors
          const { error: delErr } = await (supabase.from("catalog_colors" as any) as any).delete().eq("catalog_id", catalogId)
          if (delErr) throw delErr
          if (colorList.length > 0) {
            const { error: insErr } = await (supabase.from("catalog_colors" as any) as any).insert(
              colorList.map((cid) => ({ catalog_id: catalogId, color_id: cid }))
            )
            if (insErr) throw insErr
          }
        } else {
          // Update catalog fields
          const dbField = colId === "is_active" ? "is_active" : colId
          const { error: err } = await (supabase
            .from("catalog" as any) as any)
            .update({ [dbField]: value } as any)
            .eq("id", catalogId)
          if (err) throw err
        }
      } else if (colDef.editableFor === "child") {
        // Update inventory fields
        const { error: err } = await (supabase
          .from("inventory" as any) as any)
          .update({ [colId]: value } as any)
          .eq("id", rowId)
        if (err) throw err
      }
    } catch (e: any) {
      console.error("Database sync failed, rolling back:", e)
      toast.danger(`Failed to save change: ${e.message || String(e)}`)
      // Rollback to original items array
      setItems(previousItems)
    }
  }, [])

  const handleCellChange = useCallback(async (rowId: string, colId: string, value: any) => {
    const targetRow = items.find((i) => i.id === rowId)
    if (!targetRow) return

    const previousItems = [...items]
    const colDef = ALL_COLUMNS.find((c) => c.id === colId) || { editableFor: "none" }

    // Prepare updated list locally (optimistic update)
    let nextItems = items.map((item) => {
      // 1. If it is a parent SKU field, update ALL serial rows connected to this same catalog item
      if (colDef.editableFor === "parent" && item.catalog_id === targetRow.catalog_id) {
        if (colId === "colors") {
          const colorList = value as string[]
          const names = colorList.map((cid) => colors.find((c) => c.id === cid)?.label || "").filter(Boolean).join(", ")
          return { ...item, color_ids: colorList, color_names: names || "—" }
        }
        
        let nameUpdates: Partial<SerialInventoryRow> = {}
        if (colId === "product_type_id") {
          nameUpdates.product_name = productTypes.find((p) => p.id === value)?.label || ""
        } else if (colId === "quality_id") {
          nameUpdates.quality_name = qualities.find((q) => q.id === value)?.label || ""
        } else if (colId === "design_id") {
          nameUpdates.design_name = designs.find((d) => d.id === value)?.label || ""
        } else if (colId === "size_id") {
          nameUpdates.size_label = sizes.find((s) => s.id === value)?.label || ""
        } else if (colId === "collection_id") {
          nameUpdates.collection_name = collections.find((c) => c.id === value)?.label || null
        } else if (colId === "construction_id") {
          nameUpdates.construction_name = constructions.find((c) => c.id === value)?.label || null
        }

        return { ...item, [colId]: value, ...nameUpdates }
      }

      // 2. If it is an individual child row field, update only this exact serial number row
      if (colDef.editableFor === "child" && item.id === rowId) {
        let nameUpdates: Partial<SerialInventoryRow> = {}
        if (colId === "location_id") {
          const loc = locations.find((l) => l.id === value)
          nameUpdates.location_name = loc ? loc.label.split(" (")[0] : null
        }
        return { ...item, [colId]: value, ...nameUpdates }
      }

      return item
    })

    setItems(nextItems)

    // Fire network call in the background
    await saveCellUpdate(rowId, targetRow.catalog_id, colId, value, previousItems)
  }, [items, colors, productTypes, qualities, designs, sizes, collections, constructions, locations, saveCellUpdate])

  // ──────────────────────────────────────────────────────────
  // Cell Drag to Fill Functions
  // ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.MouseEvent, rowId: string, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragState({
      isDragging: true,
      startRowId: rowId,
      colId,
      currentRowId: rowId,
    })
  }

  const handleCellMouseEnter = (rowId: string, colId: string) => {
    if (!dragState || !dragState.isDragging || dragState.colId !== colId) return
    setDragState((prev) => {
      if (!prev) return null
      return { ...prev, currentRowId: rowId }
    })
  }

  const isCellInDragRange = useCallback((rowId: string, colId: string) => {
    if (!dragState || !dragState.isDragging || dragState.colId !== colId) return false
    const startIdx = items.findIndex((r) => r.id === dragState.startRowId)
    const endIdx = items.findIndex((r) => r.id === dragState.currentRowId)
    const curIdx = items.findIndex((r) => r.id === rowId)
    if (startIdx === -1 || endIdx === -1 || curIdx === -1) return false
    const min = Math.min(startIdx, endIdx)
    const max = Math.max(startIdx, endIdx)
    return curIdx >= min && curIdx <= max
  }, [dragState, items])

  // Mouse up to apply the dragged cell values across selected cells
  useEffect(() => {
    const handleMouseUp = async () => {
      if (!dragState || !dragState.isDragging) return
      
      const startIdx = items.findIndex((r) => r.id === dragState.startRowId)
      const endIdx = items.findIndex((r) => r.id === dragState.currentRowId)
      
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx)
        const maxIdx = Math.max(startIdx, endIdx)
        const rangeRows = items.slice(minIdx, maxIdx + 1)
        
        const sourceRow = items[startIdx]
        const colId = dragState.colId
        const sourceVal = colId === "colors" ? sourceRow.color_ids : sourceRow[colId as keyof SerialInventoryRow]
        
        const previousItems = [...items]
        const colDef = ALL_COLUMNS.find((c) => c.id === colId) || { editableFor: "none" }
        
        if (colDef.editableFor !== "none") {
          let nextItems = [...items]
          const uniqueCatalogIds = new Set<string>()

          for (const targetRow of rangeRows) {
            uniqueCatalogIds.add(targetRow.catalog_id)
          }

          nextItems = nextItems.map((item) => {
            if (colDef.editableFor === "parent" && uniqueCatalogIds.has(item.catalog_id)) {
              if (colId === "colors") {
                const colorList = sourceVal as string[]
                const names = colorList.map((cid) => colors.find((c) => c.id === cid)?.label || "").filter(Boolean).join(", ")
                return { ...item, color_ids: colorList, color_names: names || "—" }
              }

              let nameUpdates: Partial<SerialInventoryRow> = {}
              if (colId === "product_type_id") {
                nameUpdates.product_name = productTypes.find((p) => p.id === sourceVal)?.label || ""
              } else if (colId === "quality_id") {
                nameUpdates.quality_name = qualities.find((q) => q.id === sourceVal)?.label || ""
              } else if (colId === "design_id") {
                nameUpdates.design_name = designs.find((d) => d.id === sourceVal)?.label || ""
              } else if (colId === "size_id") {
                nameUpdates.size_label = sizes.find((s) => s.id === sourceVal)?.label || ""
              } else if (colId === "collection_id") {
                nameUpdates.collection_name = collections.find((c) => c.id === sourceVal)?.label || null
              } else if (colId === "construction_id") {
                nameUpdates.construction_name = constructions.find((c) => c.id === sourceVal)?.label || null
              }

              return { ...item, [colId]: sourceVal, ...nameUpdates }
            }

            if (colDef.editableFor === "child" && rangeRows.some((r) => r.id === item.id)) {
              let nameUpdates: Partial<SerialInventoryRow> = {}
              if (colId === "location_id") {
                const loc = locations.find((l) => l.id === sourceVal)
                nameUpdates.location_name = loc ? loc.label.split(" (")[0] : null
              }
              return { ...item, [colId]: sourceVal, ...nameUpdates }
            }

            return item
          })

          setItems(nextItems)
          toast.success("Applied cell values across range")

          try {
            if (colDef.editableFor === "parent") {
              const catalogIdArr = Array.from(uniqueCatalogIds)
              await Promise.all(
                catalogIdArr.map(async (catId) => {
                  if (colId === "colors") {
                    const colorList = sourceVal as string[]
                    const { error: delErr } = await (supabase.from("catalog_colors" as any) as any).delete().eq("catalog_id", catId)
                    if (delErr) throw delErr
                    if (colorList.length > 0) {
                      const { error: insErr } = await (supabase.from("catalog_colors" as any) as any).insert(
                        colorList.map((cid) => ({ catalog_id: catId, color_id: cid }))
                      )
                      if (insErr) throw insErr
                    }
                  } else {
                    const dbField = colId === "is_active" ? "is_active" : colId
                    const { error: err } = await (supabase
                      .from("catalog" as any) as any)
                      .update({ [dbField]: sourceVal } as any)
                      .eq("id", catId)
                    if (err) throw err
                  }
                })
              )
            } else if (colDef.editableFor === "child") {
              await Promise.all(
                rangeRows.map(async (row) => {
                  const { error: err } = await (supabase
                    .from("inventory" as any) as any)
                    .update({ [colId]: sourceVal } as any)
                    .eq("id", row.id)
                  if (err) throw err
                })
              )
            }
          } catch (e: any) {
            console.error("Bulk drag-fill db save failed, rolling back:", e)
            toast.danger(`Save range action failed: ${e.message || String(e)}`)
            setItems(previousItems)
          }
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
  }, [dragState, items, colors, productTypes, qualities, designs, sizes, collections, constructions, locations])

  // ──────────────────────────────────────────────────────────
  // Bulk Move Location (Optimistic UI)
  // ──────────────────────────────────────────────────────────

  const handleBulkMoveLocation = useCallback(async (targetLocId: string, targetLocLabel: string) => {
    const selectedIds = Array.from(useCatalogStore.getState().selectedInventoryIds)
    if (selectedIds.length === 0) return

    const previousItems = [...items]
    const cleanLocName = targetLocLabel.split(" (")[0]

    // 1. Optimistic Update
    setItems((prev) =>
      prev.map((item) => {
        if (selectedIds.includes(item.id)) {
          return { ...item, location_id: targetLocId, location_name: cleanLocName }
        }
        return item
      })
    )
    toast.success(`Moving ${selectedIds.length} pieces to ${cleanLocName}...`)

    // 2. Supabase Action
    try {
      const { error } = await (supabase
        .from("inventory" as any) as any)
        .update({ location_id: targetLocId })
        .in("id", selectedIds)

      if (error) throw error
      toast.success(`Successfully moved pieces`)
      useCatalogStore.getState().deselectAllInventory()
    } catch (err: any) {
      console.error("Failed to bulk move locations:", err)
      toast.danger(`Failed to move pieces: ${err.message || String(err)}`)
      setItems(previousItems)
    }
  }, [items])

  // ──────────────────────────────────────────────────────────
  // Grid Arrow Key Navigation
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === "INPUT" || target.tagName === "SELECT" || target.getAttribute("role") === "combobox"
      if (isInput && e.key === "Escape") {
        target.blur()
        return
      }

      if (!focusedCell || isInput) return

      const visibleColIds = ALL_COLUMNS.map((c) => c.id)
      const colIndex = visibleColIds.indexOf(focusedCell.colId as any)
      const rowIndex = items.findIndex((r) => r.id === focusedCell.rowId)

      if (rowIndex === -1) return

      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (rowIndex > 0) {
          setFocusedCell({ rowId: items[rowIndex - 1].id, colId: focusedCell.colId })
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (rowIndex < items.length - 1) {
          setFocusedCell({ rowId: items[rowIndex + 1].id, colId: focusedCell.colId })
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (colIndex > 0) {
          setFocusedCell({ rowId: focusedCell.rowId, colId: visibleColIds[colIndex - 1] })
        } else if (colIndex === 0) {
          setFocusedCell({ rowId: focusedCell.rowId, colId: "serial_number" })
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        if (focusedCell.colId === "serial_number") {
          setFocusedCell({ rowId: focusedCell.rowId, colId: visibleColIds[0] })
        } else if (colIndex < visibleColIds.length - 1) {
          setFocusedCell({ rowId: focusedCell.rowId, colId: visibleColIds[colIndex + 1] })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => { window.removeEventListener("keydown", handleKeyDown) }
  }, [focusedCell, items])

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Spinner size="md" color="accent" />
        <Typography.Paragraph size="sm" className="text-zinc-500 font-medium">Loading serial numbers progressively…</Typography.Paragraph>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-2">
        <Typography.Paragraph size="sm" className="text-red-500">Failed to load: {error}</Typography.Paragraph>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 select-none">
        <Typography.Paragraph size="sm" className="text-zinc-500 font-medium">No serial number rows found</Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-hidden bg-white flex flex-col relative select-none">
      {/* Progressive background loading spinner */}
      {isMoreLoading && (
        <div className="absolute top-3 right-4 z-50 flex items-center gap-2 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-full border border-zinc-200 shadow-md animate-in fade-in duration-200">
          <Spinner size="sm" color="accent" />
          <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase font-mono">Syncing pieces...</span>
        </div>
      )}
      
      {/* Scrollable table workspace using HeroUI ScrollShadow */}
      <ScrollShadow
        hideScrollBar
        className="flex-1 overflow-auto border border-zinc-200 rounded-xl relative shadow-sm max-h-[calc(100vh-270px)]"
      >
        <table className="w-full border-collapse select-text table-fixed">
          <thead>
            <tr className="bg-zinc-50 sticky top-0 z-40 border-b border-zinc-200 shadow-[0_1px_0_0_rgba(228,228,231,1)]">
              {/* Sticky Row Checkbox Header */}
              <th className="w-12 min-w-[48px] px-3 py-2 text-center border-r border-zinc-200 sticky left-0 bg-zinc-50 z-35 shadow-[1px_0_0_0_rgba(228,228,231,1)]">
                <SelectionAllCheckbox items={items} />
              </th>
              
              {/* Sticky SP Number Left Column Header */}
              <th className="w-48 min-w-[192px] px-3 py-2 text-[11px] font-bold text-zinc-500 text-left border-r border-zinc-200 sticky left-[48px] bg-zinc-50 z-30 shadow-[1px_0_0_0_rgba(228,228,231,1)]">
                Piece SP Number
              </th>
              
              {ALL_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className="px-3 py-2 text-[11px] font-bold text-zinc-500 text-left border-r border-zinc-200 bg-zinc-50"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const isDiscontinued = !row.is_active

              return (
                <tr
                  key={row.id}
                  className={cn(
                    "group border-b border-zinc-150 hover:bg-zinc-50/50",
                    isDiscontinued && "bg-zinc-50/40 text-zinc-400"
                  )}
                >
                  {/* Sticky left Selection Checkbox */}
                  <td className="w-12 min-w-[48px] p-0 border-r border-zinc-200 sticky left-0 bg-white group-hover:bg-zinc-50 z-25 text-center h-9 shadow-[1px_0_0_0_rgba(228,228,231,1)]">
                    <RowSelectionCheckbox rowId={row.id} />
                  </td>

                  {/* Sticky left SP Number Cell */}
                  <td 
                    className="px-3 py-1.5 border-r border-zinc-200 sticky left-[48px] bg-white group-hover:bg-zinc-50 z-20 font-mono text-xs font-bold text-zinc-700 h-9 shadow-[1px_0_0_0_rgba(228,228,231,1)]"
                    onMouseEnter={() => handleCellMouseEnter(row.id, "serial_number")}
                    onClick={() => setFocusedCell({ rowId: row.id, colId: "serial_number" })}
                  >
                    {row.serial_number}
                  </td>

                  {/* Spreadsheets Column Cells */}
                  {ALL_COLUMNS.map((col) => {
                    const cellId = col.id
                    const isEditable = col.editableFor !== "none"
                    const isFocused = focusedCell?.rowId === row.id && focusedCell?.colId === cellId
                    const inRange = isCellInDragRange(row.id, cellId)

                    return (
                      <td
                        key={col.id}
                        onMouseEnter={() => handleCellMouseEnter(row.id, cellId)}
                        onClick={() => isEditable && setFocusedCell({ rowId: row.id, colId: cellId })}
                        className={cn(
                          "relative p-0 border-r border-zinc-200 transition-colors h-9 text-xs outline-hidden",
                          isFocused && "ring-2 ring-indigo-500 ring-inset bg-indigo-50/10 z-10",
                          inRange && "bg-indigo-50/50 border-y border-y-indigo-300"
                        )}
                      >
                        {/* Display Field Component */}
                        {(() => {
                           if (col.id === "actions") {
                             return (
                               <div className="px-3 py-1 text-center">
                                 <Button
                                   variant="secondary"
                                   size="sm"
                                   className="h-7 text-[10px] px-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg cursor-pointer transition-colors shadow-xs"
                                   onPress={() => setShiftTarget(row)}
                                 >
                                   Shift SKU
                                 </Button>
                               </div>
                             )
                           }

                          if (col.id === "sku") {
                            return (
                              <div className="px-3 py-2 truncate font-mono text-xs text-zinc-600">
                                {row.sku}
                              </div>
                            )
                          }

                          if (!isEditable) {
                            return (
                              <div className="px-3 py-2 truncate text-zinc-500">
                                {(row as any)[col.id] || "—"}
                              </div>
                            )
                          }

                          // Lazy rendering: only show active Select triggers for the focused cell
                          if (!isFocused) {
                            if (col.id === "is_active") {
                              return (
                                <div className="px-3 py-2">
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border select-none",
                                      row.is_active
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                        : "bg-zinc-100 text-zinc-500 border-zinc-200/60"
                                    )}
                                  >
                                    {row.is_active ? "Active" : "Discontinued"}
                                  </span>
                                </div>
                              )
                            }
                            
                            let displayVal = "—"
                            if (col.id === "collection_id") displayVal = row.collection_name || "—"
                            else if (col.id === "construction_id") displayVal = row.construction_name || "—"
                            else if (col.id === "location_id") displayVal = row.location_name || "—"
                            else if (col.id === "product_type_id") displayVal = row.product_name || "—"
                            else if (col.id === "quality_id") displayVal = row.quality_name || "—"
                            else if (col.id === "design_id") displayVal = row.design_name || "—"
                            else if (col.id === "size_id") displayVal = row.size_label || "—"
                            else if (col.id === "colors") displayVal = row.color_names || "—"

                            return (
                              <div className="px-3 py-2 truncate text-zinc-600">
                                {displayVal}
                              </div>
                            )
                          }

                          // Dropdowns and Selects (only rendered on active cell focus)
                          if (col.id === "is_active") {
                            return (
                              <StatusSelect
                                value={row.is_active}
                                onChange={(val) => handleCellChange(row.id, "is_active", val)}
                              />
                            )
                          }

                          if (col.id === "collection_id") {
                            return (
                              <GridSelect
                                value={row.collection_id}
                                onChange={(val) => handleCellChange(row.id, "collection_id", val)}
                                options={collections}
                              />
                            )
                          }

                          if (col.id === "construction_id") {
                            return (
                              <GridSelect
                                value={row.construction_id}
                                onChange={(val) => handleCellChange(row.id, "construction_id", val)}
                                options={constructions}
                              />
                            )
                          }

                          if (col.id === "location_id") {
                            return (
                              <GridSelect
                                value={row.location_id}
                                onChange={(val) => handleCellChange(row.id, "location_id", val)}
                                options={locations}
                              />
                            )
                          }

                          if (col.id === "product_type_id") {
                            return (
                              <GridSelect
                                value={row.product_type_id}
                                onChange={(val) => handleCellChange(row.id, "product_type_id", val)}
                                options={productTypes}
                              />
                            )
                          }

                          if (col.id === "quality_id") {
                            return (
                              <GridSelect
                                value={row.quality_id}
                                onChange={(val) => handleCellChange(row.id, "quality_id", val)}
                                options={qualities}
                              />
                            )
                          }

                          if (col.id === "design_id") {
                            return (
                              <GridSelect
                                value={row.design_id}
                                onChange={(val) => handleCellChange(row.id, "design_id", val)}
                                options={designs}
                              />
                            )
                          }

                          if (col.id === "size_id") {
                            return (
                              <GridSelect
                                value={row.size_id}
                                onChange={(val) => handleCellChange(row.id, "size_id", val)}
                                options={sizes}
                              />
                            )
                          }

                          if (col.id === "colors") {
                            return (
                              <GridMultiSelect
                                value={row.color_ids}
                                onChange={(val) => handleCellChange(row.id, "colors", val)}
                                options={colors}
                              />
                            )
                          }

                          return <div className="px-3 py-2 text-zinc-300">—</div>
                        })()}

                        {/* Cell Corner Drag Handle Dot */}
                        {isFocused && (
                          <div
                            onMouseDown={(e) => handleDragStart(e, row.id, cellId)}
                            className="absolute bottom-0 right-0 w-2 h-2 bg-indigo-600 border border-white rounded-full cursor-crosshair z-30 shadow-xs"
                            title="Drag to fill values"
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

      {/* Floating Bulk Action Bar (Isolated subscription for high performance) */}
      <PieceBulkActionBar locations={locations} handleBulkMove={handleBulkMoveLocation} />

      {/* ── Shift SKU Modal ── */}
      <Modal isOpen={!!shiftTarget} onOpenChange={(open) => !open && setShiftTarget(null)}>
        <Modal.Backdrop className="z-[200]">
          <Modal.Container size="sm" className="z-[200]">
            <Modal.Dialog>
              {({ close }) =>
                shiftTarget && (
                  <ShiftSkuModalContent
                    shiftTarget={shiftTarget}
                    catalogOptions={catalogOptions}
                    onClose={close}
                    onShiftCompleted={(selectedCatId, targetSku, updatedPiece, newColorIds) => {
                      setItems((prev) =>
                        prev.map((item) => {
                          if (item.id === shiftTarget.id) {
                            return {
                              ...item,
                              catalog_id: selectedCatId,
                              sku: updatedPiece.sku || targetSku,
                              product_type_id: updatedPiece.product_type_id || item.product_type_id,
                              product_name: updatedPiece.product_name || item.product_name,
                              quality_id: updatedPiece.quality_id || item.quality_id,
                              quality_name: updatedPiece.quality_name || item.quality_name,
                              design_id: updatedPiece.design_id || item.design_id,
                              design_name: updatedPiece.design_name || item.design_name,
                              collection_id: updatedPiece.collection_id ?? null,
                              collection_name: updatedPiece.collection_name ?? null,
                              construction_id: updatedPiece.construction_id ?? null,
                              construction_name: updatedPiece.construction_name ?? null,
                              size_id: updatedPiece.size_id || item.size_id,
                              size_label: updatedPiece.size_label || item.size_label,
                              color_names: updatedPiece.color_names ?? null,
                              color_ids: newColorIds,
                            }
                          }
                          return item
                        })
                      )
                      toast.success(`Successfully shifted piece ${shiftTarget.serial_number} to SKU ${targetSku}`)
                    }}
                  />
                )
              }
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// Piece Bulk Action Bar
// ──────────────────────────────────────────────────────────

interface PieceBulkActionBarProps {
  locations: OptionItem[]
  handleBulkMove: (targetLocId: string, targetLocLabel: string) => Promise<void>
}

const PieceBulkActionBar = memo(({ locations, handleBulkMove }: PieceBulkActionBarProps) => {
  const selectedInventoryCount = useCatalogStore((s) => s.selectedInventoryIds.size)
  const deselectAll = useCatalogStore.getState().deselectAllInventory

  if (selectedInventoryCount === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 border border-zinc-200 shadow-2xl rounded-2xl p-3 flex items-center gap-3 backdrop-blur-md max-w-[90vw] md:max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-2 pl-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-black animate-pulse" />
        <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-800 shrink-0">
          {selectedInventoryCount} pieces selected
        </Typography.Paragraph>
      </div>

      <div className="h-5 w-px bg-zinc-200" />

      <div className="flex items-center gap-2">
        {/* Deselect All */}
        <Button
          size="sm"
          variant="ghost"
          onPress={deselectAll}
          className="text-zinc-600 hover:text-zinc-950 font-medium"
        >
          Deselect All
        </Button>

        {/* Move to Dropdown */}
        <Dropdown>
          <Dropdown.Trigger
            className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <span>Move to...</span>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="top">
            <Dropdown.Menu
              aria-label="Select location"
              className="max-h-60 overflow-y-auto"
            >
              {locations.map((loc) => (
                <Dropdown.Item
                  key={loc.id}
                  onPress={() => handleBulkMove(loc.id, loc.label)}
                >
                  {loc.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </div>
  )
})
PieceBulkActionBar.displayName = "PieceBulkActionBar"
