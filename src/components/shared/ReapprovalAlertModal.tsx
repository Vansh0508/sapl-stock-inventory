"use client"

import { Button, Modal, Typography } from "@heroui/react"
import { useVerificationStore } from "@/stores/verificationStore"
import { TriangleExclamation } from "@gravity-ui/icons"

/**
 * Global acknowledgment popup: whenever a Serial Number is added to, moved out of, or removed
 * from a SKU that was previously verified, the SKU's verification is auto-reset by the database
 * and its code is queued here so the user is told it needs to be re-approved.
 */
export default function ReapprovalAlertModal() {
  const pendingSkus = useVerificationStore((s) => s.pendingSkus)
  const clearPending = useVerificationStore((s) => s.clearPending)

  const isOpen = pendingSkus.length > 0

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && clearPending()}>
      <Modal.Backdrop className="z-[300]">
        <Modal.Container size="sm" className="z-[300]">
          <Modal.Dialog>
            <Modal.Header className="flex gap-2 items-center text-amber-700 border-b border-zinc-100">
              <TriangleExclamation width="18" height="18" className="text-amber-500" />
              Re-approval needed
            </Modal.Header>
            <Modal.Body className="py-5">
              <Typography.Paragraph size="sm" className="text-zinc-600">
                {pendingSkus.length === 1 ? (
                  <>
                    <Typography.Code weight="semibold" className="text-zinc-900">{pendingSkus[0]}</Typography.Code>
                    {" "}was verified, but its Serial Numbers just changed — it needs to be reviewed and approved again.
                  </>
                ) : (
                  <>
                    These SKUs were verified, but their Serial Numbers just changed — they need to be reviewed and approved again:
                  </>
                )}
              </Typography.Paragraph>
              {pendingSkus.length > 1 && (
                <ul className="mt-3 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {pendingSkus.map((sku) => (
                    <li key={sku}>
                      <Typography.Code weight="semibold" className="text-zinc-900">{sku}</Typography.Code>
                    </li>
                  ))}
                </ul>
              )}
            </Modal.Body>
            <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
              <Button
                onPress={clearPending}
                className="bg-amber-600 text-white rounded-xl cursor-pointer font-medium"
              >
                Got it
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
