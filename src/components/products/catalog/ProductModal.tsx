"use client"

import { AnimatePresence } from "motion/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, EmptyState, ListBox, ListBoxItem, Modal, Popover, ScrollShadow, SearchField, Select, Spinner, toast, Typography } from "@heroui/react"
import PercentageSlider from "@/components/ui/PercentageSlider"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { CatalogRow } from "@/hooks/useCatalog"

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

interface ProductModalProps {
  mode: "add" | "edit"
  catalogId?: string
  existingRow?: CatalogRow
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (row: CatalogRow) => void
}

// ──────────────────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

// ──────────────────────────────────────────────────────────
// HeroSelect — reusable HeroUI v3 compound Select with ScrollShadow
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
    // Bubble selected item to the top
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-zinc-400 shrink-0 ml-2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
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

// Redefine HeroSelect to be searchable
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
      result = options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.suffix && o.suffix.toLowerCase().includes(q))
      )
    }
    // Bubble all selected items to the top
    if (value && value.length > 0) {
      const selectedItems = result.filter((o) => value.includes(o.id))
      const unselectedItems = result.filter((o) => !value.includes(o.id))
      return [...selectedItems, ...unselectedItems]
    }
    return result
  }, [options, searchQuery, value])

  const displayLabel = (!value || value.length === 0)
    ? placeholder
    : value.map((id) => options.find((o) => o.id === id)?.label).filter(Boolean).join(", ")

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
            <span className={cn("truncate flex-1", (!value || value.length === 0) ? "text-zinc-400" : "text-zinc-900")}>
              {displayLabel}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-zinc-400 shrink-0 ml-2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </Popover.Trigger>
        <Popover.Content className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[240px] p-0 z-50">
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
                selectedKeys={new Set(value || [])}
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
                          <ListBox.ItemIndicator className="w-3 h-3 text-white" />
                        </span>
                        <span className="flex-1 text-zinc-900">{o.label}</span>
                        {o.suffix && (
                          <Typography.Code className="text-xs text-zinc-400 shrink-0">{o.suffix}</Typography.Code>
                        )}
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

// Redefine HeroMultiSelect to be searchable
const HeroMultiSelect = HeroSearchMultiSelect;

// Redefine HeroColorMultiSelect to wrap HeroSearchMultiSelect
function HeroColorMultiSelect({
  label,
  value,
  onChange,
  allColors,
  required,
  error,
  placeholder = "Select colors…",
}: {
  label: string
  value: string[]
  onChange: (val: string[]) => void
  allColors: ColorOption[]
  required?: boolean
  error?: string
  placeholder?: string
}) {
  const options = useMemo(() => allColors.map((c) => ({
    id: c.id,
    label: c.color_name,
    suffix: c.color_code,
  })), [allColors])

  return (
    <HeroSearchMultiSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      error={error}
      placeholder={placeholder}
    />
  )
}

// ──────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────

export default function ProductModal({
  mode,
  catalogId,
  existingRow,
  isOpen,
  onOpenChange,
  onSaved,
}: ProductModalProps) {
  // ── Lookup data ──
  const [productTypes, setProductTypes] = useState<OptionItem[]>([])
  const [sizes, setSizes] = useState<OptionItem[]>([])
  const [sizeSoNumbers, setSizeSoNumbers] = useState<Record<string, string>>({})
  const [qualities, setQualities] = useState<OptionItem[]>([])
  const [allQualityCodes, setAllQualityCodes] = useState<QualityCodeOption[]>([])
  const [designs, setDesigns]             = useState<OptionItem[]>([])
  const [allDesignCodes, setAllDesignCodes] = useState<DesignCodeOption[]>([])
  const [collections, setCollections] = useState<OptionItem[]>([])
  const [constructions, setConstructions] = useState<OptionItem[]>([])
  const [colors, setColors] = useState<ColorOption[]>([])
  const [fiberOptions, setFiberOptions] = useState<OptionItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch all lookups when modal opens
  useEffect(() => {
    if (!isOpen) return
    Promise.all([
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
    ]).then(([pt, sz, qt, qc, d, dc, col, con, clr, fib]) => {
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
      setColors((clr.data as any[]) ?? [])
      setFiberOptions(((fib.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: r.fiber_name })))
    })
  }, [isOpen])

  // ── Form ──
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
    },
  })

  const { fields: fiberFields, append: appendFiber, remove: removeFiber } = useFieldArray({
    control,
    name: "fibers",
  })

  const watched = useWatch({ control })

  // Pre-fill in edit mode
  useEffect(() => {
    if (!isOpen || mode !== "edit" || !existingRow || !catalogId) return
    if (qualities.length === 0 || allQualityCodes.length === 0) return
    Promise.all([
      (supabase.from("catalog_colors" as any) as any).select("color_id").eq("catalog_id", catalogId),
      (supabase.from("catalog_fibers" as any) as any).select("fiber_id, percentage").eq("catalog_id", catalogId),
    ]).then(([colorData, fiberData]) => {
      const qualityRow = qualities.find((q) => q.label === existingRow.quality_name)
      const qualityCodeRow = allQualityCodes.find(
        (qc) => qc.quality_id === qualityRow?.id && qc.quality_code === existingRow.quality_code
      )
      const d = designs.find((d) => d.label === existingRow.design_name)
      reset({
        product_type_id: productTypes.find((p) => p.label === existingRow.product_name)?.id ?? "",
        size_id: sizes.find((s) => s.label === existingRow.size_label)?.id ?? "",
        quality_id: qualityRow?.id ?? "",
        quality_code: qualityCodeRow?.quality_code ?? "",
        quality_prefix: qualityCodeRow?.quality_prefix ?? "",
        design_id: d?.id ?? "",
        design_code: existingRow.design_code ?? "",
        design_name: d?.label ?? "",
        collection_id: collections.find((c) => c.label === existingRow.collection_name)?.id ?? null,
        construction_id: constructions.find((c) => c.label === existingRow.construction_name)?.id ?? null,
        color_ids: ((colorData.data as any[]) ?? []).map((c: any) => c.color_id),
        fibers: ((fiberData.data as any[]) ?? []).map((f: any) => ({ fiber_id: f.fiber_id, percentage: f.percentage })),
      })
    })
  }, [isOpen, mode, existingRow, catalogId, qualities, allQualityCodes, designs, productTypes, sizes, collections, constructions, reset])

  // Reset when opening in add mode
  useEffect(() => {
    if (isOpen && mode === "add") {
      reset({
        product_type_id: "", size_id: "", quality_id: "", quality_code: "",
        quality_prefix: "", design_id: "", design_code: "", design_name: "",
        collection_id: null, construction_id: null,
        color_ids: [], fibers: [{ fiber_id: "", percentage: 0 }],
      })
    }
  }, [isOpen, mode, reset])

  // ── Computed ──

  // Quality codes filtered by selected quality
  const filteredQualityCodes = useMemo<OptionItem[]>(
    () =>
      allQualityCodes
        .filter((qc) => qc.quality_id === watched.quality_id)
        .map((qc) => ({ id: qc.id, label: qc.quality_code })),
    [allQualityCodes, watched.quality_id]
  )

  // Design codes filtered by selected design
  const filteredDesignCodes = useMemo<OptionItem[]>(
    () =>
      allDesignCodes
        .filter((dc) => dc.design_id === watched.design_id)
        .map((dc) => ({ id: dc.id, label: dc.design_code })),
    [allDesignCodes, watched.design_id]
  )

  // Live preview values
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

  // ── Handlers ──

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

  // Proportionally redistribute fiber percentages when one slider changes
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
        // Equal split among others
        const base = Math.floor(remaining / otherIndices.length)
        distributed = otherIndices.map((_, j) =>
          j === otherIndices.length - 1 ? remaining - base * (otherIndices.length - 1) : base
        )
      } else {
        // Proportional scaling
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

  // Redistribute removed fiber's percentage to remaining fibers
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
        return
      }
      let distributed = remaining.map((f) => Math.floor((f.percentage / remainingSum) * 100))
      const distSum = distributed.reduce((s, v) => s + v, 0)
      distributed[0] += 100 - distSum
      remaining.forEach((_, i) =>
        setValue(`fibers.${i}.percentage`, Math.max(1, distributed[i]), { shouldValidate: true })
      )
    },
    [getValues, removeFiber, setValue]
  )

  // ── Submit ──
  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      if (mode === "add") {
        const { data: catalogData, error: catalogErr } = await (supabase
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

        if (catalogErr) throw catalogErr
        const newId = (catalogData as any).id

        if (values.color_ids.length > 0) {
          const { error: colorErr } = await (supabase
            .from("catalog_colors" as any) as any)
            .insert(values.color_ids.map((cid) => ({ catalog_id: newId, color_id: cid })))
          if (colorErr) throw colorErr
        }

        if (values.fibers.length > 0) {
          const { error: fiberErr } = await (supabase
            .from("catalog_fibers" as any) as any)
            .insert(values.fibers.map((f) => ({ catalog_id: newId, fiber_id: f.fiber_id, percentage: f.percentage })))
          if (fiberErr) throw fiberErr
        }

        const { data: newRow } = await (supabase
          .from("view_catalog_full" as any) as any)
          .select("*")
          .eq("id", newId)
          .single()

        toast.success("Product created successfully!")
        if (newRow) onSaved({ ...newRow, id: (newRow as any).id! } as CatalogRow)
        onOpenChange(false)
      } else {
        if (!catalogId) throw new Error("Missing catalog ID for edit")

        const { error: updateErr } = await (supabase
          .from("catalog" as any) as any)
          .update({
            product_type_id: values.product_type_id,
            size_id: values.size_id,
            quality_id: values.quality_id,
            quality_code: values.quality_code,
            design_id: values.design_id,
            design_code: values.design_code,
            collection_id: values.collection_id ?? null,
            construction_id: values.construction_id ?? null,
          })
          .eq("id", catalogId)
        if (updateErr) throw updateErr

        const { error: deleteColorsErr } = await (supabase
          .from("catalog_colors" as any) as any)
          .delete()
          .eq("catalog_id", catalogId)
        if (deleteColorsErr) throw deleteColorsErr

        if (values.color_ids.length > 0) {
          const { error: colorErr } = await (supabase
            .from("catalog_colors" as any) as any)
            .insert(values.color_ids.map((cid) => ({ catalog_id: catalogId, color_id: cid })))
          if (colorErr) throw colorErr
        }

        const { error: deleteFibersErr } = await (supabase
          .from("catalog_fibers" as any) as any)
          .delete()
          .eq("catalog_id", catalogId)
        if (deleteFibersErr) throw deleteFibersErr

        if (values.fibers.length > 0) {
          const { error: fiberErr } = await (supabase
            .from("catalog_fibers" as any) as any)
            .insert(values.fibers.map((f) => ({ catalog_id: catalogId, fiber_id: f.fiber_id, percentage: f.percentage })))
          if (fiberErr) throw fiberErr
        }

        const { data: updatedRow } = await (supabase
          .from("view_catalog_full" as any) as any)
          .select("*")
          .eq("id", catalogId)
          .single()

        toast.success("Product updated successfully!")
        if (updatedRow) onSaved({ ...updatedRow, id: (updatedRow as any).id! } as CatalogRow)
        onOpenChange(false)
      }
    } catch (e) {
      console.error("Error saving product:", e)
      const msg = e && typeof e === "object" && "message" in e
        ? String(e.message)
        : "Failed to save product"
      toast.danger(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Slider max: each other fiber must keep at least 1% ──
  const sliderMax = fiberFields.length > 1 ? 100 - (fiberFields.length - 1) : 100

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="lg" className="z-[200]">
          <Modal.Dialog>
            {({ close }) => (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col max-h-[90vh]">
                <Modal.Header className="border-b border-zinc-100 text-zinc-900 font-semibold shrink-0">
                  {mode === "add" ? "Add New Product" : "Edit Product"}
                </Modal.Header>

                <Modal.Body className="p-0 overflow-hidden">
                  <ScrollShadow hideScrollBar className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                    <div className="flex flex-col gap-5">

                      {/* ── Live Preview — compact horizontal banner ── */}
                      <div className="flex items-stretch rounded-xl border border-indigo-100 bg-indigo-50/50 overflow-hidden">
                        <div className="flex-1 px-4 py-3 border-r border-indigo-100 min-w-0">
                          <Typography.Paragraph size="xs" weight="semibold" className="text-indigo-400 uppercase tracking-wider mb-1">Product Code</Typography.Paragraph>
                          <Typography.Code weight="semibold" truncate className="text-zinc-900 text-sm">{previewProductCode}</Typography.Code>
                        </div>
                        <div className="flex-1 px-4 py-3 min-w-0">
                          <Typography.Paragraph size="xs" weight="semibold" className="text-indigo-400 uppercase tracking-wider mb-1">SKU</Typography.Paragraph>
                          <Typography.Code weight="bold" truncate className="text-indigo-600 text-sm">{previewSku}</Typography.Code>
                        </div>
                      </div>

                      {/* ── Row 1: Product Type + Size ── */}
                      <div className="grid grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="product_type_id"
                          render={({ field }) => (
                            <HeroSelect
                              label="Product Type"
                              value={field.value}
                              onChange={field.onChange}
                              options={productTypes}
                              required
                              error={errors.product_type_id?.message}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name="size_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Size"
                              value={field.value}
                              onChange={field.onChange}
                              options={sizes}
                              required
                              error={errors.size_id?.message}
                            />
                          )}
                        />
                      </div>

                      {/* ── Quality ── */}
                      <div className={cn("grid gap-4", watched.quality_id ? "grid-cols-2" : "grid-cols-1")}>
                        <Controller
                          control={control}
                          name="quality_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Quality"
                              value={field.value}
                              onChange={(val) => {
                                field.onChange(val)
                                handleQualityChange(val)
                              }}
                              options={qualities}
                              required
                              error={errors.quality_id?.message}
                            />
                          )}
                        />

                        {/* Quality Code sub-select */}
                        <AnimatePresence mode="popLayout">
                          {watched.quality_id && (
                            <motion.div
                              key="quality-code-select"
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                              <Controller
                                control={control}
                                name="quality_code"
                                render={({ field }) => {
                                  const selectedQcId =
                                    allQualityCodes.find(
                                      (qc) =>
                                        qc.quality_id === watched.quality_id &&
                                        qc.quality_code === field.value
                                    )?.id ?? ""
                                  return (
                                    <HeroSelect
                                      label="Quality Code"
                                      value={selectedQcId}
                                      onChange={(qcId) => {
                                        handleQualityCodeChange(qcId)
                                      }}
                                      options={filteredQualityCodes}
                                      required
                                      placeholder="Select code…"
                                      error={errors.quality_code?.message}
                                    />
                                  )
                                }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* ── Design ── */}
                      <div className={cn("grid gap-4", watched.design_id ? "grid-cols-2" : "grid-cols-1")}>
                        <Controller
                          control={control}
                          name="design_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Design"
                              value={field.value}
                              onChange={(val) => {
                                field.onChange(val)
                                handleDesignChange(val)
                              }}
                              options={designs}
                              required
                              error={errors.design_id?.message}
                            />
                          )}
                        />

                        {/* Design Code sub-select */}
                        <AnimatePresence mode="popLayout">
                          {watched.design_id && (
                            <motion.div
                              key="design-code-select"
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                            >
                              <Controller
                                control={control}
                                name="design_code"
                                render={({ field }) => {
                                  const selectedDcId =
                                    allDesignCodes.find(
                                      (dc) =>
                                        dc.design_id === watched.design_id &&
                                        dc.design_code === field.value
                                    )?.id ?? ""
                                  return (
                                    <HeroSelect
                                      label="Design Code"
                                      value={selectedDcId}
                                      onChange={(dcId) => {
                                        handleDesignCodeChange(dcId)
                                      }}
                                      options={filteredDesignCodes}
                                      required
                                      placeholder="Select code…"
                                      error={errors.design_code?.message}
                                    />
                                  )
                                }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* ── Row 3: Collection + Construction ── */}
                      <div className="grid grid-cols-2 gap-4">
                        <Controller
                          control={control}
                          name="collection_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Collection"
                              value={field.value ?? ""}
                              onChange={(val) => field.onChange(val || null)}
                              options={collections}
                              placeholder="None"
                              error={errors.collection_id?.message}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name="construction_id"
                          render={({ field }) => (
                            <HeroSearchSelect
                              label="Construction"
                              value={field.value ?? ""}
                              onChange={(val) => field.onChange(val || null)}
                              options={constructions}
                              placeholder="None"
                              error={errors.construction_id?.message}
                            />
                          )}
                        />
                      </div>

                      {/* ── Colors multi-select ── */}
                      <Controller
                        control={control}
                        name="color_ids"
                        render={({ field }) => {
                          return (
                            <HeroColorMultiSelect
                              label="Colors"
                              value={field.value}
                              onChange={(val) => field.onChange(val)}
                              allColors={colors}
                              required
                              placeholder="Select colors…"
                              error={errors.color_ids?.message}
                            />
                          )
                        }}
                      />

                      {/* ── Fiber Configuration ── */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-zinc-700">Fiber Configuration</label>
                          <span
                            className={cn(
                              "text-xs font-semibold px-2.5 py-0.5 rounded-full tabular-nums",
                              fiberTotal === 100
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            )}
                          >
                            {fiberTotal}% / 100%
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">
                          {fiberFields.map((field, index) => {
                            return (
                              <div
                                key={field.id}
                                className="flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3 pt-3 pb-3"
                              >
                                {/* Top: HeroUI fiber select + delete */}
                                <div className="flex items-center gap-2">
                                  <Controller
                                    control={control}
                                    name={`fibers.${index}.fiber_id`}
                                    render={({ field: f }) => (
                                      <div className="flex-1">
                                        <Select
                                          selectedKey={f.value || null}
                                          onSelectionChange={(key) => {
                                            const newId = key != null ? String(key) : ""
                                            f.onChange(newId)
                                            if (!newId) {
                                              setValue(`fibers.${index}.percentage`, 0, { shouldValidate: true })
                                            } else if (fiberFields.length === 1) {
                                              setValue(`fibers.${index}.percentage`, 100, { shouldValidate: true })
                                            }
                                          }}
                                          placeholder="Select fiber…"
                                          className="w-full"
                                        >
                                          <Select.Trigger className="w-full h-9 rounded-xl border border-zinc-200 px-3 flex items-center justify-between bg-white text-sm transition-colors hover:border-zinc-300">
                                            <Select.Value className="text-zinc-900 data-[placeholder]:text-zinc-400" />
                                            <Select.Indicator />
                                          </Select.Trigger>
                                          <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[220px]">
                                            <ScrollShadow hideScrollBar className="max-h-48 py-1">
                                              <ListBox>
                                                {fiberOptions.map((o) => (
                                                  <ListBoxItem
                                                    key={o.id}
                                                    id={o.id}
                                                    className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-medium"
                                                  >
                                                    {o.label}
                                                  </ListBoxItem>
                                                ))}
                                              </ListBox>
                                            </ScrollShadow>
                                          </Select.Popover>
                                        </Select>
                                      </div>
                                    )}
                                  />
                                  {fiberFields.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveFiber(index)}
                                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                    >
                                      <TrashIcon />
                                    </button>
                                  )}
                                </div>

                                {/* Bottom: HeroUI Slider */}
                                <Controller
                                  control={control}
                                  name={`fibers.${index}.percentage`}
                                  render={({ field: f }) => (
                                    <PercentageSlider
                                      value={f.value}
                                      onChange={(val) => adjustFibers(index, val)}
                                      min={fiberFields.length > 1 && !!watched.fibers?.[index]?.fiber_id ? 1 : 0}
                                      max={fiberFields.length > 1 && !!watched.fibers?.[index]?.fiber_id ? sliderMax : 100}
                                      isDisabled={fiberFields.length === 1 || !watched.fibers?.[index]?.fiber_id}
                                      className="w-full"
                                    />
                                  )}
                                />
                              </div>
                            )
                          })}
                        </div>

                        {typeof errors.fibers === "object" &&
                          !Array.isArray(errors.fibers) &&
                          (errors.fibers as { message?: string })?.message && (
                            <Typography.Paragraph size="xs" className="text-red-500">
                              {(errors.fibers as { message?: string }).message}
                            </Typography.Paragraph>
                          )}

                        <Button
                          type="button"
                          variant="outline"
                          onPress={() => {
                            const current = getValues("fibers")
                            const newN = current.length + 1
                            const base = Math.floor(100 / newN)
                            const remainder = 100 - base * newN
                            appendFiber({ fiber_id: "", percentage: base + remainder })
                            current.forEach((_, i) =>
                              setValue(`fibers.${i}.percentage`, base, { shouldValidate: true })
                            )
                          }}
                          className="w-full h-8 text-xs text-zinc-500 border-dashed border-zinc-200 hover:border-indigo-300 rounded-xl cursor-pointer"
                        >
                          <PlusIcon />
                          Add Fiber
                        </Button>
                      </div>
                    </div>
                  </ScrollShadow>
                </Modal.Body>

                <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 shrink-0">
                  <Button
                    variant="outline"
                    onPress={close}
                    isDisabled={isSubmitting}
                    className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isDisabled={isSubmitting || fiberTotal !== 100}
                    className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium"
                  >
                    {isSubmitting ? "Saving…" : mode === "add" ? "Create Product" : "Save Changes"}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
