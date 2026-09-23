import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PptWishlistItem, PptWorkspace } from "@/types/ppt.types"

interface PptWishlistState {
  workspaces: PptWorkspace[]
  activeWorkspaceId: string | null

  createWorkspace: (name: string) => PptWorkspace
  deleteWorkspace: (id: string) => void
  setActiveWorkspace: (id: string | null) => void
  addItems: (workspaceId: string, items: PptWishlistItem[]) => void
  removeItem: (workspaceId: string, inventoryId: string) => void
  clearWorkspace: (workspaceId: string) => void
}

export const usePptWishlistStore = create<PptWishlistState>()(
  persist(
    (set) => ({
      workspaces: [],
      activeWorkspaceId: null,

      createWorkspace: (name) => {
        const workspace: PptWorkspace = {
          id: crypto.randomUUID(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          items: [],
        }
        set((s) => ({
          workspaces: [...s.workspaces, workspace],
          activeWorkspaceId: workspace.id,
        }))
        return workspace
      },

      deleteWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
        })),

      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

      addItems: (workspaceId, items) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => {
            if (w.id !== workspaceId) return w
            const existingIds = new Set(w.items.map((i) => i.inventoryId))
            const merged = [...w.items, ...items.filter((i) => !existingIds.has(i.inventoryId))]
            return { ...w, items: merged }
          }),
        })),

      removeItem: (workspaceId, inventoryId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, items: w.items.filter((i) => i.inventoryId !== inventoryId) }
              : w
          ),
        })),

      clearWorkspace: (workspaceId) =>
        set((s) => ({
          workspaces: s.workspaces.map((w) => (w.id === workspaceId ? { ...w, items: [] } : w)),
        })),
    }),
    {
      name: "sapl-ppt-wishlist-store",
    }
  )
)
