"use client"

import { useEffect, useState, useMemo } from "react"
import { Button, Modal, Spinner, Typography } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface ReassignOption {
  id: string
  label: string
  metadata?: Record<string, string>
}

export interface ReassignDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  deletingLabel: string
  entityType: string
  getAffectedCount: () => Promise<number>
  options: ReassignOption[]
  onReassign: (option: ReassignOption) => Promise<void>
  onDelete: () => Promise<void>
}

const WarnIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-red-500 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1116.65 16.65z" />
  </svg>
)

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

export default function ReassignDeleteModal({
  isOpen,
  onClose,
  deletingLabel,
  entityType,
  getAffectedCount,
  options,
  onReassign,
  onDelete,
}: ReassignDeleteModalProps) {
  const [affectedCount, setAffectedCount] = useState<number | null>(null)
  const [isCounting, setIsCounting] = useState(false)
  const [selected, setSelected] = useState<ReassignOption | null>(null)
  const [search, setSearch] = useState("")
  const [isWorking, setIsWorking] = useState(false)
  const [phase, setPhase] = useState<"idle" | "reassigning" | "deleting">("idle")

  useEffect(() => {
    if (!isOpen) return
    setSelected(null)
    setSearch("")
    setIsWorking(false)
    setPhase("idle")
    setAffectedCount(null)
    setIsCounting(true)
    getAffectedCount()
      .then((n) => setAffectedCount(n))
      .catch(() => setAffectedCount(0))
      .finally(() => setIsCounting(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  const hasAffected = (affectedCount ?? 0) > 0
  const noOptions = options.length === 0
  const canConfirm = !hasAffected || selected !== null

  const handleConfirm = async () => {
    setIsWorking(true)
    try {
      if (hasAffected && selected) {
        setPhase("reassigning")
        await onReassign(selected)
      }
      setPhase("deleting")
      await onDelete()
      onClose()
    } catch (err) {
      console.error("ReassignDelete error:", err)
    } finally {
      setIsWorking(false)
      setPhase("idle")
    }
  }

  const confirmLabel =
    phase === "reassigning"
      ? `Reassigning ${affectedCount} product${affectedCount !== 1 ? "s" : ""}…`
      : phase === "deleting"
        ? "Deleting…"
        : hasAffected
          ? "Reassign & Delete"
          : "Delete"

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open && !isWorking) onClose() }}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            {({ close }) => (
              <>
                <Modal.Header className="flex items-center gap-2.5 text-red-600 border-b border-zinc-100">
                  <WarnIcon />
                  <span className="font-semibold">Delete {entityType}?</span>
                </Modal.Header>

                <Modal.Body className="py-5 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      You are about to permanently delete{" "}
                      <span className="font-semibold text-zinc-900">{deletingLabel}</span>.
                    </Typography.Paragraph>

                    {isCounting ? (
                      <div className="flex items-center gap-2 text-zinc-400 text-sm mt-1">
                        <Spinner size="sm" />
                        Checking affected products…
                      </div>
                    ) : (
                      <div className={cn(
                        "mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium w-fit",
                        hasAffected
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      )}>
                        {hasAffected ? (
                          <>{affectedCount} catalog product{affectedCount !== 1 ? "s" : ""} will be affected</>
                        ) : (
                          <>No products use this — safe to delete</>
                        )}
                      </div>
                    )}
                  </div>

                  {!isCounting && hasAffected && (
                    <div className="flex flex-col gap-2">
                      <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-800">
                        Reassign {affectedCount} product{affectedCount !== 1 ? "s" : ""} to a replacement {entityType}:
                      </Typography.Paragraph>

                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <SearchIcon />
                        </span>
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder={`Search ${entityType.toLowerCase()}s…`}
                          className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white text-zinc-800 placeholder:text-zinc-400"
                        />
                      </div>

                      <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100">
                        {filteredOptions.length === 0 ? (
                          <div className="py-6 text-center text-sm text-zinc-400">
                            {noOptions
                              ? `No other ${entityType.toLowerCase()}s available. Add one first.`
                              : "No matches found."}
                          </div>
                        ) : (
                          filteredOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setSelected(opt)}
                              className={cn(
                                "w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors cursor-pointer text-left",
                                selected?.id === opt.id
                                  ? "bg-indigo-50 text-indigo-700 font-medium"
                                  : "text-zinc-700 hover:bg-zinc-50"
                              )}
                            >
                              <span className="font-mono">{opt.label}</span>
                              {selected?.id === opt.id && (
                                <span className="text-indigo-600"><CheckIcon /></span>
                              )}
                            </button>
                          ))
                        )}
                      </div>

                      {hasAffected && !selected && (
                        <Typography.Paragraph size="xs" className="text-amber-600">
                          ⚠ Select a replacement before deleting.
                        </Typography.Paragraph>
                      )}
                    </div>
                  )}
                </Modal.Body>

                <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-end gap-3">
                  <Button
                    variant="outline"
                    onPress={() => { if (!isWorking) { close(); onClose() } }}
                    className="bg-zinc-100 text-zinc-700 rounded-xl cursor-pointer"
                    isDisabled={isWorking}
                  >
                    Cancel
                  </Button>
                  <Button
                    onPress={handleConfirm}
                    variant="danger"
                    className={cn(
                      "rounded-xl text-white font-medium cursor-pointer",
                      canConfirm && !isWorking && !(noOptions && hasAffected)
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-red-300 cursor-not-allowed"
                    )}
                    isDisabled={!canConfirm || isWorking || isCounting || (noOptions && hasAffected)}
                  >
                    {isWorking ? (
                      <span className="flex items-center gap-2">
                        <Spinner size="sm" className="text-white" />
                        {confirmLabel}
                      </span>
                    ) : confirmLabel}
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
