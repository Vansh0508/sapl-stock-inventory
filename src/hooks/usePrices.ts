"use client"

import { useState, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

export type PriceRow = {
  id: string
  catalog_id: string
  inventory_id: string | null
  location_id: string
  location_name: string | null
  currency_id: string
  currency_symbol: string | null
  price: number
  valid_from: string
  valid_to: string | null
}

export function usePrices(catalogId: string) {
  const [prices, setPrices] = useState<PriceRow[]>([])
  // Starts true: a fetch is always kicked off on mount, and callers (e.g. the
  // pricing grid's one-time column seeding) must not treat "haven't fetched
  // yet" as "fetched and found nothing".
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    if (!catalogId) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: err } = await (supabase
        .from("prices" as any) as any)
        .select(`
          id,
          catalog_id,
          inventory_id,
          location_id,
          currency_id,
          price,
          valid_from,
          valid_to,
          locations(location_name),
          currencies(symbol)
        `)
        .eq("catalog_id", catalogId)
        .is("valid_to", null)

      if (err) throw err

      const mapped: PriceRow[] = ((data as any[]) ?? []).map((row: any) => {
        const loc = row.locations as { location_name: string } | null
        const cur = row.currencies as { symbol: string } | null
        return {
          id: row.id,
          catalog_id: row.catalog_id,
          inventory_id: row.inventory_id,
          location_id: row.location_id,
          location_name: loc?.location_name ?? null,
          currency_id: row.currency_id,
          currency_symbol: cur?.symbol ?? null,
          price: row.price,
          valid_from: row.valid_from,
          valid_to: row.valid_to,
        }
      })

      setPrices(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices")
    } finally {
      setIsLoading(false)
    }
  }, [catalogId])

  const upsertPrice = useCallback((row: PriceRow) => {
    setPrices((prev) => {
      const idx = prev.findIndex((p) => p.id === row.id)
      if (idx === -1) return [...prev, row]
      const next = [...prev]
      next[idx] = row
      return next
    })
  }, [])

  return { prices, isLoading, error, fetchPrices, upsertPrice }
}
