import { create } from "zustand"

interface VerificationState {
  /** SKUs whose verification was just auto-reset by the server-side cascade trigger, pending acknowledgment. */
  pendingSkus: string[]
  addPending: (skus: string[]) => void
  clearPending: () => void
}

export const useVerificationStore = create<VerificationState>()((set) => ({
  pendingSkus: [],
  addPending: (skus) =>
    set((s) => ({ pendingSkus: Array.from(new Set([...s.pendingSkus, ...skus])) })),
  clearPending: () => set({ pendingSkus: [] }),
}))
