"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button, Checkbox, Spinner, toast } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { getOriginalPublicUrl, getThumbnailUrl } from "@/lib/supabase/storage"
import type { PptConfig, PptDetailField, PptFolderFilter, PptGroupByField, PptImageQuality, PptWishlistItem } from "@/types/ppt.types"
import { PPT_DETAIL_FIELDS, PPT_FOLDER_FILTERS, PPT_GROUP_BY_OPTIONS, PPT_IMAGE_QUALITY_OPTIONS, PPT_LAYOUT_VARIANTS, DEFAULT_PPT_CONFIG } from "@/types/ppt.types"
import { cn } from "@/lib/utils"
import PptAssetPickerModal from "./PptAssetPickerModal"
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, File as FileIcon } from "@gravity-ui/icons"

interface StorageFile {
  name: string
  id: string | null
  created_at: string | null
  storagePath: string
  publicUrl: string
  folder?: string
  details?: {
    serial_number: string | null
    sku: string | null
    product_name?: string | null
    size_label?: string | null
    quality_name?: string | null
    design_name?: string | null
    collection_name?: string | null
    construction_name?: string | null
    location_name?: string | null
    color_names?: string | null
  } | null
}

interface FullPptGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
  selectedFiles: StorageFile[]
}

type AssetType = "cover-images" | "back-images" | "logo" | "grouper-images"

export default function FullPptGeneratorModal({ isOpen, onClose, selectedFiles }: FullPptGeneratorModalProps) {
  const [config, setConfig] = useState<PptConfig>(() => ({
    projectName: "Shyam Ahuja Catalog Presentation",
    ...DEFAULT_PPT_CONFIG,
    folderFilters: DEFAULT_PPT_CONFIG.folderFilters ?? ["Head", "Floor", "Corner", "Closeup", "Tag"],
    selectedFields: DEFAULT_PPT_CONFIG.selectedFields ?? [
      "sku",
      "serialNumber",
      "productType",
      "design",
      "quality",
      "collection",
      "construction",
      "color",
      "size",
    ],
  }))

  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<"config" | "assets" | "preview">("config")

  // Bucket Asset Picker Modal state
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [assetPickerFolder, setAssetPickerFolder] = useState<AssetType>("cover-images")
  const [assetPickerTitle, setAssetPickerTitle] = useState("")

  // ESC key listener to close overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGenerating && !assetPickerOpen) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, isGenerating, assetPickerOpen, onClose])

  if (!isOpen) return null

  const safeSelectedFiles = Array.isArray(selectedFiles) ? selectedFiles : []
  const folderFilters = config?.folderFilters ?? ["Head", "Floor", "Corner", "Closeup", "Tag"]
  const selectedFields = config?.selectedFields ?? [
    "sku",
    "serialNumber",
    "productType",
    "design",
    "quality",
    "collection",
    "construction",
    "color",
    "size",
  ]

  const toggleFolderFilter = (folder: PptFolderFilter) => {
    setConfig((prev) => {
      const current = prev.folderFilters ?? ["Head", "Floor", "Corner", "Closeup", "Tag"]
      return {
        ...prev,
        folderFilters: current.includes(folder)
          ? current.filter((f) => f !== folder)
          : [...current, folder],
      }
    })
  }

  const toggleDetailField = (field: PptDetailField) => {
    setConfig((prev) => {
      const current = prev.selectedFields ?? [
        "sku",
        "serialNumber",
        "productType",
        "design",
        "quality",
        "collection",
        "construction",
        "color",
        "size",
      ]
      return {
        ...prev,
        selectedFields: current.includes(field)
          ? current.filter((f) => f !== field)
          : [...current, field],
      }
    })
  }

  const openAssetPicker = (folder: AssetType, title: string) => {
    setAssetPickerFolder(folder)
    setAssetPickerTitle(title)
    setAssetPickerOpen(true)
  }

  const handleAssetSelected = (url: string) => {
    switch (assetPickerFolder) {
      case "cover-images":
        setConfig((prev) => ({ ...prev, coverImageUrl: url }))
        toast.success("Cover slide image set!")
        break
      case "back-images":
        setConfig((prev) => ({ ...prev, backImageUrl: url }))
        toast.success("Back slide image set!")
        break
      case "logo":
        setConfig((prev) => ({ ...prev, logoUrl: url }))
        toast.success("Preloaded logo set!")
        break
      case "grouper-images":
        setConfig((prev) => ({ ...prev, grouperImageUrl: url }))
        toast.success("Section divider image set!")
        break
    }
  }

  // Filter selected files by selected shot folders
  const eligibleSelectedFiles = safeSelectedFiles.filter((f) => {
    if (!f || !f.folder) return true
    return folderFilters.includes(f.folder as PptFolderFilter)
  })

  const handleGeneratePpt = async () => {
    if (safeSelectedFiles.length === 0) {
      toast.danger("No assets selected for PPT generation")
      return
    }

    if (!config.projectName.trim()) {
      toast.danger("Please enter a presentation title")
      return
    }

    setIsGenerating(true)

    try {
      // Convert selected StorageFiles into high-resolution PptWishlistItem array
      let items: PptWishlistItem[] = selectedFiles.map((file, idx) => {
        const details = file.details
        return {
          inventoryId: details?.serial_number || `file_${idx}`,
          serialNumber: details?.serial_number || file.name,
          productCode: details?.sku || file.name,
          sku: details?.sku || file.name,
          sizeLabel: details?.size_label || null,
          productName: details?.product_name || file.name,
          qualityName: details?.quality_name || null,
          designName: details?.design_name || null,
          collectionName: details?.collection_name || null,
          constructionName: details?.construction_name || null,
          colorNames: details?.color_names || null,
          folder: file.folder || null,
          imageUrl: getOriginalPublicUrl(file.publicUrl),
        }
      })

      // If multi-shot mode, query DB for any missing companion shots for each serial number
      if (config.layoutVariant === "multi-shot") {
        const serials = [...new Set(items.map((i) => i.serialNumber).filter((s) => s && !s.startsWith("file_")))]
        if (serials.length > 0) {
          const { data: invRecords } = await (supabase
            .from("view_inventory_gallery" as any) as any)
            .select("id, serial_number, sku, product_name, size_label, quality_name, design_name, collection_name, construction_name, color_names")
            .in("serial_number", serials)

          const invIds = (invRecords ?? []).map((r: any) => r.id).filter(Boolean)
          if (invIds.length > 0) {
            const { data: imgRows } = await (supabase
              .from("inventory_images" as any) as any)
              .select("inventory_id, storage_path, public_url, sort_order")
              .in("inventory_id", invIds)
              .order("sort_order", { ascending: true })

            const invById = new Map<string, any>((invRecords ?? []).map((r: any) => [r.id, r]))
            const existingUrls = new Set(items.map((i) => i.imageUrl))

            for (const img of imgRows ?? []) {
              const inv = invById.get(img.inventory_id)
              if (!inv) continue
              const origUrl = getOriginalPublicUrl(img.public_url)
              if (existingUrls.has(origUrl)) continue

              const parts = (img.storage_path || "").split("/")
              const shotFolder = parts.length >= 3 ? parts[1] : null
              if (shotFolder && !folderFilters.includes(shotFolder as any)) continue

              items.push({
                inventoryId: inv.serial_number || img.inventory_id,
                serialNumber: inv.serial_number || inv.sku,
                productCode: inv.sku,
                sku: inv.sku,
                sizeLabel: inv.size_label ?? null,
                productName: inv.product_name ?? null,
                qualityName: inv.quality_name ?? null,
                designName: inv.design_name ?? null,
                collectionName: inv.collection_name ?? null,
                constructionName: inv.construction_name ?? null,
                colorNames: inv.color_names ?? null,
                folder: shotFolder,
                imageUrl: origUrl,
              })
              existingUrls.add(origUrl)
            }
          }
        }
      }

      // Filter items according to active folderFilters
      items = items.filter((item) => {
        if (!item.folder) return true
        return folderFilters.includes(item.folder as any)
      })

      const cleanConfig: PptConfig = {
        ...config,
        coverImageUrl: config.coverImageUrl ? getOriginalPublicUrl(config.coverImageUrl) : null,
        backImageUrl: config.backImageUrl ? getOriginalPublicUrl(config.backImageUrl) : null,
        logoUrl: config.logoUrl ? getOriginalPublicUrl(config.logoUrl) : null,
        grouperImageUrl: config.grouperImageUrl ? getOriginalPublicUrl(config.grouperImageUrl) : null,
      }

      const res = await fetch("/api/ppt-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cleanConfig, items }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Server responded with ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${config.projectName.trim() || "presentation"}.pptx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      toast.success(
        config.imageQuality === "high"
          ? "High-Resolution PPT downloaded successfully!"
          : "Low-Resolution PPT downloaded successfully!"
      )
      onClose()
    } catch (err: any) {
      console.error("PPT generation failed:", err)
      toast.danger(err instanceof Error ? err.message : "Failed to generate PPT")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-zinc-900/60 backdrop-blur-xs text-zinc-900 flex flex-col overflow-hidden animate-in fade-in duration-200">
        <div className="w-full h-full bg-zinc-50 flex flex-col overflow-hidden">
          {/* ── Light Mode Header Bar ── */}
          <header className="h-16 border-b border-zinc-200 bg-white px-6 flex items-center justify-between shrink-0 z-10 shadow-3xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                <FileIcon width="18" height="18" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold tracking-tight text-zinc-900">Presentation Generator</h2>
                  <span
                    className={cn(
                      "border text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide",
                      config.imageQuality === "high"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    )}
                  >
                    {config.imageQuality === "high" ? "High-Res HD" : "Low-Res (Compressed)"}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 font-medium">
                  Configure presentation shots, section dividers, cover/back slides, and export PPTX
                </p>
              </div>
            </div>

            {/* Project Name & Actions */}
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={config.projectName}
                onChange={(e) => setConfig((prev) => ({ ...prev, projectName: e.target.value }))}
                placeholder="Presentation File Name"
                className="w-72 px-3.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />

              <Button
                type="button"
                onPress={onClose}
                isDisabled={isGenerating}
                className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onPress={handleGeneratePpt}
                isDisabled={isGenerating || !config.projectName.trim() || selectedFiles.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-6 h-9 font-extrabold cursor-pointer transition-all shadow-xs flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Spinner size="sm" color="current" />
                    <span>{config.imageQuality === "high" ? "Exporting HD PPTX…" : "Exporting Compressed PPTX…"}</span>
                  </>
                ) : (
                  <>
                    <ArrowDownToLine />
                    <span>Generate PPT ({eligibleSelectedFiles.length} Assets)</span>
                  </>
                )}
              </Button>
            </div>
          </header>

          {/* ── Main Workspace Body ── */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Workspace Tabs Sidebar */}
            <div className="w-64 border-r border-zinc-200 bg-white p-4 flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("config")}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border select-none",
                  activeTab === "config"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-3xs"
                    : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <span>1. Shot & Group Config</span>
                {config.groupBy !== "none" && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                    {config.groupBy}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("assets")}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border select-none",
                  activeTab === "assets"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-3xs"
                    : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <span>2. Cover, Back & Logo</span>
                {(config.coverImageUrl || config.backImageUrl || config.logoUrl) && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer border select-none",
                  activeTab === "preview"
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-3xs"
                    : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <span>3. Slides & Selected Items</span>
                <span className="text-[10px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-mono font-bold">
                  {eligibleSelectedFiles.length}
                </span>
              </button>

              <div className="mt-auto p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-zinc-500 uppercase tracking-wider">Quality</span>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, imageQuality: prev.imageQuality === "high" ? "low" : "high" }))
                    }
                    className={cn(
                      "font-extrabold px-2 py-0.5 rounded-md border cursor-pointer transition-all",
                      config.imageQuality === "high"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : "text-amber-700 bg-amber-50 border-amber-200"
                    )}
                  >
                    {config.imageQuality === "high" ? "Ultra HD (Original)" : "Compressed (Fast)"}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-zinc-500 uppercase tracking-wider">Format</span>
                  <span className="text-zinc-800 font-bold">16:9 Widescreen</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-zinc-500 uppercase tracking-wider">Shots Active</span>
                  <span className="text-indigo-700 font-bold">{folderFilters.length} / 5</span>
                </div>
              </div>
            </div>

            {/* Main Panel Container with Sticky Footer */}
            <div className="flex-1 flex flex-col min-h-0 bg-zinc-50 overflow-hidden">
              {/* Scrollable Tab Content Body */}
              <div className="flex-1 overflow-y-auto p-8">
                {/* TAB 1: Shot Types & Grouping */}
                {activeTab === "config" && (
                  <div className="max-w-4xl mx-auto flex flex-col gap-8">
                    {/* 0. Image Export Resolution */}
                    <div className="flex flex-col gap-3">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                        Image Export Resolution
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {PPT_IMAGE_QUALITY_OPTIONS.map((opt) => {
                          const isActive = config.imageQuality === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, imageQuality: opt.value as PptImageQuality }))}
                              className={cn(
                                "p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 select-none",
                                isActive
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-3xs ring-2 ring-indigo-500/20"
                                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300"
                              )}
                            >
                              <span className="text-xs font-extrabold text-zinc-900">{opt.label}</span>
                              <span className="text-[11px] text-zinc-500 font-medium leading-snug">{opt.description}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 1. Shot Type / Folder Selection */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                          1. Select Image Shot Types / Folders
                        </h3>
                        <span className="text-xs text-zinc-500 font-medium">
                          {eligibleSelectedFiles.length} of {safeSelectedFiles.length} selected items match folder filters
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-3">
                        {PPT_FOLDER_FILTERS.map((folder) => {
                          const isChecked = folderFilters.includes(folder.value)
                          const countInFolder = safeSelectedFiles.filter((f) => f && f.folder === folder.value).length
                          return (
                            <button
                              key={folder.value}
                              type="button"
                              onClick={() => toggleFolderFilter(folder.value)}
                              className={cn(
                                "p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 select-none",
                                isChecked
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-3xs"
                                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold">{folder.label}</span>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                />
                              </div>
                              <span className="text-[11px] font-mono text-zinc-400 font-semibold">
                                {countInFolder} file(s)
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 2. Grouping Parameter */}
                    <div className="flex flex-col gap-3">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                        2. Slide Grouping Parameter
                      </h3>
                      <div className="grid grid-cols-4 gap-3">
                        {PPT_GROUP_BY_OPTIONS.map((opt) => {
                          const isActive = config.groupBy === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, groupBy: opt.value }))}
                              className={cn(
                                "px-4 py-3 rounded-2xl text-xs font-bold text-left transition-all border cursor-pointer flex items-center justify-between select-none",
                                isActive
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                              )}
                            >
                              <span>{opt.label}</span>
                              {isActive && (
                                <Check width="14" height="14" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 3. Group Divider Slide Toggle */}
                    {config.groupBy !== "none" && (
                      <div className="p-4 bg-white border border-zinc-200 rounded-2xl flex items-center justify-between shadow-3xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-extrabold text-zinc-900">Generate Section Divider Slides</span>
                          <span className="text-[11px] text-zinc-500 font-medium">
                            Creates a dedicated section title slide when transitioning between {config.groupBy} groups (e.g. Size: 8x10 ft)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConfig((prev) => ({ ...prev, showGroupDividers: !prev.showGroupDividers }))}
                          className={cn(
                            "w-12 h-6 rounded-full transition-colors relative border cursor-pointer",
                            config.showGroupDividers ? "bg-indigo-600 border-indigo-600" : "bg-zinc-200 border-zinc-300"
                          )}
                        >
                          <span
                            className={cn(
                              "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-3xs",
                              config.showGroupDividers && "translate-x-6"
                            )}
                          />
                        </button>
                      </div>
                    )}

                    {/* 3. Detail Fields to Include */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                          3. Detail Fields to Display on Slides
                        </h3>
                        <span className="text-xs text-zinc-500 font-medium">
                          {selectedFields.length} of {PPT_DETAIL_FIELDS.length} fields active
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                        {PPT_DETAIL_FIELDS.map((field) => {
                          const isChecked = selectedFields.includes(field.value)
                          return (
                            <button
                              key={field.value}
                              type="button"
                              onClick={() => toggleDetailField(field.value)}
                              className={cn(
                                "px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between select-none",
                                isChecked
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-3xs font-bold"
                                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-100 font-medium"
                              )}
                            >
                              <span className="text-xs truncate">{field.label}</span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600 ml-1.5"
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 4. Layout Planning Options */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                          4. Presentation Layout Planning
                        </h3>
                        <span className="text-xs text-indigo-600 font-bold">
                          {config.layoutVariant === "multi-shot" ? "Multi-Shot Active" : "Single Visual Active"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {PPT_LAYOUT_VARIANTS.map((layout) => {
                          const isActive = config.layoutVariant === layout.value
                          const isComingSoon = layout.tag === "Coming Soon"
                          return (
                            <div
                              key={layout.value}
                              onClick={() => {
                                if (!isComingSoon) setConfig((prev) => ({ ...prev, layoutVariant: layout.value }))
                              }}
                              className={cn(
                                "p-3.5 rounded-2xl border flex flex-col justify-between gap-2 transition-all select-none relative",
                                isComingSoon ? "opacity-60 cursor-not-allowed bg-zinc-100 border-zinc-200" : "cursor-pointer",
                                isActive
                                  ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-3xs ring-2 ring-indigo-500/20"
                                  : !isComingSoon && "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300"
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold text-zinc-900">{layout.label}</span>
                                {layout.tag && (
                                  <span
                                    className={cn(
                                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full border",
                                      layout.tag === "New"
                                        ? "bg-indigo-100 text-indigo-700 border-indigo-200"
                                        : "bg-zinc-200 text-zinc-700 border-zinc-300"
                                    )}
                                  >
                                    {layout.tag}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-500 font-medium leading-snug">{layout.description}</p>
                            </div>
                          )
                        })}
                      </div>

                      {/* Multi-Shot Image Count Selector */}
                      {config.layoutVariant === "multi-shot" && (
                        <div className="p-4 bg-gradient-to-r from-indigo-50/60 via-white to-indigo-50/20 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs mt-1">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-extrabold text-zinc-900">Images per SKU / Slide (Multi-Shot)</span>
                            <span className="text-[11px] text-zinc-500 font-medium">
                              Head shot anchored on left; companion shots fitted on right. Minimum 3 shots; auto-adapts if fewer exist.
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {([3, 4, 5] as const).map((cnt) => {
                              const isCountActive = (config.maxShotsPerSlide ?? 3) === cnt
                              return (
                                <button
                                  key={cnt}
                                  type="button"
                                  onClick={() => setConfig((prev) => ({ ...prev, maxShotsPerSlide: cnt }))}
                                  className={cn(
                                    "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none",
                                    isCountActive
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-3xs"
                                      : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                                  )}
                                >
                                  {cnt} Images {cnt === 3 ? "(Standard)" : ""}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: Asset Pickers (Cover Image, Back Image, Logo, Section Banner) */}
                {activeTab === "assets" && (
                  <div className="max-w-4xl mx-auto flex flex-col gap-8">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400 mb-1">
                        Custom Presentation Assets (<code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-800 font-mono">ppt-assets</code> Bucket)
                      </h3>
                      <p className="text-xs text-zinc-500 font-medium">
                        Select existing images from storage bucket folders or upload new ones.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      {/* Cover Image Selector */}
                      <div className="p-5 bg-white border border-zinc-200 rounded-3xl flex flex-col gap-4 shadow-3xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase text-zinc-900">Cover Image (First Slide)</h4>
                            <p className="text-[11px] text-zinc-500 font-medium">Opening slide background</p>
                          </div>
                          {config.coverImageUrl && (
                            <button
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, coverImageUrl: null }))}
                              className="text-[10px] text-red-600 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="h-44 rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center relative overflow-hidden">
                          {config.coverImageUrl ? (
                            <Image
                              src={getThumbnailUrl(config.coverImageUrl, { width: 600, quality: 75 })}
                              alt="Cover"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <span className="text-xs font-semibold text-zinc-400">No cover image selected</span>
                              <Button
                                type="button"
                                onPress={() => openAssetPicker("cover-images", "Select Cover Image")}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all shadow-xs"
                              >
                                Choose from Bucket
                              </Button>
                            </div>
                          )}
                        </div>

                        {config.coverImageUrl && (
                          <Button
                            type="button"
                            onPress={() => openAssetPicker("cover-images", "Select Cover Image")}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all"
                          >
                            Change Cover Image
                          </Button>
                        )}
                      </div>

                      {/* Back Image Selector */}
                      <div className="p-5 bg-white border border-zinc-200 rounded-3xl flex flex-col gap-4 shadow-3xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase text-zinc-900">Back Image (Last Slide)</h4>
                            <p className="text-[11px] text-zinc-500 font-medium">Closing slide background</p>
                          </div>
                          {config.backImageUrl && (
                            <button
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, backImageUrl: null }))}
                              className="text-[10px] text-red-600 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="h-44 rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center relative overflow-hidden">
                          {config.backImageUrl ? (
                            <Image
                              src={getThumbnailUrl(config.backImageUrl, { width: 600, quality: 75 })}
                              alt="Back"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <span className="text-xs font-semibold text-zinc-400">No back slide image selected</span>
                              <Button
                                type="button"
                                onPress={() => openAssetPicker("back-images", "Select Back Slide Image")}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all shadow-xs"
                              >
                                Choose from Bucket
                              </Button>
                            </div>
                          )}
                        </div>

                        {config.backImageUrl && (
                          <Button
                            type="button"
                            onPress={() => openAssetPicker("back-images", "Select Back Slide Image")}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all"
                          >
                            Change Back Image
                          </Button>
                        )}
                      </div>

                      {/* Preloaded Logo Selector */}
                      <div className="p-5 bg-white border border-zinc-200 rounded-3xl flex flex-col gap-4 shadow-3xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase text-zinc-900">Preloaded Brand Logo</h4>
                            <p className="text-[11px] text-zinc-500 font-medium">Rendered on presentation slides</p>
                          </div>
                          {config.logoUrl && (
                            <button
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, logoUrl: null }))}
                              className="text-[10px] text-red-600 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="h-36 rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center relative overflow-hidden">
                          {config.logoUrl ? (
                            <Image
                              src={getThumbnailUrl(config.logoUrl, { width: 400, quality: 80 })}
                              alt="Logo"
                              fill
                              unoptimized
                              className="object-contain p-4"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <span className="text-xs font-semibold text-zinc-400">No preloaded logo set</span>
                              <Button
                                type="button"
                                onPress={() => openAssetPicker("logo", "Select Brand Logo")}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all shadow-xs"
                              >
                                Choose from Bucket
                              </Button>
                            </div>
                          )}
                        </div>

                        {config.logoUrl && (
                          <Button
                            type="button"
                            onPress={() => openAssetPicker("logo", "Select Brand Logo")}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all"
                          >
                            Change Logo
                          </Button>
                        )}
                      </div>

                      {/* Section Banner Selector */}
                      <div className="p-5 bg-white border border-zinc-200 rounded-3xl flex flex-col gap-4 shadow-3xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-extrabold uppercase text-zinc-900">Section Divider Banner</h4>
                            <p className="text-[11px] text-zinc-500 font-medium">Background for group parameter slides</p>
                          </div>
                          {config.grouperImageUrl && (
                            <button
                              type="button"
                              onClick={() => setConfig((prev) => ({ ...prev, grouperImageUrl: null }))}
                              className="text-[10px] text-red-600 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="h-36 rounded-2xl bg-zinc-50 border border-dashed border-zinc-300 flex items-center justify-center relative overflow-hidden">
                          {config.grouperImageUrl ? (
                            <Image
                              src={getThumbnailUrl(config.grouperImageUrl, { width: 600, quality: 75 })}
                              alt="Grouper Banner"
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <span className="text-xs font-semibold text-zinc-400">No section banner selected</span>
                              <Button
                                type="button"
                                onPress={() => openAssetPicker("grouper-images", "Select Section Divider Banner")}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all shadow-xs"
                              >
                                Choose from Bucket
                              </Button>
                            </div>
                          )}
                        </div>

                        {config.grouperImageUrl && (
                          <Button
                            type="button"
                            onPress={() => openAssetPicker("grouper-images", "Select Section Divider Banner")}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs px-4 h-8 font-bold cursor-pointer transition-all"
                          >
                            Change Section Banner
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Slide Preview & Selected Items Grid */}
                {activeTab === "preview" && (
                  <div className="max-w-6xl mx-auto flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                          Selected Product Assets ({eligibleSelectedFiles.length} Included)
                        </h3>
                        <p className="text-xs text-zinc-500 font-medium">
                          {config.imageQuality === "high"
                            ? "All images will be fetched and exported in 100% full-resolution HD quality."
                            : "Images will be compressed on the fly for a smaller, faster export."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {config.layoutVariant === "multi-shot" && (
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                            Multi-Shot ({config.maxShotsPerSlide ?? 3} shots/slide)
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-xs font-bold px-3 py-1 rounded-full border",
                            config.imageQuality === "high"
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                              : "text-amber-700 bg-amber-50 border-amber-200"
                          )}
                        >
                          {config.imageQuality === "high" ? "High-Res HD Mode Active" : "Low-Res Compressed Mode Active"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-4 max-h-[55vh] overflow-y-auto p-1">
                      {eligibleSelectedFiles.map((file, idx) => (
                        <div
                          key={file.storagePath || idx}
                          className="group relative rounded-2xl overflow-hidden border border-zinc-200 bg-white flex flex-col shadow-3xs"
                        >
                          <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-100">
                            <Image
                              src={getThumbnailUrl(file.publicUrl, { width: 300, quality: 80 })}
                              alt={file.name}
                              fill
                              className="object-cover"
                            />
                            {file.folder && (
                              <span className="absolute top-2 left-2 text-[9px] bg-white/90 text-zinc-800 font-extrabold uppercase px-1.5 py-0.5 rounded border border-zinc-200 shadow-3xs">
                                {file.folder}
                              </span>
                            )}
                          </div>
                          <div className="p-2.5 flex flex-col gap-0.5">
                            <span className="text-[11px] font-mono font-bold text-zinc-900 truncate">
                              {file.details?.serial_number || file.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-semibold truncate">
                              {file.details?.sku || file.details?.product_name || "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Sticky Bottom Footer Bar (Always Fixed at Bottom) ── */}
              <footer className="h-16 border-t border-zinc-200 bg-white px-8 flex items-center justify-between shrink-0 z-20 shadow-3xs">
                {/* Left Action: Cancel or Step Back */}
                <div className="flex items-center gap-2">
                  {activeTab === "config" ? (
                    <Button
                      type="button"
                      onPress={onClose}
                      isDisabled={isGenerating}
                      className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all"
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onPress={() => setActiveTab(activeTab === "preview" ? "assets" : "config")}
                      isDisabled={isGenerating}
                      className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <ArrowLeft width="14" height="14" />
                      <span>Back to {activeTab === "preview" ? "Cover & Logo" : "Shot & Group Config"}</span>
                    </Button>
                  )}
                </div>

                {/* Center: Step Indicator */}
                <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span>
                    Step {activeTab === "config" ? "1" : activeTab === "assets" ? "2" : "3"} of 3:{" "}
                    {activeTab === "config" ? "Shot & Group Config" : activeTab === "assets" ? "Cover, Back & Logo" : "Slides & Preview"}
                  </span>
                  {config.layoutVariant === "multi-shot" && (
                    <span className="ml-2 bg-indigo-50 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-indigo-200 uppercase tracking-wide">
                      Multi-Shot ({config.maxShotsPerSlide ?? 3} max/slide)
                    </span>
                  )}
                </div>

                {/* Right Action: Step Next or Generate PPT */}
                <div className="flex items-center gap-3">
                  {activeTab !== "preview" ? (
                    <Button
                      type="button"
                      onPress={() => setActiveTab(activeTab === "config" ? "assets" : "preview")}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-6 h-9 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-2"
                    >
                      <span>Proceed to {activeTab === "config" ? "Cover & Logo" : "Slides Preview"}</span>
                      <ArrowRight width="14" height="14" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onPress={handleGeneratePpt}
                      isDisabled={isGenerating || !config.projectName.trim() || safeSelectedFiles.length === 0}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-6 h-9 font-extrabold cursor-pointer transition-all shadow-xs flex items-center gap-2"
                    >
                      {isGenerating ? (
                        <>
                          <Spinner size="sm" color="current" />
                          <span>{config.imageQuality === "high" ? "Exporting HD PPTX…" : "Exporting Compressed PPTX…"}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine />
                          <span>Generate & Export Presentation ({eligibleSelectedFiles.length} Assets)</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </footer>
            </div>
          </div>
        </div>
      </div>

      {/* Bucket Image Picker Modal */}
      <PptAssetPickerModal
        isOpen={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        folder={assetPickerFolder}
        title={assetPickerTitle}
        selectedUrl={
          assetPickerFolder === "cover-images"
            ? config.coverImageUrl
            : assetPickerFolder === "back-images"
            ? config.backImageUrl
            : assetPickerFolder === "logo"
            ? config.logoUrl
            : config.grouperImageUrl
        }
        onSelectImage={handleAssetSelected}
      />
    </>
  )
}
