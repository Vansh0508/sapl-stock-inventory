"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Modal,
  Button,
  Spinner,
  Typography,
  Chip,
  ScrollShadow,
  SearchField,
  Dropdown,
  Popover,
  ListBox,
  ListBoxItem,
  toast,
} from "@heroui/react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { ArrowDownToLine, CircleCheck, CircleExclamation, CloudArrowUpIn, EllipsisVertical, File as FileIcon, PencilToSquare, TrashBin } from "@gravity-ui/icons"

// ──────────────────────────────────────────────────────────
// Types & Interfaces
// ──────────────────────────────────────────────────────────

interface MasterData {
  productTypes: Array<{ id: string; product_name: string }>
  qualities: Array<{ id: string; quality_name: string }>
  qualityCodes: Array<{ id: string; quality_id: string; quality_code: string; quality_prefix: string }>
  designs: Array<{ id: string; design_name: string }>
  designCodes: Array<{ id: string; design_id: string; design_code: string }>
  colors: Array<{ id: string; color_name: string; color_code: string }>
  sizes: Array<{ id: string; size_label: string; so_seq: number }>
  collections: Array<{ id: string; collection_name: string }>
  constructions: Array<{ id: string; construction_name: string }>
  fibers: Array<{ id: string; fiber_name: string }>
  existingSkus: Set<string>
  maxExistingSerialNum: number
}

export interface ParsedFiber {
  fiber_id: string
  fiber_name: string
  percentage: number
}

export interface AnalyzedRow {
  rowNum: number
  raw: Record<string, string>
  
  // Resolved lookup values
  product_type_id?: string
  product_type_name?: string
  
  quality_id?: string
  quality_name?: string
  quality_code?: string
  quality_prefix?: string
  
  design_id?: string
  design_name?: string
  design_code?: string
  
  color_ids: string[]
  color_names: string[]
  color_codes: string[]
  
  size_id?: string
  size_label?: string
  so_seq?: number
  
  collection_id?: string | null
  collection_name?: string | null
  
  construction_id?: string | null
  construction_name?: string | null
  
  parsedFibers: ParsedFiber[]
  fiberSummary?: string
  
  stockCount: number
  serialNumbers: string[]
  
  is_active: boolean
  
  // Generated fields
  computedProductCode?: string
  generatedSku?: string
  
  // Status
  isValid: boolean
  errors: string[]
}

interface BulkUploadModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function generateSerialNumbers(count: number, startIndex: number): string[] {
  const list: string[] = []
  for (let i = 0; i < count; i++) {
    const num = startIndex + 1 + i
    list.push(`SP-${String(num).padStart(5, "0")}`)
  }
  return list
}

// ──────────────────────────────────────────────────────────
// Helper Icons
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// Template CSV Generator
// ──────────────────────────────────────────────────────────

const SAMPLE_TEMPLATE_ROWS = [
  {
    "Product Type": "Rug",
    "Quality": "Super-Lux",
    "Design": "Heritage Flora",
    "Colors": "Crimson Red, Navy Blue",
    "Size": "4 x 6 ft",
    "Collection": "Sovereign Range",
    "Construction": "Hand-knotted",
    "Fibers": "80% Wool, 20% Silk",
    "Stock Count": "2",
    "Serial Numbers": "SP-00101, SP-00102",
    "Is Active": "TRUE",
  },
  {
    "Product Type": "Dhurrie",
    "Quality": "Classic Cotton",
    "Design": "Geometric Wave",
    "Colors": "Beige (Natural), Terracotta",
    "Size": "6 x 9 ft",
    "Collection": "Nomadic Essentials",
    "Construction": "Flatweave",
    "Fibers": "100% Cotton",
    "Stock Count": "3",
    "Serial Numbers": "",
    "Is Active": "TRUE",
  },
]

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Catalog_Upload_Template")
  XLSX.writeFile(wb, "shyam_ahuja_catalog_upload_template.xlsx")
}

// ──────────────────────────────────────────────────────────
// Helper Functions for Validation & Duplicate Re-evaluation
// ──────────────────────────────────────────────────────────

function recheckDuplicateSkus(rows: AnalyzedRow[], master: MasterData): AnalyzedRow[] {
  // Count frequency of each generated SKU in the current batch
  const skuCounts = new Map<string, number>()
  rows.forEach((r) => {
    if (r.generatedSku) {
      const upper = r.generatedSku.toUpperCase()
      skuCounts.set(upper, (skuCounts.get(upper) || 0) + 1)
    }
  })

  return rows.map((row) => {
    // Preserve existing field-level validation errors, remove stale duplicate SKU error messages
    const otherErrors = row.errors.filter(
      (e) => !e.includes("Duplicate SKU") && !e.includes("already exists in database catalog")
    )

    if (row.generatedSku) {
      const upper = row.generatedSku.toUpperCase()

      // Check if SKU exists in DB catalog
      if (master.existingSkus.has(upper)) {
        otherErrors.push(`Generated SKU '${row.generatedSku}' already exists in database catalog`)
      }

      // Check if SKU is duplicated across session rows
      if ((skuCounts.get(upper) || 0) > 1) {
        otherErrors.push(`Duplicate SKU '${row.generatedSku}' detected within the uploaded file`)
      }
    }

    return {
      ...row,
      errors: otherErrors,
      isValid: otherErrors.length === 0,
    }
  })
}

function reevaluateEditedRow(row: AnalyzedRow, master: MasterData, allRows: AnalyzedRow[]): AnalyzedRow {
  const errors: string[] = []

  // 1. Product Type
  if (!row.product_type_id) {
    errors.push("Product Type is missing")
  } else {
    const pt = master.productTypes.find((p) => p.id === row.product_type_id)
    if (pt) row.product_type_name = pt.product_name
    else errors.push("Invalid Product Type selected")
  }

  // 2. Quality & Quality Code
  if (!row.quality_id) {
    errors.push("Quality is missing")
  } else {
    const q = master.qualities.find((q) => q.id === row.quality_id)
    if (q) row.quality_name = q.quality_name
  }

  if (!row.quality_code) {
    errors.push("Quality Code is missing")
  } else {
    const qCode = row.quality_code
    const qc = master.qualityCodes.find(
      (c) =>
        c.quality_id === row.quality_id &&
        c.quality_code.toLowerCase().trim() === qCode.toLowerCase().trim()
    )
    if (qc) {
      row.quality_prefix = qc.quality_prefix
    } else {
      errors.push(`Quality code '${row.quality_code}' is invalid for selected quality`)
    }
  }

  // 3. Design & Design Code
  if (!row.design_id) {
    errors.push("Design is missing")
  } else {
    const d = master.designs.find((d) => d.id === row.design_id)
    if (d) row.design_name = d.design_name
  }

  if (!row.design_code) {
    errors.push("Design Code is missing")
  } else {
    const dCode = row.design_code
    const dc = master.designCodes.find(
      (c) =>
        c.design_id === row.design_id &&
        c.design_code.toLowerCase().trim() === dCode.toLowerCase().trim()
    )
    if (!dc) {
      errors.push(`Design code '${row.design_code}' is invalid for selected design`)
    }
  }

  // 4. Colors
  if (!row.color_ids || row.color_ids.length === 0) {
    errors.push("Colors field is missing (at least 1 color required)")
  } else {
    const names: string[] = []
    const codes: string[] = []
    row.color_ids.forEach((cid) => {
      const c = master.colors.find((col) => col.id === cid)
      if (c) {
        names.push(c.color_name)
        codes.push(c.color_code)
      }
    })
    row.color_names = names
    row.color_codes = codes
  }

  // 5. Size
  if (!row.size_id) {
    errors.push("Size is missing")
  } else {
    const sz = master.sizes.find((s) => s.id === row.size_id)
    if (sz) {
      row.size_label = sz.size_label
      row.so_seq = sz.so_seq
    }
  }

  // 6. Collection
  if (row.collection_id) {
    const col = master.collections.find((c) => c.id === row.collection_id)
    if (col) row.collection_name = col.collection_name
  } else {
    row.collection_name = null
  }

  // 7. Construction
  if (row.construction_id) {
    const con = master.constructions.find((c) => c.id === row.construction_id)
    if (con) row.construction_name = con.construction_name
  } else {
    row.construction_name = null
  }

  // 8. Fibers
  if (row.parsedFibers && row.parsedFibers.length > 0) {
    const totalPct = row.parsedFibers.reduce((sum, f) => sum + (f.percentage || 0), 0)
    row.fiberSummary = row.parsedFibers.map((f) => `${f.percentage}% ${f.fiber_name}`).join(", ")
    if (Math.abs(totalPct - 100) > 0.01) {
      errors.push(`Fiber blend percentages total ${totalPct}%, but must equal 100%`)
    }
  }

  // 9. Auto SKU Generation
  if (row.quality_prefix && row.design_code && row.color_codes.length > 0 && row.so_seq !== undefined) {
    const sortedColorCodes = [...row.color_codes].sort()
    const colorPart = sortedColorCodes.join("X")
    row.computedProductCode = `${row.quality_prefix}${row.design_code}${colorPart}`
    row.generatedSku = `SA-${row.computedProductCode}-SO${row.so_seq}`
  } else {
    row.computedProductCode = undefined
    row.generatedSku = undefined
  }

  row.errors = errors
  row.isValid = errors.length === 0
  return row
}

// ──────────────────────────────────────────────────────────
// Edit / Map Row Modal Component
// ──────────────────────────────────────────────────────────

interface EditBulkRowModalProps {
  isOpen: boolean
  row: AnalyzedRow | null
  masterData: MasterData
  allRows: AnalyzedRow[]
  onClose: () => void
  onSave: (updatedRow: AnalyzedRow) => void
}

function EditBulkRowModal({
  isOpen,
  row,
  masterData,
  allRows,
  onClose,
  onSave,
}: EditBulkRowModalProps) {
  const [productTypeId, setProductTypeId] = useState("")
  const [qualityId, setQualityId] = useState("")
  const [qualityCode, setQualityCode] = useState("")
  const [designId, setDesignId] = useState("")
  const [designCode, setDesignCode] = useState("")
  const [colorIds, setColorIds] = useState<string[]>([])
  const [sizeId, setSizeId] = useState("")
  const [collectionId, setCollectionId] = useState<string>("")
  const [constructionId, setConstructionId] = useState<string>("")
  const [stockCount, setStockCount] = useState(0)
  const [serialNumbersStr, setSerialNumbersStr] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [colorSearch, setColorSearch] = useState("")

  useEffect(() => {
    if (row) {
      setProductTypeId(row.product_type_id || masterData.productTypes[0]?.id || "")
      setQualityId(row.quality_id || masterData.qualities[0]?.id || "")
      setQualityCode(row.quality_code || "")
      setDesignId(row.design_id || masterData.designs[0]?.id || "")
      setDesignCode(row.design_code || "")
      setColorIds(row.color_ids || [])
      setSizeId(row.size_id || masterData.sizes[0]?.id || "")
      setCollectionId(row.collection_id || "")
      setConstructionId(row.construction_id || "")
      setStockCount(row.stockCount || 0)
      setSerialNumbersStr(row.serialNumbers ? row.serialNumbers.join(", ") : "")
      setIsActive(row.is_active ?? true)
    }
  }, [row, masterData])

  if (!row || !isOpen) return null

  // Available Quality Codes for selected quality
  const availableQualityCodes = masterData.qualityCodes.filter((qc) => qc.quality_id === qualityId)
  
  // Available Design Codes for selected design
  const availableDesignCodes = masterData.designCodes.filter((dc) => dc.design_id === designId)

  const parsedSerials = serialNumbersStr.split(/[,/|\n]+/).map((s) => s.trim()).filter(Boolean)
  const finalStockCount = parsedSerials.length > 0 ? parsedSerials.length : stockCount
  const finalSerials = parsedSerials.length > 0
    ? parsedSerials
    : (finalStockCount > 0 ? generateSerialNumbers(finalStockCount, masterData.maxExistingSerialNum + row.rowNum * 100) : [])

  // Compute draft evaluation for live preview
  const draftRow: AnalyzedRow = reevaluateEditedRow(
    {
      ...row,
      product_type_id: productTypeId,
      quality_id: qualityId,
      quality_code: qualityCode,
      design_id: designId,
      design_code: designCode,
      color_ids: colorIds,
      size_id: sizeId,
      collection_id: collectionId || null,
      construction_id: constructionId || null,
      stockCount: finalStockCount,
      serialNumbers: finalSerials,
      is_active: isActive,
    },
    masterData,
    allRows
  )

  const filteredColors = masterData.colors.filter((c) =>
    colorSearch ? c.color_name.toLowerCase().includes(colorSearch.toLowerCase()) || c.color_code.toLowerCase().includes(colorSearch.toLowerCase()) : true
  )

  const handleToggleColor = (cId: string) => {
    if (colorIds.includes(cId)) {
      setColorIds(colorIds.filter((id) => id !== cId))
    } else {
      setColorIds([...colorIds, cId])
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop className="z-[300]">
        <Modal.Container size="lg" className="max-w-2xl w-full p-4">
          <Modal.Dialog className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl">
            <Modal.Header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <PencilToSquare width="14" height="14" />
                </div>
                <div>
                  <Typography.Heading level={4} weight="semibold" className="text-zinc-900 text-base">
                    Edit Upload Row #{row.rowNum}
                  </Typography.Heading>
                  <Typography.Paragraph size="xs" className="text-zinc-500">
                    Map or fix master database fields for this row
                  </Typography.Paragraph>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Product Type & Size */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Product Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={productTypeId}
                    onChange={(e) => setProductTypeId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Product Type…</option>
                    {masterData.productTypes.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.product_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Size <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={sizeId}
                    onChange={(e) => setSizeId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Size…</option>
                    {masterData.sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.size_label} (SO{s.so_seq})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quality & Quality Code */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Quality <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qualityId}
                    onChange={(e) => {
                      const qId = e.target.value
                      setQualityId(qId)
                      const firstQc = masterData.qualityCodes.find((qc) => qc.quality_id === qId)
                      setQualityCode(firstQc ? firstQc.quality_code : "")
                    }}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Quality…</option>
                    {masterData.qualities.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quality_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Quality Code <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qualityCode}
                    onChange={(e) => setQualityCode(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Quality Code…</option>
                    {availableQualityCodes.map((qc) => (
                      <option key={qc.id} value={qc.quality_code}>
                        {qc.quality_code} ({qc.quality_prefix})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Design & Design Code */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Design <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={designId}
                    onChange={(e) => {
                      const dId = e.target.value
                      setDesignId(dId)
                      const firstDc = masterData.designCodes.find((dc) => dc.design_id === dId)
                      setDesignCode(firstDc ? firstDc.design_code : "")
                    }}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Design…</option>
                    {masterData.designs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.design_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Design Code <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={designCode}
                    onChange={(e) => setDesignCode(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Design Code…</option>
                    {availableDesignCodes.map((dc) => (
                      <option key={dc.id} value={dc.design_code}>
                        {dc.design_code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Colors Multi-Select */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Colors <span className="text-red-500">*</span> (Select 1 or more)
                </label>
                <div className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50 space-y-2">
                  <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center p-1 bg-white border border-zinc-200 rounded-lg">
                    {colorIds.length === 0 ? (
                      <span className="text-xs text-zinc-400 px-1">No colors selected</span>
                    ) : (
                      colorIds.map((cId) => {
                        const col = masterData.colors.find((c) => c.id === cId)
                        return (
                          <span
                            key={cId}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold border border-indigo-200/60"
                          >
                            <span>{col ? `${col.color_name} (${col.color_code})` : cId}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleColor(cId)}
                              className="hover:bg-indigo-200/80 rounded-sm px-0.5 text-indigo-800 cursor-pointer text-[10px]"
                            >
                              ✕
                            </button>
                          </span>
                        )
                      })
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Search colors…"
                    value={colorSearch}
                    onChange={(e) => setColorSearch(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs bg-white border border-zinc-200 rounded-lg outline-hidden"
                  />

                  <div className="max-h-36 overflow-y-auto border border-zinc-200 rounded-lg bg-white divide-y divide-zinc-100">
                    {filteredColors.map((c) => {
                      const selected = colorIds.includes(c.id)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleToggleColor(c.id)}
                          className={cn(
                            "w-full px-3 py-1.5 text-xs flex items-center justify-between transition-colors cursor-pointer text-left",
                            selected ? "bg-indigo-50/80 text-indigo-900 font-semibold" : "hover:bg-zinc-50 text-zinc-700"
                          )}
                        >
                          <span>{c.color_name}</span>
                          <span className="font-mono text-[10px] text-zinc-400">{c.color_code}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Collection & Construction */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Collection (Optional)
                  </label>
                  <select
                    value={collectionId || ""}
                    onChange={(e) => setCollectionId(e.target.value || "")}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">None</option>
                    {masterData.collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.collection_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Construction (Optional)
                  </label>
                  <select
                    value={constructionId || ""}
                    onChange={(e) => setConstructionId(e.target.value || "")}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">None</option>
                    {masterData.constructions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.construction_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stock Count & Serial Numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Stock Count / Pieces
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={stockCount}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0)
                      setStockCount(val)
                      if (val === 0) setSerialNumbersStr("")
                    }}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Serial Numbers (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SP-00101, SP-00102"
                    value={serialNumbersStr}
                    onChange={(e) => {
                      setSerialNumbersStr(e.target.value)
                      const parsed = e.target.value.split(/[,/|\n]+/).map((s) => s.trim()).filter(Boolean)
                      if (parsed.length > 0) {
                        setStockCount(parsed.length)
                      }
                    }}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 border rounded-xl bg-zinc-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-600">Mapping Validation</span>
                  {draftRow.isValid ? (
                    <Chip className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold uppercase">
                      Valid
                    </Chip>
                  ) : (
                    <Chip className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold uppercase">
                      {draftRow.errors.length} Issues
                    </Chip>
                  )}
                </div>

                {draftRow.generatedSku && (
                  <div className="text-xs">
                    <span className="text-zinc-500 font-medium">Generated SKU: </span>
                    <span className="font-mono font-bold text-indigo-700">{draftRow.generatedSku}</span>
                  </div>
                )}

                {draftRow.errors.length > 0 && (
                  <ul className="text-xs text-red-600 space-y-0.5 list-disc pl-4 font-medium">
                    {draftRow.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Modal.Body>

            <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-4 flex items-center justify-between">
              <Button
                variant="outline"
                onPress={onClose}
                className="bg-zinc-200 text-zinc-800 rounded-xl text-xs font-medium cursor-pointer"
              >
                Cancel
              </Button>

              <Button
                onPress={() => onSave(draftRow)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-4 cursor-pointer shadow-xs"
              >
                Save Changes
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

// ──────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────

export default function BulkUploadModal({
  isOpen,
  onOpenChange,
  onSuccess,
}: BulkUploadModalProps) {
  const [step, setStep] = useState<"upload" | "analyzing" | "preview" | "uploading">("upload")
  const [fileName, setFileName] = useState<string | null>(null)
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedRow[]>([])
  const [masterData, setMasterData] = useState<MasterData | null>(null)
  const [editingRow, setEditingRow] = useState<AnalyzedRow | null>(null)
  
  // Filtering & search for preview stage
  const [searchQuery, setSearchQuery] = useState("")
  const [filterTab, setFilterTab] = useState<"all" | "valid" | "error">("all")
  
  // Upload progress
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })

  // Reset modal state on open/close
  useEffect(() => {
    if (isOpen) {
      setStep("upload")
      setFileName(null)
      setAnalyzedRows([])
      setMasterData(null)
      setEditingRow(null)
      setSearchQuery("")
      setFilterTab("all")
      setUploadProgress({ current: 0, total: 0 })
    }
  }, [isOpen])

  // ──────────────────────────────────────────────────────────
  // Master Data Loader
  // ──────────────────────────────────────────────────────────

  const fetchMasterData = async (): Promise<MasterData> => {
    const [
      ptRes,
      qRes,
      qcRes,
      dRes,
      dcRes,
      coRes,
      szRes,
      colRes,
      conRes,
      fRes,
      catRes,
      invRes,
    ] = await Promise.all([
      (supabase.from("product_types" as any) as any).select("id, product_name"),
      (supabase.from("qualities" as any) as any).select("id, quality_name"),
      (supabase.from("quality_codes" as any) as any).select("id, quality_id, quality_code, quality_prefix"),
      (supabase.from("designs" as any) as any).select("id, design_name"),
      (supabase.from("design_codes" as any) as any).select("id, design_id, design_code"),
      (supabase.from("colors" as any) as any).select("id, color_name, color_code"),
      (supabase.from("sizes" as any) as any).select("id, size_label, so_seq"),
      (supabase.from("collections" as any) as any).select("id, collection_name"),
      (supabase.from("constructions" as any) as any).select("id, construction_name"),
      (supabase.from("fiber_list" as any) as any).select("id, fiber_name"),
      (supabase.from("catalog" as any) as any).select("sku"),
      (supabase.from("inventory" as any) as any).select("serial_number"),
    ])

    const checkError = (resError: any, context: string) => {
      if (!resError) return
      if (resError.message?.includes("JWT issued at future")) {
        throw new Error(
          "System clock out of sync (JWT issued at future). Please restart your local Supabase containers (`npx supabase restart`) or sync your system clock."
        )
      }
      throw new Error(`${context}: ${resError.message}`)
    }

    checkError(ptRes.error, "Product types error")
    checkError(qRes.error, "Qualities error")
    checkError(dRes.error, "Designs error")
    checkError(coRes.error, "Colors error")
    checkError(szRes.error, "Sizes error")

    const existingSkus = new Set(
      ((catRes.data as any[]) ?? []).map((r: any) => r.sku?.trim().toUpperCase()).filter(Boolean) as string[]
    )

    let maxExistingSerialNum = 0
    if (invRes.data) {
      ;((invRes.data as any[]) ?? []).forEach((r: any) => {
        if (r.serial_number) {
          const match = r.serial_number.match(/SP-(\d+)/i)
          if (match) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > maxExistingSerialNum) {
              maxExistingSerialNum = num
            }
          }
        }
      })
    }

    return {
      productTypes: ptRes.data ?? [],
      qualities: qRes.data ?? [],
      qualityCodes: qcRes.data ?? [],
      designs: dRes.data ?? [],
      designCodes: dcRes.data ?? [],
      colors: coRes.data ?? [],
      sizes: szRes.data ?? [],
      collections: colRes.data ?? [],
      constructions: conRes.data ?? [],
      fibers: fRes.data ?? [],
      existingSkus,
      maxExistingSerialNum,
    }
  }

  // ──────────────────────────────────────────────────────────
  // String Cleaning & Special Character Sanitizer
  // ──────────────────────────────────────────────────────────

  const cleanVal = (val: any): string => {
    if (val === null || val === undefined) return ""
    let str = String(val).trim()
    // Support quotes (""), braces ({}), parentheses (()), special quotes (“”), accents and extra spaces
    if (str.startsWith('"') && str.endsWith('"') && str.length > 1) {
      str = str.substring(1, str.length - 1).trim()
    }
    return str
  }

  const normalizeSizeString = (str: string): string => {
    if (!str) return ""
    return str
      .toLowerCase()
      .trim()
      // Normalize all multiplication symbols (x, X, ×, ✕, ✖, *, ·, •) and word 'by' to 'x'
      .replace(/[\u00D7\u2715\u2716\*\u00B7\u2022]/g, "x")
      .replace(/\bby\b/gi, "x")
      // Remove dimension unit words & feet/inch symbols
      .replace(/\b(feet|ft|inches|in)\b/gi, "")
      .replace(/['’"”]/g, "")
      // Normalize .0 trailing decimals (e.g., 4.0 -> 4, 6.00 -> 6)
      .replace(/(\d+)\.0+(?!\d)/g, "$1")
      // Collapse spaces around x
      .replace(/\s*x\s*/g, "x")
      // Remove all remaining spaces inside
      .replace(/\s+/g, "")
  }

  // ──────────────────────────────────────────────────────────
  // Row Parsing & Analysis Logic
  // ──────────────────────────────────────────────────────────

  const analyzeCSVData = (rawRows: Record<string, any>[], master: MasterData) => {
    const analyzedList: AnalyzedRow[] = []
    const fileSkusInThisSession = new Set<string>()
    let sessionSerialCounter = master.maxExistingSerialNum

    rawRows.forEach((rowObj, idx) => {
      const rowNum = idx + 2 // header is row 1
      const errors: string[] = []

      // Normalize dictionary keys in the row
      const normalizedMap: Record<string, string> = {}
      Object.keys(rowObj).forEach((key) => {
        const normKey = key.trim().toLowerCase().replace(/[\s_\-\/]/g, "")
        normalizedMap[normKey] = cleanVal(rowObj[key])
      })

      const getFieldValue = (...possibleKeys: string[]): string => {
        for (const pk of possibleKeys) {
          const normKey = pk.toLowerCase().replace(/[\s_\-\/]/g, "")
          if (normalizedMap[normKey] !== undefined && normalizedMap[normKey] !== "") {
            return normalizedMap[normKey]
          }
        }
        return ""
      }

      // 1. Product Type
      const productTypeInput = getFieldValue("Product Type", "ProductType", "Product", "Category")
      let product_type_id: string | undefined
      let product_type_name: string | undefined

      if (!productTypeInput) {
        errors.push("Product Type is missing")
      } else {
        const ptMatch = master.productTypes.find(
          (pt) => pt.product_name.toLowerCase().trim() === productTypeInput.toLowerCase()
        )
        if (ptMatch) {
          product_type_id = ptMatch.id
          product_type_name = ptMatch.product_name
        } else {
          errors.push(`Product Type '${productTypeInput}' not found in master database`)
        }
      }

      // 2. Quality
      const qualityInput = getFieldValue("Quality", "Quality Name", "Quality Code", "Quality Prefix")
      let quality_id: string | undefined
      let quality_name: string | undefined
      let quality_code: string | undefined
      let quality_prefix: string | undefined

      if (!qualityInput) {
        errors.push("Quality is missing")
      } else {
        // First check quality_codes table (child code or prefix match)
        const qcMatch = master.qualityCodes.find(
          (qc) =>
            qc.quality_code.toLowerCase().trim() === qualityInput.toLowerCase() ||
            qc.quality_prefix.toLowerCase().trim() === qualityInput.toLowerCase()
        )
        if (qcMatch) {
          quality_id = qcMatch.quality_id
          quality_code = qcMatch.quality_code
          quality_prefix = qcMatch.quality_prefix
          const parentQ = master.qualities.find((q) => q.id === qcMatch.quality_id)
          quality_name = parentQ?.quality_name ?? qualityInput
        } else {
          // Check qualities parent table by name
          const qMatch = master.qualities.find(
            (q) => q.quality_name.toLowerCase().trim() === qualityInput.toLowerCase()
          )
          if (qMatch) {
            quality_id = qMatch.id
            quality_name = qMatch.quality_name
            const firstQc = master.qualityCodes.find((qc) => qc.quality_id === qMatch.id)
            if (firstQc) {
              quality_code = firstQc.quality_code
              quality_prefix = firstQc.quality_prefix
            } else {
              errors.push(`Quality '${qualityInput}' has no quality codes configured`)
            }
          } else {
            errors.push(`Quality '${qualityInput}' not found in master database`)
          }
        }
      }

      // 3. Design
      const designInput = getFieldValue("Design", "Design Name", "Design Code", "Pattern")
      let design_id: string | undefined
      let design_name: string | undefined
      let design_code: string | undefined

      if (!designInput) {
        errors.push("Design is missing")
      } else {
        // Check design_codes child table
        const dcMatch = master.designCodes.find(
          (dc) => dc.design_code.toLowerCase().trim() === designInput.toLowerCase()
        )
        if (dcMatch) {
          design_id = dcMatch.design_id
          design_code = dcMatch.design_code
          const parentD = master.designs.find((d) => d.id === dcMatch.design_id)
          design_name = parentD?.design_name ?? designInput
        } else {
          // Check designs parent table by name
          const dMatch = master.designs.find(
            (d) => d.design_name.toLowerCase().trim() === designInput.toLowerCase()
          )
          if (dMatch) {
            design_id = dMatch.id
            design_name = dMatch.design_name
            const firstDc = master.designCodes.find((dc) => dc.design_id === dMatch.id)
            if (firstDc) {
              design_code = firstDc.design_code
            } else {
              errors.push(`Design '${designInput}' has no design codes configured`)
            }
          } else {
            errors.push(`Design '${designInput}' not found in master database`)
          }
        }
      }

      // 4. Colors
      const colorsInput = getFieldValue("Colors", "Color", "Color Names", "Color Codes")
      const color_ids: string[] = []
      const color_names: string[] = []
      const color_codes: string[] = []

      if (!colorsInput) {
        errors.push("Colors field is missing (at least 1 color required)")
      } else {
        const rawTokens = colorsInput.split(/[,/|+]/).map((s) => s.trim()).filter(Boolean)
        
        for (const token of rawTokens) {
          const matchedColor = master.colors.find(
            (c) =>
              c.color_name.toLowerCase().trim() === token.toLowerCase() ||
              c.color_code.toLowerCase().trim() === token.toLowerCase()
          )
          if (matchedColor) {
            if (!color_ids.includes(matchedColor.id)) {
              color_ids.push(matchedColor.id)
              color_names.push(matchedColor.color_name)
              color_codes.push(matchedColor.color_code)
            }
          } else {
            errors.push(`Color '${token}' not found in color master`)
          }
        }
      }

      // 5. Size
      const sizeInput = getFieldValue("Size", "Size Label", "Dimensions", "Size Name")
      let size_id: string | undefined
      let size_label: string | undefined
      let so_seq: number | undefined

      if (!sizeInput) {
        errors.push("Size is missing")
      } else {
        const normSize = normalizeSizeString(sizeInput)
        const rawInput = sizeInput.toLowerCase().trim()
        
        const szMatch = master.sizes.find((s) => {
          const targetNorm = normalizeSizeString(s.size_label)
          const rawLabel = s.size_label.toLowerCase().trim()
          return (
            targetNorm === normSize ||
            rawLabel === rawInput ||
            `so${s.so_seq}` === rawInput ||
            `so${s.so_seq}` === normSize
          )
        })
        if (szMatch) {
          size_id = szMatch.id
          size_label = szMatch.size_label
          so_seq = szMatch.so_seq
        } else {
          errors.push(`Size '${sizeInput}' not found in size master table`)
        }
      }

      // 6. Collection (Optional)
      const collectionInput = getFieldValue("Collection", "Collection Name")
      let collection_id: string | null = null
      let collection_name: string | null = null
      if (collectionInput) {
        const colMatch = master.collections.find(
          (c) => c.collection_name.toLowerCase().trim() === collectionInput.toLowerCase()
        )
        if (colMatch) {
          collection_id = colMatch.id
          collection_name = colMatch.collection_name
        } else {
          errors.push(`Collection '${collectionInput}' not found in collections master`)
        }
      }

      // 7. Construction (Optional)
      const constructionInput = getFieldValue("Construction", "Weave", "Construction Name")
      let construction_id: string | null = null
      let construction_name: string | null = null
      if (constructionInput) {
        const conMatch = master.constructions.find(
          (c) => c.construction_name.toLowerCase().trim() === constructionInput.toLowerCase()
        )
        if (conMatch) {
          construction_id = conMatch.id
          construction_name = conMatch.construction_name
        } else {
          errors.push(`Construction '${constructionInput}' not found in construction master`)
        }
      }

      // 8. Fibers (Optional)
      const fibersInput = getFieldValue("Fibers", "Fiber Composition", "Fiber List", "Blend")
      const parsedFibers: ParsedFiber[] = []
      let fiberSummary: string | undefined

      if (fibersInput) {
        const fiberTokens = fibersInput.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        let percentSum = 0

        for (const token of fiberTokens) {
          const match = token.match(/(\d+(?:\.\d+)?)\s*%\s*(.+)/) || token.match(/(.+?)\s*:\s*(\d+(?:\.\d+)?)/)
          if (match) {
            let pct = 0
            let fname = ""
            if (token.includes("%")) {
              pct = parseFloat(match[1])
              fname = match[2].trim()
            } else {
              fname = match[1].trim()
              pct = parseFloat(match[2])
            }

            const matchedFiber = master.fibers.find(
              (f) => f.fiber_name.toLowerCase().trim() === fname.toLowerCase()
            )

            if (matchedFiber) {
              parsedFibers.push({
                fiber_id: matchedFiber.id,
                fiber_name: matchedFiber.fiber_name,
                percentage: pct,
              })
              percentSum += pct
            } else {
              errors.push(`Fiber material '${fname}' not found in fiber master`)
            }
          }
        }

        if (parsedFibers.length > 0) {
          fiberSummary = parsedFibers.map((f) => `${f.percentage}% ${f.fiber_name}`).join(", ")
          if (Math.abs(percentSum - 100) > 0.01) {
            errors.push(`Fiber blend percentages total ${percentSum}%, but must equal 100%`)
          }
        }
      }

      // 9. Status (Is Active)
      const statusInput = getFieldValue("Is Active", "IsActive", "Status", "Active")
      let is_active = true
      if (statusInput) {
        const sLower = statusInput.toLowerCase()
        if (sLower === "false" || sLower === "no" || sLower === "0" || sLower === "discontinued") {
          is_active = false
        }
      }

      // 10. Stock Count & Serial Numbers
      const stockCountInput = getFieldValue("Stock Count", "Stock", "Quantity", "Qty", "Count", "Stock Qty")
      const serialNumbersInput = getFieldValue("Serial Numbers", "Serials", "SP Numbers", "Serial Number", "SP Number", "SP")

      let stockCount = 0
      let serialNumbers: string[] = []

      if (serialNumbersInput) {
        serialNumbers = serialNumbersInput.split(/[,/|\n]+/).map((s) => s.trim()).filter(Boolean)
        stockCount = serialNumbers.length
      } else if (stockCountInput) {
        const parsedQty = parseInt(stockCountInput, 10)
        if (!isNaN(parsedQty) && parsedQty > 0) {
          stockCount = parsedQty
          serialNumbers = generateSerialNumbers(stockCount, sessionSerialCounter)
          sessionSerialCounter += stockCount
        }
      }

      // 11. Auto SKU Generation
      let computedProductCode: string | undefined
      let generatedSku: string | undefined

      if (quality_prefix && design_code && color_codes.length > 0 && so_seq !== undefined) {
        const sortedColorCodes = [...color_codes].sort()
        const colorPart = sortedColorCodes.join("X")
        computedProductCode = `${quality_prefix}${design_code}${colorPart}`
        generatedSku = `SA-${computedProductCode}-SO${so_seq}`

        const upperSku = generatedSku.toUpperCase()

        if (master.existingSkus.has(upperSku)) {
          errors.push(`Generated SKU '${generatedSku}' already exists in database catalog`)
        }

        if (fileSkusInThisSession.has(upperSku)) {
          errors.push(`Duplicate SKU '${generatedSku}' detected within the uploaded file`)
        } else {
          fileSkusInThisSession.add(upperSku)
        }
      }

      const isValid = errors.length === 0

      analyzedList.push({
        rowNum,
        raw: rowObj,
        product_type_id,
        product_type_name,
        quality_id,
        quality_name,
        quality_code,
        quality_prefix,
        design_id,
        design_name,
        design_code,
        color_ids,
        color_names,
        color_codes,
        size_id,
        size_label,
        so_seq,
        collection_id,
        collection_name,
        construction_id,
        construction_name,
        parsedFibers,
        fiberSummary,
        stockCount,
        serialNumbers,
        is_active,
        computedProductCode,
        generatedSku,
        isValid,
        errors,
      })
    })

    return analyzedList
  }

  // ──────────────────────────────────────────────────────────
  // File Drop / Selection Handler
  // ──────────────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    try {
      setFileName(file.name)
      setStep("analyzing")

      const master = await fetchMasterData()
      setMasterData(master)

      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]

      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: "",
        raw: false,
      })

      if (jsonRows.length === 0) {
        toast.danger("The uploaded file is empty")
        setStep("upload")
        return
      }

      const rows = analyzeCSVData(jsonRows, master)
      setAnalyzedRows(rows)
      setStep("preview")
    } catch (err: any) {
      console.error("Bulk upload analysis failed:", err)
      toast.danger(err.message || "Failed to analyze CSV file")
      setStep("upload")
    }
  }

  const handleDeleteRow = (rowNum: number) => {
    const updated = analyzedRows.filter((r) => r.rowNum !== rowNum)
    if (masterData) {
      const rechecked = recheckDuplicateSkus(updated, masterData)
      setAnalyzedRows(rechecked)
    } else {
      setAnalyzedRows(updated)
    }
    toast.success(`Row #${rowNum} removed`)
  }

  const handleSaveEditedRow = (updatedRow: AnalyzedRow) => {
    if (!masterData) return
    const updatedList = analyzedRows.map((r) => (r.rowNum === updatedRow.rowNum ? updatedRow : r))
    const rechecked = recheckDuplicateSkus(updatedList, masterData)
    setAnalyzedRows(rechecked)
    setEditingRow(null)
    toast.success(`Row #${updatedRow.rowNum} updated`)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  // ──────────────────────────────────────────────────────────
  // Download Failed Rows CSV
  // ──────────────────────────────────────────────────────────

  const downloadFailedRowsCSV = () => {
    const failedRows = analyzedRows.filter((r) => !r.isValid)
    if (failedRows.length === 0) return

    const exportData = failedRows.map((r) => ({
      ...r.raw,
      "Upload Error / Reason": r.errors.join(" | "),
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Failed_Rows")
    XLSX.writeFile(wb, `catalog_upload_failed_rows_${Date.now()}.csv`)
  }

  // ──────────────────────────────────────────────────────────
  // Perform Batch Upload
  // ──────────────────────────────────────────────────────────

  const handleUploadValidRows = async () => {
    const validRows = analyzedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      toast.danger("No valid rows to upload")
      return
    }

    try {
      setStep("uploading")
      setUploadProgress({ current: 0, total: validRows.length })

      let successCount = 0
      let failureCount = 0

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i]
        setUploadProgress({ current: i + 1, total: validRows.length })

        try {
          // 1. Insert Catalog record
          const { data: newCat, error: catErr } = await (supabase
            .from("catalog" as any) as any)
            .insert({
              product_type_id: row.product_type_id!,
              quality_id: row.quality_id!,
              quality_code: row.quality_code!,
              design_id: row.design_id!,
              design_code: row.design_code!,
              size_id: row.size_id!,
              collection_id: row.collection_id,
              construction_id: row.construction_id,
              is_active: row.is_active,
            })
            .select("id")
            .single()

          if (catErr || !newCat) {
            throw new Error(catErr?.message || "Failed to create catalog row")
          }

          const catalogId = (newCat as any).id

          // 2. Insert Catalog Colors
          if (row.color_ids.length > 0) {
            const colorInserts = row.color_ids.map((colorId) => ({
              catalog_id: catalogId,
              color_id: colorId,
            }))
            const { error: colorErr } = await (supabase
              .from("catalog_colors" as any) as any)
              .insert(colorInserts)

            if (colorErr) {
              throw new Error(`Color link error: ${colorErr.message}`)
            }
          }

          // 3. Insert Catalog Fibers if specified
          if (row.parsedFibers.length > 0) {
            const fiberInserts = row.parsedFibers.map((f) => ({
              catalog_id: catalogId,
              fiber_id: f.fiber_id,
              percentage: f.percentage,
            }))
            const { error: fiberErr } = await (supabase
              .from("catalog_fibers" as any) as any)
              .insert(fiberInserts)

            if (fiberErr) {
              throw new Error(`Fiber link error: ${fiberErr.message}`)
            }
          }

          // 4. Insert Inventory Serial Numbers (Stock Count) if specified
          if (row.serialNumbers && row.serialNumbers.length > 0) {
            const inventoryInserts = row.serialNumbers.map((sn) => ({
              catalog_id: catalogId,
              serial_number: sn,
              is_sold: false,
            }))

            const { error: invErr } = await (supabase
              .from("inventory" as any) as any)
              .insert(inventoryInserts)

            if (invErr) {
              console.warn(`Inventory serial insertion warning for SKU ${row.generatedSku}:`, invErr.message)
            }
          }

          successCount++
        } catch (err: any) {
          console.error(`Row ${row.rowNum} upload failed:`, err)
          row.isValid = false
          row.errors.push(err.message || "Database insert error")
          failureCount++
        }
      }

      if (failureCount === 0) {
        toast.success(`Successfully uploaded ${successCount} products!`)
        onSuccess()
        onOpenChange(false)
      } else {
        toast.danger(`Uploaded ${successCount} products, but ${failureCount} failed. You can download failed rows.`)
        setStep("preview")
      }
    } catch (err: any) {
      console.error("Batch upload failed:", err)
      toast.danger(err.message || "Bulk upload process encountered an error")
      setStep("preview")
    }
  }

  // ──────────────────────────────────────────────────────────
  // Filtered Rows for Preview Table
  // ──────────────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    let result = analyzedRows

    if (filterTab === "valid") {
      result = result.filter((r) => r.isValid)
    } else if (filterTab === "error") {
      result = result.filter((r) => !r.isValid)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((r) => {
        return (
          (r.generatedSku && r.generatedSku.toLowerCase().includes(q)) ||
          (r.quality_name && r.quality_name.toLowerCase().includes(q)) ||
          (r.design_name && r.design_name.toLowerCase().includes(q)) ||
          r.color_names.some((c) => c.toLowerCase().includes(q)) ||
          (r.size_label && r.size_label.toLowerCase().includes(q)) ||
          r.errors.some((e) => e.toLowerCase().includes(q))
        )
      })
    }

    return result
  }, [analyzedRows, filterTab, searchQuery])

  const totalCount = analyzedRows.length
  const validCount = analyzedRows.filter((r) => r.isValid).length
  const errorCount = totalCount - validCount

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="cover" className="max-w-5xl w-full p-4">
        <Modal.Dialog className="max-h-[90vh] flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl">
          {/* Header */}
          <Modal.Header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <CloudArrowUpIn width="20" height="20" />
              </div>
              <div>
                <Typography.Heading level={4} weight="semibold" className="text-zinc-900 text-base">
                  Bulk Product Upload
                </Typography.Heading>
                <Typography.Paragraph size="xs" className="text-zinc-500">
                  Upload products in batch via CSV or Excel file with auto-generated SKUs
                </Typography.Paragraph>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onPress={downloadTemplate}
                className="h-8 px-3 text-xs rounded-xl text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-medium cursor-pointer"
              >
                <ArrowDownToLine />
                Download Template
              </Button>
            </div>
          </Modal.Header>

          {/* Body Content */}
          <Modal.Body className="flex-1 overflow-hidden p-6 flex flex-col">
            {step === "upload" && (
              <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-zinc-200 hover:border-indigo-400 bg-zinc-50/50 hover:bg-indigo-50/30 rounded-2xl transition-all text-center">
                <FileIcon width="32" height="32" className="text-indigo-600" />
                <Typography.Heading level={5} weight="semibold" className="mt-4 text-zinc-800 text-sm">
                  Choose a CSV or Excel file to upload
                </Typography.Heading>
                <Typography.Paragraph size="xs" className="text-zinc-500 mt-1 max-w-sm">
                  Supports UTF-8 characters, special symbols, quotes (&quot; &quot;), and brackets ({`{ }`}).
                </Typography.Paragraph>

                <div className="mt-6 flex items-center gap-3">
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors">
                      Browse File
                    </span>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {step === "analyzing" && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Spinner size="lg" color="accent" />
                <Typography.Paragraph size="sm" weight="medium" className="text-zinc-700">
                  Analyzing CSV &amp; mapping database references…
                </Typography.Paragraph>
                {fileName && (
                  <Typography.Code className="text-xs text-zinc-400">
                    {fileName}
                  </Typography.Code>
                )}
              </div>
            )}

            {step === "uploading" && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Spinner size="lg" color="accent" />
                <Typography.Heading level={5} weight="semibold" className="text-zinc-800 text-sm">
                  Uploading Products…
                </Typography.Heading>
                <Typography.Paragraph size="xs" className="text-zinc-500">
                  Processing row {uploadProgress.current} of {uploadProgress.total}
                </Typography.Paragraph>
                <div className="w-64 bg-zinc-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-200"
                    style={{
                      width: `${(uploadProgress.current / (uploadProgress.total || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {step === "preview" && (
              <div className="flex flex-col h-full overflow-hidden gap-4">
                {/* Stats Summary Bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between">
                    <div>
                      <Typography.Paragraph size="xs" className="text-zinc-500 font-medium">
                        Total Parsed
                      </Typography.Paragraph>
                      <Typography.Heading level={3} weight="bold" className="text-zinc-900 text-lg">
                        {totalCount}
                      </Typography.Heading>
                    </div>
                  </div>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <div>
                      <Typography.Paragraph size="xs" className="text-emerald-700 font-medium">
                        Ready to Upload
                      </Typography.Paragraph>
                      <Typography.Heading level={3} weight="bold" className="text-emerald-800 text-lg">
                        {validCount}
                      </Typography.Heading>
                    </div>
                    <CircleCheck className="text-emerald-600" />
                  </div>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                    <div>
                      <Typography.Paragraph size="xs" className="text-red-700 font-medium">
                        Errors / Issues
                      </Typography.Paragraph>
                      <Typography.Heading level={3} weight="bold" className="text-red-800 text-lg">
                        {errorCount}
                      </Typography.Heading>
                    </div>
                    <CircleExclamation className="text-red-500" />
                  </div>
                </div>

                {/* Filter and Search Toolbar */}
                <div className="flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setFilterTab("all")}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        filterTab === "all" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
                      )}
                    >
                      All ({totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab("valid")}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        filterTab === "valid" ? "bg-white text-emerald-800 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
                      )}
                    >
                      Valid ({validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab("error")}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        filterTab === "error" ? "bg-white text-red-800 shadow-xs" : "text-zinc-500 hover:text-zinc-900"
                      )}
                    >
                      Errors ({errorCount})
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <SearchField
                      aria-label="Search rows"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      className="w-56"
                    >
                      <SearchField.Group className="h-8 px-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <SearchField.SearchIcon className="text-zinc-400" />
                        <SearchField.Input placeholder="Search preview…" className="text-xs" />
                        <SearchField.ClearButton />
                      </SearchField.Group>
                    </SearchField>

                    {errorCount > 0 && (
                      <Button
                        variant="outline"
                        onPress={downloadFailedRowsCSV}
                        className="h-8 px-3 text-xs rounded-xl text-red-700 border-red-200 hover:bg-red-50 font-medium cursor-pointer shrink-0"
                      >
                        <ArrowDownToLine />
                        Download Failed Rows ({errorCount})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Table Preview */}
                <div className="flex-1 overflow-hidden border border-zinc-200 rounded-xl bg-white">
                  <ScrollShadow className="h-full max-h-[420px] overflow-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-zinc-100/90 backdrop-blur-xs border-b border-zinc-200 text-zinc-600 font-semibold z-10">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Row</th>
                          <th className="py-2.5 px-3 w-20 text-center">Status</th>
                          <th className="py-2.5 px-3">Auto SKU</th>
                          <th className="py-2.5 px-3">Product Type</th>
                          <th className="py-2.5 px-3">Quality</th>
                          <th className="py-2.5 px-3">Design</th>
                          <th className="py-2.5 px-3">Colors</th>
                          <th className="py-2.5 px-3">Size</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Stock Qty</th>
                          <th className="py-2.5 px-3">Fibers</th>
                          <th className="py-2.5 px-3">Issues / Reason</th>
                          <th className="py-2.5 px-3 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-zinc-800">
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="py-8 text-center text-zinc-400">
                              No rows match the selected filter.
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((row) => (
                            <tr
                              key={row.rowNum}
                              className={cn(
                                "hover:bg-zinc-50/80 transition-colors",
                                !row.isValid && "bg-red-50/30 hover:bg-red-50/50"
                              )}
                            >
                              <td className="py-2 px-3 text-center text-zinc-400 font-mono">
                                #{row.rowNum}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {row.isValid ? (
                                  <Chip className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] h-5 px-1.5 font-bold uppercase">
                                    Valid
                                  </Chip>
                                ) : (
                                  <Chip className="bg-red-50 text-red-700 border-red-200 text-[10px] h-5 px-1.5 font-bold uppercase">
                                    Error
                                  </Chip>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono font-semibold text-indigo-700 whitespace-nowrap">
                                {row.generatedSku || "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.product_type_name || row.raw["Product Type"] || "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.quality_name || row.raw["Quality"] || "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.design_name || row.raw["Design"] || "—"}
                              </td>
                              <td className="py-2 px-3">
                                {row.color_names.length > 0
                                  ? row.color_names.join(", ")
                                  : row.raw["Colors"] || "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.size_label || row.raw["Size"] || "—"}
                              </td>
                              <td className="py-2 px-3 whitespace-nowrap">
                                {row.stockCount > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <Chip className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px] h-5 px-1.5 font-bold font-mono">
                                      {row.stockCount} {row.stockCount === 1 ? "pc" : "pcs"}
                                    </Chip>
                                    {row.serialNumbers.length > 0 && (
                                      <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[110px]" title={row.serialNumbers.join(", ")}>
                                        ({row.serialNumbers[0]}{row.serialNumbers.length > 1 ? ` +${row.serialNumbers.length - 1}` : ""})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-zinc-400 font-normal">0 pcs</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                {row.fiberSummary || row.raw["Fibers"] || "—"}
                              </td>
                              <td className="py-2 px-3 text-red-600 font-medium">
                                {row.errors.length > 0 ? row.errors.join("; ") : "—"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Dropdown>
                                  <Dropdown.Trigger className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 cursor-pointer outline-hidden inline-flex items-center justify-center" aria-label="Row action menu">
                                    <EllipsisVertical />
                                  </Dropdown.Trigger>
                                  <Dropdown.Popover placement="bottom end" className="min-w-[140px] rounded-xl border border-zinc-200 bg-white shadow-xl p-1 z-50">
                                    <Dropdown.Menu aria-label="Row actions">
                                      <Dropdown.Item
                                        id="edit"
                                        onPress={() => setEditingRow(row)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer text-zinc-700 hover:bg-zinc-100 rounded-lg"
                                      >
                                        <PencilToSquare width="14" height="14" />
                                        Edit &amp; Map
                                      </Dropdown.Item>
                                      <Dropdown.Item
                                        id="delete"
                                        onPress={() => handleDeleteRow(row.rowNum)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer text-red-600 hover:bg-red-50 rounded-lg"
                                      >
                                        <TrashBin width="14" height="14" />
                                        Delete Row
                                      </Dropdown.Item>
                                    </Dropdown.Menu>
                                  </Dropdown.Popover>
                                </Dropdown>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </ScrollShadow>
                </div>
              </div>
            )}
          </Modal.Body>

          {/* Footer */}
          <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-4 flex items-center justify-between">
            <div>
              {step === "preview" && (
                <Button
                  variant="outline"
                  onPress={() => setStep("upload")}
                  className="rounded-xl text-xs font-medium cursor-pointer"
                >
                  Choose Different File
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onPress={() => onOpenChange(false)}
                className="bg-zinc-200 text-zinc-800 rounded-xl text-xs font-medium cursor-pointer"
              >
                Cancel
              </Button>

              {step === "preview" && (
                <Button
                  onPress={handleUploadValidRows}
                  isDisabled={validCount === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-4 cursor-pointer shadow-xs"
                >
                  Upload {validCount} Valid Products
                </Button>
              )}
            </div>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>

    {/* Edit & Map Row Modal */}
    {masterData && editingRow && (
      <EditBulkRowModal
        isOpen={!!editingRow}
        row={editingRow}
        masterData={masterData}
        allRows={analyzedRows}
        onClose={() => setEditingRow(null)}
        onSave={handleSaveEditedRow}
      />
    )}
  </Modal>
  )
}
