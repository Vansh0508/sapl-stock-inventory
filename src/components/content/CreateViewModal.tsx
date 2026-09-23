"use client"

import { useState, useEffect, useMemo } from "react"
import { Modal, Button, Checkbox, ScrollShadow } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { useContentViewsStore, type ContentView, type ContentFilterConfig } from "@/stores/contentViewsStore"
import { cn } from "@/lib/utils"

interface CreateViewModalProps {
  isOpen: boolean
  onClose: () => void
  editingView?: ContentView | null
}

interface ParameterSection {
  key: keyof ContentFilterConfig
  label: string
}

const PARAMETER_SECTIONS: ParameterSection[] = [
  { key: "designs", label: "Design" },
  { key: "qualities", label: "Quality" },
  { key: "colors", label: "Color/s" },
  { key: "sizes", label: "Size" },
  { key: "constructions", label: "Construction" },
  { key: "collections", label: "Collection" },
  { key: "folders", label: "Folder" },
  { key: "serialCounts", label: "Serial Count (Pieces)" },
]

const FOLDER_OPTIONS = ["Head", "Floor", "Corner", "Closeup", "Tag", "Unorganized"]
const SERIAL_COUNT_OPTIONS = ["0", "1", "2-5", "6-10", ">10"]

export default function CreateViewModal({ isOpen, onClose, editingView }: CreateViewModalProps) {
  const { addView, updateView } = useContentViewsStore()

  const [viewName, setViewName] = useState("")
  const [config, setConfig] = useState<ContentFilterConfig>({})

  // Active expanded parameter header key
  const [activeParamKey, setActiveParamKey] = useState<keyof ContentFilterConfig | null>("designs")
  const [optionSearch, setOptionSearch] = useState("")

  // Loaded database options for each parameter
  const [optionsMap, setOptionsMap] = useState<Record<keyof ContentFilterConfig, string[]>>({
    designs: [],
    qualities: [],
    colors: [],
    sizes: [],
    constructions: [],
    collections: [],
    folders: FOLDER_OPTIONS,
    serialCounts: SERIAL_COUNT_OPTIONS,
  })
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  const [prevEditingView, setPrevEditingView] = useState(editingView)

  if (isOpen !== prevIsOpen || editingView !== prevEditingView) {
    setPrevIsOpen(isOpen)
    setPrevEditingView(editingView)
    if (isOpen) {
      setViewName(editingView ? editingView.name : "")
      setConfig(editingView?.config || {})
      setActiveParamKey("designs")
      setOptionSearch("")
    }
  }

  // Fetch dictionary values from database when modal opens
  useEffect(() => {
    if (!isOpen) return

    async function loadAllOptions() {
      setIsLoadingOptions(true)
      try {
        const [
          { data: designsData },
          { data: qualitiesData },
          { data: colorsData },
          { data: sizesData },
          { data: constructionsData },
          { data: collectionsData },
        ] = await Promise.all([
          (supabase.from("designs" as any) as any).select("design_name").order("design_name"),
          (supabase.from("qualities" as any) as any).select("quality_name").order("quality_name"),
          (supabase.from("colors" as any) as any).select("color_name").order("color_name"),
          (supabase.from("sizes" as any) as any).select("size_label").order("size_label"),
          (supabase.from("constructions" as any) as any).select("construction_name").order("construction_name"),
          (supabase.from("collections" as any) as any).select("collection_name").order("collection_name"),
        ])

        setOptionsMap({
          designs: Array.from(new Set(((designsData as any[]) || []).map((d: any) => d.design_name).filter(Boolean))),
          qualities: Array.from(new Set(((qualitiesData as any[]) || []).map((q: any) => q.quality_name).filter(Boolean))),
          colors: Array.from(new Set(((colorsData as any[]) || []).map((c: any) => c.color_name).filter(Boolean))),
          sizes: Array.from(new Set(((sizesData as any[]) || []).map((s: any) => s.size_label).filter(Boolean))),
          constructions: Array.from(new Set(((constructionsData as any[]) || []).map((c: any) => c.construction_name).filter(Boolean))),
          collections: Array.from(new Set(((collectionsData as any[]) || []).map((c: any) => c.collection_name).filter(Boolean))),
          folders: FOLDER_OPTIONS,
          serialCounts: SERIAL_COUNT_OPTIONS,
        })
      } catch (err) {
        console.error("Failed to load filter options for view modal:", err)
      } finally {
        setIsLoadingOptions(false)
      }
    }

    loadAllOptions()
  }, [isOpen])

  // Count selected items for a given parameter
  const getSelectedCount = (key: keyof ContentFilterConfig): number => {
    return config[key]?.length || 0
  }

  // Total filters count across all parameters
  const totalSelectedCount = useMemo(() => {
    return Object.values(config).reduce((acc, arr) => acc + (arr?.length || 0), 0)
  }, [config])

  // Toggle single item selection
  const handleToggleOption = (paramKey: keyof ContentFilterConfig, value: string) => {
    setConfig((prev) => {
      const currentList = prev[paramKey] || []
      const isSelected = currentList.includes(value)
      const newList = isSelected ? currentList.filter((v) => v !== value) : [...currentList, value]

      return {
        ...prev,
        [paramKey]: newList.length > 0 ? newList : undefined,
      }
    })
  }

  // Select all visible options for current parameter
  const handleSelectAllForParam = (paramKey: keyof ContentFilterConfig, visibleOptions: string[]) => {
    setConfig((prev) => {
      const currentList = prev[paramKey] || []
      const merged = Array.from(new Set([...currentList, ...visibleOptions]))
      return { ...prev, [paramKey]: merged }
    })
  }

  // Clear options for current parameter
  const handleClearParam = (paramKey: keyof ContentFilterConfig) => {
    setConfig((prev) => ({
      ...prev,
      [paramKey]: undefined,
    }))
  }

  // Clear all filters
  const handleResetAll = () => {
    setConfig({})
  }

  // Save View handler
  const handleSave = () => {
    const finalName = viewName.trim() || "Custom View"
    if (editingView && !editingView.isDefault) {
      updateView(editingView.id, finalName, config)
    } else {
      addView(finalName, config)
    }
    onClose()
  }

  // Current list of options filtered by search query
  const currentOptions = useMemo(() => {
    if (!activeParamKey) return []
    const list = optionsMap[activeParamKey] || []
    if (!optionSearch.trim()) return list
    const q = optionSearch.toLowerCase()
    return list.filter((item) => item.toLowerCase().includes(q))
  }, [activeParamKey, optionsMap, optionSearch])

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog className="rounded-2xl shadow-2xl bg-white border border-zinc-200 overflow-hidden">
            <Modal.Header className="flex flex-col gap-1 px-6 pt-5 pb-3 border-b border-zinc-100">
              <div className="flex items-center justify-between w-full">
                <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  {editingView ? "Edit Custom View" : "Create New View"}
                </h2>
                {totalSelectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-xs font-semibold text-zinc-500 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    Clear all filters ({totalSelectedCount})
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500 font-normal">
                Configure parameter filters to create a personalized saved view.
              </p>
            </Modal.Header>

            <Modal.Body className="p-6 flex flex-col gap-5">
              {/* View Name Input */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="view-name-input" className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  View Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="view-name-input"
                  type="text"
                  placeholder="e.g., Kashan & Tabriz Rugs, Large Size Head Shots..."
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium placeholder:text-zinc-400"
                />
              </div>

              {/* Filter Parameters Header Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  Filter Parameters
                </label>
                <div className="flex flex-wrap gap-2">
                  {PARAMETER_SECTIONS.map((sec) => {
                    const count = getSelectedCount(sec.key)
                    const isActive = activeParamKey === sec.key

                    return (
                      <button
                        key={sec.key}
                        type="button"
                        onClick={() => {
                          setActiveParamKey(sec.key)
                          setOptionSearch("")
                        }}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer border",
                          isActive
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : count > 0
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                            : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                        )}
                      >
                        <span>{sec.label}</span>
                        {count > 0 && (
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                              isActive ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Active Parameter Selection Panel */}
              {activeParamKey && (
                <div className="flex flex-col gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900">
                        Filter by {PARAMETER_SECTIONS.find((s) => s.key === activeParamKey)?.label}
                      </span>
                      {getSelectedCount(activeParamKey) > 0 && (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md text-xs font-bold">
                          {getSelectedCount(activeParamKey)} selected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllForParam(activeParamKey, currentOptions)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-zinc-300">|</span>
                      <button
                        type="button"
                        onClick={() => handleClearParam(activeParamKey)}
                        className="text-xs text-zinc-500 hover:text-red-600 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Option Search Input */}
                  <div className="relative">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      placeholder={`Search ${PARAMETER_SECTIONS.find((s) => s.key === activeParamKey)?.label}...`}
                      value={optionSearch}
                      onChange={(e) => setOptionSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-zinc-400"
                    />
                  </div>

                  {/* Checkbox List Options */}
                  <ScrollShadow className="max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-1">
                    {isLoadingOptions ? (
                      <div className="p-4 text-center text-xs text-zinc-400 font-medium">Loading options...</div>
                    ) : currentOptions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-400 font-medium">
                        No matching options found
                      </div>
                    ) : (
                      currentOptions.map((opt) => {
                        const selectedList = config[activeParamKey] || []
                        const isChecked = selectedList.includes(opt)

                        return (
                          <label
                            key={opt}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-xl transition-colors cursor-pointer text-xs font-medium border border-transparent",
                              isChecked ? "bg-indigo-50/80 border-indigo-100 text-indigo-950 font-semibold" : "hover:bg-white text-zinc-800"
                            )}
                          >
                            <span className="truncate pr-2">{opt}</span>
                            <Checkbox
                              isSelected={isChecked}
                              onChange={() => handleToggleOption(activeParamKey, opt)}
                              aria-label={`Select ${opt}`}
                            >
                              <Checkbox.Content className="flex items-center justify-center cursor-pointer">
                                <Checkbox.Control className="bg-white shadow-xs">
                                  <Checkbox.Indicator />
                                </Checkbox.Control>
                              </Checkbox.Content>
                            </Checkbox>
                          </label>
                        )
                      })
                    )}
                  </ScrollShadow>
                </div>
              )}

              {/* Active Filters Summary Chips */}
              {totalSelectedCount > 0 && (
                <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                    Configured Filters ({totalSelectedCount}):
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                    {PARAMETER_SECTIONS.map((sec) => {
                      const list = config[sec.key] || []
                      if (list.length === 0) return null
                      return list.map((val) => (
                        <span
                          key={`${sec.key}-${val}`}
                          className="px-2 py-1 bg-zinc-100 text-zinc-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 border border-zinc-200"
                        >
                          <span className="text-zinc-500 text-[10px] uppercase font-bold">{sec.label}:</span>
                          <span>{val}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleOption(sec.key, val)}
                            className="text-zinc-400 hover:text-zinc-700 ml-0.5 cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    })}
                  </div>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
              <Button
                type="button"
                variant="tertiary"
                onClick={onClose}
                className="text-xs font-semibold text-zinc-600 hover:bg-zinc-200"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {editingView ? "Update View" : "Save View"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
