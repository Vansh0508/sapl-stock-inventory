"use client"

import { useEffect, useMemo, useState } from "react"
import { Chip, Dropdown, Table, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { usePrices, type PriceRow } from "@/hooks/usePrices"
import type { InventoryRowWithDetails } from "@/hooks/useInventory"
import PriceModal from "./PriceModal"

interface LocationOption {
  id: string
  location_name: string
  country: string
  currency_id: string
  currency_symbol: string
}

interface PriceGridProps {
  catalogId: string
  rows: InventoryRowWithDetails[]
  /** Whole product has been discontinued — dims the entire grid and blocks edits. */
  isDiscontinued?: boolean
}

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)

export default function PriceGrid({ catalogId, rows, isDiscontinued = false }: PriceGridProps) {
  const { prices, isLoading, fetchPrices, upsertPrice } = usePrices(catalogId)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoaded, setLocationsLoaded] = useState(false)
  const [activeLocationIds, setActiveLocationIds] = useState<string[]>([])
  const [seeded, setSeeded] = useState(false)

  const [modalTarget, setModalTarget] = useState<{
    row: InventoryRowWithDetails
    location: LocationOption
    existing: PriceRow | null
  } | null>(null)

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  useEffect(() => {
    ;(supabase.from("locations" as any) as any)
      .select("id, location_name, country, currency_id, currencies(symbol)")
      .order("location_name")
      .then(({ data }: any) => {
        const mapped: LocationOption[] = ((data as any[]) ?? []).map((l: any) => ({
          id: l.id,
          location_name: l.location_name,
          country: l.country,
          currency_id: l.currency_id,
          currency_symbol: (l.currencies as { symbol: string } | null)?.symbol ?? "",
        }))
        setLocations(mapped)
        setLocationsLoaded(true)
      })
  }, [])

  // Seed the visible location rows from whichever locations already have
  // priced entries for this catalog row, once — after that the user drives
  // the row set explicitly via "Add Location". Waits for both the prices
  // fetch and the locations fetch to finish so it never seeds off a
  // still-empty `prices` array on the very first render.
  useEffect(() => {
    if (seeded || isLoading || !locationsLoaded) return
    const existingLocationIds = Array.from(new Set(prices.map((p) => p.location_id)))
    if (existingLocationIds.length > 0) setActiveLocationIds(existingLocationIds)
    setSeeded(true)
  }, [prices, isLoading, locationsLoaded, seeded])

  const isReady = seeded && locationsLoaded && !isLoading

  const activeLocations = useMemo(
    () => activeLocationIds.map((id) => locations.find((l) => l.id === id)).filter((l): l is LocationOption => !!l),
    [activeLocationIds, locations]
  )

  // Only offer locations that haven't already been added as a row for this catalog's grid.
  const availableToAdd = useMemo(
    () => locations.filter((l) => !activeLocationIds.includes(l.id)),
    [locations, activeLocationIds]
  )

  const priceFor = (inventoryId: string, locationId: string): PriceRow | null =>
    prices.find((p) => p.inventory_id === inventoryId && p.location_id === locationId) ?? null

  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-500">Pricing</Typography.Paragraph>
          {isDiscontinued && (
            <Chip color="default" variant="soft" size="sm">
              <Chip.Label>Discontinued</Chip.Label>
            </Chip>
          )}
        </div>

        <Dropdown>
          <Dropdown.Trigger
            isDisabled={availableToAdd.length === 0 || isDiscontinued}
            className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50/60 transition-all cursor-pointer border border-dashed border-zinc-200 hover:border-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Add location row"
          >
            <PlusIcon />
            Add Location
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end" className="min-w-[220px]">
            <Dropdown.Menu
              aria-label="Select a location to add"
              onAction={(key) => setActiveLocationIds((prev) => [...prev, String(key)])}
            >
              {availableToAdd.map((l) => (
                <Dropdown.Item
                  key={l.id}
                  id={l.id}
                  className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-zinc-50 data-[focused]:bg-indigo-50"
                >
                  {l.location_name} · {l.country}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      {!isReady ? (
        <Typography.Paragraph size="xs" className="text-zinc-400">Loading pricing…</Typography.Paragraph>
      ) : activeLocations.length === 0 ? (
        <Typography.Paragraph size="xs" className="text-zinc-400 italic">
          No location rows yet — use &quot;Add Location&quot; to start pricing.
        </Typography.Paragraph>
      ) : (
        <div className={cn("w-full", isDiscontinued && "opacity-50 grayscale pointer-events-none")}>
          <Table>
            <Table.ResizableContainer>
              <Table.Content aria-label="Pricing by location and serial number">
                <Table.Header>
                  <Table.Column id="location" isRowHeader minWidth={130} defaultWidth={140}>
                    Location
                  </Table.Column>
                  {rows.map((row) => (
                    <Table.Column key={row.id} id={row.id} minWidth={110} defaultWidth="1fr">
                      <span className={cn("flex flex-col items-center gap-0.5", row.is_sold && "opacity-40 blur-[0.4px]")}>
                        <Typography.Code weight="medium" className="text-xs">{row.serial_number}</Typography.Code>
                        {row.is_sold && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600">Sold</span>
                        )}
                      </span>
                    </Table.Column>
                  ))}
                </Table.Header>
                <Table.Body>
                  {activeLocations.map((loc) => (
                    <Table.Row key={loc.id} id={loc.id}>
                      <Table.Cell>
                        <div className="flex flex-col">
                          <Typography.Paragraph size="xs" weight="semibold" className="text-zinc-700">{loc.location_name}</Typography.Paragraph>
                          <Typography.Paragraph size="xs" className="text-zinc-400">{loc.currency_symbol}</Typography.Paragraph>
                        </div>
                      </Table.Cell>
                      {rows.map((row) => {
                        const existing = priceFor(row.id, loc.id)
                        return (
                          <Table.Cell key={row.id} className={cn("text-center", row.is_sold && "opacity-40 blur-[0.4px]")}>
                            {existing ? (
                              <button
                                type="button"
                                onClick={() => !isDiscontinued && setModalTarget({ row, location: loc, existing })}
                                className="w-full text-sm font-medium text-zinc-800 hover:text-indigo-600 transition-colors cursor-pointer text-center"
                              >
                                {loc.currency_symbol} {existing.price.toLocaleString("en-IN")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => !isDiscontinued && setModalTarget({ row, location: loc, existing: null })}
                                className="flex items-center justify-center gap-1 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50/60 transition-all cursor-pointer text-[11px] font-medium h-7 w-full rounded-lg border border-dashed border-zinc-200 hover:border-indigo-300"
                                aria-label="Add price"
                              >
                                <PlusIcon />
                                Add
                              </button>
                            )}
                          </Table.Cell>
                        )
                      })}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ResizableContainer>
          </Table>
        </div>
      )}

      {modalTarget && (
        <PriceModal
          isOpen={!!modalTarget}
          onOpenChange={(open) => !open && setModalTarget(null)}
          catalogId={catalogId}
          inventoryId={modalTarget.row.id}
          serialNumber={modalTarget.row.serial_number}
          locationId={modalTarget.location.id}
          locationName={modalTarget.location.location_name}
          currencyId={modalTarget.location.currency_id}
          currencySymbol={modalTarget.location.currency_symbol}
          existingPrice={modalTarget.existing}
          onSaved={(saved) => {
            upsertPrice(saved)
            setModalTarget(null)
          }}
        />
      )}
    </div>
  )
}
