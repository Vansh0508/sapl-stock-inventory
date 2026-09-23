"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button, Modal, Spinner, toast } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import SearchToggle from "@/components/shared/SearchToggle"
import SerialNumberSubNav from "@/components/products/serial-numbers/SerialNumberSubNav"

interface SyncItem {
  id: string
  serial_number: string
  sku: string | null
  catalog_id: string | null
  location_id: string | null
  product_type_id: string | null
  size_id: string | null
  quality_id: string | null
  design_id: string | null
  collection_id: string | null
  construction_id: string | null
  quality_code: string | null
  design_code: string | null
  product_code: string | null
  created_at: string
  is_synced: boolean
  catalog?: {
    sku: string
    product_type_id: string
    size_id: string
    quality_id: string
    design_id: string
  } | null
}

export default function InventorySkuSyncView() {
  const [items, setItems] = useState<SyncItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterState, setFilterState] = useState<"all" | "missing_sku" | "synced">("all")
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await (supabase
        .from("inventory" as any) as any)
        .select(`
          id,
          serial_number,
          sku,
          catalog_id,
          location_id,
          product_type_id,
          size_id,
          quality_id,
          design_id,
          collection_id,
          construction_id,
          quality_code,
          design_code,
          product_code,
          created_at,
          catalog (sku, product_type_id, size_id, quality_id, design_id)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error

      const mapped: SyncItem[] = (data || []).map((row: any) => {
        const hasDirectSku = Boolean(row.sku && row.sku.trim().length > 0)
        return {
          id: row.id,
          serial_number: row.serial_number,
          sku: row.sku,
          catalog_id: row.catalog_id,
          location_id: row.location_id,
          product_type_id: row.product_type_id,
          size_id: row.size_id,
          quality_id: row.quality_id,
          design_id: row.design_id,
          collection_id: row.collection_id,
          construction_id: row.construction_id,
          quality_code: row.quality_code,
          design_code: row.design_code,
          product_code: row.product_code,
          created_at: row.created_at,
          is_synced: hasDirectSku,
          catalog: row.catalog,
        }
      })

      setItems(mapped)
    } catch (err: any) {
      console.error("Error fetching sync list:", err)
      toast.danger("Failed to load inventory sync data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const [isConverting, setIsConverting] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)

  const handleConvertSerialOrders = async () => {
    setIsConverting(true)
    setConfirmModalOpen(false)
    try {
      const { convertSerialOrdersToSku } = await import("@/lib/convertSerialOrdersToSku")
      const result = await convertSerialOrdersToSku()
      toast.success(result.message)
      await fetchData()
    } catch (err: any) {
      console.error("Convert serial orders error:", err)
      toast.danger(`Conversion failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsConverting(false)
    }
  }

  const [isExporting, setIsExporting] = useState(false)

  const handleExportSerials = async () => {
    setIsExporting(true)
    try {
      const { exportSerialOrdersToExcel } = await import("@/lib/exportSerialOrders")
      await exportSerialOrdersToExcel()
    } catch (err: any) {
      console.error("Export serials error:", err)
      toast.danger(`Export failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSyncAll = async () => {
    setIsSyncingAll(true)
    try {
      const { error } = await (supabase.rpc as any)("copy_catalog_to_inventory", {
        p_inventory_ids: null,
      })

      if (error) throw error
      toast.success("Synchronized all serial numbers with direct inventory columns and SKUs!")
      await fetchData()
    } catch (err: any) {
      console.error("Sync all error:", err)
      toast.danger(`Sync all failed: ${err.message || "Unknown error"}`)
    } finally {
      setIsSyncingAll(false)
    }
  }

  const handleSyncRow = async (id: string) => {
    setSyncingItemId(id)
    try {
      const { error } = await (supabase.rpc as any)("copy_catalog_to_inventory", {
        p_inventory_ids: [id],
      })

      if (error) throw error
      toast.success("Synchronized piece to inventory columns!")
      await fetchData()
    } catch (err: any) {
      console.error("Sync row error:", err)
      toast.danger(`Sync failed: ${err.message || "Unknown error"}`)
    } finally {
      setSyncingItemId(null)
    }
  }

  const stats = useMemo(() => {
    const total = items.length
    const synced = items.filter((i) => i.is_synced).length
    const missing = total - synced
    return { total, synced, missing }
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterState === "missing_sku" && item.is_synced) return false
      if (filterState === "synced" && !item.is_synced) return false

      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        item.serial_number.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.catalog?.sku && item.catalog.sku.toLowerCase().includes(q))
      )
    })
  }, [items, filterState, search])

  return (
    <div className="flex flex-col gap-6 w-full h-full p-4 md:p-6 lg:p-8">
      <SerialNumberSubNav currentPath="/products/serial-numbers/sync" />

      {/* Header & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Inventory SKU & Dimension Sync</h1>
          <p className="text-xs text-zinc-500 font-medium mt-0.5">
            Synchronize catalog parameters and SKUs directly onto individual inventory rows.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onPress={() => setConfirmModalOpen(true)}
            isDisabled={isConverting || isLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs px-4 h-10 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
          >
            {isConverting ? (
              <>
                <Spinner size="sm" color="current" />
                <span>Converting & Merging to SKUs…</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span>Copy & Convert all Serial Order Data to SKU</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            onPress={handleSyncAll}
            isDisabled={isSyncingAll || isLoading || isConverting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-5 h-10 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
          >
            {isSyncingAll ? (
              <>
                <Spinner size="sm" color="current" />
                <span>Syncing All…</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span>1-Click Sync All ({stats.missing} pending)</span>
              </>
            )}
          </Button>
          <Button
            type="button"
            onPress={handleExportSerials}
            isDisabled={isExporting || isLoading}
            className="border border-zinc-200 hover:border-zinc-300 text-zinc-700 bg-white rounded-xl text-xs px-4 h-10 font-bold cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
          >
            {isExporting ? (
              <>
                <Spinner size="sm" color="current" />
                <span>Exporting Serials…</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>Export Serials Data</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-4 shadow-3xs flex flex-col gap-1">
          <span className="text-xs font-bold text-zinc-400 uppercase">Total Inventory Pieces</span>
          <span className="text-2xl font-extrabold text-zinc-900">{stats.total}</span>
        </div>
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-3xs flex flex-col gap-1">
          <span className="text-xs font-bold text-emerald-600 uppercase">Direct SKU Populated</span>
          <span className="text-2xl font-extrabold text-emerald-700">{stats.synced}</span>
        </div>
        <div className="bg-white border border-amber-200/80 rounded-2xl p-4 shadow-3xs flex flex-col gap-1">
          <span className="text-xs font-bold text-amber-600 uppercase">Pending Direct SKU</span>
          <span className="text-2xl font-extrabold text-amber-700">{stats.missing}</span>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl">
          <button
            type="button"
            onClick={() => setFilterState("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              filterState === "all" ? "bg-white text-zinc-900 shadow-3xs" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            All Pieces ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterState("missing_sku")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              filterState === "missing_sku" ? "bg-white text-amber-800 shadow-3xs" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Pending Sync ({stats.missing})
          </button>
          <button
            type="button"
            onClick={() => setFilterState("synced")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
              filterState === "synced" ? "bg-white text-emerald-800 shadow-3xs" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Synced ({stats.synced})
          </button>
        </div>

        <SearchToggle
          value={search}
          onChange={setSearch}
          placeholder="Filter serial numbers…"
          ariaLabel="Filter serial numbers"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200 text-zinc-500 font-extrabold uppercase tracking-wider">
                <th className="py-3.5 px-4">Serial Number</th>
                <th className="py-3.5 px-4">Direct Inventory SKU</th>
                <th className="py-3.5 px-4">Catalog SKU Ref</th>
                <th className="py-3.5 px-4">Sync Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-400">
                    <Spinner size="md" color="current" />
                    <span className="block mt-2">Loading pieces…</span>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-zinc-400">
                    No records found
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                      {item.serial_number}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {item.sku ? (
                        <span className="bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-md text-[11px] border border-indigo-100/80">
                          {item.sku}
                        </span>
                      ) : (
                        <span className="text-zinc-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-zinc-500">
                      {item.catalog?.sku || "No catalog link"}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.is_synced ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Pending Sync
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        type="button"
                        size="sm"
                        onPress={() => handleSyncRow(item.id)}
                        isDisabled={syncingItemId === item.id || isSyncingAll}
                        className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-xs px-3 h-7 font-bold cursor-pointer transition-all"
                      >
                        {syncingItemId === item.id ? "Syncing…" : "Copy/Sync"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal isOpen={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <Modal.Backdrop className="bg-black/50 backdrop-blur-xs fixed inset-0 z-50">
          <Modal.Container className="flex items-center justify-center min-h-full p-4">
            <Modal.Dialog className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-lg w-full overflow-hidden">
              <Modal.Header className="px-6 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">Copy & Convert All Serials to SKU</h3>
                    <p className="text-xs text-zinc-500 font-medium">Rebuild and reconcile SKUs from Serial Numbers</p>
                  </div>
                </div>
              </Modal.Header>

              <Modal.Body className="px-6 py-4 flex flex-col gap-3 text-xs text-zinc-600 leading-relaxed">
                <p>
                  This action will scan all physical serial numbers registered in the inventory, extract and analyze their design and quality specifications, and:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-1 font-medium text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-200/60">
                  <li><strong>Redefine and group</strong> all serial pieces into unique product SKU codes.</li>
                  <li><strong>Create any missing Catalog SKUs</strong> automatically with computed product codes.</li>
                  <li><strong>Merge and nest every serial number</strong> directly inside its corresponding unique SKU master row.</li>
                  <li><strong>Sync direct SKU attributes</strong> across all inventory piece records.</li>
                </ul>
                <p className="text-zinc-500 text-[11px]">
                  All serial numbers will be maintained and cleanly organized under their respective SKUs in the Catalog tab.
                </p>
              </Modal.Body>

              <Modal.Footer className="px-6 py-3.5 bg-zinc-50/80 border-t border-zinc-100 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onPress={() => setConfirmModalOpen(false)}
                  className="rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onPress={handleConvertSerialOrders}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-9 px-5 shadow-xs"
                >
                  Confirm & Convert to SKUs
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}
