"use client"

import { useState, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"

export type InventoryRowWithDetails = {
  id: string
  serial_number: string
  catalog_id: string | null
  location_id: string | null
  created_at: string
  location_name: string | null
  country: string | null
  first_image_url: string | null
  image_urls: string[]
  is_sold: boolean
}

export function useInventory(catalogId: string) {
  const [rows, setRows] = useState<InventoryRowWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInventory = useCallback(async () => {
    if (!catalogId) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: err } = await (supabase
        .from("inventory" as any) as any)
        .select(`
          id,
          serial_number,
          catalog_id,
          location_id,
          created_at,
          is_sold,
          locations(location_name, country),
          inventory_images(public_url, sort_order)
        `)
        .eq("catalog_id", catalogId)
        .order("created_at", { ascending: true })

      if (err) throw err

      const mapped: InventoryRowWithDetails[] = ((data as any[]) ?? []).map((row: any) => {
        const images = [...((row.inventory_images as unknown as { public_url: string; sort_order: number }[]) ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order
        )
        const loc = row.locations as { location_name: string; country: string } | null
        return {
          id: row.id,
          serial_number: row.serial_number,
          catalog_id: row.catalog_id,
          location_id: row.location_id,
          created_at: row.created_at,
          location_name: loc?.location_name ?? null,
          country: loc?.country ?? null,
          first_image_url: images[0]?.public_url ?? null,
          image_urls: images.map((img) => img.public_url),
          is_sold: row.is_sold,
        }
      })

      setRows(mapped)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory")
    } finally {
      setIsLoading(false)
    }
  }, [catalogId])

  const addRow = useCallback((row: InventoryRowWithDetails) => {
    setRows((prev) => [...prev, row])
  }, [])

  const updateRow = useCallback((row: InventoryRowWithDetails) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
  }, [])

  const toggleSold = useCallback(async (inventoryId: string, nextIsSold: boolean) => {
    const { error: err } = await (supabase
      .from("inventory" as any) as any)
      .update({ is_sold: nextIsSold })
      .eq("id", inventoryId)
    if (err) throw err
    setRows((prev) => prev.map((r) => (r.id === inventoryId ? { ...r, is_sold: nextIsSold } : r)))
  }, [])

  return { rows, isLoading, error, fetchInventory, addRow, updateRow, toggleSold }
}
