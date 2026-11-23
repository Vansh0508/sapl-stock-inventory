"use client"

import { Button, Modal } from "@heroui/react"
import { FilePlus } from "@gravity-ui/icons"

interface ConvertSerialsModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Confirmation for "Copy & Convert all serials to SKU" (moved here from the Serial Numbers pages). */
export default function ConvertSerialsModal({ isOpen, onOpenChange, onConfirm }: ConvertSerialsModalProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="bg-black/50 backdrop-blur-xs fixed inset-0 z-50">
        <Modal.Container className="flex items-center justify-center min-h-full p-4">
          <Modal.Dialog className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-lg w-full overflow-hidden">
            <Modal.Header className="px-6 pt-5 pb-3 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600">
                  <FilePlus width="18" height="18" />
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
                onPress={() => onOpenChange(false)}
                className="rounded-xl text-xs font-semibold text-zinc-600 hover:bg-zinc-100 h-9 px-4"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onPress={onConfirm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-9 px-5 shadow-xs"
              >
                Confirm & Convert to SKUs
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
