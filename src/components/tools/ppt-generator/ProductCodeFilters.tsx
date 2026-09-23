"use client"

import { useEffect, useState } from "react"
import { Checkbox } from "@heroui/react"
import { catalogFilterFields } from "@/lib/filterFields"

export interface ProductCodeFilterState {
  productTypeIds: string[]
  qualityIds: string[]
  designIds: string[]
  constructionIds: string[]
  collectionIds: string[]
  colorNames: string[]
  priceMin: number | null
  priceMax: number | null
}

export const EMPTY_PPT_FILTERS: ProductCodeFilterState = {
  productTypeIds: [],
  qualityIds: [],
  designIds: [],
  constructionIds: [],
  collectionIds: [],
  colorNames: [],
  priceMin: null,
  priceMax: null,
}

interface Option {
  label: string
  value: string
}

interface FilterSectionProps {
  title: string
  options: Option[]
  selected: string[]
  onToggle: (value: string) => void
}

function FilterSection({ title, options, selected, onToggle }: FilterSectionProps) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-2 py-4 border-b border-zinc-100 last:border-b-0">
      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">{title}</h4>
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
        {options.map((o) => (
          <Checkbox
            key={o.value}
            isSelected={selected.includes(o.value)}
            onChange={() => onToggle(o.value)}
          >
            <Checkbox.Content className="flex items-center gap-2 cursor-pointer">
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span className="text-xs text-zinc-700 truncate">{o.label}</span>
            </Checkbox.Content>
          </Checkbox>
        ))}
      </div>
    </div>
  )
}

interface ProductCodeFiltersProps {
  filters: ProductCodeFilterState
  onChange: (filters: ProductCodeFilterState) => void
}

export default function ProductCodeFilters({ filters, onChange }: ProductCodeFiltersProps) {
  const [productTypeOptions, setProductTypeOptions] = useState<Option[]>([])
  const [qualityOptions, setQualityOptions] = useState<Option[]>([])
  const [designOptions, setDesignOptions] = useState<Option[]>([])
  const [constructionOptions, setConstructionOptions] = useState<Option[]>([])
  const [collectionOptions, setCollectionOptions] = useState<Option[]>([])
  const [colorOptions, setColorOptions] = useState<Option[]>([])

  useEffect(() => {
    const load = async (key: string, setter: (opts: Option[]) => void) => {
      const field = catalogFilterFields.find((f) => f.key === key)
      if (!field?.fetchOptions) return
      try {
        const opts = await field.fetchOptions()
        setter(opts)
      } catch (err) {
        console.warn(`Failed to load filter options for ${key}:`, err)
      }
    }

    load("product_type_id", setProductTypeOptions)
    load("quality_id", setQualityOptions)
    load("design_id", setDesignOptions)
    load("construction_id", setConstructionOptions)
    load("collection_id", setCollectionOptions)
    load("color_ids", setColorOptions)
  }, [])

  const toggleIn = (key: keyof ProductCodeFilterState, value: string) => {
    const current = filters[key] as string[]
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...filters, [key]: next })
  }

  const hasActiveFilters =
    filters.productTypeIds.length > 0 ||
    filters.qualityIds.length > 0 ||
    filters.designIds.length > 0 ||
    filters.constructionIds.length > 0 ||
    filters.collectionIds.length > 0 ||
    filters.colorNames.length > 0 ||
    filters.priceMin != null ||
    filters.priceMax != null

  return (
    <div className="w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-4 py-4 border-b border-zinc-200 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-bold text-zinc-900">Filters</h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_PPT_FILTERS)}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {/* Price range */}
        <div className="flex flex-col gap-2 py-4 border-b border-zinc-100">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Price range</h4>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.priceMin ?? ""}
              onChange={(e) =>
                onChange({ ...filters, priceMin: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="w-full min-w-0 border border-zinc-200 rounded-lg px-2.5 h-8 text-xs text-zinc-800 outline-none focus:border-indigo-400"
            />
            <span className="text-zinc-300 text-xs">–</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.priceMax ?? ""}
              onChange={(e) =>
                onChange({ ...filters, priceMax: e.target.value === "" ? null : Number(e.target.value) })
              }
              className="w-full min-w-0 border border-zinc-200 rounded-lg px-2.5 h-8 text-xs text-zinc-800 outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        <FilterSection
          title="Product Type"
          options={productTypeOptions}
          selected={filters.productTypeIds}
          onToggle={(v) => toggleIn("productTypeIds", v)}
        />
        <FilterSection
          title="Quality"
          options={qualityOptions}
          selected={filters.qualityIds}
          onToggle={(v) => toggleIn("qualityIds", v)}
        />
        <FilterSection
          title="Design"
          options={designOptions}
          selected={filters.designIds}
          onToggle={(v) => toggleIn("designIds", v)}
        />
        <FilterSection
          title="Construction Style"
          options={constructionOptions}
          selected={filters.constructionIds}
          onToggle={(v) => toggleIn("constructionIds", v)}
        />
        <FilterSection
          title="Collection"
          options={collectionOptions}
          selected={filters.collectionIds}
          onToggle={(v) => toggleIn("collectionIds", v)}
        />
        <FilterSection
          title="Color"
          options={colorOptions.map((o) => ({ label: o.label, value: o.label }))}
          selected={filters.colorNames}
          onToggle={(v) => toggleIn("colorNames", v)}
        />
      </div>
    </div>
  )
}
