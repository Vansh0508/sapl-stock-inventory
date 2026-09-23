"use client"

import { useMemo } from "react"
import { Chip, Spinner, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import StatCard from "./StatCard"
import ChartCard from "./ChartCard"
import {
  useDashboardStats,
  type LocationStat,
  type RecentCatalogRow,
  type TopPricedRow,
} from "@/hooks/useDashboardStats"

const numberFmt = new Intl.NumberFormat("en-US")
const formatNumber = (n: number) => numberFmt.format(Math.round(n))
const formatMoney = (n: number, symbol = "") =>
  `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n))}`

export default function DashboardTab() {
  const { stats, isLoading, error } = useDashboardStats()

  const recentColumns = useMemo<ColumnDef<RecentCatalogRow, unknown>[]>(() => {
    const h = createColumnHelper<RecentCatalogRow>()
    return [
      h.accessor("sku", {
        header: "SKU",
        cell: (i) => (
          <Typography.Paragraph size="sm" weight="medium">
            {i.getValue() ?? "—"}
          </Typography.Paragraph>
        ),
      }),
      h.accessor("product_name", { header: "Product Type", cell: (i) => i.getValue() ?? "—" }),
      h.accessor("collection_name", { header: "Collection", cell: (i) => i.getValue() ?? "—" }),
      h.accessor("quality_name", { header: "Quality", cell: (i) => i.getValue() ?? "—" }),
      h.accessor("is_active", {
        header: "Status",
        cell: (i) => (
          <Chip color={i.getValue() ? "success" : "default"} variant="soft" size="sm">
            <Chip.Label>{i.getValue() ? "Active" : "Discontinued"}</Chip.Label>
          </Chip>
        ),
      }),
      h.accessor("created_at", {
        header: "Added",
        cell: (i) => {
          const v = i.getValue()
          return v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"
        },
      }),
    ] as ColumnDef<RecentCatalogRow, unknown>[]
  }, [])

  const priceColumns = useMemo<ColumnDef<TopPricedRow, unknown>[]>(() => {
    const h = createColumnHelper<TopPricedRow>()
    return [
      h.accessor("sku", {
        header: "SKU",
        cell: (i) => (
          <Typography.Paragraph size="sm" weight="medium">
            {i.getValue() ?? "—"}
          </Typography.Paragraph>
        ),
      }),
      h.accessor("location_name", { header: "Location", cell: (i) => i.getValue() ?? "—" }),
      h.accessor("price", {
        header: "Price",
        cell: (i) => (
          <Typography.Paragraph size="sm" weight="medium" className="tabular-nums">
            {formatMoney(i.getValue(), i.row.original.currency_symbol ?? "")}
          </Typography.Paragraph>
        ),
      }),
    ] as ColumnDef<TopPricedRow, unknown>[]
  }, [])

  const locationColumns = useMemo<ColumnDef<LocationStat, unknown>[]>(() => {
    const h = createColumnHelper<LocationStat>()
    return [
      h.accessor("name", {
        header: "Location",
        cell: (i) => (
          <Typography.Paragraph size="sm" weight="medium">
            {i.getValue()}
          </Typography.Paragraph>
        ),
      }),
      h.accessor("country", { header: "Country", cell: (i) => i.getValue() || "—" }),
      h.accessor("pieces", {
        header: "Pieces",
        cell: (i) => (
          <Typography.Paragraph size="sm" className="tabular-nums">
            {formatNumber(i.getValue())}
          </Typography.Paragraph>
        ),
      }),
      h.accessor("avgPrice", {
        header: "Avg. Price",
        cell: (i) => (
          <Typography.Paragraph size="sm" className="tabular-nums">
            {i.getValue() ? formatMoney(i.getValue(), i.row.original.currency) : "—"}
          </Typography.Paragraph>
        ),
      }),
      h.accessor("value", {
        header: "Est. Value",
        cell: (i) => (
          <Typography.Paragraph size="sm" weight="medium" className="tabular-nums">
            {i.getValue() ? formatMoney(i.getValue(), i.row.original.currency) : "—"}
          </Typography.Paragraph>
        ),
      }),
    ] as ColumnDef<LocationStat, unknown>[]
  }, [])

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-zinc-50/30">
      <div className="flex flex-col gap-6 px-4 py-5 md:px-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-betweenend">
          {isLoading && <Spinner size="sm" />}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <Typography.Paragraph size="sm" className="text-red-700">
              {error}
            </Typography.Paragraph>
          </div>
        )}

        {/* ── KPI cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <StatCard label="Total SKUs" value={formatNumber(stats.totalSkus)} trend={stats.skuTrend} />
          <StatCard label="Discontinued" value={formatNumber(stats.discontinuedSkus)} />
          <StatCard label="Inventory Pieces" value={formatNumber(stats.totalPieces)} trend={stats.pieceTrend} />
          <StatCard label="Locations" value={formatNumber(stats.totalLocations)} />
          <StatCard label="Avg. Price" value={formatMoney(stats.avgPrice)} />
          <StatCard label="Est. Inventory Value" value={formatMoney(stats.totalInventoryValue)} />
        </div>

        {/* ── Dictionary counts ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Collections" value={formatNumber(stats.totalCollections)} />
          <StatCard label="Designs" value={formatNumber(stats.totalDesigns)} />
          <StatCard label="Qualities" value={formatNumber(stats.totalQualities)} />
          <StatCard label="Constructions" value={formatNumber(stats.totalConstructions)} />
          <StatCard label="Colors" value={formatNumber(stats.totalColors)} />
          <StatCard label="Fibers" value={formatNumber(stats.totalFibers)} />
        </div>

        {/* ── Tables ─────────────────────────────────────────────────────── */}
        <ChartCard title="Inventory by Location" description="Piece counts, average price, and estimated value per location">
          <DataTable
            data={stats.byLocation}
            columns={locationColumns}
            ariaLabel="Inventory by location"
            isLoading={isLoading}
            emptyMessage="No location data"
            pageSize={8}
          />
        </ChartCard>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Recently Added SKUs" description="Latest additions to the catalog">
            <DataTable
              data={stats.recentCatalog}
              columns={recentColumns}
              ariaLabel="Recently added SKUs"
              isLoading={isLoading}
              emptyMessage="No catalog entries"
              enablePagination={false}
            />
          </ChartCard>
          <ChartCard title="Highest Priced SKUs" description="Top active prices across all locations">
            <DataTable
              data={stats.topPriced}
              columns={priceColumns}
              ariaLabel="Highest priced SKUs"
              isLoading={isLoading}
              emptyMessage="No pricing data"
              enablePagination={false}
            />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
