"use client"

import { useMemo, useState } from "react"
import AppTabs from "@/components/shared/AppTabs"
import SearchBar from "@/components/shared/SearchBar"
import { useProductCodeCatalog } from "@/hooks/useProductCodeCatalog"
import { usePptWishlistStore } from "@/stores/pptWishlistStore"
import { filterProductCodes } from "@/lib/pptFilters"
import ProductCodeFilters, { EMPTY_PPT_FILTERS } from "./ProductCodeFilters"
import type { ProductCodeFilterState } from "./ProductCodeFilters"
import ProductCodeGrid from "./ProductCodeGrid"
import ProductQuickViewModal from "./ProductQuickViewModal"
import PptConfigurator from "./PptConfigurator"
import WorkspacePickerModal from "./WorkspacePickerModal"

function SelectProductsTab() {
  const { productCodes, isLoading, ensureImagesLoaded, loadingImagesFor } = useProductCodeCatalog()
  const [filters, setFilters] = useState<ProductCodeFilterState>(EMPTY_PPT_FILTERS)
  const [search, setSearch] = useState("")
  const [activeProductCode, setActiveProductCode] = useState<string | null>(null)

  const filtered = useMemo(
    () => filterProductCodes(productCodes, filters, search),
    [productCodes, filters, search]
  )

  // Re-derived from the live array (not a stale snapshot) so lazily-loaded images
  // appear in the quick view even if it was opened before they finished fetching.
  const activeGroup = activeProductCode
    ? productCodes.find((g) => g.productCode === activeProductCode) ?? null
    : null

  const handleCardClick = (productCode: string) => {
    ensureImagesLoaded(productCode)
    setActiveProductCode(productCode)
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <ProductCodeFilters filters={filters} onChange={setFilters} />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 py-3 border-b border-zinc-200 bg-white shrink-0 flex items-center justify-between gap-4">
          <SearchBar
            value={search}
            onChange={setSearch}
            disableShortcut
            placeholder="Search product code, design, quality…"
            className="w-full max-w-md"
          />
          <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider bg-zinc-100/80 px-2.5 py-1 rounded-md shrink-0">
            {filtered.length} product code{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ProductCodeGrid
            groups={filtered}
            isLoading={isLoading}
            onCardClick={(group) => handleCardClick(group.productCode)}
            onVisible={ensureImagesLoaded}
            loadingImagesFor={loadingImagesFor}
          />
        </div>
      </div>

      <ProductQuickViewModal group={activeGroup} onOpenChange={(open) => !open && setActiveProductCode(null)} />
    </div>
  )
}

function GeneratePptTab() {
  const workspaces = usePptWishlistStore((s) => s.workspaces)
  const activeWorkspaceId = usePptWishlistStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = usePptWishlistStore((s) => s.setActiveWorkspace)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  if (workspaces.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm font-semibold text-zinc-600">No workspaces yet</p>
        <p className="text-xs text-zinc-400 max-w-sm">
          Go to &quot;Select Products&quot;, open a product code, and add serial numbers to a new workspace to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 py-3 border-b border-zinc-200 bg-white shrink-0 flex items-center gap-3">
        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide shrink-0">Workspace</label>
        <select
          value={activeWorkspaceId ?? ""}
          onChange={(e) => setActiveWorkspace(e.target.value || null)}
          className="border border-zinc-200 rounded-xl px-3 h-9 text-sm text-zinc-800 outline-none focus:border-indigo-400 bg-white"
        >
          <option value="" disabled>
            Select a workspace…
          </option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.items.length})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
        >
          + New workspace
        </button>
      </div>

      {activeWorkspace ? (
        <PptConfigurator key={activeWorkspace.id} workspace={activeWorkspace} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">
          Select a workspace to configure its PPT
        </div>
      )}

      <WorkspacePickerModal
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        onConfirm={(workspaceId) => setActiveWorkspace(workspaceId)}
      />
    </div>
  )
}

export default function PptGeneratorPage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/30">
      <div className="px-6 py-4 bg-white border-b border-zinc-200/60 shrink-0">
        <h1 className="text-xl font-bold text-zinc-900">PPT Generator</h1>
        <p className="text-xs text-zinc-400 mt-0.5 font-medium">
          Browse products by Product Code, build a wishlist, then configure and export a presentation.
        </p>
      </div>

      <AppTabs
        className="flex-1 flex flex-col min-h-0"
        listContainerClassName="px-6 border-b border-zinc-200 bg-white shrink-0"
        panelClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
        defaultTab="select"
        tabs={[
          { id: "select", label: "Select Products", content: <SelectProductsTab /> },
          { id: "generate", label: "Generate PPT", content: <GeneratePptTab /> },
        ]}
      />
    </div>
  )
}
