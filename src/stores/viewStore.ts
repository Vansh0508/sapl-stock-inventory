import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  FilterState,
  FilterGroup,
  RowHeight,
  SortDirection,
  SortRule,
  ViewMode,
} from "@/types/app.types"

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const initialFilterState = (): FilterState => ({
  groups: [
    {
      id: newId(),
      conjunction: "AND",
      conditions: [],
    },
  ],
  groupConjunction: "AND",
  isDirty: false,
})

interface ViewState {
  // --- Search -------------------------------------------------------------
  /** Debounced search query that consumers read to filter data. */
  searchQuery: string
  /** Whether the inline search bar is visible above the grid. */
  isSearchOpen: boolean

  // --- Toolbar state ------------------------------------------------------
  catalogFilter: {
    applied: FilterState
    staged: FilterState
  }
  galleryFilter: {
    applied: FilterState
    staged: FilterState
  }
  sorts: SortRule[]
  groupBy: string | null
  rowHeight: RowHeight
  /** Column ids that are currently hidden. */
  hiddenColumns: string[]

  // --- Search actions -----------------------------------------------------
  setSearchQuery: (query: string) => void
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void

  // --- Filter actions -----------------------------------------------------
  setFilterState: (context: "catalog" | "gallery", type: "applied" | "staged", state: FilterState) => void
  setStagedFilter: (context: "catalog" | "gallery", state: FilterState) => void
  applyFilter: (context: "catalog" | "gallery") => void
  resetStagedFilter: (context: "catalog" | "gallery") => void
  clearAllFilters: (context: "catalog" | "gallery") => void
  removeConditionFromApplied: (context: "catalog" | "gallery", conditionId: string) => void

  // --- Sort actions -------------------------------------------------------
  addSort: (field: string, direction?: SortDirection) => void
  updateSort: (id: string, patch: Partial<Omit<SortRule, "id">>) => void
  removeSort: (id: string) => void
  clearSorts: () => void

  // --- Group / row height / columns --------------------------------------
  setGroupBy: (field: string | null) => void
  setRowHeight: (height: RowHeight) => void
  toggleColumn: (columnId: string) => void
  setHiddenColumns: (columnIds: string[]) => void
  showAllColumns: () => void

  // --- Gallery view mode -------------------------------------------------
  galleryView: ViewMode
  setGalleryView: (view: ViewMode) => void

  // --- Lifecycle ----------------------------------------------------------
  /**
   * Reset toolbar + search state. Called on tab change.
   */
  resetView: () => void
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
  searchQuery: "",
  isSearchOpen: false,
  catalogFilter: {
    applied: initialFilterState(),
    staged: initialFilterState(),
  },
  galleryFilter: {
    applied: initialFilterState(),
    staged: initialFilterState(),
  },
  sorts: [],
  groupBy: null,
  rowHeight: "normal",
  hiddenColumns: [],
  galleryView: "kanban",

  setSearchQuery: (query) => set({ searchQuery: query }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  toggleSearch: () =>
    set((s) => {
      const next = !s.isSearchOpen
      // Closing the bar clears the query so stale results don't linger.
      return next ? { isSearchOpen: true } : { isSearchOpen: false, searchQuery: "" }
    }),

  setFilterState: (context, type, state) =>
    set((s) => ({
      [`${context}Filter`]: {
        ...s[`${context}Filter`],
        [type]: state,
      },
    })),

  setStagedFilter: (context, state) =>
    set((s) => ({
      [`${context}Filter`]: {
        ...s[`${context}Filter`],
        staged: {
          ...state,
          isDirty: true,
        },
      },
    })),

  applyFilter: (context) =>
    set((s) => {
      const filterSlice = s[`${context}Filter`]
      return {
        [`${context}Filter`]: {
          applied: { ...filterSlice.staged, isDirty: false },
          staged: { ...filterSlice.staged, isDirty: false },
        },
      }
    }),

  resetStagedFilter: (context) =>
    set((s) => {
      const filterSlice = s[`${context}Filter`]
      return {
        [`${context}Filter`]: {
          ...filterSlice,
          staged: { ...filterSlice.applied, isDirty: false },
        },
      }
    }),

  clearAllFilters: (context) =>
    set(() => {
      const clean = initialFilterState()
      return {
        [`${context}Filter`]: {
          applied: clean,
          staged: clean,
        },
      }
    }),

  removeConditionFromApplied: (context, conditionId) =>
    set((s) => {
      const filterSlice = s[`${context}Filter`]

      const cleanGroups = (groups: FilterGroup[]): FilterGroup[] => {
        const result = groups.map((g) => ({
          ...g,
          conditions: g.conditions.filter((c) => c.id !== conditionId),
        }))

        const nonStaleGroups = result.filter((g) => g.conditions.length > 0)
        if (nonStaleGroups.length === 0) {
          return [
            {
              id: newId(),
              conjunction: "AND",
              conditions: [],
            },
          ]
        }
        return nonStaleGroups
      }

      const nextAppliedGroups = cleanGroups(filterSlice.applied.groups)
      const nextStagedGroups = cleanGroups(filterSlice.staged.groups)

      return {
        [`${context}Filter`]: {
          applied: {
            ...filterSlice.applied,
            groups: nextAppliedGroups,
            isDirty: false,
          },
          staged: {
            ...filterSlice.staged,
            groups: nextStagedGroups,
            isDirty: false,
          },
        },
      }
    }),

  addSort: (field, direction = "asc") =>
    set((s) => {
      // One sort rule per field — replace direction if the field already exists.
      const existing = s.sorts.find((r) => r.field === field)
      if (existing) {
        return {
          sorts: s.sorts.map((r) => (r.field === field ? { ...r, direction } : r)),
        }
      }
      return { sorts: [...s.sorts, { id: newId(), field, direction }] }
    }),
  updateSort: (id, patch) =>
    set((s) => ({
      sorts: s.sorts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })),
  removeSort: (id) => set((s) => ({ sorts: s.sorts.filter((r) => r.id !== id) })),
  clearSorts: () => set({ sorts: [] }),

  setGalleryView: (view) => set({ galleryView: view }),
  setGroupBy: (field) => set({ groupBy: field }),
  setRowHeight: (height) => set({ rowHeight: height }),
  toggleColumn: (columnId) =>
    set((s) => ({
      hiddenColumns: s.hiddenColumns.includes(columnId)
        ? s.hiddenColumns.filter((c) => c !== columnId)
        : [...s.hiddenColumns, columnId],
    })),
  setHiddenColumns: (columnIds) => set({ hiddenColumns: columnIds }),
  showAllColumns: () => set({ hiddenColumns: [] }),

  resetView: () =>
    set(() => {
      const clean = initialFilterState()
      return {
        searchQuery: "",
        isSearchOpen: false,
        catalogFilter: {
          applied: clean,
          staged: clean,
        },
        galleryFilter: {
          applied: clean,
          staged: clean,
        },
        sorts: [],
        groupBy: null,
        rowHeight: "normal",
        hiddenColumns: [],
      }
    }),
    }),
    {
      name: "sapl-view-store",
      // Bumped to drop previously-persisted `columnWidths` — column resize
      // state now lives locally in each DataTable instance (see DataTable.tsx)
      // instead of this shared, cross-table store slice.
      version: 2,
      partialize: (state) => ({
        hiddenColumns: state.hiddenColumns,
        rowHeight: state.rowHeight,
        galleryView: state.galleryView,
      }),
    }
  )
)
