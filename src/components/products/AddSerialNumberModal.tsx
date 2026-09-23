"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Button,
  Chip,
  EmptyState,
  ListBox,
  ListBoxItem,
  Modal,
  Popover,
  ScrollShadow,
  SearchField,
  Select,
  Spinner,
  toast,
  Typography,
} from "@heroui/react"
import ImageUploader, { UploadedImage } from "@/components/shared/ImageUploader"
import PercentageSlider from "@/components/ui/PercentageSlider"
import { supabase } from "@/lib/supabase/client"
import { uploadImage } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"
import { runWithVerificationGuard } from "@/lib/verificationGuard"

// ──────────────────────────────────────────────────────────
// Schema & Types
// ──────────────────────────────────────────────────────────

const fiberEntry = z.object({
  fiber_id: z.string().min(1, "Select a fiber"),
  percentage: z.number().min(1).max(100),
})

const schema = z.object({
  // Step 1
  serial_number: z.string().min(1, "Serial number is required"),

  // Step 2 Core Details
  size_id: z.string().min(1, "Size is required"),
  quality_id: z.string().min(1, "Quality is required"),
  quality_code: z.string().min(1, "Select a quality code"),
  quality_prefix: z.string(),
  design_id: z.string().min(1, "Design is required"),
  design_code: z.string().min(1, "Select a design code"),
  color_ids: z.array(z.string()).min(1, "Select at least one color"),

  // Selection of existing SKU vs creation of new SKU
  selected_catalog_id: z.string().nullable().optional(),
  is_new_sku: z.boolean(),

  // Required if creating a new SKU
  product_type_id: z.string().optional(),
  collection_id: z.string().nullable().optional(),
  construction_id: z.string().nullable().optional(),
  fibers: z.array(fiberEntry).optional(),

  // Physical Location & Status
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

interface MatchingSkuItem {
  id: string
  sku: string
  product_name: string | null
  quality_name: string | null
  design_name: string | null
  size_label: string | null
  collection_name: string | null
}

interface AddSerialNumberModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
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
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mr-1.5 text-indigo-600">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
)

// ──────────────────────────────────────────────────────────
// Search Select Components
// ──────────────────────────────────────────────────────────

function HeroSearchSelect({
  label,
  value,
  onChange,
  options,
  required,
  error,
  placeholder = "Select…",
  disabled = false,
}: {
  label: string
  value: string
  onChange: (val: string) => void
  options: OptionItem[]
  required?: boolean
  error?: string
  placeholder?: string
  disabled?: boolean
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
            disabled={disabled}
            className={cn(
              "w-full h-10 rounded-xl border px-3 flex items-center justify-between bg-white text-sm transition-colors text-left outline-hidden cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
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
                          {isSelected && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
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

// ──────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────

export default function AddSerialNumberModal({
  isOpen,
  onOpenChange,
  onSaved,
}: AddSerialNumberModalProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)

  // Uploaded Images state for Step 1
  const [images, setImages] = useState<UploadedImage[]>([])
  const [isScanningMedia, setIsScanningMedia] = useState(false)

  // Lookup option states
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

  // Dynamic Matching SKU state
  const [matchingSkus, setMatchingSkus] = useState<MatchingSkuItem[]>([])
  const [isSearchingSkus, setIsSearchingSkus] = useState(false)
  const [serialExistsWarning, setSerialExistsWarning] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch Lookups
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
      (supabase.from("locations" as any) as any).select("id, location_name, country").order("location_name"),
    ]).then(([pt, sz, qt, qc, d, dc, col, con, clr, fib, loc]) => {
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
      setLocations(((loc.data as any[]) ?? []).map((r: any) => ({ id: r.id, label: `${r.location_name} (${r.country})` })))
    })
  }, [isOpen])

  // Form Setup
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      serial_number: "",
      size_id: "",
      quality_id: "",
      quality_code: "",
      quality_prefix: "",
      design_id: "",
      design_code: "",
      color_ids: [],
      selected_catalog_id: null,
      is_new_sku: false,
      product_type_id: "",
      collection_id: null,
      construction_id: null,
      fibers: [{ fiber_id: "", percentage: 100 }],
      location_id: "",
      is_sold: false,
    },
  })

  const { fields: fiberFields, append: appendFiber, remove: removeFiber } = useFieldArray({
    control,
    name: "fibers",
  })

  const watched = useWatch({ control })

  // Reset modal state on close/open
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1)
      setImages([])
      setSerialExistsWarning(null)
      setMatchingSkus([])
      reset({
        serial_number: "",
        size_id: "",
        quality_id: "",
        quality_code: "",
        quality_prefix: "",
        design_id: "",
        design_code: "",
        color_ids: [],
        selected_catalog_id: null,
        is_new_sku: false,
        product_type_id: "",
        collection_id: null,
        construction_id: null,
        fibers: [{ fiber_id: "", percentage: 100 }],
        location_id: "",
        is_sold: false,
      })
    }
  }, [isOpen, reset])

  // Check if serial number already exists when typing
  useEffect(() => {
    const sp = watched.serial_number?.trim()
    if (!sp) {
      setSerialExistsWarning(null)
      return
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("inventory")
        .select("serial_number")
        .eq("serial_number", sp)
        .maybeSingle()

      if (data) {
        setSerialExistsWarning(`Warning: Serial number "${sp}" already exists in inventory.`)
      } else {
        setSerialExistsWarning(null)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [watched.serial_number])

  // Scan media storage automatically for entered Serial Number
  const handleAutoScanMedia = async () => {
    const sp = watched.serial_number?.trim()
    if (!sp) {
      toast.info("Please enter a serial number first")
      return
    }
    try {
      setIsScanningMedia(true)
      const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "images"
      const { data: mediaItems } = await supabase.storage.from(bucketName).list("media", {
        search: sp,
        limit: 20,
      })

      if (mediaItems && mediaItems.length > 0) {
        const foundImages: UploadedImage[] = mediaItems
          .filter((item) => item.name && !item.name.startsWith("."))
          .map((item, idx) => {
            const path = `media/${item.name}`
            const pubUrl = supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl
            return {
              id: `scanned_${idx}_${Date.now()}`,
              previewUrl: pubUrl,
              publicUrl: pubUrl,
              storagePath: path,
              sort_order: idx,
            }
          })
        setImages((prev) => [...prev, ...foundImages])
        toast.success(`Found ${foundImages.length} media file(s) matching "${sp}"`)
      } else {
        toast.info(`No existing media storage files found matching "${sp}"`)
      }
    } catch (e: any) {
      console.error("Auto scan failed:", e)
      toast.danger("Failed to search media storage")
    } finally {
      setIsScanningMedia(false)
    }
  }

  // Filtered Quality Codes & Design Codes based on parent selections
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

  // Query Available Matching SKUs whenever Quality, Quality Code, Design, Design Code, Colors, or Size changes
  useEffect(() => {
    const { quality_id, quality_code, design_id, design_code, size_id, color_ids } = watched

    if (!quality_id || !quality_code || !design_id || !design_code || !size_id) {
      setMatchingSkus([])
      return
    }

    const qCode = quality_code
    const dCode = design_code
    const sId = size_id

    let isMounted = true
    setIsSearchingSkus(true)

    async function searchMatchingSkus() {
      try {
        // Query catalog table for matching attributes
        const { data: catRows, error } = await (supabase
          .from("catalog" as any) as any)
          .select("id, sku")
          .eq("quality_code", qCode)
          .eq("design_code", dCode)
          .eq("size_id", sId)

        if (error) throw error

        if (!catRows || (catRows as any[]).length === 0) {
          if (isMounted) {
            setMatchingSkus([])
            setValue("selected_catalog_id", null)
            setValue("is_new_sku", true)
          }
          return
        }

        // If colors were selected, filter by catalog_colors matching color_ids
        let matchingIds = ((catRows as any[]) ?? []).map((r: any) => r.id)
        if (color_ids && color_ids.length > 0) {
          const { data: colorMatches } = await (supabase
            .from("catalog_colors" as any) as any)
            .select("catalog_id")
            .in("catalog_id", matchingIds)
            .in("color_id", color_ids)

          if (colorMatches) {
            // Find catalog_ids that contain all selected colors
            const colorCounts: Record<string, number> = {}
            ;((colorMatches as any[]) ?? []).forEach((cm: any) => {
              colorCounts[cm.catalog_id] = (colorCounts[cm.catalog_id] || 0) + 1
            })
            matchingIds = matchingIds.filter((id: string) => (colorCounts[id] || 0) >= color_ids.length)
          }
        }

        const finalMatches: MatchingSkuItem[] = ((catRows as any[]) ?? [])
          .filter((r: any) => matchingIds.includes(r.id))
          .map((r: any) => ({
            id: r.id,
            sku: r.sku,
            product_name: null,
            quality_name: null,
            design_name: null,
            size_label: null,
            collection_name: null,
          }))

        if (isMounted) {
          setMatchingSkus(finalMatches)
          if (finalMatches.length > 0) {
            // Default to selecting the first matching SKU
            setValue("selected_catalog_id", finalMatches[0].id)
            setValue("is_new_sku", false)
          } else {
            setValue("selected_catalog_id", null)
            setValue("is_new_sku", true)
          }
        }
      } catch (err) {
        console.error("Error searching matching SKUs:", err)
      } finally {
        if (isMounted) setIsSearchingSkus(false)
      }
    }

    searchMatchingSkus()
    return () => {
      isMounted = false
    }
  }, [
    watched.quality_id,
    watched.quality_code,
    watched.design_id,
    watched.design_code,
    watched.size_id,
    JSON.stringify(watched.color_ids),
    setValue,
  ])

  const fiberTotal = useMemo(
    () => (watched.fibers ?? []).reduce((s, f) => s + (Number(f?.percentage) || 0), 0),
    [watched.fibers]
  )

  // Quality & Design Handlers
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
      setValue("design_id", id)
      setValue("design_code", "")
    },
    [setValue]
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

  const adjustFibers = useCallback(
    (changedIndex: number, newVal: number) => {
      const currentFibers = getValues("fibers") || []
      const otherIndices = currentFibers.map((_, i) => i).filter((i) => i !== changedIndex)

      setValue(`fibers.${changedIndex}.percentage`, newVal, { shouldValidate: true })

      if (otherIndices.length === 0) return

      const remaining = 100 - newVal
      const otherSum = otherIndices.reduce((s, i) => s + (currentFibers[i]?.percentage || 0), 0)

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
      const currentFibers = getValues("fibers") || []
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

  // Step 1 -> Step 2 validation
  const handleGoToStep2 = async () => {
    const isValid = await trigger("serial_number")
    if (!isValid) return
    setCurrentStep(2)
  }

  // Submission Logic
  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      let targetCatalogId = values.selected_catalog_id ?? ""

      // If creating a new SKU or no SKU selected
      if (values.is_new_sku || !targetCatalogId) {
        if (!values.product_type_id) {
          toast.danger("Product Type is required to create a new SKU")
          setIsSubmitting(false)
          return
        }
        if (fiberTotal !== 100) {
          toast.danger("Fiber composition percentages must sum to 100%")
          setIsSubmitting(false)
          return
        }

        // Check if computed SKU exists in catalog
        const { data: existingCat } = await (supabase
          .from("catalog" as any) as any)
          .select("id")
          .eq("sku", previewSku)
          .maybeSingle()

        if (existingCat) {
          targetCatalogId = (existingCat as any).id
        } else {
          // Insert new catalog SKU
          const { data: newCat, error: insertCatErr } = await (supabase
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

          if (insertCatErr) throw insertCatErr
          targetCatalogId = (newCat as any).id

          // Insert catalog colors
          if (values.color_ids.length > 0) {
            await (supabase
              .from("catalog_colors" as any) as any)
              .insert(values.color_ids.map((cid: string) => ({ catalog_id: targetCatalogId, color_id: cid })))
          }

          // Insert catalog fibers
          if (values.fibers && values.fibers.length > 0) {
            await (supabase.from("catalog_fibers" as any) as any).insert(
              values.fibers.map((f: any) => ({
                catalog_id: targetCatalogId,
                fiber_id: f.fiber_id,
                percentage: f.percentage,
              }))
            )
          }
        }
      }

      // Insert Serial Number row into inventory
      const newInv = await runWithVerificationGuard([targetCatalogId], async () => {
        const { data, error: insertInvErr } = await (supabase
          .from("inventory" as any) as any)
          .insert({
            serial_number: values.serial_number.trim(),
            catalog_id: targetCatalogId,
            location_id: values.location_id || null,
            is_sold: values.is_sold,
          })
          .select("id")
          .single()

        if (insertInvErr) throw insertInvErr
        return data
      })
      const inventoryId = (newInv as any).id

      // Upload local images to Supabase storage and attach to inventory_images
      if (images.length > 0) {
        const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "images"

        for (let i = 0; i < images.length; i++) {
          const img = images[i]
          let pubUrl = img.publicUrl
          let path = img.storagePath

          // If local File is attached, upload to bucket
          if (img.file) {
            const fileExt = img.file.name.split(".").pop() || "jpg"
            const filename = `${values.serial_number.trim()}_${Date.now()}_${i}.${fileExt}`
            const uploadPath = `inventory/${filename}`

            pubUrl = await uploadImage(bucketName, uploadPath, img.file)
            path = uploadPath
          }

          if (pubUrl && path) {
            await (supabase.from("inventory_images" as any) as any).insert({
              inventory_id: inventoryId,
              storage_path: path,
              public_url: pubUrl,
              sort_order: i,
            })
          }
        }
      }

      toast.success(`Serial number ${values.serial_number.trim()} created and mapped successfully!`)
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      console.error("Error creating serial number:", e)
      toast.danger(e.message || "Failed to create serial number")
    } finally {
      setIsSubmitting(false)
    }
  }

  const sliderMax = fiberFields.length > 1 ? 100 - (fiberFields.length - 1) : 100

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="lg" className="z-[200]">
          <Modal.Dialog>
            {({ close }) => (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col max-h-[90vh]">
                {/* Header */}
                <Modal.Header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                      {currentStep}
                    </div>
                    <div>
                      <Typography.Heading level={4} className="text-zinc-900 font-bold">
                        {currentStep === 1 ? "Step 1: Serial Number & Media" : "Step 2: Product Details & SKU"}
                      </Typography.Heading>
                      <Typography.Paragraph size="xs" className="text-zinc-500">
                        {currentStep === 1
                          ? "Enter the physical SP serial number and map/upload image media."
                          : "Specify SKU attributes or select an existing matching catalog SKU."}
                      </Typography.Paragraph>
                    </div>
                  </div>

                  {/* Step Indicator */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-colors",
                        currentStep === 1 ? "bg-indigo-600" : "bg-zinc-200"
                      )}
                    />
                    <span
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-colors",
                        currentStep === 2 ? "bg-indigo-600" : "bg-zinc-200"
                      )}
                    />
                  </div>
                </Modal.Header>

                {/* Body */}
                <Modal.Body className="p-0 overflow-hidden">
                  <ScrollShadow hideScrollBar className="px-6 py-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
                    <AnimatePresence mode="wait">
                      {/* ──────────────── STEP 1 ──────────────── */}
                      {currentStep === 1 && (
                        <motion.div
                          key="step1"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="flex flex-col gap-6"
                        >
                          {/* Serial Number Input */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                              Serial Number (SP Number) <span className="text-red-500">*</span>
                            </label>
                            <Controller
                              control={control}
                              name="serial_number"
                              render={({ field }) => (
                                <input
                                  {...field}
                                  type="text"
                                  placeholder="e.g. SP-00997"
                                  className={cn(
                                    "w-full h-11 px-3.5 rounded-xl border bg-white text-sm font-mono font-bold tracking-wide outline-hidden transition-all",
                                    errors.serial_number
                                      ? "border-red-400 focus:border-red-500"
                                      : "border-zinc-200 hover:border-zinc-300 focus:border-indigo-500"
                                  )}
                                />
                              )}
                            />
                            {errors.serial_number && (
                              <Typography.Paragraph size="xs" className="text-red-500">
                                {errors.serial_number.message}
                              </Typography.Paragraph>
                            )}
                            {serialExistsWarning && (
                              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                                {serialExistsWarning}
                              </div>
                            )}
                          </div>

                          {/* Image Media Section */}
                          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/80 p-4 bg-zinc-50/50">
                            <div className="flex items-center justify-between">
                              <div>
                                <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-900">
                                  Piece Images & Media
                                </Typography.Paragraph>
                                <Typography.Paragraph size="xs" className="text-zinc-500">
                                  Drag and drop photos to upload or auto-match from storage media.
                                </Typography.Paragraph>
                              </div>

                              <Button
                                size="sm"
                                variant="outline"
                                onPress={handleAutoScanMedia}
                                isDisabled={isScanningMedia}
                                className="border-indigo-200 hover:border-indigo-300 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl text-xs font-semibold h-8 px-3 cursor-pointer shrink-0"
                              >
                                {isScanningMedia ? (
                                  <Spinner size="sm" color="accent" />
                                ) : (
                                  <>
                                    <SparklesIcon />
                                    <span>Scan Storage</span>
                                  </>
                                )}
                              </Button>
                            </div>

                            <ImageUploader images={images} onImagesChange={setImages} maxImages={15} />
                          </div>
                        </motion.div>
                      )}

                      {/* ──────────────── STEP 2 ──────────────── */}
                      {currentStep === 2 && (
                        <motion.div
                          key="step2"
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="flex flex-col gap-6"
                        >
                          {/* Serial Banner */}
                          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-indigo-700 font-medium">Serial Number:</span>
                              <Chip className="bg-indigo-600 text-white font-mono font-bold text-xs h-6 px-2">
                                {watched.serial_number}
                              </Chip>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCurrentStep(1)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline underline-offset-2"
                            >
                              ← Edit Step 1
                            </button>
                          </div>

                          {/* Live Preview */}
                          <div className="flex items-stretch rounded-xl border border-indigo-100 bg-indigo-50/40 overflow-hidden">
                            <div className="flex-1 px-4 py-3 border-r border-indigo-100 min-w-0">
                              <Typography.Paragraph size="xs" weight="semibold" className="text-indigo-400 uppercase tracking-wider mb-1">
                                Generated Code
                              </Typography.Paragraph>
                              <Typography.Code weight="semibold" truncate className="text-zinc-900 text-sm">
                                {previewProductCode}
                              </Typography.Code>
                            </div>
                            <div className="flex-1 px-4 py-3 min-w-0">
                              <Typography.Paragraph size="xs" weight="semibold" className="text-indigo-400 uppercase tracking-wider mb-1">
                                Target SKU
                              </Typography.Paragraph>
                              <Typography.Code weight="bold" truncate className="text-indigo-600 text-sm">
                                {previewSku}
                              </Typography.Code>
                            </div>
                          </div>

                          {/* Core Attributes: Size, Quality, Design, Colors */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Size */}
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

                            {/* Quality */}
                            <div className="flex flex-col gap-2">
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
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Quality Code */}
                            {watched.quality_id && (
                              <Controller
                                control={control}
                                name="quality_code"
                                render={({ field }) => (
                                  <HeroSearchSelect
                                    label="Quality Code"
                                    value={
                                      allQualityCodes.find(
                                        (q) =>
                                          q.quality_id === watched.quality_id &&
                                          q.quality_code === field.value
                                      )?.id ?? ""
                                    }
                                    onChange={handleQualityCodeChange}
                                    options={filteredQualityCodes}
                                    required
                                    error={errors.quality_code?.message}
                                  />
                                )}
                              />
                            )}

                            {/* Design */}
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
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Design Code */}
                            {watched.design_id && (
                              <Controller
                                control={control}
                                name="design_code"
                                render={({ field }) => (
                                  <HeroSearchSelect
                                    label="Design Code"
                                    value={
                                      allDesignCodes.find(
                                        (d) =>
                                          d.design_id === watched.design_id &&
                                          d.design_code === field.value
                                      )?.id ?? ""
                                    }
                                    onChange={handleDesignCodeChange}
                                    options={filteredDesignCodes}
                                    required
                                    error={errors.design_code?.message}
                                  />
                                )}
                              />
                            )}

                            {/* Colors */}
                            <Controller
                              control={control}
                              name="color_ids"
                              render={({ field }) => (
                                <HeroSearchMultiSelect
                                  label="Colors"
                                  value={field.value}
                                  onChange={field.onChange}
                                  options={colors.map((c) => ({
                                    id: c.id,
                                    label: c.color_name,
                                    suffix: c.color_code,
                                  }))}
                                  required
                                  error={errors.color_ids?.message}
                                />
                              )}
                            />
                          </div>

                          {/* ── Dynamic Matching SKU Selection Dropdown ── */}
                          <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/20 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <Typography.Paragraph size="sm" weight="bold" className="text-zinc-900">
                                  Available Matching SKUs
                                </Typography.Paragraph>
                                <Typography.Paragraph size="xs" className="text-zinc-500">
                                  {isSearchingSkus
                                    ? "Searching catalog for matching combinations…"
                                    : matchingSkus.length > 0
                                    ? `Found ${matchingSkus.length} matching catalog SKU(s) for this combination.`
                                    : "No existing catalog SKU matches this combination."}
                                </Typography.Paragraph>
                              </div>

                              <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={watched.is_new_sku}
                                    onChange={(e) => {
                                      setValue("is_new_sku", e.target.checked)
                                      if (e.target.checked) {
                                        setValue("selected_catalog_id", null)
                                      } else if (matchingSkus.length > 0) {
                                        setValue("selected_catalog_id", matchingSkus[0].id)
                                      }
                                    }}
                                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span>Create New SKU</span>
                                </label>
                              </div>
                            </div>

                            {!watched.is_new_sku && matchingSkus.length > 0 && (
                              <Controller
                                control={control}
                                name="selected_catalog_id"
                                render={({ field }) => (
                                  <HeroSearchSelect
                                    label="Select Existing Catalog SKU"
                                    value={field.value || ""}
                                    onChange={(val) => {
                                      field.onChange(val)
                                    }}
                                    options={matchingSkus.map((skuItem) => ({
                                      id: skuItem.id,
                                      label: skuItem.sku,
                                      suffix: `${skuItem.quality_name ?? ""} / ${skuItem.design_name ?? ""} (${skuItem.size_label ?? ""})`,
                                    }))}
                                    required
                                  />
                                )}
                              />
                            )}
                          </div>

                          {/* ── Fallback / Create New SKU Section ── */}
                          {watched.is_new_sku && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/30 p-4"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                <Typography.Paragraph size="xs" weight="bold" className="text-amber-800 uppercase tracking-wider">
                                  New Catalog SKU Parameters
                                </Typography.Paragraph>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <Controller
                                  control={control}
                                  name="product_type_id"
                                  render={({ field }) => (
                                    <HeroSearchSelect
                                      label="Product Type"
                                      value={field.value || ""}
                                      onChange={field.onChange}
                                      options={productTypes}
                                      required
                                      error={errors.product_type_id?.message}
                                    />
                                  )}
                                />

                                <Controller
                                  control={control}
                                  name="collection_id"
                                  render={({ field }) => (
                                    <HeroSearchSelect
                                      label="Collection"
                                      value={field.value || ""}
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
                                      value={field.value || ""}
                                      onChange={field.onChange}
                                      options={constructions}
                                    />
                                  )}
                                />
                              </div>

                              {/* Fibers Composition */}
                              <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 bg-white">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-800">
                                      Fiber Composition
                                    </Typography.Paragraph>
                                    <Typography.Paragraph size="xs" className="text-zinc-400">
                                      Percentages must sum to exactly 100%
                                    </Typography.Paragraph>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onPress={() =>
                                      appendFiber({ fiber_id: "", percentage: fiberFields.length === 0 ? 100 : 0 })
                                    }
                                    className="flex items-center gap-1 bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 h-8 rounded-lg cursor-pointer"
                                  >
                                    <PlusIcon /> Add Fiber
                                  </Button>
                                </div>

                                <div className="flex flex-col gap-4 mt-2">
                                  {fiberFields.map((field, idx) => (
                                    <div
                                      key={field.id}
                                      className="flex flex-col gap-2 p-3 bg-zinc-50 rounded-lg border border-zinc-100 relative"
                                    >
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onPress={() => handleRemoveFiber(idx)}
                                        className="absolute top-2.5 right-2.5 min-w-0 w-7 h-7 p-0 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 border-transparent hover:border-red-100 cursor-pointer"
                                      >
                                        <TrashIcon />
                                      </Button>

                                      <div className="w-4/5">
                                        <Controller
                                          control={control}
                                          name={`fibers.${idx}.fiber_id`}
                                          render={({ field }) => (
                                            <HeroSearchSelect
                                              label="Fiber Type"
                                              value={field.value || ""}
                                              onChange={field.onChange}
                                              options={fiberOptions}
                                              required
                                            />
                                          )}
                                        />
                                      </div>

                                      <div className="mt-2 flex items-center gap-3">
                                        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider w-16">
                                          Percentage
                                        </span>
                                        <div className="flex-1">
                                          <Controller
                                            control={control}
                                            name={`fibers.${idx}.percentage`}
                                            render={({ field }) => (
                                              <PercentageSlider
                                                value={field.value ?? 0}
                                                onChange={(val) => adjustFibers(idx, val)}
                                                max={sliderMax}
                                              />
                                            )}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="flex items-center justify-between border-t border-zinc-100 pt-3 mt-1 shrink-0">
                                  <span className="text-xs font-semibold text-zinc-500">Total Composition</span>
                                  <Chip
                                    color={fiberTotal === 100 ? "success" : "danger"}
                                    variant="soft"
                                    size="sm"
                                    className="font-bold tabular-nums"
                                  >
                                    {fiberTotal}%
                                  </Chip>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          <div className="h-px bg-zinc-200/60 my-1" />

                          {/* Physical Location & Status */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Controller
                              control={control}
                              name="location_id"
                              render={({ field }) => (
                                <HeroSearchSelect
                                  label="Physical Location"
                                  value={field.value || ""}
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
                                  <label className="text-xs font-medium text-zinc-700">Inventory Status</label>
                                  <Select
                                    aria-label="Select status"
                                    selectedKey={field.value ? "sold" : "stock"}
                                    onSelectionChange={(key) => {
                                      field.onChange(key === "sold")
                                    }}
                                    className="w-full"
                                  >
                                    <Select.Trigger className="w-full h-10 rounded-xl border border-zinc-200 hover:border-zinc-300 px-3 flex items-center justify-between bg-white text-sm transition-colors">
                                      <Select.Value className="text-zinc-900" />
                                      <Select.Indicator />
                                    </Select.Trigger>
                                    <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[140px]">
                                      <ListBox>
                                        <ListBoxItem id="stock" textValue="In Stock">In Stock</ListBoxItem>
                                        <ListBoxItem id="sold" textValue="Sold">Sold</ListBoxItem>
                                      </ListBox>
                                    </Select.Popover>
                                  </Select>
                                </div>
                              )}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </ScrollShadow>
                </Modal.Body>

                {/* Footer Controls */}
                <Modal.Footer className="border-t border-zinc-100 px-6 py-4 flex items-center justify-between shrink-0">
                  <Button
                    type="button"
                    onPress={() => {
                      if (currentStep === 2) setCurrentStep(1)
                      else onOpenChange(false)
                    }}
                    className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 h-10 px-4 rounded-xl text-sm font-semibold cursor-pointer"
                  >
                    {currentStep === 2 ? "← Back" : "Cancel"}
                  </Button>

                  {currentStep === 1 ? (
                    <Button
                      type="button"
                      onPress={handleGoToStep2}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-6 rounded-xl text-sm font-semibold cursor-pointer"
                    >
                      Next: Product Details →
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      isDisabled={isSubmitting || (watched.is_new_sku && fiberTotal !== 100)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white h-10 px-6 rounded-xl text-sm font-semibold cursor-pointer"
                    >
                      {isSubmitting ? <Spinner size="sm" /> : "Save & Add Serial Number"}
                    </Button>
                  )}
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
