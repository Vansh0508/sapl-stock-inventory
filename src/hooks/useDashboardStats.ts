"use client"

import { useState, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase/client"
import { useTableRealtime } from "@/lib/supabase/realtime"

export interface NameCount {
  name: string
  skus: number
  pieces: number
}

export interface NameValue {
  name: string
  value: number
}

export interface LocationStat {
  id: string
  name: string
  country: string
  pieces: number
  value: number
  avgPrice: number
  currency: string
}

export interface MonthPoint {
  month: string
  /** ISO date of the first day of the month — time-series charts need a real date on the x-axis. */
  date: string
  catalog: number
  inventory: number
}

export interface Trend {
  value: number
  direction: "up" | "down"
}

export interface DashboardStats {
  totalSkus: number
  activeSkus: number
  discontinuedSkus: number
  totalPieces: number
  totalLocations: number
  totalCollections: number
  totalDesigns: number
  totalQualities: number
  totalConstructions: number
  totalColors: number
  totalFibers: number
  totalProductTypes: number
  avgPiecesPerSku: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  totalInventoryValue: number
  pricedCatalogCount: number
  byProductType: NameCount[]
  byCollection: NameCount[]
  byQuality: NameCount[]
  byConstruction: NameCount[]
  byColor: NameValue[]
  byLocation: LocationStat[]
  byCountry: NameValue[]
  statusSplit: NameValue[]
  growth: MonthPoint[]
  skuTrend: Trend | null
  pieceTrend: Trend | null
}

const EMPTY_STATS: DashboardStats = {
  totalSkus: 0,
  activeSkus: 0,
  discontinuedSkus: 0,
  totalPieces: 0,
  totalLocations: 0,
  totalCollections: 0,
  totalDesigns: 0,
  totalQualities: 0,
  totalConstructions: 0,
  totalColors: 0,
  totalFibers: 0,
  totalProductTypes: 0,
  avgPiecesPerSku: 0,
  avgPrice: 0,
  minPrice: 0,
  maxPrice: 0,
  totalInventoryValue: 0,
  pricedCatalogCount: 0,
  byProductType: [],
  byCollection: [],
  byQuality: [],
  byConstruction: [],
  byColor: [],
  byLocation: [],
  byCountry: [],
  statusSplit: [],
  growth: [],
  skuTrend: null,
  pieceTrend: null,
}

function monthKey(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-")
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

function periodTrend(totalNow: number, addedThisPeriod: number): Trend | null {
  const previousTotal = totalNow - addedThisPeriod
  if (addedThisPeriod <= 0 || previousTotal <= 0) return null
  return { value: (addedThisPeriod / previousTotal) * 100, direction: "up" }
}

function bump<T extends string>(map: Map<T, { skus: number; pieces: number }>, key: T, field: "skus" | "pieces") {
  const entry = map.get(key) ?? { skus: 0, pieces: 0 }
  entry[field] += 1
  map.set(key, entry)
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = async (table: string) => {
    let allData: any[] = []
    let from = 0
    let hasMore = true
    while (hasMore) {
      const { data, error } = await (supabase.from(table as any) as any).select("*").range(from, from + 999)
      if (error) throw error
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
    return allData
  }

  const fetchStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [
        catalogRows,
        inventoryRows,
        priceRows,
        locationRows,
        collectionsRes,
        designsRes,
        qualitiesRes,
        constructionsRes,
        colorsRes,
        fibersRes,
        productTypesRes,
      ] = await Promise.all([
        fetchAll("view_catalog_full"),
        fetchAll("view_inventory_gallery"),
        fetchAll("view_active_prices"),
        fetchAll("locations"),
        (supabase.from("collections" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("designs" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("qualities" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("constructions" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("colors" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("fiber_list" as any) as any).select("*", { count: "exact", head: true }),
        (supabase.from("product_types" as any) as any).select("*", { count: "exact", head: true }),
      ])

      // ── Catalog-level aggregates ──────────────────────────────────────
      const totalSkus = catalogRows.length
      const activeSkus = catalogRows.filter((r) => r.is_active).length
      const discontinuedSkus = totalSkus - activeSkus

      const productTypeMap = new Map<string, { skus: number; pieces: number }>()
      const collectionMap = new Map<string, { skus: number; pieces: number }>()
      const qualityMap = new Map<string, { skus: number; pieces: number }>()
      const constructionMap = new Map<string, { skus: number; pieces: number }>()
      const colorMap = new Map<string, number>()

      for (const row of catalogRows) {
        bump(productTypeMap, row.product_name ?? "Unspecified", "skus")
        bump(collectionMap, row.collection_name ?? "Unassigned", "skus")
        bump(qualityMap, row.quality_name ?? "Unspecified", "skus")
        bump(constructionMap, row.construction_name ?? "Unspecified", "skus")

        if (row.color_names) {
          for (const c of (row.color_names as string).split(",").map((s: any) => s.trim()).filter(Boolean)) {
            colorMap.set(c, (colorMap.get(c) ?? 0) + 1)
          }
        }
      }

      // ── Inventory-level aggregates (physical pieces) ─────────────────
      const totalPieces = inventoryRows.length
      const locationMap = new Map<string, { name: string; country: string; pieces: number; value: number; currency: string }>()
      const countryMap = new Map<string, number>()

      // price lookup keyed by catalog_id + location_id for per-piece valuation
      const priceLookup = new Map<string, number>()
      for (const p of priceRows) {
        if (p.catalog_id && p.location_id && p.price != null) {
          priceLookup.set(`${p.catalog_id}_${p.location_id}`, p.price)
        }
      }

      for (const row of inventoryRows) {
        if (row.product_name) bump(productTypeMap, row.product_name, "pieces")
        if (row.collection_name) bump(collectionMap, row.collection_name, "pieces")
        if (row.quality_name) bump(qualityMap, row.quality_name, "pieces")

        const locId = row.location_id ?? "unknown"
        const locEntry = locationMap.get(locId) ?? {
          name: row.location_name ?? "Unknown",
          country: row.location_country ?? "—",
          pieces: 0,
          value: 0,
          currency: row.currency_symbol ?? "",
        }
        locEntry.pieces += 1
        const price = row.catalog_id && row.location_id ? priceLookup.get(`${row.catalog_id}_${row.location_id}`) : undefined
        if (price) locEntry.value += price
        locationMap.set(locId, locEntry)

        const country = row.location_country ?? "Unknown"
        countryMap.set(country, (countryMap.get(country) ?? 0) + 1)
      }

      // ── Pricing aggregates ────────────────────────────────────────────
      const prices = priceRows.map((p) => p.price).filter((p): p is number => p != null)
      const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
      const minPrice = prices.length ? Math.min(...prices) : 0
      const maxPrice = prices.length ? Math.max(...prices) : 0
      const pricedCatalogCount = new Set(priceRows.map((p) => p.catalog_id).filter(Boolean)).size
      const totalInventoryValue = Array.from(locationMap.values()).reduce((sum, l) => sum + l.value, 0)

      // ── Growth over time ──────────────────────────────────────────────
      const catalogMonthMap = new Map<string, number>()
      for (const row of catalogRows) {
        const key = monthKey(row.created_at)
        if (key) catalogMonthMap.set(key, (catalogMonthMap.get(key) ?? 0) + 1)
      }
      const inventoryMonthMap = new Map<string, number>()
      for (const row of inventoryRows) {
        const key = monthKey(row.created_at)
        if (key) inventoryMonthMap.set(key, (inventoryMonthMap.get(key) ?? 0) + 1)
      }
      const allMonths = Array.from(new Set([...catalogMonthMap.keys(), ...inventoryMonthMap.keys()])).sort()
      const growth: MonthPoint[] = allMonths.slice(-12).map((key) => ({
        month: monthLabel(key),
        date: `${key}-01`,
        catalog: catalogMonthMap.get(key) ?? 0,
        inventory: inventoryMonthMap.get(key) ?? 0,
      }))

      const currentMonthKey = allMonths[allMonths.length - 1]
      const skuTrend = currentMonthKey ? periodTrend(totalSkus, catalogMonthMap.get(currentMonthKey) ?? 0) : null
      const pieceTrend = currentMonthKey ? periodTrend(totalPieces, inventoryMonthMap.get(currentMonthKey) ?? 0) : null

      const toNameCount = (map: Map<string, { skus: number; pieces: number }>): NameCount[] =>
        Array.from(map.entries())
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.skus - a.skus)

      setStats({
        totalSkus,
        activeSkus,
        discontinuedSkus,
        totalPieces,
        totalLocations: locationRows.length,
        totalCollections: collectionsRes.count ?? 0,
        totalDesigns: designsRes.count ?? 0,
        totalQualities: qualitiesRes.count ?? 0,
        totalConstructions: constructionsRes.count ?? 0,
        totalColors: colorsRes.count ?? 0,
        totalFibers: fibersRes.count ?? 0,
        totalProductTypes: productTypesRes.count ?? 0,
        avgPiecesPerSku: totalSkus ? totalPieces / totalSkus : 0,
        avgPrice,
        minPrice,
        maxPrice,
        totalInventoryValue,
        pricedCatalogCount,
        byProductType: toNameCount(productTypeMap).slice(0, 10),
        byCollection: toNameCount(collectionMap).slice(0, 10),
        byQuality: toNameCount(qualityMap).slice(0, 10),
        byConstruction: toNameCount(constructionMap).slice(0, 10),
        byColor: Array.from(colorMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
        byLocation: Array.from(locationMap.entries())
          .map(([id, v]) => ({
            id,
            name: v.name,
            country: v.country,
            pieces: v.pieces,
            value: v.value,
            avgPrice: v.pieces ? v.value / v.pieces : 0,
            currency: v.currency,
          }))
          .sort((a, b) => b.pieces - a.pieces),
        byCountry: Array.from(countryMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        statusSplit: [
          { name: "Active", value: activeSkus },
          { name: "Discontinued", value: discontinuedSkus },
        ],
        growth,
        skuTrend,
        pieceTrend,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useTableRealtime("catalog", fetchStats)
  useTableRealtime("inventory", fetchStats)
  useTableRealtime("prices", fetchStats)

  return { stats, isLoading, error, refetch: fetchStats }
}
