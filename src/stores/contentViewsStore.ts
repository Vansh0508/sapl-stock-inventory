"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ContentFilterConfig {
  designs?: string[]
  constructions?: string[]
  qualities?: string[]
  colors?: string[]
  sizes?: string[]
  collections?: string[]
  folders?: string[]
  serialCounts?: string[]
}

export interface ContentView {
  id: string
  name: string
  isDefault?: boolean
  isGroupView?: boolean
  config: ContentFilterConfig
}

interface ContentViewStore {
  views: ContentView[]
  activeViewId: string
  activeViewOverride: ContentView | null
  selectedGroupCategory: keyof ContentFilterConfig | "none"
  setActiveViewId: (id: string) => void
  setActiveViewOverride: (view: ContentView | null) => void
  setSelectedGroupCategory: (cat: keyof ContentFilterConfig | "none") => void
  addView: (name: string, config: ContentFilterConfig) => ContentView
  updateView: (id: string, name: string, config: ContentFilterConfig) => void
  deleteView: (id: string) => void
  getActiveView: () => ContentView
}

const DEFAULT_VIEW: ContentView = {
  id: "default",
  name: "Default",
  isDefault: true,
  config: {},
}

export const useContentViewsStore = create<ContentViewStore>()(
  persist(
    (set, get) => ({
      views: [DEFAULT_VIEW],
      activeViewId: "default",
      activeViewOverride: null,
      selectedGroupCategory: "none",

      setActiveViewId: (id: string) => {
        set({ activeViewId: id, activeViewOverride: null })
      },

      setActiveViewOverride: (view: ContentView | null) => {
        set({ activeViewOverride: view, activeViewId: view ? view.id : "default" })
      },

      setSelectedGroupCategory: (cat: keyof ContentFilterConfig | "none") => {
        set({ selectedGroupCategory: cat, activeViewOverride: null, activeViewId: "default" })
      },

      addView: (name: string, config: ContentFilterConfig) => {
        const newView: ContentView = {
          id: `view_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: name.trim() || "Untitled View",
          config,
        }
        set((state) => ({
          views: [...state.views, newView],
          activeViewId: newView.id,
          activeViewOverride: null,
        }))
        return newView
      },

      updateView: (id: string, name: string, config: ContentFilterConfig) => {
        set((state) => ({
          views: state.views.map((v) =>
            v.id === id
              ? {
                  ...v,
                  name: name.trim() || v.name,
                  config,
                }
              : v
          ),
        }))
      },

      deleteView: (id: string) => {
        const { views, activeViewId } = get()
        const filtered = views.filter((v) => v.id !== id || v.isDefault)
        const nextActiveId = activeViewId === id ? "default" : activeViewId
        set({
          views: filtered,
          activeViewId: nextActiveId,
          activeViewOverride: null,
        })
      },

      getActiveView: () => {
        const { views, activeViewId, activeViewOverride } = get()
        if (activeViewOverride) return activeViewOverride
        return views.find((v) => v.id === activeViewId) || DEFAULT_VIEW
      },
    }),
    {
      name: "shyam_ahuja_content_views_v1",
      partialize: (state) => ({
        views: state.views,
        activeViewId: state.activeViewId,
        selectedGroupCategory: state.selectedGroupCategory,
      }),
    }
  )
)
