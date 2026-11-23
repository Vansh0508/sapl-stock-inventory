"use client"

import { useMemo } from "react"
import { Spinner, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  BarXAxis,
  BarYAxis,
  ChartTooltip,
  Grid,
  PieChart,
  PieCenter,
  PieSlice,
  XAxis,
} from "@/components/charts"
import ChartCard from "./ChartCard"
import { useDashboardStats, type LocationStat, type NameCount } from "@/hooks/useDashboardStats"

const numberFmt = new Intl.NumberFormat("en-US")
const formatNumber = (n: number) => numberFmt.format(Math.round(n))
const formatMoney = (n: number, symbol = "") =>
  `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n))}`

// Bklit theme tokens (see the chart block in globals.css)
const PRIMARY = "var(--chart-line-primary)"
const SECONDARY = "var(--chart-4)"

// Category charts stay readable with a handful of bars; the location table below lists everything.
const MAX_BARS = 8

/** Skus + pieces tooltip rows for the category bar charts. */
const skuPieceRows = (point: Record<string, unknown>) => [
  { color: PRIMARY, label: "SKUs", value: formatNumber(Number(point.skus ?? 0)) },
  { color: SECONDARY, label: "Pieces", value: formatNumber(Number(point.pieces ?? 0)) },
]

const toBarData = (rows: NameCount[]) =>
  rows.slice(0, MAX_BARS).map((r) => ({ name: r.name, skus: r.skus, pieces: r.pieces }))

const LegendDot = ({ color, label, value }: { color: string; label: string; value?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
    {value && <span className="font-semibold text-zinc-800 tabular-nums">{value}</span>}
  </span>
)

const EmptyChart = ({ message }: { message: string }) => (
  <div className="flex h-48 items-center justify-center">
    <Typography.Paragraph size="sm" className="text-zinc-400">
      {message}
    </Typography.Paragraph>
  </div>
)

export default function DashboardTab() {
  const { stats, isLoading, error } = useDashboardStats()
  const chartStatus = isLoading ? "loading" : "ready"

  const growthData = useMemo(
    () =>
      stats.growth.map((p) => {
        // Local-time month start, so the axis never slips into the previous month west of UTC
        const [year, month] = p.date.split("-").map(Number)
        return { date: new Date(year, month - 1, 1), catalog: p.catalog, inventory: p.inventory }
      }),
    [stats.growth]
  )

  const locationData = useMemo(
    () => stats.byLocation.slice(0, MAX_BARS).map((l) => ({ name: l.name, pieces: l.pieces })),
    [stats.byLocation]
  )
  const productTypeData = useMemo(() => toBarData(stats.byProductType), [stats.byProductType])
  const collectionData = useMemo(() => toBarData(stats.byCollection), [stats.byCollection])
  const qualityData = useMemo(() => toBarData(stats.byQuality), [stats.byQuality])

  const statusData = useMemo(
    () => [
      { label: "Active", value: stats.activeSkus, color: PRIMARY },
      { label: "Discontinued", value: stats.discontinuedSkus, color: SECONDARY },
    ],
    [stats.activeSkus, stats.discontinuedSkus]
  )

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

  const skuPieceLegend = (
    <div className="flex items-center gap-3">
      <LegendDot color={PRIMARY} label="SKUs" />
      <LegendDot color={SECONDARY} label="Pieces" />
    </div>
  )

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-zinc-50/30">
      <div className="flex flex-col gap-4 px-4 py-5 md:px-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <Typography.Paragraph size="sm" className="text-red-700">
              {error}
            </Typography.Paragraph>
          </div>
        )}

        {/* ── Growth + SKU status ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard
            title="Catalog & Inventory Growth"
            description="SKUs and pieces added per month (last 12 months)"
            className="lg:col-span-2"
            action={
              <div className="flex items-center gap-3">
                <LegendDot color={PRIMARY} label="SKUs" />
                <LegendDot color={SECONDARY} label="Pieces" />
              </div>
            }
          >
            {!isLoading && growthData.length < 2 ? (
              <EmptyChart message="Not enough history to chart yet" />
            ) : (
              <AreaChart
                data={growthData}
                status={chartStatus}
                aspectRatio="5 / 2"
                margin={{ top: 16, right: 16, bottom: 32, left: 16 }}
              >
                <Grid horizontal />
                <Area dataKey="catalog" fill={PRIMARY} strokeWidth={2} fillOpacity={0.3} />
                <Area dataKey="inventory" fill={SECONDARY} strokeWidth={2} fillOpacity={0.2} />
                <XAxis />
                <ChartTooltip
                  rows={(p) => [
                    { color: PRIMARY, label: "SKUs added", value: formatNumber(Number(p.catalog ?? 0)) },
                    { color: SECONDARY, label: "Pieces added", value: formatNumber(Number(p.inventory ?? 0)) },
                  ]}
                />
              </AreaChart>
            )}
          </ChartCard>

          <ChartCard title="SKU Status" description="Active vs discontinued catalog entries">
            {isLoading ? (
              <div className="flex h-56 items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : stats.totalSkus === 0 ? (
              <EmptyChart message="No catalog entries" />
            ) : (
              <div className="flex flex-col items-center gap-4 py-2">
                <PieChart data={statusData} size={220} innerRadius={72} padAngle={0.02} cornerRadius={4}>
                  {statusData.map((s, i) => (
                    <PieSlice key={s.label} index={i} />
                  ))}
                  <PieCenter defaultLabel="SKUs" />
                </PieChart>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  {statusData.map((s) => (
                    <LegendDot key={s.label} color={s.color} label={s.label} value={formatNumber(s.value)} />
                  ))}
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        {/* ── Where stock sits / what it is ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Pieces by Location" description={`Top ${MAX_BARS} locations by physical piece count`}>
            {!isLoading && locationData.length === 0 ? (
              <EmptyChart message="No location data" />
            ) : (
              <BarChart
                data={locationData}
                xDataKey="name"
                orientation="horizontal"
                status={chartStatus}
                aspectRatio="2 / 1"
                margin={{ top: 8, right: 24, bottom: 8, left: 84 }}
              >
                <Grid vertical />
                <Bar dataKey="pieces" fill={PRIMARY} lineCap="round" />
                <BarYAxis />
                <ChartTooltip
                  rows={(p) => [{ color: PRIMARY, label: "Pieces", value: formatNumber(Number(p.pieces ?? 0)) }]}
                />
              </BarChart>
            )}
          </ChartCard>

          <ChartCard title="Product Types" description="SKUs and pieces per product type" action={skuPieceLegend}>
            {!isLoading && productTypeData.length === 0 ? (
              <EmptyChart message="No product types" />
            ) : (
              <BarChart
                data={productTypeData}
                xDataKey="name"
                status={chartStatus}
                aspectRatio="2 / 1"
                margin={{ top: 16, right: 16, bottom: 36, left: 16 }}
              >
                <Grid horizontal />
                <Bar dataKey="skus" fill={PRIMARY} lineCap="round" />
                <Bar dataKey="pieces" fill={SECONDARY} lineCap="round" />
                <BarXAxis />
                <ChartTooltip rows={skuPieceRows} />
              </BarChart>
            )}
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Top Collections" description={`Top ${MAX_BARS} collections by SKU count`} action={skuPieceLegend}>
            {!isLoading && collectionData.length === 0 ? (
              <EmptyChart message="No collections" />
            ) : (
              <BarChart
                data={collectionData}
                xDataKey="name"
                orientation="horizontal"
                status={chartStatus}
                aspectRatio="2 / 1"
                margin={{ top: 8, right: 24, bottom: 8, left: 84 }}
              >
                <Grid vertical />
                <Bar dataKey="skus" fill={PRIMARY} lineCap="round" />
                <Bar dataKey="pieces" fill={SECONDARY} lineCap="round" />
                <BarYAxis />
                <ChartTooltip rows={skuPieceRows} />
              </BarChart>
            )}
          </ChartCard>

          <ChartCard title="Top Qualities" description={`Top ${MAX_BARS} qualities by SKU count`} action={skuPieceLegend}>
            {!isLoading && qualityData.length === 0 ? (
              <EmptyChart message="No qualities" />
            ) : (
              <BarChart
                data={qualityData}
                xDataKey="name"
                orientation="horizontal"
                status={chartStatus}
                aspectRatio="2 / 1"
                margin={{ top: 8, right: 24, bottom: 8, left: 84 }}
              >
                <Grid vertical />
                <Bar dataKey="skus" fill={PRIMARY} lineCap="round" />
                <Bar dataKey="pieces" fill={SECONDARY} lineCap="round" />
                <BarYAxis />
                <ChartTooltip rows={skuPieceRows} />
              </BarChart>
            )}
          </ChartCard>
        </div>

        {/* ── Location breakdown ─────────────────────────────────────────── */}
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
      </div>
    </div>
  )
}
