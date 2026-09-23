"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button, Chip, Dropdown, Modal, ScrollShadow, Spinner, toast } from "@heroui/react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { runWithVerificationGuard } from "@/lib/verificationGuard"

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export interface SerialAnalyzedRow {
  rowNum: number
  raw: Record<string, string>

  skuInput: string
  serialNumberInput: string
  locationInput: string
  isSoldInput: boolean

  catalog_id?: string
  matchedSku?: string

  serial_number?: string

  location_id?: string
  matchedLocationName?: string

  isValid: boolean
  errors: string[]
}

export interface CatalogItem {
  id: string
  sku: string
  product_code?: string
  quality_name?: string
  quality_code?: string
  design_name?: string
  design_code?: string
  size_label?: string
  color_names?: string
  product_name?: string
}

export interface SerialMasterData {
  catalogList: CatalogItem[]
  locationsList: Array<{ id: string; location_name: string }>
  existingSerials: Set<string>
  maxExistingSerialNum: number
}

interface BulkSerialUploadModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ──────────────────────────────────────────────────────────
// SKU & Location Match Helpers
// ──────────────────────────────────────────────────────────

export function normalizeSkuString(str: string): string {
  if (!str) return ""
  return String(str)
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-") // normalize unicode dashes to hyphens
    .replace(/[\u00A0\u200B\u202F]/g, "")      // remove non-breaking/zero-width spaces
    .replace(/["'’`\(\)]/g, "")                 // remove quotes & parens
    .replace(/\s+/g, "")                       // remove spaces
}

export function findCatalogSkuMatch(
  rowObj: Record<string, string>,
  rawSkuInput: string,
  catalogList: CatalogItem[]
): CatalogItem | undefined {
  if (!catalogList || catalogList.length === 0) return undefined

  const skuInput = rawSkuInput ? normalizeSkuString(rawSkuInput) : ""

  if (skuInput) {
    // 1. Direct normalized match on c.sku
    let match = catalogList.find((c) => normalizeSkuString(c.sku) === skuInput)
    if (match) return match

    // 2. Direct normalized match on c.product_code
    match = catalogList.find((c) => c.product_code && normalizeSkuString(c.product_code) === skuInput)
    if (match) return match

    // 3. Omitted "SA-" prefix match (e.g. input is "SLHF101X202-SO1")
    match = catalogList.find((c) => {
      const normDb = normalizeSkuString(c.sku)
      return normDb === `SA-${skuInput}` || normDb === `SA${skuInput}` || `SA-${normDb}` === skuInput
    })
    if (match) return match

    // 4. Stripped hyphens match (e.g. input "SA-SLHF101X202-1" or "SLHF101X202-1")
    const strippedInput = skuInput.replace(/[-_]/g, "")
    match = catalogList.find((c) => {
      const strippedDb = normalizeSkuString(c.sku).replace(/[-_]/g, "")
      return strippedDb === strippedInput || strippedDb === `SA${strippedInput}` || `SA${strippedDb}` === strippedInput
    })
    if (match) return match

    // 5. Soft contains match
    match = catalogList.find((c) => {
      const normDb = normalizeSkuString(c.sku)
      return normDb.includes(skuInput) || skuInput.includes(normDb)
    })
    if (match) return match
  }

  // 6. Attribute-based Composite Match (if row specifies Quality, Design, Size)
  const normMap: Record<string, string> = {}
  Object.keys(rowObj).forEach((k) => {
    normMap[k.toLowerCase().replace(/[\s_\-\/]/g, "")] = String(rowObj[k] ?? "").trim().toLowerCase()
  })

  const qualityVal = normMap["quality"] || normMap["qualityname"] || normMap["qualitycode"] || ""
  const designVal = normMap["design"] || normMap["designname"] || normMap["designcode"] || ""
  const sizeVal = normMap["size"] || normMap["sizelabel"] || normMap["dimensions"] || ""

  if (qualityVal && designVal) {
    const match = catalogList.find((c) => {
      const qMatch = c.quality_name?.toLowerCase().includes(qualityVal) || c.quality_code?.toLowerCase() === qualityVal
      const dMatch = c.design_name?.toLowerCase().includes(designVal) || c.design_code?.toLowerCase() === designVal
      const sMatch = !sizeVal || c.size_label?.toLowerCase().includes(sizeVal)
      return qMatch && dMatch && sMatch
    })
    if (match) return match
  }

  return undefined
}

export function findLocationMatch(
  locationInput: string,
  locationsList: Array<{ id: string; location_name: string }>
) {
  if (!locationInput || !locationsList || locationsList.length === 0) return undefined
  const normInput = locationInput.trim().toLowerCase().replace(/[\s_\-\/]/g, "")
  if (!normInput) return undefined

  // 1. Exact / normalized match
  let match = locationsList.find(
    (l) => l.location_name.trim().toLowerCase().replace(/[\s_\-\/]/g, "") === normInput
  )
  if (match) return match

  // 2. Partial match (e.g. "Mumbai" in "Mumbai Showroom")
  match = locationsList.find((l) => {
    const normLoc = l.location_name.trim().toLowerCase().replace(/[\s_\-\/]/g, "")
    return normLoc.includes(normInput) || normInput.includes(normLoc)
  })

  return match
}

// ──────────────────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────────────────

const UploadCloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
  </svg>
)

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)

const FileSpreadsheetIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" className="text-indigo-600">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
)

const EllipsisVerticalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
  </svg>
)

const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

// ──────────────────────────────────────────────────────────
// Template CSV Generator
// ──────────────────────────────────────────────────────────

const SERIAL_SAMPLE_TEMPLATE_ROWS = [
  {
    "SKU": "SA-SLHF101X202-SO1",
    "Serial Number": "SP-00101",
    "Location": "Mumbai Showroom",
    "Is Sold": "FALSE",
  },
  {
    "SKU": "SA-SLHF101X202-SO1",
    "Serial Number": "SP-00102",
    "Location": "Mumbai Showroom",
    "Is Sold": "FALSE",
  },
  {
    "SKU": "SA-CCGW301X302-SO2",
    "Serial Number": "SP-00103",
    "Location": "Delhi Warehouse",
    "Is Sold": "FALSE",
  },
]

function downloadSerialTemplate() {
  const ws = XLSX.utils.json_to_sheet(SERIAL_SAMPLE_TEMPLATE_ROWS)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Serial_Number_Template")
  XLSX.writeFile(wb, "shyam_ahuja_serial_number_upload_template.xlsx")
}

// ──────────────────────────────────────────────────────────
// Row Re-evaluator for Edit Modal
// ──────────────────────────────────────────────────────────

function reevaluateSerialRow(
  updated: SerialAnalyzedRow,
  master: SerialMasterData,
  defaultLocationId: string,
  allRows: SerialAnalyzedRow[]
): SerialAnalyzedRow {
  const errors: string[] = []

  // 1. SKU matching
  let catalog_id: string | undefined
  let matchedSku: string | undefined

  if (!updated.skuInput) {
    errors.push("SKU is required")
  } else {
    const skuMatch = findCatalogSkuMatch(updated.raw, updated.skuInput, master.catalogList)
    if (skuMatch) {
      catalog_id = skuMatch.id
      matchedSku = skuMatch.sku
    } else {
      errors.push(`SKU '${updated.skuInput}' not found in database catalog (${master.catalogList.length} SKUs in system)`)
    }
  }

  // 2. Location matching
  let location_id: string | undefined
  let matchedLocationName: string | undefined

  if (updated.location_id) {
    const loc = master.locationsList.find((l) => l.id === updated.location_id)
    if (loc) {
      location_id = loc.id
      matchedLocationName = loc.location_name
    }
  } else if (updated.locationInput) {
    const locMatch = findLocationMatch(updated.locationInput, master.locationsList)
    if (locMatch) {
      location_id = locMatch.id
      matchedLocationName = locMatch.location_name
    } else {
      errors.push(`Location '${updated.locationInput}' not found in database locations`)
    }
  } else if (defaultLocationId) {
    const loc = master.locationsList.find((l) => l.id === defaultLocationId)
    if (loc) {
      location_id = loc.id
      matchedLocationName = loc.location_name
    }
  }

  if (!location_id) {
    errors.push("Location is required (select location or set default location)")
  }

  // 3. Serial Number
  const serial = updated.serial_number || updated.serialNumberInput
  if (!serial) {
    errors.push("Serial Number is required")
  } else {
    const upperSerial = serial.toUpperCase().trim()
    if (master.existingSerials.has(upperSerial)) {
      errors.push(`Serial Number '${serial}' already exists in inventory`)
    }

    const duplicatesInSession = allRows.filter(
      (r) => r.rowNum !== updated.rowNum && (r.serial_number || r.serialNumberInput)?.toUpperCase().trim() === upperSerial
    )
    if (duplicatesInSession.length > 0) {
      errors.push(`Duplicate Serial Number '${serial}' detected within this upload session`)
    }
  }

  return {
    ...updated,
    catalog_id,
    matchedSku: matchedSku ?? updated.skuInput,
    serial_number: serial,
    location_id,
    matchedLocationName: matchedLocationName ?? updated.locationInput,
    isValid: errors.length === 0,
    errors,
  }
}

// ──────────────────────────────────────────────────────────
// Edit Row Modal Component
// ──────────────────────────────────────────────────────────

interface EditSerialRowModalProps {
  isOpen: boolean
  row: SerialAnalyzedRow | null
  masterData: SerialMasterData
  defaultLocationId: string
  allRows: SerialAnalyzedRow[]
  onClose: () => void
  onSave: (updatedRow: SerialAnalyzedRow) => void
}

function EditSerialRowModal({
  isOpen,
  row,
  masterData,
  defaultLocationId,
  allRows,
  onClose,
  onSave,
}: EditSerialRowModalProps) {
  const [catalogId, setCatalogId] = useState("")
  const [skuInput, setSkuInput] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [locationId, setLocationId] = useState("")
  const [isSold, setIsSold] = useState(false)
  const [skuSearch, setSkuSearch] = useState("")

  useEffect(() => {
    if (row) {
      setCatalogId(row.catalog_id || "")
      setSkuInput(row.matchedSku || row.skuInput || "")
      setSerialNumber(row.serial_number || row.serialNumberInput || "")
      setLocationId(row.location_id || defaultLocationId || "")
      setIsSold(row.isSoldInput ?? false)
    }
  }, [row, defaultLocationId])

  if (!row || !isOpen) return null

  const filteredCatalog = masterData.catalogList.filter((c) => {
    if (!skuSearch.trim()) return true
    const q = skuSearch.toLowerCase()
    return (
      c.sku.toLowerCase().includes(q) ||
      (c.product_code || "").toLowerCase().includes(q) ||
      (c.quality_name || "").toLowerCase().includes(q) ||
      (c.design_name || "").toLowerCase().includes(q) ||
      (c.size_label || "").toLowerCase().includes(q) ||
      (c.color_names || "").toLowerCase().includes(q)
    )
  }).slice(0, 100)

  const draftRow: SerialAnalyzedRow = reevaluateSerialRow(
    {
      ...row,
      skuInput: skuInput || (masterData.catalogList.find((c) => c.id === catalogId)?.sku ?? ""),
      catalog_id: catalogId,
      serial_number: serialNumber,
      serialNumberInput: serialNumber,
      location_id: locationId,
      isSoldInput: isSold,
    },
    masterData,
    defaultLocationId,
    allRows
  )

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="md" className="z-[200]">
          <Modal.Dialog>
            <Modal.Header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-zinc-900 font-bold text-base">
                  Edit &amp; Map Serial Row #{row.rowNum}
                </h3>
                <p className="text-xs text-zinc-500">
                  Select matching SKU and Location from database
                </p>
              </div>
            </Modal.Header>

            <Modal.Body className="p-6 space-y-4">
              {/* SKU Selection */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 block mb-1">
                  Product SKU <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="Search SKU by name, code, quality, design..."
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    className="w-full h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden font-mono"
                  />
                  <select
                    value={catalogId}
                    onChange={(e) => {
                      setCatalogId(e.target.value)
                      const cat = masterData.catalogList.find((c) => c.id === e.target.value)
                      if (cat) setSkuInput(cat.sku)
                    }}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden font-mono"
                  >
                    <option value="">Select SKU ({masterData.catalogList.length} items)...</option>
                    {filteredCatalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sku} {c.quality_name ? `— ${c.quality_name} / ${c.design_name} / ${c.size_label}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Serial Number & Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Serial Number (SP) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-indigo-500 outline-hidden"
                  >
                    <option value="">Select Location...</option>
                    {masterData.locationsList.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={isSold}
                    onChange={(e) => setIsSold(e.target.checked)}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Mark piece as Sold</span>
                </label>
              </div>

              {/* Live Validation Box */}
              <div className="p-3 border rounded-xl bg-zinc-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-600">Validation Status</span>
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
// Main Modal Component
// ──────────────────────────────────────────────────────────

export default function BulkSerialUploadModal({
  isOpen,
  onOpenChange,
  onSuccess,
}: BulkSerialUploadModalProps) {
  const [step, setStep] = useState<"upload" | "analyzing" | "preview" | "uploading">("upload")
  const [fileName, setFileName] = useState<string | null>(null)
  const [analyzedRows, setAnalyzedRows] = useState<SerialAnalyzedRow[]>([])
  const [masterData, setMasterData] = useState<SerialMasterData | null>(null)
  const [defaultLocationId, setDefaultLocationId] = useState<string>("")
  const [editingRow, setEditingRow] = useState<SerialAnalyzedRow | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [filterTab, setFilterTab] = useState<"all" | "valid" | "error">("all")
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })

  useEffect(() => {
    if (isOpen) {
      setStep("upload")
      setFileName(null)
      setAnalyzedRows([])
      setMasterData(null)
      setDefaultLocationId("")
      setEditingRow(null)
      setSearchQuery("")
      setFilterTab("all")
      setUploadProgress({ current: 0, total: 0 })
    }
  }, [isOpen])

  // Fetch Master Data in full with paginated chunks
  const fetchMasterData = async (): Promise<SerialMasterData> => {
    // 1. Fetch catalog products in pages of 1000 to bypass PostgREST limit
    const catalogMap = new Map<string, CatalogItem>()

    let catFrom = 0
    let catHasMore = true
    while (catHasMore) {
      const { data, error } = await (supabase
        .from("view_catalog_full" as any) as any)
        .select("id, sku, product_code, quality_name, quality_code, design_name, design_code, size_label, color_names, product_name")
        .range(catFrom, catFrom + 999)

      if (error) {
        console.error("fetchMasterData view_catalog_full error:", error)
        break
      }

      if (data && (data as any[]).length > 0) {
        ;((data as any[]) ?? []).forEach((r: any) => {
          if (r.id && r.sku) {
            catalogMap.set(r.id, {
              id: r.id,
              sku: r.sku,
              product_code: r.product_code ?? undefined,
              quality_name: r.quality_name ?? undefined,
              quality_code: r.quality_code ?? undefined,
              design_name: r.design_name ?? undefined,
              design_code: r.design_code ?? undefined,
              size_label: r.size_label ?? undefined,
              color_names: r.color_names ?? undefined,
              product_name: r.product_name ?? undefined,
            })
          }
        })
        if ((data as any[]).length < 1000) catHasMore = false
        else catFrom += 1000
      } else {
        catHasMore = false
      }
    }

    // Secondary fallback fetch from base catalog table if view missed anything
    let baseFrom = 0
    let baseHasMore = true
    while (baseHasMore) {
      const { data, error } = await (supabase
        .from("catalog" as any) as any)
        .select("id, sku, product_code")
        .range(baseFrom, baseFrom + 999)

      if (error) break

      if (data && (data as any[]).length > 0) {
        ;((data as any[]) ?? []).forEach((r: any) => {
          if (r.id && r.sku && !catalogMap.has(r.id)) {
            catalogMap.set(r.id, { id: r.id, sku: r.sku, product_code: r.product_code ?? undefined })
          }
        })
        if ((data as any[]).length < 1000) baseHasMore = false
        else baseFrom += 1000
      } else {
        baseHasMore = false
      }
    }

    const catalogList = Array.from(catalogMap.values())

    // 2. Fetch locations
    const locationsList: Array<{ id: string; location_name: string }> = []
    let locFrom = 0
    let locHasMore = true
    while (locHasMore) {
      const { data, error } = await (supabase
        .from("locations" as any) as any)
        .select("id, location_name")
        .range(locFrom, locFrom + 999)

      if (error) break

      if (data && (data as any[]).length > 0) {
        locationsList.push(...(data as any[]))
        if ((data as any[]).length < 1000) locHasMore = false
        else locFrom += 1000
      } else {
        locHasMore = false
      }
    }

    // 3. Fetch existing inventory serial numbers
    const existingSerials = new Set<string>()
    let maxExistingSerialNum = 0

    let invFrom = 0
    let invHasMore = true
    while (invHasMore) {
      const { data, error } = await (supabase
        .from("inventory" as any) as any)
        .select("serial_number")
        .range(invFrom, invFrom + 999)

      if (error) break

      if (data && (data as any[]).length > 0) {
        ;((data as any[]) ?? []).forEach((r: any) => {
          if (r.serial_number) {
            existingSerials.add(r.serial_number.trim().toUpperCase())
            const match = r.serial_number.match(/SP-(\d+)/i)
            if (match) {
              const num = parseInt(match[1], 10)
              if (!isNaN(num) && num > maxExistingSerialNum) {
                maxExistingSerialNum = num
              }
            }
          }
        })
        if ((data as any[]).length < 1000) invHasMore = false
        else invFrom += 1000
      } else {
        invHasMore = false
      }
    }

    return {
      catalogList,
      locationsList,
      existingSerials,
      maxExistingSerialNum,
    }
  }

  // Clean raw cell values
  const cleanCellVal = (val: any): string => {
    if (val === null || val === undefined) return ""
    let str = String(val).trim()
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
      str = str.substring(1, str.length - 1).trim()
    }
    return str
  }

  // Analyze CSV
  const analyzeCSVData = (
    rawRows: Record<string, any>[],
    master: SerialMasterData,
    defLocId: string
  ) => {
    const analyzedList: SerialAnalyzedRow[] = []
    const serialsInSession = new Set<string>()
    let sessionSerialCounter = master.maxExistingSerialNum

    rawRows.forEach((rowObj, idx) => {
      const rowNum = idx + 2
      const errors: string[] = []

      const normalizedMap: Record<string, string> = {}
      Object.keys(rowObj).forEach((key) => {
        const normKey = key.trim().toLowerCase().replace(/[\s_\-\/]/g, "")
        normalizedMap[normKey] = cleanCellVal(rowObj[key])
      })

      const getVal = (...keys: string[]) => {
        for (const k of keys) {
          const normKey = k.toLowerCase().replace(/[\s_\-\/]/g, "")
          if (normalizedMap[normKey] !== undefined && normalizedMap[normKey] !== "") {
            return normalizedMap[normKey]
          }
        }
        return ""
      }

      let skuInput = getVal(
        "SKU",
        "Catalog SKU",
        "Product SKU",
        "SKU Code",
        "SKU Number",
        "SKU#",
        "SKU_Code",
        "Item SKU",
        "Product_SKU",
        "SKU ID",
        "Product Code",
        "Item Code",
        "Code",
        "SKU Name"
      )

      // Fallback header lookup: find any key containing 'sku' or 'code'
      if (!skuInput) {
        for (const k of Object.keys(rowObj)) {
          const kLower = k.toLowerCase()
          if (kLower.includes("sku") || kLower.includes("code")) {
            const val = cleanCellVal(rowObj[k])
            if (val) {
              skuInput = val
              break
            }
          }
        }
      }

      // Fallback header lookup: use 1st column if still empty
      if (!skuInput) {
        const firstKey = Object.keys(rowObj)[0]
        if (firstKey) {
          skuInput = cleanCellVal(rowObj[firstKey])
        }
      }

      let serialNumberInput = getVal(
        "Serial Number",
        "Serial",
        "SP Number",
        "SP",
        "Serial No",
        "Serial_Number",
        "SP_Number",
        "Piece Number"
      )
      const locationInput = getVal(
        "Location",
        "Location Name",
        "Store",
        "Warehouse",
        "Branch",
        "Location_Name",
        "Site"
      )
      const isSoldStr = getVal("Is Sold", "IsSold", "Sold", "Status")

      let isSoldInput = false
      if (isSoldStr) {
        const sLower = isSoldStr.toLowerCase()
        if (sLower === "true" || sLower === "yes" || sLower === "1" || sLower === "sold") {
          isSoldInput = true
        }
      }

      // If serial number is missing in CSV, auto-generate SP-xxxxx
      if (!serialNumberInput) {
        sessionSerialCounter++
        serialNumberInput = `SP-${String(sessionSerialCounter).padStart(5, "0")}`
      }

      // SKU resolution with multi-stage smart matcher
      let catalog_id: string | undefined
      let matchedSku: string | undefined

      if (!skuInput) {
        errors.push("SKU is missing")
      } else {
        const catMatch = findCatalogSkuMatch(rowObj, skuInput, master.catalogList)
        if (catMatch) {
          catalog_id = catMatch.id
          matchedSku = catMatch.sku
        } else {
          errors.push(`SKU '${skuInput}' not found in database catalog (${master.catalogList.length} catalog SKUs available)`)
        }
      }

      // Location resolution with 2-stage location matcher
      let location_id: string | undefined
      let matchedLocationName: string | undefined

      if (locationInput) {
        const locMatch = findLocationMatch(locationInput, master.locationsList)
        if (locMatch) {
          location_id = locMatch.id
          matchedLocationName = locMatch.location_name
        } else {
          errors.push(`Location '${locationInput}' not found in database locations`)
        }
      } else if (defLocId) {
        const defLoc = master.locationsList.find((l) => l.id === defLocId)
        if (defLoc) {
          location_id = defLoc.id
          matchedLocationName = defLoc.location_name
        }
      }

      if (!location_id) {
        errors.push("Location is required (select location or set default location)")
      }

      // Serial Number validation
      const upperSerial = serialNumberInput.toUpperCase().trim()
      if (master.existingSerials.has(upperSerial)) {
        errors.push(`Serial Number '${serialNumberInput}' already exists in inventory`)
      }

      if (serialsInSession.has(upperSerial)) {
        errors.push(`Duplicate Serial Number '${serialNumberInput}' in upload batch`)
      } else {
        serialsInSession.add(upperSerial)
      }

      const isValid = errors.length === 0

      analyzedList.push({
        rowNum,
        raw: rowObj,
        skuInput,
        serialNumberInput,
        locationInput,
        isSoldInput,
        catalog_id,
        matchedSku: matchedSku ?? skuInput,
        serial_number: serialNumberInput,
        location_id,
        matchedLocationName: matchedLocationName ?? locationInput,
        isValid,
        errors,
      })
    })

    return analyzedList
  }

  // Handle File
  const handleFile = async (file: File) => {
    try {
      setFileName(file.name)
      setStep("analyzing")

      const master = await fetchMasterData()
      setMasterData(master)

      const defLoc = master.locationsList[0]?.id || ""
      setDefaultLocationId(defLoc)

      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: "array" })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: "" })

      if (!rawRows || rawRows.length === 0) {
        toast.danger("Uploaded file contains no data rows")
        setStep("upload")
        return
      }

      const analyzed = analyzeCSVData(rawRows, master, defLoc)
      setAnalyzedRows(analyzed)
      setStep("preview")
    } catch (err: any) {
      console.error("Serial upload analysis failed:", err)
      toast.danger(err.message || "Failed to process file")
      setStep("upload")
    }
  }

  // Re-evaluate on default location change
  const handleDefaultLocationChange = (locId: string) => {
    setDefaultLocationId(locId)
    if (masterData && analyzedRows.length > 0) {
      const updated = analyzedRows.map((r) =>
        reevaluateSerialRow(
          { ...r, location_id: r.locationInput ? r.location_id : locId },
          masterData,
          locId,
          analyzedRows
        )
      )
      setAnalyzedRows(updated)
    }
  }

  const handleSaveEditedRow = (updatedRow: SerialAnalyzedRow) => {
    setAnalyzedRows((prev) => prev.map((r) => (r.rowNum === updatedRow.rowNum ? updatedRow : r)))
    setEditingRow(null)
    toast.success(`Row #${updatedRow.rowNum} updated!`)
  }

  const handleDeleteRow = (rowNum: number) => {
    const updated = analyzedRows.filter((r) => r.rowNum !== rowNum)
    setAnalyzedRows(updated)
    toast.success(`Row #${rowNum} removed`)
  }

  const downloadFailedRowsCSV = () => {
    const failedRows = analyzedRows.filter((r) => !r.isValid)
    if (failedRows.length === 0) return

    const exportData = failedRows.map((r) => ({
      ...r.raw,
      "Upload Error / Reason": r.errors.join(" | "),
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Failed_Serials")
    XLSX.writeFile(wb, `serial_upload_failed_rows_${Date.now()}.csv`)
  }

  // Perform Upload
  const handleUploadValidRows = async () => {
    const validRows = analyzedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      toast.danger("No valid serial rows to upload")
      return
    }

    try {
      setStep("uploading")
      setUploadProgress({ current: 0, total: validRows.length })

      const inserts = validRows.map((r) => ({
        catalog_id: r.catalog_id!,
        serial_number: r.serial_number!,
        location_id: r.location_id!,
        is_sold: r.isSoldInput ?? false,
      }))

      await runWithVerificationGuard(inserts.map((i) => i.catalog_id), async () => {
        const { error } = await (supabase.from("inventory" as any) as any).insert(inserts)
        if (error) {
          throw new Error(error.message)
        }
      })

      toast.success(`Successfully uploaded ${validRows.length} serial numbers!`)
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error("Serial upload failed:", err)
      toast.danger(err.message || "Failed to upload serial numbers")
      setStep("preview")
    }
  }

  const filteredRows = analyzedRows.filter((r) => {
    if (filterTab === "valid" && !r.isValid) return false
    if (filterTab === "error" && r.isValid) return false

    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      r.skuInput.toLowerCase().includes(q) ||
      (r.serial_number || "").toLowerCase().includes(q) ||
      (r.matchedLocationName || "").toLowerCase().includes(q) ||
      r.errors.some((e) => e.toLowerCase().includes(q))
    )
  })

  const validCount = analyzedRows.filter((r) => r.isValid).length
  const errorCount = analyzedRows.filter((r) => !r.isValid).length

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[100]">
        <Modal.Container size="cover" className="z-[100] max-h-[90vh]">
          <Modal.Dialog className="flex flex-col h-full overflow-hidden">
            <Modal.Header className="border-b border-zinc-100 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-zinc-900 font-bold text-lg">
                  Bulk Upload Serial Numbers
                </h3>
                <p className="text-xs text-zinc-500">
                  Batch add physical pieces connected to SKUs &amp; Locations
                </p>
              </div>
            </Modal.Header>

            <Modal.Body className="flex-1 overflow-hidden p-6">
              {step === "upload" && (
                <div className="flex flex-col items-center justify-center h-full py-12 space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-inner">
                    <UploadCloudIcon />
                  </div>

                  <div className="text-center max-w-md">
                    <h4 className="text-zinc-900 font-bold text-base mb-1">
                      Upload Serial Numbers File
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Upload an Excel (.xlsx / .xls) or CSV file containing SKU, Serial Number, and Location.
                    </p>
                  </div>

                  {/* Drop Area */}
                  <label className="w-full max-w-lg h-36 border-2 border-dashed border-zinc-200 hover:border-indigo-500 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all bg-zinc-50/50 hover:bg-indigo-50/20 group">
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFile(file)
                      }}
                      className="hidden"
                    />
                    <FileSpreadsheetIcon />
                    <span className="text-xs font-semibold text-zinc-700 mt-2 group-hover:text-indigo-600">
                      Click to browse or drop file here
                    </span>
                    <span className="text-[11px] text-zinc-400">Supports .xlsx, .xls, .csv</span>
                  </label>

                  {/* Download Template Button */}
                  <Button
                    variant="outline"
                    onPress={downloadSerialTemplate}
                    className="border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-white rounded-xl text-xs font-medium h-8 px-3 cursor-pointer"
                  >
                    <DownloadIcon />
                    <span>Download Serial Number Template</span>
                  </Button>
                </div>
              )}

              {step === "analyzing" && (
                <div className="flex flex-col items-center justify-center h-full py-16 space-y-3">
                  <Spinner size="lg" color="accent" />
                  <h4 className="text-zinc-800 font-semibold text-base">
                    Analyzing Serial Numbers &amp; Database Matching…
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Validating SKUs, Locations, and SP Numbers
                  </p>
                </div>
              )}

              {step === "uploading" && (
                <div className="flex flex-col items-center justify-center h-full py-16 space-y-4">
                  <Spinner size="lg" color="accent" />
                  <h4 className="text-zinc-800 font-semibold text-base">
                    Uploading Serial Numbers to Inventory ({uploadProgress.current} / {uploadProgress.total})
                  </h4>
                  <div className="w-64 h-2 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-200"
                      style={{
                        width: `${(uploadProgress.current / Math.max(1, uploadProgress.total)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {step === "preview" && (
                <div className="flex flex-col h-full space-y-4 overflow-hidden">
                  {/* Top Bar Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-50 p-3 rounded-2xl border border-zinc-200/80 shrink-0">
                    {/* Default Location Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-700 whitespace-nowrap">
                        Default Location:
                      </span>
                      <select
                        value={defaultLocationId}
                        onChange={(e) => handleDefaultLocationChange(e.target.value)}
                        className="h-8 rounded-xl border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 font-medium outline-hidden"
                      >
                        {masterData?.locationsList.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.location_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-200 text-xs font-semibold">
                      <button
                        onClick={() => setFilterTab("all")}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                          filterTab === "all" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                        )}
                      >
                        All ({analyzedRows.length})
                      </button>
                      <button
                        onClick={() => setFilterTab("valid")}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                          filterTab === "valid" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-50"
                        )}
                      >
                        Valid ({validCount})
                      </button>
                      <button
                        onClick={() => setFilterTab("error")}
                        className={cn(
                          "px-2.5 py-1 rounded-lg transition-all cursor-pointer",
                          filterTab === "error" ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50"
                        )}
                      >
                        Errors ({errorCount})
                      </button>
                    </div>

                    {/* Search */}
                    <input
                      type="text"
                      placeholder="Search preview rows..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-hidden w-48"
                    />
                  </div>

                  {/* Table */}
                  <div className="flex-1 border rounded-2xl overflow-hidden bg-white">
                    <ScrollShadow className="h-full overflow-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-zinc-50 border-b border-zinc-200 sticky top-0 font-semibold text-zinc-600 uppercase text-[10px] tracking-wider z-10">
                          <tr>
                            <th className="py-2.5 px-3 w-12 text-center">Row</th>
                            <th className="py-2.5 px-3 w-16 text-center">Status</th>
                            <th className="py-2.5 px-3">Product SKU</th>
                            <th className="py-2.5 px-3 font-mono">Serial Number (SP)</th>
                            <th className="py-2.5 px-3">Location</th>
                            <th className="py-2.5 px-3 w-20 text-center">Is Sold</th>
                            <th className="py-2.5 px-3">Issues / Reason</th>
                            <th className="py-2.5 px-3 w-16 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 text-zinc-800">
                          {filteredRows.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-zinc-400">
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
                                  {row.matchedSku || row.skuInput || "—"}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap">
                                  {row.serial_number || row.serialNumberInput || "—"}
                                </td>
                                <td className="py-2 px-3 font-medium text-zinc-800 whitespace-nowrap">
                                  {row.matchedLocationName || row.locationInput || "—"}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span className={cn("px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase", row.isSoldInput ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                                    {row.isSoldInput ? "Sold" : "Available"}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-red-600 font-medium">
                                  {row.errors.length > 0 ? row.errors.join("; ") : "—"}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <Dropdown>
                                    <Dropdown.Trigger className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 cursor-pointer outline-hidden inline-flex items-center justify-center" aria-label="Row action menu">
                                      <EllipsisVerticalIcon />
                                    </Dropdown.Trigger>
                                    <Dropdown.Popover placement="bottom end" className="min-w-[140px] rounded-xl border border-zinc-200 bg-white shadow-xl p-1 z-50">
                                      <Dropdown.Menu aria-label="Row actions">
                                        <Dropdown.Item
                                          id="edit"
                                          onPress={() => setEditingRow(row)}
                                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer text-zinc-700 hover:bg-zinc-100 rounded-lg"
                                        >
                                          <PencilIcon />
                                          Edit &amp; Map
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                          id="delete"
                                          onPress={() => handleDeleteRow(row.rowNum)}
                                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer text-red-600 hover:bg-red-50 rounded-lg"
                                        >
                                          <TrashIcon />
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

            <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-4 flex items-center justify-between shrink-0">
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
                {step === "preview" && errorCount > 0 && (
                  <Button
                    variant="outline"
                    onPress={downloadFailedRowsCSV}
                    className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-medium h-9 px-3 cursor-pointer"
                  >
                    Download Failed Rows
                  </Button>
                )}

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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-4 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    Upload {validCount} Valid Serials
                  </Button>
                )}
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Edit Row Popup */}
      {editingRow && masterData && (
        <EditSerialRowModal
          isOpen={!!editingRow}
          row={editingRow}
          masterData={masterData}
          defaultLocationId={defaultLocationId}
          allRows={analyzedRows}
          onClose={() => setEditingRow(null)}
          onSave={handleSaveEditedRow}
        />
      )}
    </Modal>
  )
}
