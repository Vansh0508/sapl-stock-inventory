"use client"

import { useState, useCallback, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Tabs, Spinner } from "@heroui/react"
import type { Key } from "react"
import { cn } from "@/lib/utils"
import Toolbar from "@/components/shared/Toolbar"
import { useViewStore } from "@/stores/viewStore"
import { useGalleryCatalog, type GalleryInventoryItem } from "@/hooks/useGalleryCatalog"
import type { ViewMode, ToolbarColumn } from "@/types/app.types"
import GridView from "./GridView"
import GalleryView from "./GalleryView"
import KanbanView from "./KanbanView"
import RecordView from "./RecordView"

// ─── Toolbar columns for gallery context ─────────────────────────────────────

const GALLERY_COLUMNS: ToolbarColumn[] = [
  { id: "sku", label: "SKU", type: "text", groupable: false, hideable: false },
  { id: "serial_number", label: "Serial Number", type: "text" },
  { id: "location_name", label: "Location", type: "text" },
  { id: "product_name", label: "Product Type", type: "text" },
  { id: "quality_name", label: "Quality", type: "text" },
  { id: "design_name", label: "Design", type: "text" },
  { id: "collection_name", label: "Collection", type: "text" },
  { id: "construction_name", label: "Construction", type: "text" },
  { id: "color_names", label: "Colors", type: "text", groupable: false },
  { id: "size_label", label: "Size", type: "text" },
  { id: "is_active", label: "Status", type: "boolean", groupable: false },
]

// ─── View modes (text-only, no icons) ────────────────────────────────────────

// Grid, Gallery and Kanban are temporarily hidden from the switcher (not removed) — flip `hidden` to bring them back.
const VIEW_MODES: { id: ViewMode; label: string; hidden?: boolean }[] = [
  { id: "grid", label: "Grid", hidden: true },
  { id: "gallery", label: "Gallery", hidden: true },
  { id: "kanban", label: "Kanban", hidden: true },
  { id: "record", label: "Record" },
]

const VISIBLE_VIEW_MODES = VIEW_MODES.filter((mode) => !mode.hidden)
const DEFAULT_VIEW_MODE = VISIBLE_VIEW_MODES[0].id

// ─── GalleryTab ───────────────────────────────────────────────────────────────

export default function GalleryTab() {
  const galleryView = useViewStore((s) => s.galleryView)
  const setGalleryView = useViewStore((s) => s.setGalleryView)
  const rowHeight = useViewStore((s) => s.rowHeight)
  const openSearch = useViewStore((s) => s.openSearch)

  const { items, isLoading, error, refetch } = useGalleryCatalog()

  // Ctrl+F / Cmd+F opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openSearch])

  // A hidden view mode left over from persisted state renders as the default immediately (so the
  // hidden view never mounts), and the store is corrected to match.
  const isHiddenView = !!VIEW_MODES.find((mode) => mode.id === galleryView)?.hidden
  const activeView: ViewMode = isHiddenView ? DEFAULT_VIEW_MODE : galleryView
  useEffect(() => {
    if (isHiddenView) setGalleryView(DEFAULT_VIEW_MODE)
  }, [isHiddenView, setGalleryView])

  // Selected item for Record standalone view
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Modal item (opened from card click in non-record views)
  const [modalItem, setModalItem] = useState<GalleryInventoryItem | null>(null)

  const handleCardClick = useCallback(
    (item: GalleryInventoryItem) => {
      if (activeView === "record") {
        setSelectedId(item.id)
      } else {
        setModalItem(item)
      }
    },
    [activeView]
  )

  const handleModalNavigate = useCallback(
    (id: string) => {
      const found = items.find((i) => i.id === id)
      if (found) setModalItem(found)
    },
    [items]
  )

  const sharedProps = { items, isLoading, rowHeight, onCardClick: handleCardClick, refetch }

  const isRecordView = activeView === "record"

  return (
    <div className={cn("flex flex-col flex-1 overflow-hidden bg-zinc-50/30", isRecordView && "h-full")}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-zinc-200/70">
        <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 overflow-x-auto md:overflow-x-visible scrollbar-none">
          {/* View mode switcher — HeroUI Tabs (text-only, no icons) */}
          <Tabs
            variant="secondary"
            selectedKey={activeView}
            onSelectionChange={(key: Key) => setGalleryView(key as ViewMode)}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Gallery view mode">
                {VISIBLE_VIEW_MODES.map((mode) => (
                  <Tabs.Tab key={mode.id} id={mode.id}>
                    {mode.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>

          {/* Toolbar (gallery-context) */}
          <Toolbar columns={GALLERY_COLUMNS} context="gallery" className="justify-end" />
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 md:mx-6 mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200 shrink-0">
          {error}
        </div>
      )}

      {/* ── Active view ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-24 bg-zinc-50/10 gap-3">
          <Spinner size="lg" color="accent" />
          <p className="text-zinc-500 font-medium text-sm">Loading gallery inventory...</p>
        </div>
      ) : (
        <div className={cn("flex-1 min-h-0", isRecordView ? "overflow-hidden" : "overflow-auto")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={cn(isRecordView ? "h-full" : "")}
            >
              {activeView === "grid" && <GridView {...sharedProps} />}
              {activeView === "gallery" && <GalleryView {...sharedProps} />}
              {activeView === "kanban" && <KanbanView {...sharedProps} />}
              {activeView === "record" && (
                <RecordView
                  items={items}
                  isLoading={isLoading}
                  selectedId={selectedId}
                  onSelectId={setSelectedId}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* ── Card-click record modal (non-record views) ────────────────────── */}
      <RecordView
        asModal
        modalItem={modalItem}
        items={items}
        isLoading={false}
        selectedId={modalItem?.id ?? null}
        onSelectId={handleModalNavigate}
        onClose={() => setModalItem(null)}
      />
    </div>
  )
}
