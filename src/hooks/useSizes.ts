"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useTableRealtime } from "@/lib/supabase/realtime"
import type { Database } from "@/types/database.types"

type SizeView = Database["public"]["Views"]["view_sizes_full"]["Row"]

export interface SizeRow {
  id: string
  size_label: string
  length_id: string
  width_id: string
  length_name: string
  width_name: string
  so_number: string
  created_at: string
  updated_at: string
}

export interface SizeFormValues {
  size_label: string
  length_id: string
  width_id: string
}

function mapView(row: SizeView): SizeRow {
  return {
    id: row.id ?? "",
    size_label: row.size_label ?? "",
    length_id: row.length_id ?? "",
    width_id: row.width_id ?? "",
    length_name: row.length_name ?? "",
    width_name: row.width_name ?? "",
    so_number: row.so_number ?? "",
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  }
}

/**
 * Sizes CRUD hook. Reads from the resolved `view_sizes` (joined length/width
 * names + generated SO number) and writes to the `sizes` base table. Because
 * `so_seq`/`so_number` are generated, mutations refetch the view rather than
 * patching optimistically.
 */
export function useSizes() {
  const [data, setData] = useState<SizeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    const { data: rows, error: dbError } = await (supabase
      .from("view_sizes" as any) as any)
      .select("*")
      .order("so_seq", { ascending: true })

    if (dbError) throw dbError
    setData(((rows as any[]) ?? []).map(mapView))
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data: rows, error: dbError } = await (supabase
          .from("view_sizes" as any) as any)
          .select("*")
          .order("so_seq", { ascending: true })

        if (dbError) throw dbError
        if (active) setData(((rows as any[]) ?? []).map(mapView))
      } catch (err) {
        console.error("Failed to fetch sizes:", err)
        if (active) setError(err as Error)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  // Live-refresh on any change to the sizes table.
  useTableRealtime("sizes", refetch)

  const create = async (values: SizeFormValues) => {
    const { error: dbError } = await (supabase.from("sizes" as any) as any).insert([values])
    if (dbError) throw dbError
    await refetch()
  }

  const update = async (id: string, values: SizeFormValues) => {
    const { error: dbError } = await (supabase.from("sizes" as any) as any).update(values).eq("id", id)
    if (dbError) throw dbError
    await refetch()
  }

  const deleteRecord = async (id: string) => {
    const previousData = [...data]
    setData((prev) => prev.filter((item) => item.id !== id))
    try {
      const { error: dbError } = await (supabase.from("sizes" as any) as any).delete().eq("id", id)
      if (dbError) throw dbError
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  return {
    data,
    isLoading,
    error,
    create,
    update,
    delete: deleteRecord,
  }
}
