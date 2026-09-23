"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useViewStore } from "@/stores/viewStore"
import { buildCatalogQuery } from "@/lib/applyFilters"
import type { Database } from "@/types/database.types"
import type { FilterState } from "@/types/app.types"

export type CatalogRow = { id: string } & Omit<
  Database["public"]["Views"]["view_catalog_full"]["Row"],
  "id"
>

function hasActiveFilters(filterState: FilterState): boolean {
  return filterState.groups.some((g) =>
    g.conditions.some(
      (c) =>
        c.operator === "is_empty" ||
        c.operator === "is_not_empty" ||
        c.operator === "is_true" ||
        c.operator === "is_false" ||
        (c.value !== null && c.value !== "")
    )
  )
}

export function useCatalog() {
  const [rows, setRows] = useState<CatalogRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const searchQuery = useViewStore((s) => s.searchQuery)
  const appliedFilter = useViewStore((s) => s.catalogFilter.applied)
  const sorts = useViewStore((s) => s.sorts)

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const filtersActive = hasActiveFilters(appliedFilter)
      const searchActive = searchQuery.trim().length > 0

      // Step 1: get filtered IDs (only when filters are active).
      // We use a lightweight select("id") query and execute it via buildCatalogQuery.
      // Supabase query builders are thenable, so awaiting them executes the query.
      let filteredIds: string[] | null = null

      if (filtersActive) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let idQuery: any = supabase.from("view_catalog_full").select("id")

        if (searchActive) {
          const q = `%${searchQuery.trim()}%`
          idQuery = idQuery.or(
            `sku.ilike.${q},product_name.ilike.${q},design_name.ilike.${q},quality_name.ilike.${q},collection_name.ilike.${q},construction_name.ilike.${q},color_names.ilike.${q}`
          )
        }

        // buildCatalogQuery mutates idQuery and returns the same builder.
        // Awaiting that builder (thenable) executes it and gives {data, error}.
        const result = await buildCatalogQuery(idQuery, appliedFilter) as { data: { id: string }[] | null; error: Error | null }
        if (result?.error) throw result.error
        filteredIds = (result?.data ?? []).map((r) => r.id).filter(Boolean) as string[]
      }

      // Step 2: fetch full rows with ordering in pages of 1000 to bypass PostgREST limit.
      let allData: any[] = []
      let from = 0
      let hasMore = true
      const q = searchActive ? `%${searchQuery.trim()}%` : ""

      while (hasMore) {
        let query: any = supabase.from("view_catalog_full").select("*")

        if (filteredIds !== null) {
          if (filteredIds.length === 0) {
            setRows([])
            return
          }
          query = query.in("id", filteredIds)
        } else if (searchActive) {
          query = query.or(
            `sku.ilike.${q},product_name.ilike.${q},design_name.ilike.${q},quality_name.ilike.${q},collection_name.ilike.${q},construction_name.ilike.${q},color_names.ilike.${q}`
          )
        }

        if (sorts.length > 0) {
          for (const sort of sorts) {
            query = query.order(sort.field, { ascending: sort.direction === "asc" })
          }
        } else {
          query = query.order("sku", { ascending: true })
        }

        const { data, error: err } = await query.range(from, from + 999)
        if (err) throw err

        if (!data || data.length === 0) {
          hasMore = false
        } else {
          allData = allData.concat(data)
          if (data.length < 1000) {
            hasMore = false
          } else {
            from += 1000
          }
        }
      }

      setRows(
        (allData as Database["public"]["Views"]["view_catalog_full"]["Row"][])
          .filter((r) => r.id !== null) as CatalogRow[]
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalog")
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, appliedFilter, sorts])

  useEffect(() => {
    fetchCatalog()
  }, [fetchCatalog])

  const addRow = useCallback((row: CatalogRow) => {
    setRows((prev) => [row, ...prev])
  }, [])

  const updateRow = useCallback((id: string, patch: Partial<CatalogRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [])

  return { rows, isLoading, error, refetch: fetchCatalog, addRow, updateRow }
}
