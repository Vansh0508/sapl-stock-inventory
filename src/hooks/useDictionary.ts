"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useTableRealtime } from "@/lib/supabase/realtime"

// A loose, chainable view of a PostgREST query for dynamic-table access.
// Indexing the fully-typed client by a runtime table name produces a union
// across every table that breaks per-table inference; this keeps the dynamic
// calls loose (without `any`) while the public hook API stays typed against
// the caller-supplied Row type. Extends Promise so the chain is awaitable.
interface LooseQuery extends Promise<{ data: unknown; error: unknown }> {
  select(columns?: string): LooseQuery
  insert(rows: unknown[]): LooseQuery
  update(values: unknown): LooseQuery
  delete(): LooseQuery
  eq(column: string, value: unknown): LooseQuery
  order(column: string, options?: { ascending?: boolean }): LooseQuery
  single(): LooseQuery
}

const db = supabase as unknown as { from(table: string): LooseQuery }

interface DictionaryRow {
  id: string
  created_at: string
  updated_at: string
}

/**
 * Generic CRUD hook for the simple Manage dictionary tables (single/multi text
 * column lookups). Provides optimistic create/update/delete with rollback,
 * mirroring the hand-written useCurrencies/useColors hooks but reusable.
 *
 * Supply the generated Row type so `data` and the payloads stay typed, e.g.
 * `useDictionary<QualityRow>("qualities", "quality_name")`.
 */
export function useDictionary<Row extends DictionaryRow>(
  table: string,
  orderColumn: keyof Row & string,
) {
  type CreatePayload = Omit<Row, "id" | "created_at" | "updated_at">
  type UpdatePayload = Partial<CreatePayload>

  const [data, setData] = useState<Row[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const sortByOrderColumn = (rows: Row[]) =>
    [...rows].sort((a, b) =>
      String(a[orderColumn] ?? "").localeCompare(String(b[orderColumn] ?? ""))
    )

  const refetch = useCallback(async () => {
    try {
      const { data: rows, error: dbError } = await db
        .from(table)
        .select("*")
        .order(orderColumn, { ascending: true })

      if (dbError) throw dbError
      setData((rows as Row[]) || [])
    } catch (err) {
      console.error(`Failed to fetch ${table}:`, err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [table, orderColumn])

  useEffect(() => {
    const run = async () => {
      await refetch()
    }
    run()
  }, [refetch])

  // Live-refresh on any insert/update/delete from the database.
  useTableRealtime(table, refetch)

  const create = async (payload: CreatePayload) => {
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimisticRecord = {
      ...payload,
      id: tempId,
      created_at: now,
      updated_at: now,
    } as unknown as Row

    const previousData = [...data]
    setData((prev) => sortByOrderColumn([...prev, optimisticRecord]))

    try {
      const { data: inserted, error: dbError } = await db
        .from(table)
        .insert([payload])
        .select()
        .single()

      if (dbError) throw dbError

      setData((prev) =>
        sortByOrderColumn(prev.map((item) => (item.id === tempId ? (inserted as Row) : item)))
      )
      return inserted as Row
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  const update = async (id: string, payload: UpdatePayload) => {
    const previousData = [...data]

    setData((prev) =>
      sortByOrderColumn(
        prev.map((item) =>
          item.id === id
            ? ({ ...item, ...payload, updated_at: new Date().toISOString() } as Row)
            : item
        )
      )
    )

    try {
      const { data: updated, error: dbError } = await db
        .from(table)
        .update(payload)
        .eq("id", id)
        .select()
        .single()

      if (dbError) throw dbError

      setData((prev) =>
        sortByOrderColumn(prev.map((item) => (item.id === id ? (updated as Row) : item)))
      )
      return updated as Row
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    const previousData = [...data]
    setData((prev) => prev.filter((item) => item.id !== id))

    try {
      const { error: dbError } = await db.from(table).delete().eq("id", id)
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
