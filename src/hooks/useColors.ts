"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useTableRealtime } from "@/lib/supabase/realtime"
import type { Database } from "@/types/database.types"

type Color = Database["public"]["Tables"]["colors"]["Row"]
type ColorInsert = Database["public"]["Tables"]["colors"]["Insert"]
type ColorUpdate = Database["public"]["Tables"]["colors"]["Update"]

export function useColors() {
  const [data, setData] = useState<Color[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      const { data: colors, error: dbError } = await (supabase
        .from("colors" as any) as any)
        .select("*")
        .order("color_name", { ascending: true })

      if (dbError) throw dbError
      setData(colors || [])
    } catch (err) {
      console.error("Failed to fetch colors:", err)
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      await refetch()
    }
    run()
  }, [refetch])

  // Live-refresh on any change to the colors table.
  useTableRealtime("colors", refetch)

  const create = async (insertData: Omit<ColorInsert, "id" | "created_at" | "updated_at">) => {
    const tempId = crypto.randomUUID()
    const optimisticRecord: Color = {
      id: tempId,
      color_name: insertData.color_name,
      color_code: insertData.color_code,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const previousData = [...data]

    // Optimistically add and sort
    setData((prev) =>
      [...prev, optimisticRecord].sort((a, b) => a.color_name.localeCompare(b.color_name))
    )

    try {
      const { data: inserted, error: dbError } = await (supabase
        .from("colors" as any) as any)
        .insert([insertData])
        .select()
        .single()

      if (dbError) throw dbError

      // Replace optimistic record with actual db record
      setData((prev) =>
        prev
          .map((item) => (item.id === tempId ? inserted : item))
          .sort((a, b) => a.color_name.localeCompare(b.color_name))
      )
      return inserted
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  const update = async (id: string, updateData: Omit<ColorUpdate, "id" | "created_at" | "updated_at">) => {
    const previousData = [...data]

    // Optimistically update
    setData((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            return {
              ...item,
              ...updateData,
              updated_at: new Date().toISOString(),
            } as Color
          }
          return item
        })
        .sort((a, b) => a.color_name.localeCompare(b.color_name))
    )

    try {
      const { data: updated, error: dbError } = await (supabase
        .from("colors" as any) as any)
        .update(updateData)
        .eq("id", id)
        .select()
        .single()

      if (dbError) throw dbError

      // Replace with real updated data
      setData((prev) =>
        prev
          .map((item) => (item.id === id ? updated : item))
          .sort((a, b) => a.color_name.localeCompare(b.color_name))
      )
      return updated
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    const previousData = [...data]

    // Optimistically remove
    setData((prev) => prev.filter((item) => item.id !== id))

    try {
      const { error: dbError } = await (supabase
        .from("colors" as any) as any)
        .delete()
        .eq("id", id)

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
