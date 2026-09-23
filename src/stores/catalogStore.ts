import { create } from "zustand"
import { persist } from "zustand/middleware"

interface CatalogState {
  /** Set of selected catalog row ids (SKUs). */
  selectedIds: Set<string>
  /** Whether the bulk-edit page/flow is active. */
  isBulkEditing: boolean

  toggleSelected: (id: string) => void
  selectMany: (ids: string[]) => void
  setSelected: (ids: string[]) => void
  /** True when the row id is currently selected. */
  isSelected: (id: string) => boolean
  /** Number of currently-selected rows. */
  selectedCount: () => number
  deselectAll: () => void
  setBulkEditing: (active: boolean) => void

  /** Set of selected inventory row ids (physical items). */
  selectedInventoryIds: Set<string>
  toggleInventorySelected: (id: string) => void
  selectManyInventory: (ids: string[]) => void
  setSelectedInventory: (ids: string[]) => void
  isInventorySelected: (id: string) => boolean
  selectedInventoryCount: () => number
  deselectAllInventory: () => void
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      selectedIds: new Set<string>(),
      isBulkEditing: false,
      selectedInventoryIds: new Set<string>(),

      toggleSelected: (id) =>
        set((s) => {
          const next = new Set(s.selectedIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { selectedIds: next }
        }),
      selectMany: (ids) =>
        set((s) => {
          const next = new Set(s.selectedIds)
          ids.forEach((id) => next.add(id))
          return { selectedIds: next }
        }),
      setSelected: (ids) => set({ selectedIds: new Set(ids) }),
      isSelected: (id) => get().selectedIds.has(id),
      selectedCount: () => get().selectedIds.size,
      deselectAll: () => set({ selectedIds: new Set<string>() }),
      setBulkEditing: (active) => set({ isBulkEditing: active }),

      toggleInventorySelected: (id) =>
        set((s) => {
          const next = new Set(s.selectedInventoryIds)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return { selectedInventoryIds: next }
        }),
      selectManyInventory: (ids) =>
        set((s) => {
          const next = new Set(s.selectedInventoryIds)
          ids.forEach((id) => next.add(id))
          return { selectedInventoryIds: next }
        }),
      setSelectedInventory: (ids) => set({ selectedInventoryIds: new Set(ids) }),
      isInventorySelected: (id) => get().selectedInventoryIds.has(id),
      selectedInventoryCount: () => get().selectedInventoryIds.size,
      deselectAllInventory: () => set({ selectedInventoryIds: new Set<string>() }),
    }),
    {
      name: "sapl-catalog-store",
      partialize: (state) => ({
        isBulkEditing: state.isBulkEditing,
      }),
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null
          const str = localStorage.getItem(name)
          if (!str) return null
          const parsed = JSON.parse(str)
          return {
            ...parsed,
            state: {
              ...parsed.state,
              selectedIds: new Set<string>(),
              selectedInventoryIds: new Set<string>(),
            },
          }
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return
          localStorage.removeItem(name)
        },
      },
    }
  )
)
