"use client"

import { useEffect, useRef, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, ListBox, ListBoxItem, Modal, Select, toast, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import type { InventoryRowWithDetails } from "@/hooks/useInventory"
import { cn } from "@/lib/utils"
import { runWithVerificationGuard } from "@/lib/verificationGuard"
import { Reorder, AnimatePresence } from "motion/react"
import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import MediaSelectorModal from "./MediaSelectorModal"

// ──────────────────────────────────────────────────────────
// Types & Schema
// ──────────────────────────────────────────────────────────

const schema = z.object({
  serial_number: z.string().min(1, "SP Number is required").max(100),
  location_id: z.string().min(1, "Location is required"),
})

type FormValues = z.infer<typeof schema>

interface LocationOption {
  id: string
  location_name: string
  country: string
}

interface AttachedImage {
  id: string
  storagePath: string
  publicUrl: string
  name: string
}

function getImageSortWeight(filename: string): number {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "")
  const underscoreMatch = nameWithoutExt.match(/__(\d+)_+$/)
  if (underscoreMatch) return parseInt(underscoreMatch[1], 10)
  const parenMatch = nameWithoutExt.match(/\((\d+)\)$/)
  if (parenMatch) return parseInt(parenMatch[1], 10)
  const plainUnderscoreMatch = nameWithoutExt.match(/_(\d+)$/)
  if (plainUnderscoreMatch) return parseInt(plainUnderscoreMatch[1], 10)
  return 100
}

interface InventoryModalProps {
  catalogId: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (row: InventoryRowWithDetails, isEdit: boolean) => void
  mode?: "add" | "edit"
  existingRow?: InventoryRowWithDetails | null
}

export default function InventoryModal({
  catalogId,
  isOpen,
  onOpenChange,
  onSaved,
  mode = "add",
  existingRow,
}: InventoryModalProps) {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [images, setImages] = useState<AttachedImage[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingImages, setIsLoadingImages] = useState(false)
  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const serialInputRef = useRef<HTMLInputElement>(null)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { serial_number: "", location_id: "" },
  })

  const watchedSerialNumber = useWatch({ control, name: "serial_number" }) || ""

  // Fetch locations and handle pre-populate on open
  useEffect(() => {
    if (!isOpen) return
    supabase
      .from("locations")
      .select("id, location_name, country")
      .order("location_name")
      .then(({ data }) => setLocations(data ?? []))

    if (mode === "edit" && existingRow) {
      reset({
        serial_number: existingRow.serial_number,
        location_id: existingRow.location_id ?? "",
      })
      
      // Fetch existing images for this inventory item
      setIsLoadingImages(true)
      ;(supabase.from("inventory_images" as any) as any)
        .select("id, public_url, storage_path, sort_order")
        .eq("inventory_id", existingRow.id)
        .order("sort_order", { ascending: true })
        .then(({ data, error }: any) => {
          if (error) {
            console.error("Failed to fetch images", error)
            toast.danger("Failed to load existing images")
          } else {
            const mapped = ((data as any[]) ?? []).map((img: any) => ({
              id: img.storage_path, // use storagePath as unique id
              storagePath: img.storage_path,
              publicUrl: img.public_url,
              name: img.storage_path.split("/").pop() ?? "image",
            }))
            setImages(mapped)
          }
          setIsLoadingImages(false)
        })
    } else {
      reset({ serial_number: "", location_id: "" })
      setImages([])
    }
  }, [isOpen, reset, mode, existingRow])

  // Focus serial input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => serialInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      // 1. Check serial number uniqueness
      if (mode === "edit" && existingRow) {
        if (values.serial_number.trim() !== existingRow.serial_number) {
          const { data: existing } = await (supabase
            .from("inventory" as any) as any)
            .select("id")
            .eq("serial_number", values.serial_number.trim())
            .limit(1)

          if (existing && (existing as any[]).length > 0) {
            setError("serial_number", { type: "manual", message: "This SP Number already exists" })
            setIsSubmitting(false)
            return
          }
        }
      } else {
        const { data: existing } = await (supabase
          .from("inventory" as any) as any)
          .select("id")
          .eq("serial_number", values.serial_number.trim())
          .limit(1)

        if (existing && (existing as any[]).length > 0) {
          setError("serial_number", { type: "manual", message: "This SP Number already exists" })
          setIsSubmitting(false)
          return
        }
      }

      // 2. Insert or Update inventory row
      let inventoryId = ""
      let createdAt = ""
      if (mode === "edit" && existingRow) {
        inventoryId = existingRow.id
        createdAt = existingRow.created_at
        const { error: invErr } = await (supabase
          .from("inventory" as any) as any)
          .update({
            serial_number: values.serial_number.trim(),
            location_id: values.location_id,
          })
          .eq("id", inventoryId)
        if (invErr) throw invErr
      } else {
        const invRow = await runWithVerificationGuard([catalogId], async () => {
          const { data, error: invErr } = await (supabase
            .from("inventory" as any) as any)
            .insert({
              catalog_id: catalogId,
              serial_number: values.serial_number.trim(),
              location_id: values.location_id,
            })
            .select("id, serial_number, catalog_id, location_id, created_at")
            .single()
          if (invErr) throw invErr
          return data
        })
        inventoryId = (invRow as any).id
        createdAt = (invRow as any).created_at
      }

      // 3. Save media connections (delete all old links, write new links)
      const { error: deleteErr } = await (supabase
        .from("inventory_images" as any) as any)
        .delete()
        .eq("inventory_id", inventoryId)
      if (deleteErr) throw deleteErr

      let firstImageUrl: string | null = null
      if (images.length > 0) {
        const toInsert = images.map((img, i) => ({
          inventory_id: inventoryId,
          storage_path: img.storagePath,
          public_url: img.publicUrl,
          sort_order: i,
        }))
        const { error: insertErr } = await (supabase
          .from("inventory_images" as any) as any)
          .insert(toInsert)
        if (insertErr) throw insertErr
        firstImageUrl = images[0].publicUrl
      }

      // 4. Get location details for optimistic update
      const loc = locations.find((l) => l.id === values.location_id)

      const resultRow: InventoryRowWithDetails = {
        id: inventoryId,
        serial_number: values.serial_number.trim(),
        catalog_id: catalogId,
        location_id: values.location_id,
        created_at: createdAt,
        location_name: loc?.location_name ?? null,
        country: loc?.country ?? null,
        first_image_url: firstImageUrl,
        image_urls: images.map((img) => img.publicUrl),
        is_sold: existingRow?.is_sold ?? false,
      }

      if (mode === "edit") {
        toast.success("Inventory piece updated successfully!")
        onSaved(resultRow, true)
      } else {
        toast.success("Inventory piece added successfully!")
        onSaved(resultRow, false)
      }
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save inventory"
      toast.danger(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="lg" className="z-[200]">
          <Modal.Dialog>
            {({ close }) => (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col max-h-[90vh] bg-white rounded-2xl overflow-hidden">
                <Modal.Header className="border-b border-zinc-100 text-zinc-900 font-semibold shrink-0">
                  {mode === "edit" ? "Edit Inventory Piece" : "Add Inventory Piece"}
                </Modal.Header>

                <Modal.Body className="overflow-y-auto py-6 flex flex-col gap-5">
                  {isLoadingImages ? (
                    <div className="py-12 text-center">
                      <Typography.Paragraph size="sm" className="text-zinc-400">Loading images…</Typography.Paragraph>
                    </div>
                  ) : (
                    <>
                      {/* Serial Number */}
                      <Controller
                        control={control}
                        name="serial_number"
                        render={({ field }) => (
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-zinc-700">
                              SP Number <span className="text-red-500">*</span>
                            </label>
                            <input
                              ref={serialInputRef}
                              type="text"
                              placeholder="e.g. SP-2024-001"
                              value={field.value}
                              onChange={field.onChange}
                              className={cn(
                                "h-10 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all",
                                errors.serial_number
                                  ? "border-red-400 bg-red-50"
                                  : "border-zinc-200 hover:border-zinc-300"
                              )}
                            />
                            {errors.serial_number && (
                              <Typography.Paragraph size="xs" className="text-red-500">{errors.serial_number.message}</Typography.Paragraph>
                            )}
                          </div>
                        )}
                      />

                      {/* Location */}
                      <Controller
                        control={control}
                        name="location_id"
                        render={({ field }) => (
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-zinc-700">
                              Location <span className="text-red-500">*</span>
                            </label>
                            <Select
                              selectedKey={field.value || null}
                              onSelectionChange={(key) => field.onChange(key != null ? String(key) : "")}
                              isInvalid={!!errors.location_id}
                              placeholder="Select location…"
                              className="w-full"
                            >
                              <Select.Trigger className={cn(
                                "w-full h-10 rounded-xl border px-3 flex items-center justify-between bg-white text-sm transition-colors",
                                errors.location_id ? "border-red-400" : "border-zinc-200 hover:border-zinc-300"
                              )}>
                                <Select.Value className="text-zinc-900 data-[placeholder]:text-zinc-400" />
                                <Select.Indicator />
                              </Select.Trigger>
                              <Select.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden min-w-[240px]">
                                <ListBox className="max-h-52 overflow-y-auto scrollbar-hide py-1">
                                  {locations.map((l) => (
                                    <ListBoxItem
                                      key={l.id}
                                      id={l.id}
                                      className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-medium"
                                    >
                                      {l.location_name} · {l.country}
                                    </ListBoxItem>
                                  ))}
                                </ListBox>
                              </Select.Popover>
                            </Select>
                            {errors.location_id && (
                              <Typography.Paragraph size="xs" className="text-red-500">{errors.location_id.message}</Typography.Paragraph>
                            )}
                          </div>
                        )}
                      />

                      {/* Images */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-zinc-700">
                          Photos <span className="text-zinc-400">(optional, up to 20)</span>
                        </label>

                        <div className="flex flex-wrap gap-2">
                          <Reorder.Group
                            axis="x"
                            values={images}
                            onReorder={setImages}
                            className="flex flex-wrap gap-2"
                          >
                            <AnimatePresence>
                              {images.map((img) => (
                                <Reorder.Item
                                  key={img.id}
                                  value={img}
                                  className="relative group touch-none cursor-grab active:cursor-grabbing shrink-0"
                                  whileDrag={{ scale: 1.05, zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                                  layout
                                >
                                  <div className="relative w-20 h-20 sm:w-[100px] sm:h-[100px] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex items-center justify-center">
                                    {img.storagePath.toLowerCase().endsWith(".mp4") || img.name.toLowerCase().endsWith(".mp4") ? (
                                      <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 24 24" className="text-white opacity-85">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <Image
                                        src={getThumbnailUrl(img.publicUrl, { width: 160, quality: 75 })}
                                        alt={img.name}
                                        fill
                                        unoptimized
                                        className="object-cover"
                                        sizes="100px"
                                      />
                                    )}
                                    {/* Remove button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setImages((prev) => prev.filter((item) => item.id !== img.id))
                                      }}
                                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center cursor-pointer shadow-sm border border-white/20"
                                      aria-label="Remove image"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </Reorder.Item>
                              ))}
                            </AnimatePresence>
                          </Reorder.Group>

                          {/* Add media card */}
                          {images.length < 20 && (
                            <button
                              type="button"
                              onClick={() => setIsSelectorOpen(true)}
                              className="w-20 h-20 sm:w-[100px] sm:h-[100px] rounded-xl border-2 border-dashed border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/10 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-zinc-50/50 transition-colors shrink-0 select-none group"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="text-zinc-400 group-hover:text-indigo-600 transition-colors">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              <span className="text-[10px] font-semibold text-zinc-500 group-hover:text-indigo-600 transition-colors">Add media</span>
                            </button>
                          )}
                        </div>

                        <MediaSelectorModal
                          isOpen={isSelectorOpen}
                          onOpenChange={setIsSelectorOpen}
                          alreadySelectedPaths={images.map((img) => img.storagePath)}
                          defaultSearchQuery={watchedSerialNumber}
                          onSelected={(selected) => {
                            const mapped = selected.map((f) => ({
                              id: f.storagePath,
                              storagePath: f.storagePath,
                              publicUrl: f.publicUrl,
                              name: f.name,
                            }))
                            
                            // Sort by default image weight order
                            mapped.sort((a, b) => {
                              const wA = getImageSortWeight(a.name)
                              const wB = getImageSortWeight(b.name)
                              if (wA !== wB) return wA - wB
                              return a.name.localeCompare(b.name)
                            })

                            setImages(mapped)
                          }}
                        />
                      </div>
                    </>
                  )}
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
                    isDisabled={isSubmitting || isLoadingImages}
                    className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium"
                  >
                    {isSubmitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Add Inventory"}
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
