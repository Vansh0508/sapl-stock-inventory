"use client"

import { useState } from "react"
import { Button, Modal, toast } from "@heroui/react"
import { usePptWishlistStore } from "@/stores/pptWishlistStore"

interface WorkspacePickerModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Called once a workspace id is chosen or created — caller is responsible for adding items to it. */
  onConfirm: (workspaceId: string) => void
}

export default function WorkspacePickerModal({ isOpen, onOpenChange, onConfirm }: WorkspacePickerModalProps) {
  const workspaces = usePptWishlistStore((s) => s.workspaces)
  const createWorkspace = usePptWishlistStore((s) => s.createWorkspace)

  const [mode, setMode] = useState<"select" | "create">(workspaces.length === 0 ? "create" : "select")
  const [selectedId, setSelectedId] = useState<string | null>(workspaces[0]?.id ?? null)
  const [newName, setNewName] = useState("")

  const handleConfirm = () => {
    if (mode === "create") {
      const name = newName.trim()
      if (!name) {
        toast.danger("Please enter a workspace name")
        return
      }
      const workspace = createWorkspace(name)
      setNewName("")
      onConfirm(workspace.id)
      onOpenChange(false)
      return
    }

    if (!selectedId) {
      toast.danger("Please select a workspace")
      return
    }
    onConfirm(selectedId)
    onOpenChange(false)
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[300]">
        <Modal.Container size="sm" className="z-[300]">
          <Modal.Dialog>
            <div className="flex flex-col bg-white rounded-2xl overflow-hidden">
              <Modal.Header className="border-b border-zinc-150 px-6 py-4 flex items-center justify-between text-zinc-900 font-semibold shrink-0">
                <span>Add to wishlist</span>
              </Modal.Header>

              <Modal.Body className="p-6 flex flex-col gap-4">
                <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setMode("select")}
                    disabled={workspaces.length === 0}
                    className={`px-3 h-8 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      mode === "select" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
                    }`}
                  >
                    Select workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className={`px-3 h-8 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      mode === "create" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
                    }`}
                  >
                    Create new
                  </button>
                </div>

                {mode === "select" ? (
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                    {workspaces.length === 0 ? (
                      <p className="text-xs text-zinc-400">No workspaces yet — create one instead.</p>
                    ) : (
                      workspaces.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedId(w.id)}
                          className={`text-left px-3 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${
                            selectedId === w.id
                              ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                              : "border-zinc-200 hover:border-zinc-300 text-zinc-700"
                          }`}
                        >
                          <span className="font-semibold">{w.name}</span>
                          <span className="text-zinc-400 text-xs ml-2">{w.items.length} item{w.items.length !== 1 ? "s" : ""}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-zinc-600">Workspace name</label>
                    <input
                      autoFocus
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Spring Collection Pitch"
                      className="border border-zinc-200 rounded-xl px-3 h-10 text-sm text-zinc-800 outline-none focus:border-indigo-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirm()
                      }}
                    />
                  </div>
                )}
              </Modal.Body>

              <Modal.Footer className="border-t border-zinc-150 bg-zinc-50/50 p-4 flex items-center justify-end shrink-0 gap-2">
                <Button
                  onPress={() => onOpenChange(false)}
                  className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onPress={handleConfirm}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold"
                >
                  Continue
                </Button>
              </Modal.Footer>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
