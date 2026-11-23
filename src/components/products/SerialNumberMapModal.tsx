"use client"

import { AnimatePresence } from "motion/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Image from "next/image"
import { Button, Chip, EmptyState, ListBox, ListBoxItem, Modal, Popover, ScrollShadow, SearchField, Select, Spinner, toast, Typography } from "@heroui/react"
import PercentageSlider from "@/components/ui/PercentageSlider"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { runWithVerificationGuard } from "@/lib/verificationGuard"
import { Check, ChevronDown, Magnifier, Plus, TrashBin } from "@gravity-ui/icons"

// ──────────────────────────────────────────────────────────
// Types / Schema
// ──────────────────────────────────────────────────────────

const fiberEntry = z.object({
  fiber_id: z.string().min(1, "Select a fiber"),
  percentage: z.number().min(1).max(100),
})

const schema = z.object({
  product_type_id: z.string().min(1, "Required"),
  size_id: z.string().min(1, "Required"),
  quality_id: z.string().min(1, "Required"),
  quality_code: z.string().min(1, "Select a quality code"),
  quality_prefix: z.string(),
  design_id: z.string().min(1, "Required"),
  design_code: z.string().min(1, "Select a design code"),
  design_name: z.string(),
  collection_id: z.string().nullable().optional(),
  construction_id: z.string().nullable().optional(),
  color_ids: z.string().array().min(1, "Select at least one color"),
  fibers: z.array(fiberEntry).refine(
    (arr) => arr.reduce((s, f) => s + f.percentage, 0) === 100,
    { message: "Fiber percentages must total 100%" }
  ),
  location_id: z.string().nullable().optional(),
  is_sold: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface OptionItem {
  id: string
  label: string
  prefix?: string
  suffix?: string
}

interface QualityCodeOption {
  id: string
  quality_id: string
  quality_code: string
  quality_prefix: string
}

interface DesignCodeOption {
  id: string
  design_id: string
  design_code: string
}

interface ColorOption {
  id: string
  color_name: string
  color_code: string
}

interface CatalogFullRow {
  id: string
  sku: string
  product_name: string | null
  quality_name: string | null
  design_name: string | null
  collection_name: string | null
  construction_name: string | null
  color_names: string | null
  fiber_configuration: string | null
  size_label: string | null
  sample_image_url?: string | null
}

interface SerialNumberMapModalProps {
  inventoryId: string
  serialNumber: string
  catalogId: string | null
  locationId: string | null
  isSold: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

// ──────────────────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// Custom Search Selectors
// ──────────────────────────────────────────────────────────

function HeroSearchSelect({
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = "Select…",
}: {
  label: string
  value: string
  onChange: (val: string) => void
  options: OptionItem[]
  required?: boolean
  error?: string
  placeholder?: string
}) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    let result = options
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.suffix && o.suffix.toLowerCase().includes(q))
      )
    }
    if (value) {
      const selected = result.find((o) => o.id === value)
      if (selected) {
        return [selected, ...result.filter((o) => o.id !== value)]
      }
    }
    return result
  }, [options, searchQuery, value])

  const selectedOption = options.find((o) => o.id === value)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Popover>
        <Popover.Trigger>
          <button
            type="button"
            className={cn(
              "w-full h-10 rounded-xl border px-3 flex items-center justify-between bg-white text-sm transition-colors text-left outline-hidden cursor-pointer",
              error ? "border-red-400" : "border-zinc-200 hover:border-zinc-300 focus:border-indigo-500"
            )}
          >
            <span className={cn("truncate flex-1", !selectedOption ? "text-zinc-400" : "text-zinc-900")}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown width="14" height="14" className="text-zinc-400 shrink-0 ml-2" />
          </button>
        </Popover.Trigger>
        <Popover.Content className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[220px] p-0 z-50">
          <Popover.Dialog className="outline-hidden flex flex-col">
            <SearchField
              autoFocus
              aria-label={`Search ${label}`}
              value={searchQuery}
              onChange={setSearchQuery}
              className="border-b border-zinc-100"
            >
              <SearchField.Group className="px-2.5 py-2">
                <SearchField.SearchIcon className="text-zinc-400 shrink-0" />
                <SearchField.Input placeholder="Search…" className="text-sm" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ScrollShadow hideScrollBar className="max-h-56 py-1">
              <ListBox
                selectionMode="single"
                selectedKeys={value ? new Set([value]) : new Set()}
                onSelectionChange={(keys) => {
                  const first = keys === "all" ? options[0]?.id : Array.from(keys)[0]
                  onChange(first ? String(first) : "")
                }}
                renderEmptyState={() => (
                  <EmptyState className="px-3 py-4 text-xs text-zinc-400 text-center">No results</EmptyState>
                )}
              >
                {filteredOptions.map((o) => (
                  <ListBoxItem
                    key={o.id}
                    id={o.id}
                    textValue={o.label}
                    className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-medium"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{o.label}</span>
                      {o.suffix && (
                        <Typography.Code className="text-xs text-zinc-400 ml-4 shrink-0">
                          {o.suffix}
                        </Typography.Code>
                      )}
                    </div>
                  </ListBoxItem>
                ))}
              </ListBox>
            </ScrollShadow>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      {error && <Typography.Paragraph size="xs" className="text-red-500 mt-0.5">{error}</Typography.Paragraph>}
    </div>
  )
}

const HeroSelect = HeroSearchSelect;

function HeroSearchMultiSelect({
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = "Select…",
}: {
  label: string
  value: string[]
  onChange: (val: string[]) => void
  options: OptionItem[]
  required?: boolean
  error?: string
  placeholder?: string
}) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredOptions = useMemo(() => {
    let result = options
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = options.filter((o) => o.label.toLowerCase().includes(q))
    }
    return result
  }, [options, searchQuery])

  const selectedLabels = useMemo(() => {
    return value.map((id) => options.find((o) => o.id === id)?.label).filter(Boolean)
  }, [value, options])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-zinc-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Popover>
        <Popover.Trigger>
          <button
            type="button"
            className={cn(
              "w-full min-h-[40px] py-1.5 rounded-xl border px-3 flex items-center justify-between bg-white text-sm transition-colors text-left outline-hidden cursor-pointer gap-2",
              error ? "border-red-400" : "border-zinc-200 hover:border-zinc-300 focus:border-indigo-500"
            )}
          >
            <div className="flex flex-wrap gap-1 flex-1 items-center">
              {selectedLabels.length > 0 ? (
                selectedLabels.map((lbl, idx) => (
                  <Chip key={idx} size="sm" className="bg-indigo-50 text-indigo-700 text-xs border-indigo-200">
                    {lbl}
                  </Chip>
                ))
              ) : (
                <span className="text-zinc-400">{placeholder}</span>
              )}
            </div>
            <ChevronDown width="14" height="14" className="text-zinc-400 shrink-0 ml-2" />
          </button>
        </Popover.Trigger>
        <Popover.Content className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[220px] p-0 z-50">
          <Popover.Dialog className="outline-hidden flex flex-col">
            <SearchField
              autoFocus
              aria-label={`Search ${label}`}
              value={searchQuery}
              onChange={setSearchQuery}
              className="border-b border-zinc-100"
            >
              <SearchField.Group className="px-2.5 py-2">
                <SearchField.SearchIcon className="text-zinc-400 shrink-0" />
                <SearchField.Input placeholder="Search…" className="text-sm" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <ScrollShadow hideScrollBar className="max-h-56 py-1">
              <ListBox
                selectionMode="multiple"
                selectedKeys={new Set(value)}
                onSelectionChange={(keys) => {
                  const arr = keys === "all" ? options.map((o) => o.id) : Array.from(keys).map(String)
                  onChange(arr)
                }}
                renderEmptyState={() => (
                  <EmptyState className="px-3 py-4 text-xs text-zinc-400 text-center">No results</EmptyState>
                )}
              >
                {filteredOptions.map((o) => (
                  <ListBoxItem
                    key={o.id}
                    id={o.id}
                    textValue={o.label}
                    className="text-sm px-3 py-2 cursor-pointer outline-none data-[focused]:bg-indigo-50"
                  >
                    {({ isSelected }) => (
                      <div className="flex items-center gap-2.5 w-full">
                        <span
                          className={cn(
                            "flex items-center justify-center w-4 h-4 rounded border shrink-0 transition-colors",
                            isSelected ? "bg-indigo-600 border-indigo-600" : "border-zinc-300 bg-white"
                          )}
                        >
                          {isSelected && (
                            <Check width="10" height="10" />
                          )}
                        </span>
                        <span>{o.label}</span>
                      </div>
                    )}
                  </ListBoxItem>
                ))}
              </ListBox>
            </ScrollShadow>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      {error && <Typography.Paragraph size="xs" className="text-red-500 mt-0.5">{error}</Typography.Paragraph>}
    </div>
  )
}

export default function SerialNumberMapModal({
  inventoryId,
  serialNumber,
  catalogId,
  locationId,
  isSold,
  isOpen,
  onOpenChange,
  onSaved,
}: SerialNumberMapModalProps) {
  // ── Mode State: "existing" | "new" ──
  const [mappingMode, setMappingMode] = useState<"existing" | "new">("existing")
  const [existingCatalogList, setExistingCatalogList] = useState<CatalogFullRow[]>([])
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("")
  const [isUnmapping, setIsUnmapping] = useState(false)

  // ── Lookup data ──
  const [productTypes, setProductTypes] = useState<OptionItem[]>([])
  const [sizes, setSizes] = useState<OptionItem[]>([])
  const [sizeSoNumbers, setSizeSoNumbers] = useState<Record<string, string>>({})
  const [qualities, setQualities] = useState<OptionItem[]>([])
  const [allQualityCodes, setAllQualityCodes] = useState<QualityCodeOption[]>([])
  const [designs, setDesigns] = useState<OptionItem[]>([])
  const [allDesignCodes, setAllDesignCodes] = useState<DesignCodeOption[]>([])
  const [collections, setCollections] = useState<OptionItem[]>([])
  const [constructions, setConstructions] = useState<OptionItem[]>([])
  const [colors, setColors] = useState<ColorOption[]>([])
  const [fiberOptions, setFiberOptions] = useState<OptionItem[]>([])
  const [locations, setLocations] = useState<OptionItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locationId ?? "")
  const [selectedIsSold, setSelectedIsSold] = useState<boolean>(isSold)
  const [selectedIsVerified, setSelectedIsVerified] = useState<boolean>(false)

  // Fetch catalog master & lookups
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      (supabase.from("view_catalog_full" as any) as any).select("*").order("sku", { ascending: true }),
      (supabase.from("product_types" as any) as any).select("id, product_name").order("product_name"),
      (supabase.from("view_sizes" as any) as any).select("id, size_label, so_number").order("size_label"),
      (supabase.from("qualities" as any) as any).select("id, quality_name").order("quality_name"),
      (supabase.from("quality_codes" as any) as any).select("id, quality_id, quality_code, quality_prefix").order("quality_code"),
      (supabase.from("designs" as any) as any).select("id, design_name").order("design_name"),
      (supabase.from("design_codes" as any) as any).select("id, design_id, design_code").order("design_code"),
      (supabase.from("collections" as any) as any).select("id, collection_name").order("collection_name"),
      (supabase.from("constructions" as any) as any).select("id, construction_name").order("construction_name"),
      (supabase.from("colors" as any) as any).select("id, color_name, color_code").order("color_name"),
      (supabase.from("fiber_list" as any) as any).select("id, fiber_name").order("fiber_name"),
      (supabase.from("locations" as any) as any).select("id, location_name, country").order("location_name"),
    ]).then(([catList, pt, sz, qt, qc, d, dc, col, con, clr, fib, loc]: any[]) => {
      if (catList.data) {
        setExistingCatalogList(catList.data as CatalogFullRow[])
      }
      setProductTypes(((pt.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.product_name })))
      setSizes(((sz.data as any[]) ?? []).map((r: any) => ({ id: r.id!, label: r.size_label! })))
      setSizeSoNumbers(
        Object.fromEntries(((sz.data as any[]) ?? []).map((r: any) => [r.id!, r.so_number ?? ""]))
      )
      setQualities(((qt.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.quality_name })))
      setAllQualityCodes(
        ((qc.data as any[]) ?? []).map((r: any) => ({
          id: r.id,
          quality_id: r.quality_id,
          quality_code: r.quality_code,
          quality_prefix: r.quality_prefix ?? "",
        }))
      )
      setDesigns(((d.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.design_name })))
      setAllDesignCodes(
        ((dc.data as any[]) ?? []).map((r: any) => ({
          id: r.id,
          design_id: r.design_id,
          design_code: r.design_code,
        }))
      )
      setCollections(((col.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.collection_name })))
      setConstructions(((con.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.construction_name })))
      setColors(clr.data ?? [])
      setFiberOptions(((fib.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.fiber_name })))
      setLocations(((loc.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: `${r.location_name} (${r.country})` })))
    })
  }, [isOpen])

  // Initial selection
  useEffect(() => {
    setSelectedLocationId(locationId ?? "")
    setSelectedIsSold(isSold)
    if (catalogId) {
      setSelectedCatalogId(catalogId)
      setMappingMode("existing")
    } else {
      setSelectedCatalogId("")
      setMappingMode("existing")
    }
  }, [catalogId, locationId, isSold, isOpen])

  // Options list for SKU dropdown selector
  const catalogSelectOptions = useMemo<OptionItem[]>(() => {
    return existingCatalogList.map((c) => ({
      id: c.id,
      label: `${c.sku} — ${c.product_name || "Rug"} (${c.quality_name || "Default"}, ${c.design_name || "Pattern"})`,
      suffix: c.size_label || "",
    }))
  }, [existingCatalogList])

  // Currently selected SKU details object for Mode A
  const activeSelectedCatalogRow = useMemo(() => {
    return existingCatalogList.find((c) => c.id === selectedCatalogId) || null
  }, [existingCatalogList, selectedCatalogId])

  // ── Form for Mode B (Create New SKU) ──
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      product_type_id: "",
      size_id: "",
      quality_id: "",
      quality_code: "",
      quality_prefix: "",
      design_id: "",
      design_code: "",
      design_name: "",
      collection_id: null,
      construction_id: null,
      color_ids: [],
      fibers: [{ fiber_id: "", percentage: 0 }],
      location_id: "",
      is_sold: false,
    },
  })

  const { fields: fiberFields, append: appendFiber, remove: removeFiber } = useFieldArray({
    control,
    name: "fibers",
  })

  const watched = useWatch({ control })

  // Pre-fill form if catalogId exists
  useEffect(() => {
    if (!isOpen || qualities.length === 0 || allQualityCodes.length === 0) return

    if (catalogId) {
      Promise.all([
        (supabase.from("view_catalog_full" as any) as any).select("*").eq("id", catalogId).maybeSingle(),
        (supabase.from("catalog_colors" as any) as any).select("color_id").eq("catalog_id", catalogId),
        (supabase.from("catalog_fibers" as any) as any).select("fiber_id, percentage").eq("catalog_id", catalogId),
      ]).then(([catData, colorData, fiberData]: any[]) => {
        const catRow = catData.data as any
        if (!catRow) return

        const qualityRow = qualities.find((q) => q.label === catRow.quality_name)
        const qualityCodeRow = allQualityCodes.find(
          (qc) => qc.quality_id === qualityRow?.id && qc.quality_code === catRow.quality_code
        )
        const d = designs.find((d) => d.label === catRow.design_name)

        reset({
          product_type_id: productTypes.find((p) => p.label === catRow.product_name)?.id ?? "",
          size_id: sizes.find((s) => s.label === catRow.size_label)?.id ?? "",
          quality_id: qualityRow?.id ?? "",
          quality_code: qualityCodeRow?.quality_code ?? "",
          quality_prefix: qualityCodeRow?.quality_prefix ?? "",
          design_id: d?.id ?? "",
          design_code: catRow.design_code ?? "",
          design_name: d?.label ?? "",
          collection_id: collections.find((c) => c.label === catRow.collection_name)?.id ?? null,
          construction_id: constructions.find((c) => c.label === catRow.construction_name)?.id ?? null,
          color_ids: ((colorData.data as any[]) ?? []).map((c: any) => c.color_id),
          fibers: ((fiberData.data as any[]) ?? []).map((f: any) => ({ fiber_id: f.fiber_id, percentage: f.percentage })),
          location_id: locationId ?? "",
          is_sold: isSold,
        })
      })
    }
  }, [isOpen, catalogId, locationId, isSold, qualities, allQualityCodes, designs, productTypes, sizes, collections, constructions, reset])

  // ── Computed ──
  const filteredQualityCodes = useMemo<OptionItem[]>(
    () =>
      allQualityCodes
        .filter((qc) => qc.quality_id === watched.quality_id)
        .map((qc) => ({ id: qc.id, label: qc.quality_code })),
    [allQualityCodes, watched.quality_id]
  )

  const filteredDesignCodes = useMemo<OptionItem[]>(
    () =>
      allDesignCodes
        .filter((dc) => dc.design_id === watched.design_id)
        .map((dc) => ({ id: dc.id, label: dc.design_code })),
    [allDesignCodes, watched.design_id]
  )

  const selectedQualityPrefix = useMemo(() => {
    const qc = allQualityCodes.find(
      (q) => q.quality_id === watched.quality_id && q.quality_code === watched.quality_code
    )
    return qc?.quality_prefix ?? ""
  }, [allQualityCodes, watched.quality_id, watched.quality_code])

  const selectedColorCodes = useMemo(() => {
    return (watched.color_ids ?? [])
      .map((id) => colors.find((c) => c.id === id)?.color_code)
      .filter(Boolean)
      .sort()
      .join("X")
  }, [watched.color_ids, colors])

  const previewProductCode = useMemo(() => {
    const prefix = selectedQualityPrefix || "?"
    const design = watched.design_code || "???"
    const colorPart = selectedColorCodes || "???"
    return `${prefix}${design}${colorPart}`
  }, [selectedQualityPrefix, watched.design_code, selectedColorCodes])

  const previewSoNumber = sizeSoNumbers[watched.size_id ?? ""] || "SO?"
  const previewSku = `SA-${previewProductCode}-${previewSoNumber}`

  const fiberTotal = useMemo(
    () => (watched.fibers ?? []).reduce((s, f) => s + (Number(f?.percentage) || 0), 0),
    [watched.fibers]
  )

  // ── Handlers for Form B ──
  const handleQualityChange = useCallback(
    (id: string) => {
      setValue("quality_id", id)
      setValue("quality_code", "")
      setValue("quality_prefix", "")
    },
    [setValue]
  )

  const handleQualityCodeChange = useCallback(
    (qualityCodeRowId: string) => {
      const qc = allQualityCodes.find((q) => q.id === qualityCodeRowId)
      if (qc) {
        setValue("quality_code", qc.quality_code, { shouldValidate: true })
        setValue("quality_prefix", qc.quality_prefix)
      }
    },
    [allQualityCodes, setValue]
  )

  const handleDesignChange = useCallback(
    (id: string) => {
      const d = designs.find((d) => d.id === id)
      setValue("design_id", id)
      setValue("design_code", "")
      setValue("design_name", d?.label ?? "")
    },
    [designs, setValue]
  )

  const handleDesignCodeChange = useCallback(
    (dcId: string) => {
      const dc = allDesignCodes.find((d) => d.id === dcId)
      if (dc) {
        setValue("design_code", dc.design_code, { shouldValidate: true })
      }
    },
    [allDesignCodes, setValue]
  )

  const toggleColor = useCallback(
    (colorId: string, currentIds: string[]) => {
      const next = currentIds.includes(colorId)
        ? currentIds.filter((id) => id !== colorId)
        : [...currentIds, colorId]
      setValue("color_ids", next, { shouldValidate: true })
    },
    [setValue]
  )

  const adjustFibers = useCallback(
    (changedIndex: number, newVal: number) => {
      const currentFibers = getValues("fibers")
      const otherIndices = currentFibers.map((_, i) => i).filter((i) => i !== changedIndex)

      setValue(`fibers.${changedIndex}.percentage`, newVal, { shouldValidate: true })

      if (otherIndices.length === 0) return

      const remaining = 100 - newVal
      const otherSum = otherIndices.reduce((s, i) => s + currentFibers[i].percentage, 0)

      let distributed: number[]
      if (otherSum === 0) {
        const base = Math.floor(remaining / otherIndices.length)
        distributed = otherIndices.map((_, j) =>
          j === otherIndices.length - 1 ? remaining - base * (otherIndices.length - 1) : base
        )
      } else {
        distributed = otherIndices.map((i) =>
          Math.floor((currentFibers[i].percentage / otherSum) * remaining)
        )
        const distSum = distributed.reduce((s, v) => s + v, 0)
        distributed[distributed.length - 1] += remaining - distSum
      }

      otherIndices.forEach((fiberIdx, j) => {
        setValue(`fibers.${fiberIdx}.percentage`, Math.max(0, distributed[j]), { shouldValidate: true })
      })
    },
    [getValues, setValue]
  )

  const handleRemoveFiber = useCallback(
    (index: number) => {
      const currentFibers = getValues("fibers")
      removeFiber(index)
      const remaining = currentFibers.filter((_, i) => i !== index)
      if (remaining.length === 0) return
      if (remaining.length === 1) {
        setValue("fibers.0.percentage", 100, { shouldValidate: true })
        return
      }
      const remainingSum = remaining.reduce((s, f) => s + f.percentage, 0)
      if (remainingSum === 0) {
        const base = Math.floor(100 / remaining.length)
        remaining.forEach((_, i) =>
          setValue(`fibers.${i}.percentage`, i === 0 ? 100 - base * (remaining.length - 1) : base)
        )
      } else {
        remaining.forEach((f, i) => {
          const val = Math.floor((f.percentage / remainingSum) * 100)
          setValue(`fibers.${i}.percentage`, val)
        })
      }
    },
    [getValues, removeFiber, setValue]
  )

  // ── Mode A Submit: Map Existing SKU ──
  const handleMapExistingSku = async () => {
    if (!selectedCatalogId) {
      toast.danger("Please select an existing SKU to map.")
      return
    }

    setIsSubmitting(true)
    try {
      await runWithVerificationGuard([catalogId, selectedCatalogId], async () => {
        const { error } = await (supabase
          .from("inventory" as any) as any)
          .update({
            catalog_id: selectedCatalogId,
            location_id: selectedLocationId || null,
            is_sold: selectedIsSold,
            is_verified: selectedIsVerified,
          })
          .eq("id", inventoryId)

        if (error) throw error
      })

      const mappedRow = existingCatalogList.find((c) => c.id === selectedCatalogId)
      toast.success(`Successfully mapped ${serialNumber} to SKU ${mappedRow?.sku || ""}!`)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      console.error("Error mapping existing SKU:", e)
      toast.danger(e.message || "Failed to map SKU")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Mode B Submit: Create New SKU & Map ──
  const onSubmitNewSku = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      const qualityPrefix = selectedQualityPrefix
      const sizeRow = sizes.find((s) => s.id === values.size_id)
      const soSeq = sizeSoNumbers[values.size_id] || ""
      const designCode = values.design_code

      const cols = colors.filter((c) => values.color_ids.includes(c.id))
      const colorCodes = cols
        .map((c) => c.color_code)
        .sort()
        .join("X")

      const computedSku = `SA-${qualityPrefix}${designCode}${colorCodes}-SO${soSeq}`

      let targetCatalogId = ""
      const { data: existingCat, error: existingErr } = await (supabase
        .from("catalog" as any) as any)
        .select("id")
        .eq("sku", computedSku)
        .maybeSingle()

      if (existingErr) throw existingErr

      if (existingCat) {
        targetCatalogId = (existingCat as any).id
      } else {
        const { data: newCat, error: insertErr } = await (supabase
          .from("catalog" as any) as any)
          .insert({
            product_type_id: values.product_type_id,
            size_id: values.size_id,
            quality_id: values.quality_id,
            quality_code: values.quality_code,
            design_id: values.design_id,
            design_code: values.design_code,
            collection_id: values.collection_id ?? null,
            construction_id: values.construction_id ?? null,
          })
          .select("id")
          .single()

        if (insertErr) throw insertErr
        targetCatalogId = (newCat as any).id

        if (values.color_ids.length > 0) {
          const { error: colorErr } = await (supabase
            .from("catalog_colors" as any) as any)
            .insert(values.color_ids.map((cid) => ({ catalog_id: targetCatalogId, color_id: cid })))
          if (colorErr) throw colorErr
        }

        if (values.fibers.length > 0) {
          const { error: fiberErr } = await (supabase
            .from("catalog_fibers" as any) as any)
            .insert(values.fibers.map((f) => ({ catalog_id: targetCatalogId, fiber_id: f.fiber_id, percentage: f.percentage })))
          if (fiberErr) throw fiberErr
        }
      }

      await runWithVerificationGuard([catalogId, targetCatalogId], async () => {
        const { error: updateInvErr } = await (supabase
          .from("inventory" as any) as any)
          .update({
            catalog_id: targetCatalogId,
            location_id: values.location_id || null,
            is_sold: values.is_sold,
          })
          .eq("id", inventoryId)

        if (updateInvErr) throw updateInvErr
      })

      toast.success(`Created new SKU and mapped to ${serialNumber}!`)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      console.error("Error creating & mapping new SKU:", e)
      toast.danger(e.message || "Failed to create & map new SKU")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Unmap Handler ──
  const handleUnmap = async () => {
    setIsUnmapping(true)
    try {
      await runWithVerificationGuard([catalogId], async () => {
        const { error } = await (supabase
          .from("inventory" as any) as any)
          .update({ catalog_id: null })
          .eq("id", inventoryId)

        if (error) throw error
      })
      toast.success(`Unmapped SKU from ${serialNumber}`)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.danger(e.message || "Failed to unmap SKU")
    } finally {
      setIsUnmapping(false)
    }
  }

  const sliderMax = fiberFields.length > 1 ? 100 - (fiberFields.length - 1) : 100

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="lg" className="z-[200]">
          <Modal.Dialog className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <Modal.Header className="border-b border-zinc-100 dark:border-zinc-800/80 p-5 shrink-0">
              <div className="flex items-center justify-between w-full">
                <div>
                  <Typography.Heading level={4} className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Map Serial Number: <span className="font-mono text-indigo-600 dark:text-indigo-400">{serialNumber}</span>
                  </Typography.Heading>
                  <Typography.Paragraph size="xs" className="text-zinc-500">
                    Associate this physical piece with an existing SKU or create a new SKU specification
                  </Typography.Paragraph>
                </div>

                {catalogId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={handleUnmap}
                    isDisabled={isUnmapping || isSubmitting}
                    className="border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold shrink-0"
                  >
                    {isUnmapping ? "Unmapping…" : "Unmap Current SKU"}
                  </Button>
                )}
              </div>
            </Modal.Header>

            <Modal.Body className="p-0 overflow-hidden">
              <ScrollShadow hideScrollBar className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                <div className="flex flex-col gap-5">
                  
                  {/* Top Segmented Mode Selector */}
                  <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl border border-zinc-200/80 dark:border-zinc-700/80">
                    <button
                      type="button"
                      onClick={() => setMappingMode("existing")}
                      className={cn(
                        "py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                        mappingMode === "existing"
                          ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      <Magnifier width="14" height="14" />
                      <span>Map to Existing SKU</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMappingMode("new")}
                      className={cn(
                        "py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2",
                        mappingMode === "new"
                          ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                      )}
                    >
                      <Plus width="14" height="14" />
                      <span>Create New SKU & Map</span>
                    </button>
                  </div>

                  {/* ────────────────────────────────────────────────────────── */}
                  {/* MODE A: Select Existing SKU */}
                  {/* ────────────────────────────────────────────────────────── */}
                  {mappingMode === "existing" && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-200">
                      {/* Search Existing SKU */}
                      <HeroSearchSelect
                        label="Select Master SKU"
                        required
                        placeholder="Search SKU code, product type, design, or quality…"
                        value={selectedCatalogId}
                        onChange={setSelectedCatalogId}
                        options={catalogSelectOptions}
                      />

                      {/* Selected SKU Preview Card */}
                      {activeSelectedCatalogRow ? (
                        <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400 text-sm">
                              {activeSelectedCatalogRow.sku}
                            </span>
                            <Chip size="sm" className="bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-bold text-[10px]">
                              {activeSelectedCatalogRow.product_name || "Rug"}
                            </Chip>
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div>
                              <span className="text-zinc-400 block font-medium">Quality & Design</span>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {activeSelectedCatalogRow.quality_name || "—"} / {activeSelectedCatalogRow.design_name || "—"}
                              </span>
                            </div>

                            <div>
                              <span className="text-zinc-400 block font-medium">Size & Collection</span>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {activeSelectedCatalogRow.size_label || "—"} ({activeSelectedCatalogRow.collection_name || "Standard"})
                              </span>
                            </div>

                            <div className="col-span-2">
                              <span className="text-zinc-400 block font-medium">Fiber Configuration</span>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {activeSelectedCatalogRow.fiber_configuration || "—"}
                              </span>
                            </div>

                            <div className="col-span-2">
                              <span className="text-zinc-400 block font-medium">Color Palette</span>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {activeSelectedCatalogRow.color_names || "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-zinc-400 text-xs">
                          Search and select an existing master SKU above to view specification details
                        </div>
                      )}

                      {/* Location & Status Selectors */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <HeroSearchSelect
                          label="Location"
                          placeholder="Select location…"
                          value={selectedLocationId}
                          onChange={setSelectedLocationId}
                          options={locations}
                        />

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Status</label>
                          <Select
                            aria-label="Is Sold"
                            selectedKey={selectedIsSold ? "sold" : "available"}
                            onSelectionChange={(key) => setSelectedIsSold(key === "sold")}
                            className="w-full"
                          >
                            <Select.Trigger className="w-full h-10 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 flex items-center justify-between bg-white dark:bg-zinc-900 text-sm">
                              <Select.Value />
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1">
                              <ListBox>
                                <ListBoxItem id="available" textValue="Available">Available</ListBoxItem>
                                <ListBoxItem id="sold" textValue="Sold">Sold</ListBoxItem>
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </div>
                      </div>

                      {/* Action Footer Button for Mode A */}
                      <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100 dark:border-zinc-800">
                        <Button variant="outline" onPress={() => onOpenChange(false)} className="rounded-xl text-xs font-bold">
                          Cancel
                        </Button>
                        <Button
                          variant="primary"
                          onPress={handleMapExistingSku}
                          isDisabled={isSubmitting || !selectedCatalogId}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-5"
                        >
                          {isSubmitting ? "Mapping…" : "Map to Selected SKU"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ────────────────────────────────────────────────────────── */}
                  {/* MODE B: Create New SKU & Map */}
                  {/* ────────────────────────────────────────────────────────── */}
                  {mappingMode === "new" && (
                    <form onSubmit={handleSubmit(onSubmitNewSku)} className="flex flex-col gap-5 animate-in fade-in duration-200">
                      {/* Live Formula SKU Preview Card */}
                      <div className="p-4 rounded-xl bg-zinc-900 text-white flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block">Generated SKU Preview</span>
                          <span className="font-mono text-base font-bold text-indigo-400">{previewSku}</span>
                        </div>
                        <Chip size="sm" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs font-bold">
                          Formula SKU
                        </Chip>
                      </div>

                      {/* Product Type & Size */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="product_type_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Product Type"
                              required
                              error={errors.product_type_id?.message}
                              value={field.value}
                              onChange={field.onChange}
                              options={productTypes}
                            />
                          )}
                        />

                        <Controller
                          control={control}
                          name="size_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Size"
                              required
                              error={errors.size_id?.message}
                              value={field.value}
                              onChange={field.onChange}
                              options={sizes}
                            />
                          )}
                        />
                      </div>

                      {/* Quality & Quality Code */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="quality_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Quality"
                              required
                              error={errors.quality_id?.message}
                              value={field.value}
                              onChange={(val) => {
                                field.onChange(val)
                                handleQualityChange(val)
                              }}
                              options={qualities}
                            />
                          )}
                        />

                        <Controller
                          control={control}
                          name="quality_code"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Quality Code"
                              required
                              error={errors.quality_code?.message}
                              value={
                                allQualityCodes.find(
                                  (qc) => qc.quality_id === watched.quality_id && qc.quality_code === field.value
                                )?.id ?? ""
                              }
                              onChange={handleQualityCodeChange}
                              options={filteredQualityCodes}
                              placeholder={watched.quality_id ? "Select code…" : "Select quality first"}
                            />
                          )}
                        />
                      </div>

                      {/* Design & Design Code */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="design_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Design"
                              required
                              error={errors.design_id?.message}
                              value={field.value}
                              onChange={(val) => {
                                field.onChange(val)
                                handleDesignChange(val)
                              }}
                              options={designs}
                            />
                          )}
                        />

                        <Controller
                          control={control}
                          name="design_code"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Design Code"
                              required
                              error={errors.design_code?.message}
                              value={
                                allDesignCodes.find(
                                  (dc) => dc.design_id === watched.design_id && dc.design_code === field.value
                                )?.id ?? ""
                              }
                              onChange={handleDesignCodeChange}
                              options={filteredDesignCodes}
                              placeholder={watched.design_id ? "Select code…" : "Select design first"}
                            />
                          )}
                        />
                      </div>

                      {/* Collection & Construction */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="collection_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Collection"
                              placeholder="Optional collection…"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={collections}
                            />
                          )}
                        />

                        <Controller
                          control={control}
                          name="construction_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Construction"
                              placeholder="Optional construction…"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={constructions}
                            />
                          )}
                        />
                      </div>

                      {/* Colors Multi-Select */}
                      <Controller
                        control={control}
                        name="color_ids"
                        render={({ field }) => (
                          <HeroSearchMultiSelect
                            label="Color Palette"
                            required
                            error={errors.color_ids?.message}
                            value={field.value}
                            onChange={field.onChange}
                            options={colors.map((c) => ({ id: c.id, label: `${c.color_name} (${c.color_code})` }))}
                          />
                        )}
                      />

                      {/* Fiber Percentages */}
                      <div className="flex flex-col gap-2 p-4 rounded-xl bg-zinc-50 border border-zinc-200/80">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-zinc-900">
                            Fiber Breakdown <span className="text-red-500">*</span>
                          </label>
                          <span className={cn("text-xs font-bold font-mono", fiberTotal === 100 ? "text-emerald-600" : "text-amber-600")}>
                            Total: {fiberTotal}%
                          </span>
                        </div>

                        {fiberFields.map((fieldItem, idx) => (
                          <div key={fieldItem.id} className="flex items-center gap-3">
                            <Controller
                              control={control}
                              name={`fibers.${idx}.fiber_id`}
                              render={({ field }) => (
                                <div className="flex-1">
                                  <HeroSearchSelect
                                    label=""
                                    placeholder="Select fiber…"
                                    value={field.value}
                                    onChange={field.onChange}
                                    options={fiberOptions}
                                  />
                                </div>
                              )}
                            />

                            <Controller
                              control={control}
                              name={`fibers.${idx}.percentage`}
                              render={({ field }) => (
                                <div className="w-36">
                                  <PercentageSlider
                                    value={field.value}
                                    onChange={(v) => adjustFibers(idx, v)}
                                    max={100}
                                  />
                                </div>
                              )}
                            />

                            {fiberFields.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveFiber(idx)}
                                className="p-2 text-zinc-400 hover:text-red-600 cursor-pointer transition-colors"
                              >
                                <TrashBin width="14" height="14" />
                              </button>
                            )}
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onPress={() => appendFiber({ fiber_id: "", percentage: 0 })}
                          className="mt-1 self-start text-xs font-bold border-zinc-300 text-zinc-700 flex items-center gap-1"
                        >
                          <Plus width="14" height="14" />
                          <span>Add Fiber Component</span>
                        </Button>
                      </div>

                      {/* Location & IsSold Status */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="location_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Location"
                              placeholder="Select location…"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              options={locations}
                            />
                          )}
                        />

                        <Controller
                          control={control}
                          name="is_sold"
                          render={({ field }) => (
                            <div className="flex flex-col gap-1">
                              <label className="text-xs font-medium text-zinc-700">Status</label>
                              <Select
                                aria-label="Status"
                                selectedKey={field.value ? "sold" : "available"}
                                onSelectionChange={(key) => field.onChange(key === "sold")}
                                className="w-full"
                              >
                                <Select.Trigger className="w-full h-10 rounded-xl border border-zinc-200 px-3 flex items-center justify-between bg-white text-sm">
                                  <Select.Value />
                                  <Select.Indicator />
                                </Select.Trigger>
                                <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg p-1">
                                  <ListBox>
                                    <ListBoxItem id="available" textValue="Available">Available</ListBoxItem>
                                    <ListBoxItem id="sold" textValue="Sold">Sold</ListBoxItem>
                                  </ListBox>
                                </Select.Popover>
                              </Select>
                            </div>
                          )}
                        />
                      </div>

                      {/* Action Footer Button for Mode B */}
                      <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                        <Button variant="outline" onPress={() => onOpenChange(false)} className="rounded-xl text-xs font-bold">
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          isDisabled={isSubmitting || fiberTotal !== 100}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold px-5"
                        >
                          {isSubmitting ? "Creating & Mapping…" : "Create New SKU & Map"}
                        </Button>
                      </div>
                    </form>
                  )}

                </div>
              </ScrollShadow>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
