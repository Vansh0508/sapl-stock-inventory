"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import type { PptProductCodeGroup, PptSkuGroup } from "@/types/ppt.types"

/** Splits an array into fixed-size chunks — Supabase `.in()` filters get unwieldy past a few hundred ids. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Caps how many requests are in flight at once. Firing every batch fully unbounded can exhaust the
 * local Supabase/Docker connection pool and surface as a raw "Failed to fetch" network error, so all
 * batched requests below are routed through a single shared limiter instance.
 */
function createLimiter(limit: number) {
  let active = 0
  const queue: Array<() => void> = []

  function schedule() {
    if (active >= limit || queue.length === 0) return
    active++
    const run = queue.shift()
    run?.()
  }

  return function withLimit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--
            schedule()
          })
      })
      schedule()
    })
  }
}

/** Retries a single transient network failure (e.g. a dropped connection under load) before giving up. */
async function withRetry<T>(fn: () => PromiseLike<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!(err instanceof TypeError)) throw err
    return await fn()
  }
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const { data, error } = await withRetry(() => build(offset, offset + pageSize - 1))
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      hasMore = false
      break
    }
    rows.push(...data)
    if (data.length < pageSize) {
      hasMore = false
      break
    }
    offset += pageSize
  }
  return rows
}

type DictionaryTable = "product_types" | "qualities" | "designs" | "constructions" | "collections" | "sizes" | "locations"

async function fetchIdNameMap(table: DictionaryTable, nameColumn: string): Promise<Map<string, string>> {
  const { data, error } = await (supabase.from(table as any) as any).select(`id, ${nameColumn}`)
  if (error) throw new Error(error.message)
  const map = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data as any[]) ?? []) map.set(row.id, row[nameColumn])
  return map
}

export function useProductCodeCatalog() {
  const [productCodes, setProductCodes] = useState<PptProductCodeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingImagesFor, setLoadingImagesFor] = useState<Set<string>>(new Set())
  const imagesFetchedRef = useRef<Set<string>>(new Set())
  const inventoryIdsByProductCodeRef = useRef<Map<string, string[]>>(new Map())

  // ── Structural pass: everything needed to render the grid + filters, no images ──
  const fetchStructuralData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    imagesFetchedRef.current = new Set()
    inventoryIdsByProductCodeRef.current = new Map()

    try {
      interface CatalogRow {
        id: string
        product_code: string | null
        sku: string | null
        product_type_id: string | null
        quality_id: string | null
        design_id: string | null
        collection_id: string | null
        construction_id: string | null
        size_id: string | null
      }

      // Dictionary maps and the catalog rows don't depend on each other — fetch them all at once.
      const [
        [productTypeMap, qualityMap, designMap, constructionMap, collectionMap, sizeMap, locationMap],
        catalogRows,
      ] = await Promise.all([
        Promise.all([
          fetchIdNameMap("product_types", "product_name"),
          fetchIdNameMap("qualities", "quality_name"),
          fetchIdNameMap("designs", "design_name"),
          fetchIdNameMap("constructions", "construction_name"),
          fetchIdNameMap("collections", "collection_name"),
          fetchIdNameMap("sizes", "size_label"),
          fetchIdNameMap("locations", "location_name"),
        ]),
        fetchAllRows<CatalogRow>((from, to) =>
          (supabase
            .from("catalog" as any) as any)
            .select("id, product_code, sku, product_type_id, quality_id, design_id, collection_id, construction_id, size_id")
            .eq("is_active", true)
            .order("product_code", { ascending: true })
            .range(from, to)
        ),
      ])

      const activeCatalogIds = catalogRows.map((r) => r.id)
      const idBatches = chunk(activeCatalogIds, 300)

      interface InventoryRow {
        id: string
        serial_number: string | null
        catalog_id: string | null
        location_id: string | null
      }

      // Colors, prices, and inventory are independent of each other and each other's batches, but firing
      // every batch fully unbounded can exhaust the connection pool — route them through a shared limiter.
      const limiter = createLimiter(6)
      const [colorBatchResults, priceBatchResults, inventoryBatchResults] = await Promise.all([
        Promise.all(
          idBatches.map((idBatch) =>
            limiter(() =>
              withRetry(() =>
                (supabase.from("catalog_colors" as any) as any).select("catalog_id, colors(color_name, color_code)").in("catalog_id", idBatch)
              )
            )
          )
        ),
        Promise.all(
          idBatches.map((idBatch) =>
            limiter(() =>
              withRetry(() =>
                (supabase.from("view_active_prices" as any) as any).select("catalog_id, price, currency_symbol").in("catalog_id", idBatch)
              )
            )
          )
        ),
        Promise.all(
          idBatches.map((idBatch) =>
            limiter(() =>
              fetchAllRows<InventoryRow>((from, to) =>
                (supabase
                  .from("inventory" as any) as any)
                  .select("id, serial_number, catalog_id, location_id")
                  .in("catalog_id", idBatch)
                  .range(from, to)
              )
            )
          )
        ),
      ])

      // Colors are exact per catalog row (they're literally embedded in product_code),
      // so any one catalog row's colors represent the whole Product Code correctly.
      const colorsByCatalogId = new Map<string, { names: string[]; codes: string[] }>()
      for (const { data, error: colorErr } of (colorBatchResults as any[])) {
        if (colorErr) {
          console.warn("Failed to fetch catalog colors:", colorErr.message)
          continue
        }
        for (const row of ((data as any[]) ?? [])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const color = (row as any).colors
          if (!color) continue
          const entry = colorsByCatalogId.get(row.catalog_id) ?? { names: [], codes: [] }
          entry.names.push(color.color_name)
          entry.codes.push(color.color_code)
          colorsByCatalogId.set(row.catalog_id, entry)
        }
      }

      const inventoryRows = inventoryBatchResults.flat()

      const priceByCatalogId = new Map<string, { min: number; max: number; symbol: string | null }>()
      for (const { data: priceRows, error: priceErr } of (priceBatchResults as any[])) {
        if (priceErr) {
          console.warn("Failed to fetch active prices:", priceErr.message)
          continue
        }
        for (const p of ((priceRows as any[]) ?? [])) {
          if (p.price == null || p.catalog_id == null) continue
          const existing = priceByCatalogId.get(p.catalog_id)
          if (!existing) {
            priceByCatalogId.set(p.catalog_id, { min: p.price, max: p.price, symbol: p.currency_symbol })
          } else {
            existing.min = Math.min(existing.min, p.price)
            existing.max = Math.max(existing.max, p.price)
          }
        }
      }

      // ── Build the Product Code → SKU → Serial hierarchy (images intentionally empty) ──
      const groupMap = new Map<string, PptProductCodeGroup>()

      for (const row of catalogRows) {
        if (!row.product_code) continue
        let group = groupMap.get(row.product_code)
        if (!group) {
          const colors = colorsByCatalogId.get(row.id)
          group = {
            productCode: row.product_code,
            productName: row.product_type_id ? productTypeMap.get(row.product_type_id) ?? null : null,
            productTypeId: row.product_type_id,
            qualityName: row.quality_id ? qualityMap.get(row.quality_id) ?? null : null,
            qualityId: row.quality_id,
            designName: row.design_id ? designMap.get(row.design_id) ?? null : null,
            designId: row.design_id,
            collectionName: row.collection_id ? collectionMap.get(row.collection_id) ?? null : null,
            collectionId: row.collection_id,
            constructionName: row.construction_id ? constructionMap.get(row.construction_id) ?? null : null,
            constructionId: row.construction_id,
            colorNames: colors ? colors.names.join(" / ") : null,
            colorCodes: colors ? colors.codes.join("X") : null,
            isActive: true,
            skus: [],
            allImageUrls: [],
            coverImageUrl: null,
            minPrice: null,
            maxPrice: null,
            currencySymbol: null,
          }
          groupMap.set(row.product_code, group)
        }

        const priceInfo = priceByCatalogId.get(row.id)
        if (priceInfo) {
          group.minPrice = group.minPrice == null ? priceInfo.min : Math.min(group.minPrice, priceInfo.min)
          group.maxPrice = group.maxPrice == null ? priceInfo.max : Math.max(group.maxPrice, priceInfo.max)
          group.currencySymbol = group.currencySymbol ?? priceInfo.symbol
        }

        const sku: PptSkuGroup = {
          catalogId: row.id,
          sku: row.sku ?? "",
          sizeLabel: row.size_id ? sizeMap.get(row.size_id) ?? null : null,
          serials: [],
        }
        group.skus.push(sku)
      }

      const skuByCatalogId = new Map<string, PptSkuGroup>()
      for (const group of groupMap.values()) {
        for (const sku of group.skus) skuByCatalogId.set(sku.catalogId, sku)
      }

      for (const inv of inventoryRows) {
        if (!inv.catalog_id || !inv.serial_number) continue
        const sku = skuByCatalogId.get(inv.catalog_id)
        if (!sku) continue
        sku.serials.push({
          inventoryId: inv.id,
          serialNumber: inv.serial_number,
          locationName: inv.location_id ? locationMap.get(inv.location_id) ?? null : null,
          imageUrls: [],
        })
      }

      // Track each Product Code's full inventory id list so images can be fetched lazily later.
      for (const group of groupMap.values()) {
        const ids = group.skus.flatMap((s) => s.serials.map((se) => se.inventoryId))
        inventoryIdsByProductCodeRef.current.set(group.productCode, ids)
      }

      setProductCodes(Array.from(groupMap.values()))
    } catch (err) {
      console.error("Product code catalog fetch failed:", err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to load products: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStructuralData()
  }, [fetchStructuralData])

  // ── Lazy pass: fetch images only for a Product Code once it's actually needed on screen ──
  const ensureImagesLoaded = useCallback((productCode: string) => {
    if (imagesFetchedRef.current.has(productCode)) return
    const inventoryIds = inventoryIdsByProductCodeRef.current.get(productCode)
    if (!inventoryIds || inventoryIds.length === 0) {
      imagesFetchedRef.current.add(productCode)
      return
    }

    imagesFetchedRef.current.add(productCode)
    setLoadingImagesFor((prev) => new Set(prev).add(productCode))

    ;(async () => {
      try {
        const { data: imageRows, error: imgErr } = await (supabase
          .from("inventory_images" as any) as any)
          .select("inventory_id, public_url, sort_order")
          .in("inventory_id", inventoryIds)
          .order("sort_order", { ascending: true })

        if (imgErr) throw new Error(imgErr.message)

        const imageMap = new Map<string, string[]>()
        for (const img of ((imageRows as any[]) ?? [])) {
          const list = imageMap.get(img.inventory_id) ?? []
          list.push(img.public_url)
          imageMap.set(img.inventory_id, list)
        }

        setProductCodes((prev) =>
          prev.map((group) => {
            if (group.productCode !== productCode) return group
            const pooled: string[] = []
            const skus = group.skus.map((sku) => ({
              ...sku,
              serials: sku.serials.map((serial) => {
                const urls = imageMap.get(serial.inventoryId) ?? []
                pooled.push(...urls)
                return { ...serial, imageUrls: urls }
              }),
            }))
            const allImageUrls = Array.from(new Set(pooled))
            return { ...group, skus, allImageUrls, coverImageUrl: allImageUrls[0] ?? null }
          })
        )
      } catch (err) {
        console.error(`Failed to load images for Product Code ${productCode}:`, err)
        imagesFetchedRef.current.delete(productCode) // allow retry
      } finally {
        setLoadingImagesFor((prev) => {
          const next = new Set(prev)
          next.delete(productCode)
          return next
        })
      }
    })()
  }, [])

  return {
    productCodes,
    isLoading,
    error,
    refetch: fetchStructuralData,
    ensureImagesLoaded,
    loadingImagesFor,
  }
}
