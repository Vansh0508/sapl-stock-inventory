"use client"

import { useState } from "react"
import { Button, Checkbox, toast } from "@heroui/react"
import type { PptWorkspace } from "@/types/ppt.types"
import { DEFAULT_PPT_CONFIG, PPT_COVER_PAGES, PPT_GROUP_BY_OPTIONS, PPT_IMAGE_QUALITY_OPTIONS } from "@/types/ppt.types"
import type { PptConfig, PptCoverPage, PptGroupByField, PptImageQuality, PptSizeType } from "@/types/ppt.types"
import { getOriginalPublicUrl } from "@/lib/supabase/storage"
import PptLivePreview from "./PptLivePreview"

interface PptConfiguratorProps {
  workspace: PptWorkspace
}

export default function PptConfigurator({ workspace }: PptConfiguratorProps) {
  const [config, setConfig] = useState<PptConfig>({
    projectName: workspace.name,
    ...DEFAULT_PPT_CONFIG,
  })
  const [isGenerating, setIsGenerating] = useState(false)

  const toggleCoverPage = (page: PptCoverPage) => {
    setConfig((prev) => ({
      ...prev,
      coverPages: prev.coverPages.includes(page)
        ? prev.coverPages.filter((p) => p !== page)
        : [...prev.coverPages, page],
    }))
  }

  const handleDownload = async () => {
    if (workspace.items.length === 0) {
      toast.danger("This workspace has no serial numbers yet")
      return
    }
    if (!config.projectName.trim()) {
      toast.danger("Please enter a project name")
      return
    }

    setIsGenerating(true)
    try {
      const cleanConfig: PptConfig = {
        ...config,
        coverImageUrl: config.coverImageUrl ? getOriginalPublicUrl(config.coverImageUrl) : null,
        backImageUrl: config.backImageUrl ? getOriginalPublicUrl(config.backImageUrl) : null,
        logoUrl: config.logoUrl ? getOriginalPublicUrl(config.logoUrl) : null,
        grouperImageUrl: config.grouperImageUrl ? getOriginalPublicUrl(config.grouperImageUrl) : null,
      }
      const cleanItems = workspace.items.map((item) => ({
        ...item,
        imageUrl: item.imageUrl ? getOriginalPublicUrl(item.imageUrl) : null,
      }))

      const res = await fetch("/api/ppt-generator/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: cleanConfig, items: cleanItems }),
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

      toast.success("PPT downloaded successfully!")
    } catch (err) {
      console.error("PPT generation failed:", err)
      toast.danger(err instanceof Error ? err.message : "Failed to generate PPT")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Configuration panel */}
      <div className="w-80 shrink-0 border-r border-zinc-200 bg-white overflow-y-auto p-5 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Project Name</label>
          <input
            type="text"
            value={config.projectName}
            onChange={(e) => setConfig((prev) => ({ ...prev, projectName: e.target.value }))}
            placeholder="PPT file name"
            className="border border-zinc-200 rounded-xl px-3 h-10 text-sm text-zinc-800 outline-none focus:border-indigo-400"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Design</label>
          <div className="border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-700 bg-zinc-50/60">
            Classic layout
            <p className="text-[11px] text-zinc-400 mt-0.5">More designs coming soon</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Size Type</label>
          <div className="flex gap-4">
            {(["ft", "cm"] as PptSizeType[]).map((type) => (
              <Checkbox
                key={type}
                isSelected={config.sizeType === type}
                onChange={() => setConfig((prev) => ({ ...prev, sizeType: type }))}
              >
                <Checkbox.Content className="flex items-center gap-2 cursor-pointer">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="text-sm text-zinc-700 uppercase">{type}</span>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Image Resolution</label>
          <div className="flex flex-col gap-1.5">
            {PPT_IMAGE_QUALITY_OPTIONS.map((opt) => (
              <Checkbox
                key={opt.value}
                isSelected={config.imageQuality === opt.value}
                onChange={() => setConfig((prev) => ({ ...prev, imageQuality: opt.value as PptImageQuality }))}
              >
                <Checkbox.Content className="flex items-center gap-2 cursor-pointer">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="text-sm text-zinc-700">{opt.label}</span>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Cover Pages</label>
          <div className="flex flex-col gap-1.5">
            {PPT_COVER_PAGES.map((cover) => (
              <Checkbox
                key={cover.value}
                isSelected={config.coverPages.includes(cover.value)}
                onChange={() => toggleCoverPage(cover.value)}
              >
                <Checkbox.Content className="flex items-center gap-2 cursor-pointer">
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <span className="text-sm text-zinc-700">{cover.label}</span>
                </Checkbox.Content>
              </Checkbox>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Separator (Group By)</label>
          <select
            value={config.groupBy}
            onChange={(e) => setConfig((prev) => ({ ...prev, groupBy: e.target.value as PptGroupByField }))}
            className="border border-zinc-200 rounded-xl px-3 h-10 text-sm text-zinc-800 outline-none focus:border-indigo-400 bg-white"
          >
            {PPT_GROUP_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-100">
          <p className="text-xs text-zinc-400 mb-3">
            {workspace.items.length} serial number{workspace.items.length !== 1 ? "s" : ""} in &quot;{workspace.name}&quot;
          </p>
          <Button
            onPress={handleDownload}
            isDisabled={isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm px-4 h-11 cursor-pointer font-semibold"
          >
            {isGenerating ? "Generating…" : "Download PPT"}
          </Button>
        </div>
      </div>

      {/* Live preview */}
      <div className="flex-1 min-w-0 bg-zinc-50/50 overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-zinc-200 bg-white shrink-0">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Live Preview</h3>
        </div>
        <div className="flex-1 min-h-0 max-w-xl mx-auto w-full">
          <PptLivePreview config={config} items={workspace.items} />
        </div>
      </div>
    </div>
  )
}
