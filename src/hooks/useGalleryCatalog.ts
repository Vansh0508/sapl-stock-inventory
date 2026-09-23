"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useViewStore } from "@/stores/viewStore"
import { buildGalleryQuery } from "@/lib/applyFilters"

export interface GalleryInventoryItem {
  id: string
  serial_number: string | null
  catalog_id: string | null
  location_id: string | null
  location_name: string | null
  location_state: string | null
  location_country: string | null
  currency_symbol: string | null
  sku: string | null
  product_name: string | null
  quality_name: string | null
  quality_code: string | null
  quality_prefix: string | null
  design_name: string | null
  design_code: string | null
  collection_name: string | null
  construction_name: string | null
  color_names: string | null
  color_codes: string | null
  fiber_configuration: string | null
  size_label: string | null
  is_active: boolean | null
  created_at: string | null
  updated_at: string | null
  product_code: string | null
  so_number: string | null
  image_url: string | null
  image_urls: string[]
  product_type_id: string | null
  quality_id: string | null
  design_id: string | null
  collection_id: string | null
  construction_id: string | null
  size_id: string | null
}

export function useGalleryCatalog() {
  const [items, setItems] = useState<GalleryInventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const galleryFilter = useViewStore((s) => s.galleryFilter)
  const sorts = useViewStore((s) => s.sorts)
  const searchQuery = useViewStore((s) => s.searchQuery)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const filtersActive = galleryFilter.applied.groups.some((g) =>
        g.conditions.some(
          (c) =>
            c.operator === "is_empty" ||
            c.operator === "is_not_empty" ||
            c.operator === "is_true" ||
            c.operator === "is_false" ||
            (c.value !== null && c.value !== "")
        )
      )
      const searchActive = searchQuery.trim().length > 0

      let filteredIds: string[] | null = null

      if (filtersActive) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let idQuery: any = supabase.from("view_inventory_gallery").select("id")

        if (searchActive) {
          const q = `%${searchQuery.trim()}%`
          idQuery = idQuery.or(
            `sku.ilike.${q},product_name.ilike.${q},design_name.ilike.${q},quality_name.ilike.${q},collection_name.ilike.${q},color_names.ilike.${q},serial_number.ilike.${q},location_name.ilike.${q}`
          )
        }

        const result = await buildGalleryQuery(idQuery, galleryFilter.applied) as { data: { id: string }[] | null; error: Error | null }
        if (result?.error) throw result.error
        filteredIds = (result?.data ?? []).map((r) => r.id).filter(Boolean) as string[]
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mainQuery: any = supabase.from("view_inventory_gallery").select("*")

      if (filteredIds !== null) {
        if (filteredIds.length === 0) {
          setItems([])
          return
        }
        mainQuery = mainQuery.in("id", filteredIds)
      } else if (searchActive) {
        const q = searchQuery.trim()
        mainQuery = mainQuery.or(
          `sku.ilike.%${q}%,product_name.ilike.%${q}%,quality_name.ilike.%${q}%,collection_name.ilike.%${q}%,color_names.ilike.%${q}%,serial_number.ilike.%${q}%,location_name.ilike.%${q}%`
        )
      }

      if (sorts.length > 0) {
        for (const sort of sorts) {
          mainQuery = mainQuery.order(sort.field, { ascending: sort.direction === "asc" })
        }
      } else {
        mainQuery = mainQuery.order("product_code", { ascending: true }).order("serial_number", { ascending: true })
      }

      let hasMore = true
      let offset = 0
      const limit = 100
      let accumulatedItems: any[] = []

      while (hasMore) {
        // Fetch next page of products
        let chunkQuery = mainQuery.range(offset, offset + limit - 1)
        const { data: inventoryRows, error: invErr } = await chunkQuery
        if (invErr) throw invErr

        if (!inventoryRows || inventoryRows.length === 0) {
          hasMore = false
          break
        }

        const validRows = inventoryRows.filter(
          (r: { id: string | null }) => r.id !== null
        ) as Array<{ id: string; [key: string]: any }>

        if (validRows.length === 0) {
          hasMore = false
          break
        }

        // Map basic info immediately (without images) and append to accumulated list
        const chunkItems = validRows.map((r) => ({
          id: r.id,
          serial_number: r.serial_number,
          catalog_id: r.catalog_id,
          location_id: r.location_id,
          location_name: r.location_name,
          location_state: r.location_state,
          location_country: r.location_country,
          currency_symbol: r.currency_symbol,
          sku: r.sku,
          product_name: r.product_name,
          quality_name: r.quality_name,
          product_code: r.product_code,
          quality_code: r.quality_code,
          quality_prefix: r.quality_prefix,
          design_name: r.design_name,
          design_code: r.design_code,
          collection_name: r.collection_name,
          construction_name: r.construction_name,
          color_names: r.color_names,
          color_codes: r.color_codes,
          fiber_configuration: r.fiber_configuration,
          size_label: r.size_label,
          is_active: r.is_active,
          created_at: r.created_at,
          updated_at: r.updated_at,
          so_number: r.so_number,
          image_url: null,
          image_urls: [],
          product_type_id: r.product_type_id,
          quality_id: r.quality_id,
          design_id: r.design_id,
          collection_id: r.collection_id,
          construction_id: r.construction_id,
          size_id: r.size_id,
        }))

        accumulatedItems = [...accumulatedItems, ...chunkItems]
        
        // Update React state with newly retrieved items
        setItems([...accumulatedItems])
        // Instantly switch off main screen loading spinner on first chunk fetch
        setIsLoading(false)

        // Fetch image paths for the current chunk of 100 items in the background
        const chunkIds = validRows.map((r) => r.id)
        try {
          const { data: imageRows, error: imgErr } = await (supabase
            .from("inventory_images" as any) as any)
            .select("inventory_id, public_url, sort_order")
            .in("inventory_id", chunkIds)
            .order("sort_order", { ascending: true })

          if (!imgErr && imageRows) {
            const imageMap: Record<string, string[]> = {}
            for (const img of (imageRows as any[])) {
              if (!imageMap[img.inventory_id]) {
                imageMap[img.inventory_id] = []
              }
              imageMap[img.inventory_id].push(img.public_url)
            }

            // Merge image data into accumulated items list
            accumulatedItems = accumulatedItems.map((item) => {
              if (chunkIds.includes(item.id)) {
                return {
                  ...item,
                  image_url: imageMap[item.id]?.[0] || null,
                  image_urls: imageMap[item.id] || [],
                }
              }
              return item
            })
            setItems([...accumulatedItems])
          }
        } catch (imgErr) {
          console.error("Progressive background images fetch failed:", imgErr)
        }

        if (inventoryRows.length < limit) {
          hasMore = false
        } else {
          offset += limit
          // Yield to browser main thread so renders can happen dynamically between chunks
          await new Promise((resolve) => setTimeout(resolve, 80))
        }
      }

    } catch (err: any) {
      const details = {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        name: err?.name,
      }
      console.error("Gallery query error:", details, err)
      const msg =
        err?.message || err?.details || err?.hint || err?.code || JSON.stringify(details) || String(err)
      setError(`Failed to load gallery data: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }, [galleryFilter.applied, sorts, searchQuery])

  useEffect(() => {
    let cancelled = false
    async function run() {
      await Promise.resolve()
      if (!cancelled) fetchData()
    }
    run()
    return () => {
      cancelled = true
    }
  }, [fetchData])

  return { items, isLoading, error, refetch: fetchData }
}
