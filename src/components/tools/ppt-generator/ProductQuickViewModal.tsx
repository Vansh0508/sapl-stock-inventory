"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import { Button, Checkbox, Modal, toast } from "@heroui/react"
import { usePptWishlistStore } from "@/stores/pptWishlistStore"
import type { PptProductCodeGroup, PptWishlistItem } from "@/types/ppt.types"
import WorkspacePickerModal from "./WorkspacePickerModal"

interface ProductQuickViewModalProps {
  group: PptProductCodeGroup | null
  onOpenChange: (open: boolean) => void
}

export default function ProductQuickViewModal({ group, onOpenChange }: ProductQuickViewModalProps) {
  const [selectedSerialIds, setSelectedSerialIds] = useState<Set<string>>(new Set())
  const [expandedSkuIds, setExpandedSkuIds] = useState<Set<string>>(new Set())
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const activeWorkspaceId = usePptWishlistStore((s) => s.activeWorkspaceId)
  const addItems = usePptWishlistStore((s) => s.addItems)

  const isOpen = group !== null

  const toggleSku = (catalogId: string) => {
    setExpandedSkuIds((prev) => {
      const next = new Set(prev)
      if (next.has(catalogId)) next.delete(catalogId)
      else next.add(catalogId)
      return next
    })
  }

  const toggleSerial = (inventoryId: string) => {
    setSelectedSerialIds((prev) => {
      const next = new Set(prev)
      if (next.has(inventoryId)) next.delete(inventoryId)
      else next.add(inventoryId)
      return next
    })
  }

  const selectedItems: PptWishlistItem[] = useMemo(() => {
    if (!group) return []
    const items: PptWishlistItem[] = []
    for (const sku of group.skus) {
      for (const serial of sku.serials) {
        if (!selectedSerialIds.has(serial.inventoryId)) continue
        items.push({
          inventoryId: serial.inventoryId,
          serialNumber: serial.serialNumber,
          productCode: group.productCode,
          sku: sku.sku,
          sizeLabel: sku.sizeLabel,
          productName: group.productName,
          qualityName: group.qualityName,
          designName: group.designName,
          collectionName: group.collectionName,
          constructionName: group.constructionName,
          colorNames: group.colorNames,
          imageUrl: serial.imageUrls[0] ?? null,
        })
      }
    }
    return items
  }, [group, selectedSerialIds])

  const handleClose = (open: boolean) => {
    if (!open) {
      setSelectedSerialIds(new Set())
      setExpandedSkuIds(new Set())
    }
    onOpenChange(open)
  }

  const commitToWorkspace = (workspaceId: string) => {
    addItems(workspaceId, selectedItems)
    toast.success(`Added ${selectedItems.length} serial number${selectedItems.length !== 1 ? "s" : ""} to wishlist`)
    setSelectedSerialIds(new Set())
  }

  const handleAddToWishlist = () => {
    if (selectedItems.length === 0) {
      toast.danger("Select at least one serial number first")
      return
    }
    if (activeWorkspaceId) {
      commitToWorkspace(activeWorkspaceId)
    } else {
      setIsPickerOpen(true)
    }
  }

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={handleClose}>
        <Modal.Backdrop className="z-[200]">
          <Modal.Container size="cover" className="z-[200] w-[80vw] h-[80vh] max-w-none">
            <Modal.Dialog>
              {group && (
                <div className="flex flex-col h-[80vh] bg-white rounded-2xl overflow-hidden">
                  <Modal.Header className="border-b border-zinc-150 px-6 py-4 flex items-center justify-between text-zinc-900 shrink-0">
                    <div>
                      <span className="font-mono font-bold text-lg">{group.productCode}</span>
                      <p className="text-xs text-zinc-400 font-medium mt-0.5">
                        {[group.productName, group.designName, group.qualityName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </Modal.Header>

                  <Modal.Body className="flex-1 min-h-0 p-0 flex overflow-hidden">
                    {/* Combined image gallery — pooled from every serial number under this Product Code */}
                    <div className="w-1/2 border-r border-zinc-100 overflow-y-auto p-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">
                        All images ({group.allImageUrls.length})
                      </h4>
                      {group.allImageUrls.length === 0 ? (
                        <p className="text-xs text-zinc-400">No images available for this product.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {group.allImageUrls.map((url) => (
                            <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100">
                              <Image src={getThumbnailUrl(url, { width: 300, quality: 75 })} alt={group.productCode} fill unoptimized sizes="200px" className="object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Size → Serial number multi-level selection */}
                    <div className="w-1/2 overflow-y-auto p-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">
                        Sizes &amp; serial numbers
                      </h4>
                      <div className="flex flex-col gap-2">
                        {group.skus.map((sku) => {
                          const isExpanded = expandedSkuIds.has(sku.catalogId)
                          const selectedInSku = sku.serials.filter((s) => selectedSerialIds.has(s.inventoryId)).length
                          return (
                            <div key={sku.catalogId} className="border border-zinc-200 rounded-xl overflow-hidden">
                              <button
                                type="button"
                                onClick={() => toggleSku(sku.catalogId)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50/60 hover:bg-zinc-100/60 transition-colors cursor-pointer"
                              >
                                <span className="text-sm font-semibold text-zinc-900">{sku.sizeLabel ?? sku.sku}</span>
                                <span className="flex items-center gap-2">
                                  {selectedInSku > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">
                                      {selectedInSku} selected
                                    </span>
                                  )}
                                  <span className="text-xs text-zinc-400">{sku.serials.length} pcs</span>
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24"
                                    stroke="currentColor" strokeWidth="2.5"
                                    className={`text-zinc-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                </span>
                              </button>

                              {isExpanded && (
                                <div className="flex flex-col divide-y divide-zinc-100">
                                  {sku.serials.map((serial) => (
                                    <label
                                      key={serial.inventoryId}
                                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50/60 cursor-pointer"
                                    >
                                      <Checkbox
                                        isSelected={selectedSerialIds.has(serial.inventoryId)}
                                        onChange={() => toggleSerial(serial.inventoryId)}
                                      >
                                        <Checkbox.Content className="flex items-center cursor-pointer">
                                          <Checkbox.Control>
                                            <Checkbox.Indicator />
                                          </Checkbox.Control>
                                        </Checkbox.Content>
                                      </Checkbox>
                                      <span className="font-mono text-xs font-semibold text-zinc-800">{serial.serialNumber}</span>
                                      {serial.locationName && (
                                        <span className="text-[10px] text-zinc-400 ml-auto">{serial.locationName}</span>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </Modal.Body>

                  <Modal.Footer className="border-t border-zinc-150 bg-zinc-50/50 p-4 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold text-zinc-500">
                      {selectedItems.length} serial number{selectedItems.length !== 1 ? "s" : ""} selected
                    </span>
                    <Button
                      onPress={handleAddToWishlist}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold"
                    >
                      Add to wishlist
                    </Button>
                  </Modal.Footer>
                </div>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <WorkspacePickerModal
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        onConfirm={(workspaceId) => commitToWorkspace(workspaceId)}
      />
    </>
  )
}
