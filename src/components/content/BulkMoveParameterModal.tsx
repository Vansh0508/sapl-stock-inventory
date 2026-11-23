"use client"

import { useState, useEffect, useMemo } from "react"
import { Modal, Button, Spinner, toast } from "@heroui/react"
import Image from "next/image"
import { supabase } from "@/lib/supabase/client"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"
import { ArrowRightArrowLeft, Check } from "@gravity-ui/icons"

interface StorageFile {
  name: string
  id: string | null
  created_at: string | null
  storagePath: string
  publicUrl: string
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
  } | null
}

interface BulkMoveParameterModalProps {
  isOpen: boolean
  onClose: () => void
  selectedFiles: StorageFile[]
  onSuccess: () => void
}

type ParamKey = "designs" | "qualities" | "sizes" | "collections" | "constructions" | "product_types" | "locations"

interface ParamConfig {
  key: ParamKey
  label: string
  table: string
  idCol: string
  nameCol: string
  field: string
}

const PARAM_CONFIGS: ParamConfig[] = [
  { key: "designs", label: "Design", table: "designs", idCol: "id", nameCol: "design_name", field: "design_id" },
  { key: "qualities", label: "Quality", table: "qualities", idCol: "id", nameCol: "quality_name", field: "quality_id" },
  { key: "sizes", label: "Size", table: "sizes", idCol: "id", nameCol: "size_label", field: "size_id" },
  { key: "collections", label: "Collection", table: "collections", idCol: "id", nameCol: "collection_name", field: "collection_id" },
  { key: "constructions", label: "Construction", table: "constructions", idCol: "id", nameCol: "construction_name", field: "construction_id" },
  { key: "product_types", label: "Product Type", table: "product_types", idCol: "id", nameCol: "product_name", field: "product_type_id" },
  { key: "locations", label: "Location", table: "locations", idCol: "id", nameCol: "location_name", field: "location_id" },
]

export default function BulkMoveParameterModal({ isOpen, onClose, selectedFiles, onSuccess }: BulkMoveParameterModalProps) {
  const [selectedParamKey, setSelectedParamKey] = useState<ParamKey>("designs")
  const [options, setOptions] = useState<{ id: string; name: string; code?: string }[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [selectedTargetId, setSelectedTargetId] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [showShiftDetailsList, setShowShiftDetailsList] = useState(false)

  // Fetch target options whenever selectedParamKey or modal visibility changes
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setIsLoadingOptions(true)
    setSelectedTargetId("")
    setSearchTerm("")

    const currentConfig = PARAM_CONFIGS.find((p) => p.key === selectedParamKey)!

    const loadData = async () => {
      try {
        let query: any = supabase.from(currentConfig.table as any)

        if (currentConfig.table === "designs") {
          query = query.select("id, design_name, design_codes(design_code)")
        } else if (currentConfig.table === "qualities") {
          query = query.select("id, quality_name, quality_codes(quality_code)")
        } else {
          query = query.select(`${currentConfig.idCol}, ${currentConfig.nameCol}`)
        }

        const { data, error } = await query.order(currentConfig.nameCol as any)

        if (cancelled) return
        if (error || !data) {
          console.error("Failed to fetch parameter options:", error)
          setOptions([])
          return
        }

        const formatted = (data as any[]).map((row) => {
          let code: string | undefined = undefined
          if (row.design_codes && Array.isArray(row.design_codes) && row.design_codes.length > 0) {
            code = row.design_codes[0].design_code
          } else if (row.quality_codes && Array.isArray(row.quality_codes) && row.quality_codes.length > 0) {
            code = row.quality_codes[0].quality_code
          }

          return {
            id: String(row[currentConfig.idCol]),
            name: String(row[currentConfig.nameCol] || "").trim(),
            code,
          }
        }).filter((item) => Boolean(item.id && item.name))

        setOptions(formatted)
        if (formatted.length > 0) {
          setSelectedTargetId(formatted[0].id)
        }
      } catch (e) {
        if (!cancelled) console.error("Error loading options:", e)
      } finally {
        if (!cancelled) setIsLoadingOptions(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedParamKey])

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (opt.code && opt.code.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const activeConfig = PARAM_CONFIGS.find((p) => p.key === selectedParamKey)!
  const selectedTargetObj = options.find((o) => o.id === selectedTargetId)

  // Fetch fallback defaults when creating new inventory pieces
  const getDefaultInventoryFields = async () => {
    const { data: pt } = await (supabase.from("product_types" as any) as any).select("id").limit(1).maybeSingle()
    const { data: sz } = await (supabase.from("sizes" as any) as any).select("id").limit(1).maybeSingle()
    const { data: ql } = await (supabase.from("qualities" as any) as any).select("id").limit(1).maybeSingle()
    const { data: ds } = await (supabase.from("designs" as any) as any).select("id").limit(1).maybeSingle()
    const { data: loc } = await (supabase.from("locations" as any) as any).select("id").limit(1).maybeSingle()

    return {
      product_type_id: (pt as any)?.id || null,
      size_id: (sz as any)?.id || null,
      quality_id: (ql as any)?.id || null,
      design_id: (ds as any)?.id || null,
      location_id: (loc as any)?.id || null,
    }
  }

  // Compute SKU and formula codes directly for the inventory table
  const computeInventorySku = async (fields: {
    quality_id?: string | null
    design_id?: string | null
    size_id?: string | null
  }) => {
    let quality_code = ""
    let quality_prefix = ""
    let design_code = ""
    let so_seq = ""

    if (fields.quality_id) {
      const { data: qc } = await (supabase
        .from("quality_codes" as any) as any)
        .select("quality_code, quality_prefix")
        .eq("quality_id", fields.quality_id)
        .order("created_at")
        .limit(1)
        .maybeSingle()
      if (qc) {
        quality_code = (qc as any).quality_code || ""
        quality_prefix = (qc as any).quality_prefix || ""
      }
    }

    if (fields.design_id) {
      const { data: dc } = await (supabase
        .from("design_codes" as any) as any)
        .select("design_code")
        .eq("design_id", fields.design_id)
        .order("created_at")
        .limit(1)
        .maybeSingle()
      if (dc) {
        design_code = (dc as any).design_code || ""
      }
    }

    if (fields.size_id) {
      const { data: sz } = await (supabase
        .from("sizes" as any) as any)
        .select("so_seq")
        .eq("id", fields.size_id)
        .maybeSingle()
      if (sz) {
        so_seq = (sz as any).so_seq ? String((sz as any).so_seq) : ""
      }
    }

    const product_code = `${quality_prefix}${design_code}`
    const sku = (product_code || so_seq) ? `SA-${product_code}-${so_seq ? 'SO' + so_seq : ''}` : null

    return {
      quality_code: quality_code || null,
      design_code: design_code || null,
      product_code: product_code || null,
      sku,
    }
  }

  const handleApplyMove = async () => {
    if (!selectedTargetId) {
      toast.danger("Please select a target parameter value")
      return
    }

    if (selectedFiles.length === 0) return

    setIsSubmitting(true)
    let shiftedCount = 0
    let createdPieceCount = 0
    let failedCount = 0

    try {
      const storagePaths = selectedFiles.map((f) => f.storagePath)

      // 1. Query database for existing inventory_images mapping
      const { data: existingImgRefs } = await (supabase
        .from("inventory_images" as any) as any)
        .select("id, storage_path, inventory_id, public_url")
        .in("storage_path", storagePaths)

      const imgRefMap = new Map(((existingImgRefs as any[]) ?? []).map((r) => [r.storage_path, r]))

      // 2. Load fallback defaults for new unassigned pieces
      const defaults = await getDefaultInventoryFields()

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const existingRef = imgRefMap.get(file.storagePath)
        let inventoryId = existingRef?.inventory_id

        try {
          if (!inventoryId) {
            // Unassigned file: create new serialized physical piece directly in INVENTORY table
            const autoSerial = `SP-${Date.now().toString().slice(-6)}-${i + 1}`

            const newFields: Record<string, any> = {
              serial_number: autoSerial,
              product_type_id: defaults.product_type_id,
              size_id: defaults.size_id,
              quality_id: defaults.quality_id,
              design_id: defaults.design_id,
              location_id: defaults.location_id,
              [activeConfig.field]: selectedTargetId,
            }

            const computedCodes = await computeInventorySku({
              quality_id: newFields.quality_id,
              design_id: newFields.design_id,
              size_id: newFields.size_id,
            })

            const { data: newInv, error: invInsErr } = await (supabase
              .from("inventory" as any) as any)
              .insert({
                serial_number: autoSerial,
                product_type_id: newFields.product_type_id,
                size_id: newFields.size_id,
                quality_id: newFields.quality_id,
                design_id: newFields.design_id,
                collection_id: newFields.collection_id || null,
                construction_id: newFields.construction_id || null,
                location_id: newFields.location_id,
                quality_code: computedCodes.quality_code,
                design_code: computedCodes.design_code,
                product_code: computedCodes.product_code,
                sku: computedCodes.sku,
              })
              .select("id")
              .single()

            if (invInsErr || !newInv) throw invInsErr || new Error("Failed to insert inventory piece")
            inventoryId = newInv.id
            createdPieceCount++

            // Insert inventory_images reference
            await (supabase.from("inventory_images" as any) as any).insert({
              inventory_id: inventoryId,
              storage_path: file.storagePath,
              public_url: file.publicUrl,
            })

            shiftedCount++
          } else {
            // Existing piece: shift parameter directly in INVENTORY table
            // Fetch current inventory record
            const { data: currentInv } = await (supabase
              .from("inventory" as any) as any)
              .select("id, product_type_id, size_id, quality_id, design_id, collection_id, construction_id, location_id")
              .eq("id", inventoryId)
              .single()

            const updatedFields: Record<string, any> = {
              product_type_id: (currentInv as any)?.product_type_id || defaults.product_type_id,
              size_id: (currentInv as any)?.size_id || defaults.size_id,
              quality_id: (currentInv as any)?.quality_id || defaults.quality_id,
              design_id: (currentInv as any)?.design_id || defaults.design_id,
              collection_id: (currentInv as any)?.collection_id || null,
              construction_id: (currentInv as any)?.construction_id || null,
              location_id: (currentInv as any)?.location_id || defaults.location_id,
              [activeConfig.field]: selectedTargetId,
            }

            // Recompute quality_code, design_code, product_code, and sku directly for the inventory row
            const computedCodes = await computeInventorySku({
              quality_id: updatedFields.quality_id,
              design_id: updatedFields.design_id,
              size_id: updatedFields.size_id,
            })

            // Update INVENTORY table directly — NOT modifying or creating catalog rows!
            const { error: invUpdateErr } = await (supabase
              .from("inventory" as any) as any)
              .update({
                product_type_id: updatedFields.product_type_id,
                size_id: updatedFields.size_id,
                quality_id: updatedFields.quality_id,
                design_id: updatedFields.design_id,
                collection_id: updatedFields.collection_id,
                construction_id: updatedFields.construction_id,
                location_id: updatedFields.location_id,
                quality_code: computedCodes.quality_code,
                design_code: computedCodes.design_code,
                product_code: computedCodes.product_code,
                sku: computedCodes.sku,
                updated_at: new Date().toISOString(),
              })
              .eq("id", inventoryId)

            if (invUpdateErr) throw invUpdateErr
            shiftedCount++
          }
        } catch (itemErr) {
          console.error(`Failed to shift file ${file.name}:`, itemErr)
          failedCount++
        }
      }

      if (shiftedCount > 0) {
        let msg = `Successfully shifted ${shiftedCount} inventory piece(s) to ${activeConfig.label} '${selectedTargetObj?.name || ""}' and updated inventory SKUs directly!`
        if (createdPieceCount > 0) {
          msg += ` (${createdPieceCount} new SP piece(s) created in inventory)`
        }
        toast.success(msg)
      }

      if (failedCount > 0) {
        toast.danger(`Failed to shift ${failedCount} item(s).`)
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error("Bulk parameter shift error:", err)
      toast.danger(`Bulk shift failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Breakdown of selected items
  const shiftSummary = useMemo(() => {
    const total = selectedFiles.length
    const withSerial = selectedFiles.filter((f) => f.details?.serial_number).length
    const unassigned = total - withSerial
    return { total, withSerial, unassigned }
  }, [selectedFiles])

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <Modal.Backdrop className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <Modal.Container className="w-full max-w-xl my-auto">
          <Modal.Dialog className="rounded-3xl shadow-2xl bg-white border border-zinc-200 overflow-hidden w-full relative z-[10000]">
            <Modal.Header className="px-6 pt-5 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shadow-xs">
                  <ArrowRightArrowLeft width="20" height="20" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Shift Inventory Parameters</h3>
                  <p className="text-xs text-zinc-400 font-semibold">
                    Shift {selectedFiles.length} piece(s) in the Inventory table & auto-update their direct SKU.
                  </p>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className="p-6 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
              {/* Selected Shift Items Summary */}
              <div className="p-3.5 bg-zinc-50 border border-zinc-200/80 rounded-2xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-800">
                      Selected Pieces for Shift ({shiftSummary.total})
                    </span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                      {shiftSummary.withSerial} in Inventory
                    </span>
                    {shiftSummary.unassigned > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                        {shiftSummary.unassigned} unassigned
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShiftDetailsList(!showShiftDetailsList)}
                    className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    {showShiftDetailsList ? "Hide details" : "View pieces"}
                  </button>
                </div>

                {/* Detailed Collapsible List */}
                {showShiftDetailsList && (
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pt-2 border-t border-zinc-200/60">
                    {selectedFiles.map((file, idx) => {
                      const sp = file.details?.serial_number
                      const sku = file.details?.sku
                      return (
                        <div key={file.storagePath || idx} className="flex items-center justify-between gap-3 bg-white p-2 rounded-xl border border-zinc-200/60 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-zinc-200 shrink-0 bg-zinc-100">
                              <Image
                                src={getThumbnailUrl(file.publicUrl, { width: 64, quality: 70 })}
                                alt={file.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-mono font-bold text-zinc-900 truncate">
                                {sp || "Unassigned Image"}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono truncate">
                                {sku || "No SKU assigned"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] font-semibold text-zinc-500">
                              {file.details?.design_name || file.details?.quality_name || "—"}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Step 1: Select Parameter Category */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                  1. Choose Target Parameter to Shift
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {PARAM_CONFIGS.map((param) => {
                    const isActive = selectedParamKey === param.key
                    return (
                      <button
                        key={param.key}
                        type="button"
                        onClick={() => setSelectedParamKey(param.key)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border text-left flex items-center justify-between shadow-3xs",
                          isActive
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300"
                        )}
                      >
                        <span>{param.label}</span>
                        {isActive && (
                          <Check width="13" height="13" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Step 2: Select Target Parameter Value */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">
                    2. Select Target {activeConfig.label}
                  </label>
                  <span className="text-[11px] text-zinc-400 font-medium">
                    {options.length} options available
                  </span>
                </div>

                {/* Option Filter Input */}
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Search ${activeConfig.label}s…`}
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />

                <div className="max-h-44 overflow-y-auto border border-zinc-200/80 rounded-xl p-1 bg-zinc-50/50 flex flex-col gap-1">
                  {isLoadingOptions ? (
                    <div className="flex items-center justify-center p-6 text-xs text-indigo-600 font-medium gap-2">
                      <Spinner size="sm" color="current" />
                      <span>Loading {activeConfig.label} options…</span>
                    </div>
                  ) : filteredOptions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400 font-medium">
                      No {activeConfig.label.toLowerCase()} found matching "{searchTerm}"
                    </div>
                  ) : (
                    filteredOptions.map((opt) => {
                      const isSelected = selectedTargetId === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSelectedTargetId(opt.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-between select-none",
                            isSelected
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold"
                              : "text-zinc-700 hover:bg-zinc-100"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span>{opt.name}</span>
                            {opt.code && (
                              <span className="text-[10px] bg-zinc-200/70 text-zinc-700 px-1.5 py-0.5 rounded font-mono font-bold">
                                {opt.code}
                              </span>
                            )}
                          </div>
                          {isSelected && (
                            <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">
                              Selected ✓
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Direct Inventory Update Guarantee Notice */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-50/90 to-teal-50/90 border border-emerald-200/80 rounded-2xl flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ✓
                </div>
                <div className="flex flex-col gap-0.5 text-xs text-emerald-950">
                  <span className="font-bold">Direct Inventory Table Shift</span>
                  <p className="text-[11px] text-emerald-900/80 leading-relaxed">
                    This operation directly updates the <strong>inventory</strong> table attributes (e.g. {activeConfig.label}, design code, quality code, and direct SKU) for the selected physical pieces without modifying the catalog table.
                  </p>
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between">
              <div className="text-xs text-zinc-500 font-medium">
                Target: <span className="font-bold text-indigo-700">{selectedTargetObj?.name || "None"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onPress={onClose}
                  isDisabled={isSubmitting}
                  className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onPress={handleApplyMove}
                  isDisabled={isSubmitting || !selectedTargetId}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs px-5 h-9 font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                >
                  {isSubmitting ? (
                    <>
                      <Spinner size="sm" color="current" />
                      <span>Shifting Inventory…</span>
                    </>
                  ) : (
                    <span>Shift Inventory ({selectedFiles.length})</span>
                  )}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
