"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useTableRealtime } from "@/lib/supabase/realtime"
import type { Database } from "@/types/database.types"

export type LocationWithCurrency = Database["public"]["Tables"]["locations"]["Row"] & {
  currency: {
    id: string
    currency_name: string
    symbol: string
  } | null
}

type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"]
type LocationUpdate = Database["public"]["Tables"]["locations"]["Update"]

export function useLocations() {
  const [data, setData] = useState<LocationWithCurrency[]>([])
  const [currencies, setCurrencies] = useState<Database["public"]["Tables"]["currencies"]["Row"][]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refetch = useCallback(async () => {
    try {
      // Fetch locations with joined currency details
      const { data: locations, error: dbError } = await (supabase
        .from("locations" as any) as any)
        .select(`
          *,
          currency:currencies (
            id,
            currency_name,
            symbol
          )
        `)
        .order("location_name", { ascending: true })

      if (dbError) throw dbError

      // Also fetch currencies so we can look them up for optimistic UI updates
      const { data: currencyList, error: currencyError } = await (supabase
        .from("currencies" as any) as any)
        .select("*")

      if (currencyError) throw currencyError

      setData((locations as unknown as LocationWithCurrency[]) || [])
      setCurrencies(currencyList || [])
    } catch (err: any) {
      console.error("Failed to fetch locations:", err.message || JSON.stringify(err, null, 2))
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

  // Live-refresh on any change to the locations table.
  useTableRealtime("locations", refetch)

  const create = async (insertData: Omit<LocationInsert, "id" | "created_at" | "updated_at">) => {
    const tempId = crypto.randomUUID()
    
    // Resolve currency details from local cache for optimistic record
    const selectedCurrency = currencies.find((c) => c.id === insertData.currency_id)
    const optimisticRecord: LocationWithCurrency = {
      id: tempId,
      location_name: insertData.location_name,
      country: insertData.country,
      state: insertData.state ?? null,
      currency_id: insertData.currency_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: selectedCurrency
        ? {
            id: selectedCurrency.id,
            currency_name: selectedCurrency.currency_name,
            symbol: selectedCurrency.symbol,
          }
        : null,
    }

    const previousData = [...data]

    // Optimistically insert and sort
    setData((prev) =>
      [...prev, optimisticRecord].sort((a, b) => a.location_name.localeCompare(b.location_name))
    )

    try {
      const { data: inserted, error: dbError } = await (supabase
        .from("locations" as any) as any)
        .insert([insertData])
        .select()
        .single()

      if (dbError) throw dbError

      // Retrieve full joined details for the inserted record
      const { data: fullInserted, error: joinError } = await (supabase
        .from("locations" as any) as any)
        .select(`
          *,
          currency:currencies (
            id,
            currency_name,
            symbol
          )
        `)
        .eq("id", inserted.id)
        .single()

      if (joinError) throw joinError

      // Replace optimistic record with actual db record
      setData((prev) =>
        prev
          .map((item) => (item.id === tempId ? (fullInserted as unknown as LocationWithCurrency) : item))
          .sort((a, b) => a.location_name.localeCompare(b.location_name))
      )
      return fullInserted as unknown as LocationWithCurrency
    } catch (err) {
      setData(previousData)
      throw err
    }
  }

  const update = async (id: string, updateData: Omit<LocationUpdate, "id" | "created_at" | "updated_at">) => {
    const previousData = [...data]
    const selectedCurrency = updateData.currency_id
      ? currencies.find((c) => c.id === updateData.currency_id)
      : null

    // Optimistically update
    setData((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            return {
              ...item,
              ...updateData,
              updated_at: new Date().toISOString(),
              currency: selectedCurrency
                ? {
                    id: selectedCurrency.id,
                    currency_name: selectedCurrency.currency_name,
                    symbol: selectedCurrency.symbol,
                  }
                : item.currency, // retain current if currency_id didn't change
            } as LocationWithCurrency
          }
          return item
        })
        .sort((a, b) => a.location_name.localeCompare(b.location_name))
    )

    try {
      const { error: dbError } = await (supabase
        .from("locations" as any) as any)
        .update(updateData)
        .eq("id", id)
        .select()
        .single()

      if (dbError) throw dbError

      // Fetch joined data
      const { data: fullUpdated, error: joinError } = await (supabase
        .from("locations" as any) as any)
        .select(`
          *,
          currency:currencies (
            id,
            currency_name,
            symbol
          )
        `)
        .eq("id", id)
        .single()

      if (joinError) throw joinError

      // Replace with real updated data
      setData((prev) =>
        prev
          .map((item) => (item.id === id ? (fullUpdated as unknown as LocationWithCurrency) : item))
          .sort((a, b) => a.location_name.localeCompare(b.location_name))
      )
      return fullUpdated as unknown as LocationWithCurrency
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
        .from("locations" as any) as any)
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
