"use client"

import { useMemo, useRef, useState, useEffect, useLayoutEffect, memo, useCallback } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "motion/react"
import type { PanInfo } from "motion/react"
import { Typography, Checkbox, Button, Dropdown, ScrollShadow, toast } from "@heroui/react"
import { cn } from "@/lib/utils"
import { useViewStore } from "@/stores/viewStore"
import { useCatalogStore } from "@/stores/catalogStore"
import { useIsMobile } from "@/hooks/useMediaQuery"
import { supabase } from "@/lib/supabase/client"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import CardStack from "@/components/shared/CardStack"
import type { GalleryInventoryItem } from "@/hooks/useGalleryCatalog"
import type { RowHeight } from "@/types/app.types"

interface KanbanViewProps {
  items: GalleryInventoryItem[]
  isLoading: boolean
  rowHeight: RowHeight
  onCardClick: (item: GalleryInventoryItem) => void
  refetch: () => Promise<void>
}

type GroupField =
  | "sku"
  | "location_name"
  | "collection_name"
  | "quality_name"
  | "design_name"
  | "product_name"
  | "construction_name"
  | "size_label"

function getGroupValue(item: GalleryInventoryItem, field: GroupField): string {
  return (item[field] as string | null) ?? "Ungrouped"
}

interface KanbanCardProps {
  item: GalleryInventoryItem
  rowHeight: RowHeight
  onCardClick: (item: GalleryInventoryItem) => void
  isDragging: boolean
  activeDragId: string | null
  onDragStart: (item: GalleryInventoryItem) => void
  onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  onDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo, item: GalleryInventoryItem) => void
  isMobile: boolean
  stackImages?: string[]
  dragSnapToOrigin?: boolean
  /** Viewport DOMRect of the card being dragged — used to compute fly-to offset for ghost cards */
  dragAnchorRect?: DOMRect | null
}

const KanbanCard = memo(({
  item,
  rowHeight,
  onCardClick,
  isDragging,
  activeDragId,
  onDragStart,
  onDrag,
  onDragEnd,
  isMobile,
  stackImages = [],
  dragSnapToOrigin = true,
  dragAnchorRect = null,
}: KanbanCardProps) => {
  const isSelected = useCatalogStore((s) => s.selectedInventoryIds.has(item.id))
  const toggleInventorySelected = useCatalogStore((s) => s.toggleInventorySelected)
  const selectedCount = useCatalogStore.getState().selectedInventoryIds.size
  const isAnySelectedCardDragging = useCatalogStore((s) => activeDragId !== null && s.selectedInventoryIds.has(activeDragId))

  const imgHeight = rowHeight === "compact" ? "h-20" : rowHeight === "normal" ? "h-28" : "h-40"

  // Ghost = another selected card being "pulled" behind the dragged card
  const isGhost = isAnySelectedCardDragging && isSelected && !isDragging
  // Dimmed = unselected card while a drag is happening
  const isDimmed = isAnySelectedCardDragging && !isSelected

  // Ref to measure this card's viewport position when it becomes a ghost
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Delta from this card's center → anchor card's center (fly-to target)
  const [flyDelta, setFlyDelta] = useState<{ x: number; y: number } | null>(null)

  // Tracks whether the pointer moved enough to be a drag — suppresses the
  // spurious click event that Framer Motion fires at drag-end (pointerup → click).
  const hasDragged = useRef(false)

  const handleDragStart = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    hasDragged.current = true
    onDragStart(item)
  }

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragEnd(event, info, item)
    // Keep the flag set a bit longer so the click that fires immediately after
    // pointerup is still blocked.
    setTimeout(() => { hasDragged.current = false }, 150)
  }

  const handleClick = () => {
    // Block click if: we just finished a drag, or another selected card is dragging
    if (hasDragged.current || isAnySelectedCardDragging) return
    onCardClick(item)
  }

  // When isGhost flips true, capture current position and compute the pull vector.
  // useLayoutEffect fires synchronously before the browser paints, so getBoundingClientRect
  // still reflects the card's pre-animation position.
  useLayoutEffect(() => {
    if (isGhost && dragAnchorRect && cardRef.current) {
      const selfRect = cardRef.current.getBoundingClientRect()
      setFlyDelta({
        x: (dragAnchorRect.left + dragAnchorRect.width / 2) - (selfRect.left + selfRect.width / 2),
        y: (dragAnchorRect.top  + dragAnchorRect.height / 2) - (selfRect.top  + selfRect.height / 2),
      })
    } else if (!isGhost) {
      // Reset without animation so the card re-enters normally in its new column
      setFlyDelta(null)
    }
  }, [isGhost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animate props — ghost cards fly toward anchor then vanish;
  // x/y reset is instant (duration 0) so they don't fly back on drop.
  const animateProps = isGhost
    ? { x: flyDelta?.x ?? 0, y: flyDelta?.y ?? 0, opacity: 0, scale: 0.75 }
    : { x: 0, y: 0, opacity: isDimmed ? 0.35 : 1, scale: isDimmed ? 0.97 : 1 }

  const transitionProps = isGhost
    ? { type: "spring" as const, stiffness: 520, damping: 32, mass: 0.6, opacity: { duration: 0.18 } }
    : { type: "spring" as const, stiffness: 300, damping: 24, x: { duration: 0 }, y: { duration: 0 } }

  return (
    <motion.div
      ref={cardRef}
      layout
      layoutId={item.id}
      data-item-id={item.id}
      drag={!isMobile && !isGhost}
      dragSnapToOrigin={dragSnapToOrigin}
      onDragStart={handleDragStart}
      onDrag={onDrag}
      onDragEnd={handleDragEnd}
      animate={animateProps}
      transition={transitionProps}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        cursor: "grabbing",
        zIndex: 50,
        pointerEvents: "none",
      }}
      whileHover={!isMobile && !isGhost ? { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.09)" } : undefined}
      onClick={handleClick}
      className={cn(
        "group relative cursor-pointer select-none touch-none",
        isGhost ? "pointer-events-none" : ""
      )}
    >
      <CardStack count={isDragging && isSelected ? selectedCount : 1} isDragging={isDragging} images={stackImages}>
        <div
          className={cn(
            "relative bg-white rounded-xl border border-zinc-100 overflow-hidden transition-all group-hover:border-zinc-200"
          )}
        >
          {/* Checkbox (visible on hover or always if selected) */}
          <div
            className={cn(
              "absolute top-2 left-2 z-20 transition-opacity duration-200",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              isSelected={isSelected}
              onChange={() => toggleInventorySelected(item.id)}
              aria-label="Select card"
            >
              <Checkbox.Content className="flex items-center justify-center p-0 pointer-events-auto">
                <Checkbox.Control className="rounded-full">
                  <Checkbox.Indicator />
                </Checkbox.Control>
              </Checkbox.Content>
            </Checkbox>
          </div>

          <div className={cn("relative overflow-hidden bg-zinc-50 pointer-events-none", imgHeight)}>
            {item.image_url ? (
              <Image
                src={getThumbnailUrl(item.image_url, { width: 320, quality: 75 })}
                alt={item.sku ?? "Product"}
                fill
                unoptimized
                sizes="280px"
                className="object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" className="text-zinc-200" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21,15 16,10 5,21" />
                </svg>
              </div>
            )}
            {item.location_name && (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-4 px-1.5 rounded-full bg-black/50 text-white text-[9px] font-medium backdrop-blur-sm">
                {item.location_name}
              </span>
            )}
          </div>
          <div className="p-2.5 flex flex-col gap-0.5 pointer-events-none">
            <div className="flex items-center justify-between gap-1">
              <Typography.Paragraph size="xs" weight="semibold" truncate className="font-mono text-zinc-900 flex-1">{item.sku ?? "—"}</Typography.Paragraph>
              {item.serial_number && (
                <span className="font-mono text-[9px] text-zinc-400 font-semibold bg-zinc-100 px-1 rounded-xs shrink-0">
                  {item.serial_number}
                </span>
              )}
            </div>
            <Typography.Paragraph size="xs" truncate className="text-zinc-500">{item.quality_name ?? ""}</Typography.Paragraph>
            <Typography.Paragraph size="xs" truncate className="text-zinc-400">{item.size_label ?? ""}</Typography.Paragraph>
          </div>
        </div>
      </CardStack>
    </motion.div>
  )
})


function SkeletonColumn() {
  return (
    <div className="flex flex-col gap-2 w-64 shrink-0">
      <div className="h-8 bg-zinc-100 rounded-xl animate-pulse" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 bg-zinc-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

export default function KanbanView({ items, isLoading, rowHeight, onCardClick, refetch }: KanbanViewProps) {
  // If no groupBy is specified, it works "sku" wise by default
  const rawGroupBy = useViewStore((s) => s.groupBy)
  const groupBy = (rawGroupBy || "sku") as GroupField
  const isMobile = useIsMobile()
  const boardRef = useRef<HTMLDivElement>(null)

  // Zustand selections - retrieve callbacks statically to avoid reactive subscription
  const deselectAllInventory = useCatalogStore.getState().deselectAllInventory

  // Synchronized and optimistically updated local copy of items
  const [localItems, setLocalItems] = useState<GalleryInventoryItem[]>(items)
  const [successDroppedIds, setSuccessDroppedIds] = useState<Set<string>>(new Set())

  // Stable references for async callbacks to prevent dynamic re-recreation of drag handlers
  const itemsRef = useRef(items)
  const groupByRef = useRef(groupBy)
  const localItemsRef = useRef(localItems)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    groupByRef.current = groupBy
  }, [groupBy])

  useEffect(() => {
    localItemsRef.current = localItems
  }, [localItems])

  // Keep localItems synced with items prop when items changes
  useEffect(() => {
    Promise.resolve().then(() => {
      setLocalItems(items)
      setSuccessDroppedIds(new Set())
    })
  }, [items])


  // Dragging states
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [draggedStackImages, setDraggedStackImages] = useState<string[]>([])
  // Ref to track the currently-hovered column — readable synchronously in onDragEnd
  const overColumnRef = useRef<Element | null>(null)
  // Viewport DOMRect of the card that was grabbed — ghost cards fly toward this position
  const dragAnchorRectRef = useRef<DOMRect | null>(null)

  // Show/Hide empty columns options
  const [showEmptyColumns, setShowEmptyColumns] = useState(false)
  const [allDictionaryValues, setAllDictionaryValues] = useState<{ id: string | null; title: string }[]>([])

  // Load all master dictionary values when showEmptyColumns is true
  useEffect(() => {
    if (!showEmptyColumns || isLoading) {
      Promise.resolve().then(() => {
        setAllDictionaryValues([])
      })
      return
    }

    async function fetchDictionary() {
      let data: { id: string | null; title: string }[] | null = null

      try {
        if (groupBy === "location_name") {
          const res = await (supabase.from("locations" as any) as any).select("id, location_name").order("location_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.location_name })) || []
        } else if (groupBy === "collection_name") {
          const res = await (supabase.from("collections" as any) as any).select("id, collection_name").order("collection_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.collection_name })) || []
        } else if (groupBy === "quality_name") {
          const res = await (supabase.from("qualities" as any) as any).select("id, quality_name").order("quality_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.quality_name })) || []
        } else if (groupBy === "design_name") {
          const res = await (supabase.from("designs" as any) as any).select("id, design_name").order("design_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.design_name })) || []
        } else if (groupBy === "product_name") {
          const res = await (supabase.from("product_types" as any) as any).select("id, product_name").order("product_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.product_name })) || []
        } else if (groupBy === "construction_name") {
          const res = await (supabase.from("constructions" as any) as any).select("id, construction_name").order("construction_name")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.construction_name })) || []
        } else if (groupBy === "size_label") {
          const res = await (supabase.from("sizes" as any) as any).select("id, size_label").order("size_label")
          data = ((res.data as any[]) ?? []).map((r: any) => ({ id: r.id, title: r.size_label })) || []
        }
      } catch (e) {
        console.error("Failed to fetch dictionary values:", e)
      }

      if (data) {
        if (groupBy === "collection_name" || groupBy === "construction_name") {
          data.push({ id: null, title: "Ungrouped" })
        }
        const finalData = data
        Promise.resolve().then(() => {
          setAllDictionaryValues(finalData)
        })
      } else {
        Promise.resolve().then(() => {
          setAllDictionaryValues([])
        })
      }
    }

    fetchDictionary()
  }, [groupBy, showEmptyColumns, isLoading])

  // Re-group columns dynamically based on items & active field using useMemo to avoid synchronous setState inside useEffect
  const boardColumns = useMemo(() => {
    if (isLoading) return []

    const columnsMap = new Map<string, { id: string | null; items: GalleryInventoryItem[] }>()

    for (const item of localItems) {
      const title = getGroupValue(item, groupBy)

      // Resolve relational ID for this column from the item itself
      let id: string | null = null
      if (groupBy === "sku") id = item.catalog_id
      else if (groupBy === "location_name") id = item.location_id
      else if (groupBy === "collection_name") id = item.collection_id
      else if (groupBy === "quality_name") id = item.quality_id
      else if (groupBy === "design_name") id = item.design_id
      else if (groupBy === "product_name") id = item.product_type_id
      else if (groupBy === "construction_name") id = item.construction_id
      else if (groupBy === "size_label") id = item.size_id

      if (!columnsMap.has(title)) {
        columnsMap.set(title, { id, items: [] })
      }
      columnsMap.get(title)!.items.push(item)
    }

    // Merge empty columns if showEmptyColumns is enabled and values are loaded
    if (showEmptyColumns && allDictionaryValues.length > 0) {
      const mergedColumns: { title: string; id: string | null; items: GalleryInventoryItem[] }[] = []

      for (const dicVal of allDictionaryValues) {
        const title = dicVal.title
        const grouped = columnsMap.get(title)
        mergedColumns.push({
          title,
          id: dicVal.id,
          items: grouped ? grouped.items : [],
        })
      }

      // Add any additional columns present in items but not in dictionary values
      for (const [title, data] of columnsMap.entries()) {
        const exists = allDictionaryValues.some((v) => v.title === title)
        if (!exists) {
          mergedColumns.push({
            title,
            id: data.id,
            items: data.items,
          })
        }
      }

      return mergedColumns
    }

    return Array.from(columnsMap.entries()).map(([title, data]) => ({
      title,
      id: data.id,
      items: data.items,
    }))
  }, [localItems, groupBy, isLoading, showEmptyColumns, allDictionaryValues])

  // Bulk update function
  const handleBulkUpdate = async (itemIds: string[], targetId: string | null, targetTitle: string) => {
    const finalValId = targetTitle === "Ungrouped" ? null : (targetId === "null" ? null : targetId)

    try {
      toast.success(`Moving ${itemIds.length} item(s) to ${targetTitle}...`)

      if (groupBy === "location_name") {
        if (!finalValId) throw new Error("Location ID cannot be empty")
        const { error } = await (supabase
          .from("inventory" as any) as any)
          .update({ location_id: finalValId })
          .in("id", itemIds)
        if (error) throw error
      } else if (groupBy === "sku") {
        if (!finalValId) throw new Error("SKU catalog ID cannot be empty")
        const { error } = await (supabase
          .from("inventory" as any) as any)
          .update({ catalog_id: finalValId })
          .in("id", itemIds)
        if (error) throw error
      } else {
        // Find parent catalog IDs for target items
        const catalogIds = Array.from(
          new Set(
            localItems
              .filter((item) => itemIds.includes(item.id))
              .map((item) => item.catalog_id)
              .filter(Boolean)
          )
        ) as string[]

        if (catalogIds.length > 0) {
          let fieldName = ""
          if (groupBy === "collection_name") fieldName = "collection_id"
          else if (groupBy === "quality_name") fieldName = "quality_id"
          else if (groupBy === "design_name") fieldName = "design_id"
          else if (groupBy === "product_name") fieldName = "product_type_id"
          else if (groupBy === "construction_name") fieldName = "construction_id"
          else if (groupBy === "size_label") fieldName = "size_id"

          if (fieldName) {
            const { error } = await (supabase
              .from("catalog" as any) as any)
              .update({ [fieldName]: finalValId } as any)
              .in("id", catalogIds)
            if (error) throw error
          }
        }
      }

      toast.success(`Successfully moved ${itemIds.length} item(s) to ${targetTitle}`)
      await refetch()
      deselectAllInventory()
    } catch (err) {
      console.error("Bulk update failed:", err)
      const errorMsg = err instanceof Error ? err.message : String(err)
      toast.danger(`Failed to move: ${errorMsg}`)
    }
  }

  // Translate absolute page coordinates to client viewport coordinates
  const getViewportCoords = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if ("clientX" in event && typeof event.clientX === "number") {
      return { x: event.clientX, y: event.clientY }
    }
    const touchEv = event as TouchEvent
    if (touchEv.touches && touchEv.touches[0]) {
      return { x: touchEv.touches[0].clientX, y: touchEv.touches[0].clientY }
    }
    if (touchEv.changedTouches && touchEv.changedTouches[0]) {
      return { x: touchEv.changedTouches[0].clientX, y: touchEv.changedTouches[0].clientY }
    }
    return {
      x: info.point.x - window.scrollX,
      y: info.point.y - window.scrollY,
    }
  }

  // Returns the column element whose X range contains the cursor — reliable even when
  // the cursor hovers over child elements (cards, text, images) inside the column.
  // Using X-only detection means the entire column height is a valid drop zone.
  const findColumnAtPoint = (cursorX: number): Element | null => {
    const columns = boardRef.current?.querySelectorAll("[data-column-title]")
    if (!columns) return null

    // First pass: exact X overlap
    for (const col of Array.from(columns)) {
      const rect = col.getBoundingClientRect()
      if (cursorX >= rect.left && cursorX <= rect.right) {
        return col
      }
    }

    // Second pass fallback: find nearest column by horizontal distance
    // (handles the gap between columns and cursor at board edge)
    let closestCol: Element | null = null
    let closestDist = 64 // only snap if within 64px of a column edge
    for (const col of Array.from(columns)) {
      const rect = col.getBoundingClientRect()
      const distLeft = Math.abs(cursorX - rect.left)
      const distRight = Math.abs(cursorX - rect.right)
      const dist = Math.min(distLeft, distRight)
      if (dist < closestDist) {
        closestDist = dist
        closestCol = col
      }
    }
    return closestCol
  }

  // Update handleBulkUpdateRef for callback stability
  const handleBulkUpdateRef = useRef<any>(null)
  useEffect(() => {
    handleBulkUpdateRef.current = handleBulkUpdate
  }, [handleBulkUpdate])

  // Pointer position detection during drag
  const handleDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const coords = getViewportCoords(event, info)
    const columnEl = findColumnAtPoint(coords.x)

    // Update ref synchronously — readable in onDragEnd without timing issues
    overColumnRef.current = columnEl

    // Update DOM attribute for CSS highlight — no React re-render
    const columns = boardRef.current?.querySelectorAll("[data-column-title]")
    columns?.forEach((col) => {
      if (col === columnEl) {
        col.setAttribute("data-drag-over", "true")
      } else {
        col.removeAttribute("data-drag-over")
      }
    })
  }, [])

  const handleDragStart = useCallback((item: GalleryInventoryItem) => {
    // Capture the anchor card's viewport rect BEFORE state updates trigger re-renders.
    // Ghost cards will read this to compute their fly-to delta.
    const anchorEl = boardRef.current?.querySelector(`[data-item-id="${item.id}"]`)
    dragAnchorRectRef.current = anchorEl ? anchorEl.getBoundingClientRect() : null

    setActiveDragId(item.id)
    overColumnRef.current = null

    const selectedInventoryIds = useCatalogStore.getState().selectedInventoryIds
    const currentLocalItems = localItemsRef.current

    if (selectedInventoryIds.has(item.id)) {
      const otherImages = currentLocalItems
        .filter((i) => selectedInventoryIds.has(i.id) && i.id !== item.id)
        .map((i) => i.image_url)
        .filter((url): url is string => !!url)
      // Shuffle them randomly
      const shuffled = [...otherImages].sort(() => 0.5 - Math.random())
      setDraggedStackImages(shuffled)
    } else {
      setDraggedStackImages([])
    }
  }, [])

  const handleDragEnd = useCallback(async (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
    item: GalleryInventoryItem
  ) => {
    // Read from ref — this is always the last value set by handleDrag,
    // not the stale DOM attribute which may have been cleared by a timing race.
    // If ref has no value, try one last point check using final event coords.
    let columnEl = overColumnRef.current
    if (!columnEl) {
      const coords = getViewportCoords(event, info)
      columnEl = findColumnAtPoint(coords.x)
    }

    // Clear all drag-over visual state
    overColumnRef.current = null
    const columns = boardRef.current?.querySelectorAll("[data-column-title]")
    columns?.forEach((col) => col.removeAttribute("data-drag-over"))

    const clearDragState = () => {
      setTimeout(() => {
        setActiveDragId(null)
        setDraggedStackImages([])
      }, 400)
    }

    if (!columnEl) {
      clearDragState()
      return
    }

    const targetTitle = columnEl.getAttribute("data-column-title")
    const targetId = columnEl.getAttribute("data-column-id")
    if (!targetTitle) {
      clearDragState()
      return
    }

    const currentGroupBy = groupByRef.current
    const currentVal = getGroupValue(item, currentGroupBy)
    if (targetTitle === currentVal) {
      clearDragState()
      return
    }

    const selectedInventoryIds = useCatalogStore.getState().selectedInventoryIds
    const isSelected = selectedInventoryIds.has(item.id)
    const itemIds = isSelected ? Array.from(selectedInventoryIds) : [item.id]

    // Mark as successfully dropped to prevent snap-back animation
    setSuccessDroppedIds((prev) => {
      const next = new Set(prev)
      itemIds.forEach((id) => next.add(id))
      return next
    })

    // Perform optimistic layout updates
    setLocalItems((prev) =>
      prev.map((i) => {
        if (itemIds.includes(i.id)) {
          let update: Partial<GalleryInventoryItem> = {}
          const finalId = targetId === "null" ? null : targetId
          if (currentGroupBy === "location_name") {
            update = { location_name: targetTitle, location_id: finalId }
          } else if (currentGroupBy === "collection_name") {
            update = { collection_name: targetTitle, collection_id: finalId }
          } else if (currentGroupBy === "quality_name") {
            update = { quality_name: targetTitle, quality_id: finalId }
          } else if (currentGroupBy === "design_name") {
            update = { design_name: targetTitle, design_id: finalId }
          } else if (currentGroupBy === "product_name") {
            update = { product_name: targetTitle, product_type_id: finalId }
          } else if (currentGroupBy === "construction_name") {
            update = { construction_name: targetTitle, construction_id: finalId }
          } else if (currentGroupBy === "size_label") {
            update = { size_label: targetTitle, size_id: finalId }
          } else if (currentGroupBy === "sku") {
            update = { sku: targetTitle, catalog_id: finalId }
          }
          return { ...i, ...update }
        }
        return i
      })
    )

    try {
      await handleBulkUpdateRef.current?.(itemIds, targetId, targetTitle)
    } catch {
      // Rollback optimistic update on database failure
      setLocalItems(itemsRef.current)
      setSuccessDroppedIds((prev) => {
        const next = new Set(prev)
        itemIds.forEach((id) => next.delete(id))
        return next
      })
    } finally {
      clearDragState()
    }
  }, [])


  const isAnySelectedCardDragging = useCatalogStore((s) => activeDragId !== null && s.selectedInventoryIds.has(activeDragId))

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4 md:p-6 overflow-x-auto pb-6 scrollbar-thin">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonColumn key={i} />
        ))}
      </div>
    )
  }

  if (boardColumns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 select-none">
        <Typography.Paragraph size="sm" weight="medium" className="text-zinc-500">No items match the current filters</Typography.Paragraph>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-zinc-50/50">
      {/* Options Header Bar */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2 bg-white border-b border-zinc-200 shadow-xs shrink-0">
        <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500 font-mono tracking-wider uppercase">
          Kanban Board
        </Typography.Paragraph>
        <div className="flex items-center gap-4">
          <Checkbox
            isSelected={showEmptyColumns}
            onChange={() => setShowEmptyColumns(!showEmptyColumns)}
            aria-label="Show empty columns"
          >
            <Checkbox.Content className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="text-xs font-semibold text-zinc-600 select-none">Show Empty Columns</span>
            </Checkbox.Content>
          </Checkbox>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-hidden h-full">
        {isMobile ? (
          <MobileKanban
            columns={boardColumns}
            rowHeight={rowHeight}
            onCardClick={onCardClick}
          />
        ) : (
          <div
            ref={boardRef}
            className="flex gap-4 p-4 md:p-6 overflow-x-auto pb-6 h-full min-h-0"
          >
            {boardColumns.map((col) => {
              return (
                <div
                  key={col.title}
                  data-column-title={col.title}
                  data-column-id={col.id || "null"}
                  className="flex flex-col w-64 shrink-0 rounded-xl p-2 transition-all duration-200 border border-dashed border-transparent bg-zinc-50/10 data-[drag-over=true]:bg-zinc-100/90 data-[drag-over=true]:border-zinc-300 data-[drag-over=true]:shadow-xs h-full min-h-0"
                >
                  {/* Static column header */}
                  <div className="flex items-center justify-between px-3 py-2 mb-2 rounded-xl bg-zinc-50 border border-zinc-200 shadow-xs shrink-0 select-none">
                    <Typography.Paragraph size="xs" weight="semibold" truncate className="text-zinc-700">{col.title}</Typography.Paragraph>
                    <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-semibold shrink-0">
                      {col.items.length}
                    </span>
                  </div>
                  {/* Column scroll area using HeroUI ScrollShadow */}
                  <ScrollShadow
                    hideScrollBar
                    className={cn(
                      "flex-1 min-h-0 flex flex-col gap-2 pr-0.5",
                      activeDragId ? "overflow-visible" : "overflow-y-auto"
                    )}
                    style={activeDragId ? { height: "100%", maxHeight: "100%" } : undefined}
                  >
                    {col.items.map((item) => (
                      <KanbanCard
                        key={item.id}
                        item={item}
                        rowHeight={rowHeight}
                        onCardClick={onCardClick}
                        isDragging={activeDragId === item.id}
                        activeDragId={activeDragId}
                        onDragStart={handleDragStart}
                        onDrag={handleDrag}
                        onDragEnd={handleDragEnd}
                        isMobile={false}
                        stackImages={activeDragId === item.id ? draggedStackImages : []}
                        dragSnapToOrigin={!successDroppedIds.has(item.id)}
                        dragAnchorRect={activeDragId ? dragAnchorRectRef.current : null}
                      />
                    ))}
                  </ScrollShadow>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Action Bar (Isolated subscription for high performance) */}
      <BulkActionBar
        deselectAll={deselectAllInventory}
        boardColumns={boardColumns}
        handleBulkUpdate={handleBulkUpdate}
      />
    </div>
  )
}

interface BulkActionBarProps {
  deselectAll: () => void
  boardColumns: { title: string; id: string | null; items: GalleryInventoryItem[] }[]
  handleBulkUpdate: (itemIds: string[], targetId: string | null, targetTitle: string) => Promise<void>
}

const BulkActionBar = memo(({ deselectAll, boardColumns, handleBulkUpdate }: BulkActionBarProps) => {
  const selectedInventoryCount = useCatalogStore((s) => s.selectedInventoryIds.size)

  if (selectedInventoryCount === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        key="bulk-bar"
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/95 border border-zinc-200 shadow-2xl rounded-2xl p-3 flex items-center gap-3 backdrop-blur-md max-w-[90vw] md:max-w-xl"
      >
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
                aria-label="Select target column"
                className="max-h-60 overflow-y-auto"
              >
                {boardColumns.map((col) => (
                  <Dropdown.Item
                    key={col.id || "null"}
                    onPress={() => handleBulkUpdate(Array.from(useCatalogStore.getState().selectedInventoryIds), col.id, col.title)}
                  >
                    {col.title}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </motion.div>
    </AnimatePresence>
  )
})
BulkActionBar.displayName = "BulkActionBar"


function MobileKanban({
  columns,
  rowHeight,
  onCardClick,
}: {
  columns: { title: string; id: string | null; items: GalleryInventoryItem[] }[]
  rowHeight: RowHeight
  onCardClick: (item: GalleryInventoryItem) => void
}) {
  const totalColumns = columns.length
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 375))

  useEffect(() => {
    const handler = () => setVw(window.innerWidth)
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])

  return (
    <div className="overflow-hidden h-full pb-16">
      <motion.div
        drag="x"
        dragConstraints={{ left: -(totalColumns - 1) * (vw - 32), right: 0 }}
        dragElastic={0.1}
        className="flex h-full"
        style={{ width: `${totalColumns * 100}vw` }}
      >
        {columns.map((col) => (
          <div key={col.title} className="flex flex-col px-4 pb-4" style={{ width: "100vw" }}>
            <div className={cn("sticky top-0 z-10 flex items-center justify-between px-3 py-2 mb-3 rounded-xl bg-zinc-50 border border-zinc-200")}>
              <Typography.Paragraph size="xs" weight="semibold" truncate className="text-zinc-700">{col.title}</Typography.Paragraph>
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-zinc-200 text-zinc-600 text-[10px] font-semibold shrink-0">
                {col.items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto pb-10">
              {col.items.map((item) => (
                <KanbanCard
                  key={item.id}
                  item={item}
                  rowHeight={rowHeight}
                  onCardClick={onCardClick}
                  isDragging={false}
                  activeDragId={null}
                  onDragStart={() => {}}
                  onDrag={() => {}}
                  onDragEnd={() => {}}
                  isMobile={true}
                />
              ))}
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
