"use client"

import { useState, useEffect, useMemo } from "react"
import { Dropdown, Popover, ScrollShadow, Spinner } from "@heroui/react"
import { useContentViewsStore, type ContentView, type ContentFilterConfig } from "@/stores/contentViewsStore"
import CreateViewModal from "./CreateViewModal"
import { cn } from "@/lib/utils"
import { FOLDER_KEYS } from "@/lib/content-folders"
import { supabase } from "@/lib/supabase/client"
import { Check, ChevronDown, EyeSlash, Funnel, LayoutCellsLarge, Plus } from "@gravity-ui/icons"

const PARAM_LABELS: Record<string, string> = {
  designs: "Design",
  qualities: "Quality",
  colors: "Color",
  sizes: "Size",
  constructions: "Construction",
  collections: "Collection",
  folders: "Folder",
  serialCounts: "Serial Count",
}

interface GroupCategoryOption {
  key: keyof ContentFilterConfig | "none"
  label: string
  table?: string
  col?: string
  staticValues?: string[]
}

const PARAMETER_GROUP_CATEGORIES: GroupCategoryOption[] = [
  { key: "none", label: "None (All Assets)" },
  { key: "designs", label: "Design", table: "designs", col: "design_name" },
  { key: "collections", label: "Collection", table: "collections", col: "collection_name" },
  { key: "constructions", label: "Construction", table: "constructions", col: "construction_name" },
  { key: "qualities", label: "Quality", table: "qualities", col: "quality_name" },
  { key: "colors", label: "Color", table: "colors", col: "color_name" },
  { key: "sizes", label: "Size", table: "sizes", col: "size_label" },
  { key: "folders", label: "Folder", staticValues: [...FOLDER_KEYS] },
  { key: "serialCounts", label: "Serial Count", staticValues: ["0", "1", "2-5", "6-10", ">10"] },
]

export default function ViewsBar() {
  const {
    views,
    activeViewId,
    setActiveViewId,
    setActiveViewOverride,
    selectedGroupCategory,
    setSelectedGroupCategory,
    deleteView,
    getActiveView,
  } = useContentViewsStore()

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  const [generatedViews, setGeneratedViews] = useState<ContentView[]>([])
  const [isGroupLoading, setIsGroupLoading] = useState(false)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingView, setEditingView] = useState<ContentView | null>(null)
  const [showParams, setShowParams] = useState(true)

  // Fetch distinct parameter options when selectedGroupCategory changes
  useEffect(() => {
    if (!isMounted || selectedGroupCategory === "none") {
      setGeneratedViews([])
      return
    }

    const categoryDef = PARAMETER_GROUP_CATEGORIES.find((c) => c.key === selectedGroupCategory)
    if (!categoryDef) return

    if (categoryDef.staticValues) {
      const list: ContentView[] = categoryDef.staticValues.map((val) => ({
        id: `group_${selectedGroupCategory}_${val}`,
        name: val,
        isGroupView: true,
        config: { [selectedGroupCategory]: [val] },
      }))
      setGeneratedViews(list)
      return
    }

    if (!categoryDef.table || !categoryDef.col) return

    let cancelled = false
    setIsGroupLoading(true)

    const fetchOptions = async () => {
      try {
        const { data, error } = await supabase
          .from(categoryDef.table as any)
          .select(categoryDef.col as any)
          .order(categoryDef.col as any)

        if (cancelled) return
        if (error || !data) {
          setGeneratedViews([])
          return
        }

        const rawList = (data as any[])
          .map((r) => String(r[categoryDef.col!] ?? "").trim())
          .filter(Boolean)
        const uniqueValues = [...new Set(rawList)]

        const list: ContentView[] = uniqueValues.map((val) => ({
          id: `group_${selectedGroupCategory}_${val}`,
          name: val,
          isGroupView: true,
          config: { [selectedGroupCategory]: [val] },
        }))

        setGeneratedViews(list)
      } catch (e) {
        if (!cancelled) console.error("Failed to load parameter options:", e)
      } finally {
        if (!cancelled) setIsGroupLoading(false)
      }
    }

    fetchOptions()

    return () => {
      cancelled = true
    }
  }, [selectedGroupCategory, isMounted])

  const activeView = isMounted ? getActiveView() : null
  const currentActiveId = isMounted ? activeView?.id || activeViewId : "default"

  const displayViews = useMemo(() => {
    if (!isMounted) return views.filter((v) => v.isDefault)
    const defaultView = views.find((v) => v.isDefault) || { id: "default", name: "Default", isDefault: true, config: {} }
    const customViews = views.filter((v) => !v.isDefault)
    return [defaultView, ...generatedViews, ...customViews]
  }, [isMounted, views, generatedViews])

  const handleOpenCreate = () => {
    setEditingView(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (view: ContentView) => {
    setEditingView(view)
    setIsModalOpen(true)
  }

  const handleSelectView = (view: ContentView) => {
    if (view.isDefault) {
      setActiveViewOverride(null)
      setActiveViewId("default")
    } else if (view.isGroupView) {
      setActiveViewOverride(view)
    } else {
      setActiveViewOverride(null)
      setActiveViewId(view.id)
    }
  }

  // Count active filters in a view
  const getFilterCount = (view: ContentView) => {
    if (!view.config) return 0
    return Object.values(view.config).reduce((acc, list) => acc + (list?.length || 0), 0)
  }

  // Active filter parameter details list for active view
  const activeParams = useMemo(() => {
    if (!activeView?.config) return []
    const entries: { category: string; values: string[] }[] = []
    for (const [key, list] of Object.entries(activeView.config)) {
      if (list && list.length > 0) {
        entries.push({
          category: PARAM_LABELS[key] || key,
          values: list,
        })
      }
    }
    return entries
  }, [activeView])

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-zinc-200 rounded-2xl shadow-3xs mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Parameter Grouping Category Selector */}
          <Popover>
            <Popover.Trigger>
              <button
                type="button"
                className="flex items-center gap-1.5 shrink-0 text-xs font-bold tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-indigo-100/70 transition-all shadow-3xs"
              >
                <LayoutCellsLarge width="13" height="13" className="text-indigo-600" />
                <span>
                  Group Views:{" "}
                  <span className="font-extrabold">
                    {PARAMETER_GROUP_CATEGORIES.find((c) => c.key === selectedGroupCategory)?.label || "None"}
                  </span>
                </span>
                <ChevronDown width="12" height="12" className="text-indigo-500 ml-0.5" />
              </button>
            </Popover.Trigger>
            <Popover.Content className="p-1 min-w-[170px] bg-white border border-zinc-200 rounded-2xl shadow-xl z-50">
              <Popover.Dialog className="flex flex-col gap-0.5 outline-hidden">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-100">
                  Select Parameter
                </div>
                {PARAMETER_GROUP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      setSelectedGroupCategory(cat.key)
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs rounded-xl font-medium transition-colors cursor-pointer flex items-center justify-between",
                      selectedGroupCategory === cat.key
                        ? "bg-indigo-50 text-indigo-700 font-bold"
                        : "text-zinc-700 hover:bg-zinc-100"
                    )}
                  >
                    <span>{cat.label}</span>
                    {selectedGroupCategory === cat.key && (
                      <Check width="14" height="14" className="text-indigo-600" />
                    )}
                  </button>
                ))}
              </Popover.Dialog>
            </Popover.Content>
          </Popover>

          <div className="h-4 w-px bg-zinc-200 shrink-0" />

          {/* Generated Views / Custom Views Horizontal Tabs Bar */}
          <ScrollShadow orientation="horizontal" className="flex items-center gap-2 py-0.5 max-w-full overflow-x-auto">
            {isGroupLoading ? (
              <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium px-2 py-1">
                <Spinner size="sm" />
                <span>Loading parameter views…</span>
              </div>
            ) : (
              displayViews.map((view) => {
                const isActive = view.id === currentActiveId
                const filterCount = getFilterCount(view)

                return (
                  <div key={view.id} className="relative group shrink-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => handleSelectView(view)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border",
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                          : view.isGroupView
                          ? "bg-indigo-50/70 text-indigo-900 border-indigo-200/80 hover:bg-indigo-100/60"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300"
                      )}
                    >
                      <span>{view.name}</span>
                      {filterCount > 0 && (
                        <span
                          className={cn(
                            "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                            isActive ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"
                          )}
                        >
                          {filterCount}
                        </span>
                      )}
                    </button>

                    {/* Kebab / Context dropdown for user custom views */}
                    {!view.isDefault && !view.isGroupView && (
                      <Dropdown>
                        <Dropdown.Trigger
                          className={cn(
                            "p-1 rounded-lg ml-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer text-xs flex items-center justify-center",
                            isActive ? "text-white" : "text-zinc-500"
                          )}
                        >
                          ⋮
                        </Dropdown.Trigger>
                        <Dropdown.Popover placement="bottom end" className="p-1 min-w-[130px] bg-white border border-zinc-200 rounded-xl shadow-xl z-50">
                          <Dropdown.Menu aria-label="View actions">
                            <Dropdown.Item
                              id="edit-view"
                              onClick={() => handleOpenEdit(view)}
                              className="px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer flex items-center gap-2 font-medium"
                            >
                              Edit View
                            </Dropdown.Item>
                            <Dropdown.Item
                              id="delete-view"
                              onClick={() => deleteView(view.id)}
                              className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg cursor-pointer flex items-center gap-2 font-medium"
                            >
                              Delete View
                            </Dropdown.Item>
                          </Dropdown.Menu>
                        </Dropdown.Popover>
                      </Dropdown>
                    )}
                  </div>
                )
              })
            )}
          </ScrollShadow>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Show / Hide Parameters Toggle Button */}
          {activeParams.length > 0 && (
            <button
              type="button"
              onClick={() => setShowParams(!showParams)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-3xs",
                showParams
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                  : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
              )}
            >
              <EyeSlash width="14" height="14" />
              <span>{showParams ? "Hide parameters" : "Show parameters"}</span>
            </button>
          )}

          {/* Create Custom View Button */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-3xs"
          >
            <Plus width="14" height="14" />
            <span>New View</span>
          </button>
        </div>
      </div>

      {/* Active Filter Parameters Sub-Bar */}
      {showParams && activeParams.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 bg-indigo-50/50 border border-indigo-100/80 rounded-2xl mb-4 text-xs font-medium text-zinc-700 animate-in fade-in duration-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 mr-1 shrink-0 flex items-center gap-1">
            <Funnel width="12" height="12" />
            View Parameters:
          </span>
          {activeParams.map((param) => (
            <div key={param.category} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-200/70 rounded-xl shadow-3xs">
              <span className="font-bold text-indigo-950">{param.category}:</span>
              <span className="text-zinc-700">{param.values.join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      <CreateViewModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingView={editingView}
      />
    </>
  )
}
