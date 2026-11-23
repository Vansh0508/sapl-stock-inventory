"use client"

import type { SortDescriptor } from "@heroui/react"
import type { ColumnDef, SortingState } from "@tanstack/react-table"

import { Checkbox, Dropdown, Pagination, Spinner, Table, Typography } from "@heroui/react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import type { ExpandedState } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { Fragment, useMemo, useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, EllipsisVertical, PencilToSquare, TrashBin } from "@gravity-ui/icons"

// --- Sorting bridge: TanStack <-> React Aria -----------------------------
function toSortDescriptor(sorting: SortingState): SortDescriptor | undefined {
  const first = sorting[0]
  if (!first) return undefined
  return {
    column: first.id,
    direction: first.desc ? "descending" : "ascending",
  }
}

function toSortingState(descriptor: SortDescriptor): SortingState {
  return [{ desc: descriptor.direction === "descending", id: descriptor.column as string }]
}

function getPaginationRange(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 3) return [1, 2, 3, 4, 5, "...", total]
  if (current >= total - 2) return [1, "...", total - 4, total - 3, total - 2, total - 1, total]
  return [1, "...", current - 1, current, current + 1, "...", total]
}

// --- Action icons --------------------------------------------------------
// react-aria's Table wires up `isSelected`/`onChange` for any Checkbox with
// `slot="selection"` automatically via the table's own selection manager —
// driven by the `selectionMode`/`selectedKeys`/`onSelectionChange` props on
// `Table.Content`. Do not pass `isSelected`/`onChange` explicitly here.
const SelectionCheckbox = ({ ariaLabel }: { ariaLabel: string }) => (
  <Checkbox slot="selection" aria-label={ariaLabel}>
    <Checkbox.Content className="flex items-center justify-center">
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
    </Checkbox.Content>
  </Checkbox>
)

// --- Props ---------------------------------------------------------------
export interface DataTableProps<T extends { id: string }> {
  /** Row data (already filtered/searched by the parent). */
  data: T[]
  /** TanStack column definitions — define one per data column. */
  columns: ColumnDef<T, unknown>[]
  /** Accessible label for the table. */
  ariaLabel: string
  /** Loading flag — shown in the empty state while data is fetching. */
  isLoading?: boolean
  /** Message shown when there are no rows and not loading. */
  emptyMessage?: string
  /** Singular noun used in the action buttons' aria-labels (e.g. "Color"). */
  entityName?: string
  /** Rows per page. Defaults to 10. */
  pageSize?: number
  /** Minimum table width (px or percent) before horizontal scroll kicks in. Defaults to "100%". */
  minWidth?: number | string
  /** Enables drag-to-resize column widths. Defaults to true. */
  enableResizing?: boolean
  /** Called when a row is clicked (typically opens the edit modal). */
  onRowClick?: (row: T) => void
  /** When provided, renders an Edit action button per row. */
  onEdit?: (row: T) => void
  /** When provided, renders a Delete action button per row. */
  onDelete?: (row: T) => void
  /** Method to extract sub-rows for expanding row support */
  getSubRows?: (row: T) => T[] | undefined
  /** Renders the pagination footer and paginates the row model. Defaults to true. */
  enablePagination?: boolean
  /** Adds a leading checkbox column driven by the table's native multi-select. */
  enableRowSelection?: boolean
  /** Controlled selected row ids — required when `enableRowSelection` is true. */
  selectedKeys?: Set<string> | "all"
  /** Called when the user toggles a row or the select-all checkbox. */
  onSelectionChange?: (keys: Set<string> | "all") => void
  /**
   * When provided, adds a leading expand toggle column. The returned content
   * renders in a full-width row directly below the expanded row (e.g. a
   * nested DataTable).
   */
  renderSubRow?: (row: T) => ReactNode
  /** Whether the actions column (and row_actions) is sticky right. Defaults to false. */
  stickyActions?: boolean
  /** How columns are sized: 'fixed' uses exact pixels, 'flexible' uses fr units to fill container width. Defaults to 'flexible'. */
  columnWidthMode?: "fixed" | "flexible"
  /** Optional custom class name passed to the Table component. */
  className?: string
  /** Optional max height of the table container (e.g. for vertical scroll). */
  maxHeight?: string | number
  /**
   * When provided, column widths are computed from the content of the current
   * page's rows rather than a static size from the column definition.
   * Receives (columnId, row) and should return the cell's display text.
   */
  getCellText?: (columnId: string, row: T) => string
}

/**
 * Reusable TanStack-powered data table for the Manage dictionary tables.
 * Uses the default HeroUI Table styling — handles client-side sorting and
 * pagination, renders an optional edit/delete actions column, supports
 * row-click, and shows a friendly empty/loading state.
 */
export function DataTable<T extends { id: string }>({
  data,
  columns,
  ariaLabel,
  isLoading = false,
  emptyMessage = "No records found",
  entityName = "record",
  pageSize = 10,
  minWidth = "100%",
  enableResizing = true,
  onRowClick,
  onEdit,
  onDelete,
  getSubRows,
  enablePagination = true,
  enableRowSelection = false,
  selectedKeys,
  onSelectionChange,
  renderSubRow,
  stickyActions = false,
  columnWidthMode = "flexible",
  className,
  maxHeight,
  getCellText,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [expandedSubRows, setExpandedSubRows] = useState<Set<string>>(new Set())
  const storageKey = `sapl_page_size_${entityName || "default"}`

  const [localPageSize, setLocalPageSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed)) return parsed
      }
    }
    return pageSize
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(storageKey)
      if (saved) return
    }
    setLocalPageSize(pageSize)
  }, [pageSize, storageKey])

  const handlePageSizeChange = (newSize: number) => {
    setLocalPageSize(newSize)
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, String(newSize))
    }
  }

  const hasActions = Boolean(onEdit || onDelete)

  const toggleSubRow = (id: string) => {
    setExpandedSubRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Prepend selection/expand columns and append the actions column, as configured.
  const resolvedColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    const result = [...columns]

    if (renderSubRow) {
      const expandColumn: ColumnDef<T, unknown> = {
        id: "__expand",
        header: "",
        enableSorting: false,
        size: 36,
        cell: ({ row }) => (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              toggleSubRow(row.original.id)
            }}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer inline-flex"
            aria-label={expandedSubRows.has(row.original.id) ? "Collapse row" : "Expand row"}
          >
            <ChevronRight width="14" height="14" className={`transition-transform duration-150 ${expandedSubRows.has(row.original.id) ? "rotate-90" : ""}`} />
          </button>
        ),
      }
      result.unshift(expandColumn)
    }

    if (enableRowSelection) {
      const selectionColumn: ColumnDef<T, unknown> = {
        id: "__select",
        header: () => <SelectionCheckbox ariaLabel="Select all rows" />,
        enableSorting: false,
        size: 44,
        cell: () => (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <SelectionCheckbox ariaLabel="Select row" />
          </div>
        ),
      }
      result.unshift(selectionColumn)
    }

    if (hasActions) {
      const actionsColumn: ColumnDef<T, unknown> = {
        id: "actions",
        header: "",
        enableSorting: false,
        size: 44,
        cell: ({ row }) => (
          <div
            className="flex justify-end items-center"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Dropdown>
              <Dropdown.Trigger
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
                aria-label={`${entityName} actions`}
              >
                <EllipsisVertical />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end" className="min-w-[160px]">
                <Dropdown.Menu aria-label={`${entityName} actions`}>
                  {onEdit && (
                    <Dropdown.Item
                      id="edit"
                      onAction={() => onEdit(row.original)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-indigo-50 hover:text-indigo-700 data-[focused]:bg-indigo-50 data-[focused]:text-indigo-700"
                    >
                      <PencilToSquare />
                      Edit
                    </Dropdown.Item>
                  )}
                  {onDelete && (
                    <Dropdown.Item
                      id="delete"
                      onAction={() => onDelete(row.original)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg cursor-pointer outline-hidden hover:bg-red-50 data-[focused]:bg-red-50"
                    >
                      <TrashBin />
                      Delete
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        ),
      }
      result.push(actionsColumn)
    }

    return result
  }, [columns, hasActions, onEdit, onDelete, entityName, enableRowSelection, renderSubRow, expandedSubRows])

  // Column widths are local to this table instance and only ever written by a
  // user's manual drag (see `handleResizeEnd` below) — never seeded with
  // defaults, never shared across tables, and never persisted. Columns
  // without an entry stay flexible (`fr`-based) so the table always fills the
  // available width — fitting the screen as its outer boundary — growing or
  // shrinking as columns are hidden or shown.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<T>({
    columns: resolvedColumns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getSubRows ? getExpandedRowModel() : undefined,
    getSubRows,
    getRowId: (row) => row.id,
    initialState: { pagination: { pageSize: localPageSize } },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    state: { sorting, expanded },
  })

  useEffect(() => {
    table.setPageSize(localPageSize)
  }, [localPageSize, table])

  const sortDescriptor = useMemo(() => toSortDescriptor(sorting), [sorting])

  const { pageIndex } = table.getState().pagination
  const pageCount = enablePagination ? table.getPageCount() : 1
  const paginationRange = enablePagination ? getPaginationRange(pageIndex + 1, pageCount) : []
  const total = data.length
  const start = total === 0 ? 0 : pageIndex * localPageSize + 1
  const end = enablePagination ? Math.min((pageIndex + 1) * localPageSize, total) : total

  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const rows = table.getRowModel().rows
  const rowHeaderIndex = Math.max(
    headers.findIndex((h) => !["__select", "__expand", "actions"].includes(h.column.id)),
    0
  )

  // Compute per-column pixel widths from the current page's visible rows only.
  // This re-runs whenever the page changes (rows reference changes).
  const pageColumnSizes = useMemo(() => {
    if (!getCellText) return {} as Record<string, number>
    const CHAR_W = 8.2
    const PAD = 32
    const SORT_ICON = 24
    const sizes: Record<string, number> = {}
    for (const header of headers) {
      const col = header.column
      if (!col.getCanSort()) continue // skip structural columns
      const colDef = col.columnDef
      const headerLabel = typeof colDef.header === "string" ? colDef.header : col.id
      let maxLen = headerLabel.length
      for (const row of rows) {
        const text = getCellText(col.id, row.original)
        if (text.length > maxLen) maxLen = text.length
      }
      const minWidth = colDef.size ?? 100
      sizes[col.id] = Math.ceil(Math.max(maxLen * CHAR_W + PAD + SORT_ICON, minWidth))
    }
    return sizes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, getCellText])
  // Non-sortable columns are the structural ones (select/expand/actions) —
  // they keep a fixed pixel width. Sortable (real data) columns flex to fill
  // the row via `fr` units unless the user has manually resized them.
  // These props only have an effect inside a `Table.ResizableContainer` —
  // react-aria warns (and ignores them) otherwise, so skip them entirely
  // when resizing is disabled.
  const getColumnWidthProps = (header: (typeof headers)[number]) => {
    if (!enableResizing) return {}
    const isFlexible = header.column.getCanSort()
    // If we have a page-computed size, use it; otherwise fall back to the column def
    const computedSize = getCellText ? (pageColumnSizes[header.column.id] ?? header.column.columnDef.size ?? 100) : (header.column.columnDef.size ?? 100)
    const baseSize = isFlexible ? computedSize : (header.column.columnDef.size ?? 40)
    if (!isFlexible) return { width: baseSize }
    const override = columnWidths[header.column.id]
    if (override != null) return { width: override }
    if (columnWidthMode === "fixed") return { width: baseSize }
    return { defaultWidth: `${baseSize}fr` as const }
  }

  const handleResizeEnd = (widths: Map<string | number, string | number>) => {
    const next = { ...columnWidths }
    widths.forEach((value, key) => {
      const px = typeof value === "number" ? value : parseFloat(value)
      if (!Number.isNaN(px)) next[String(key)] = px
    })
    setColumnWidths(next)
  }

  const tableContent = (
    <Table.Content
      aria-label={ariaLabel}
      style={{ minWidth }}
      sortDescriptor={sortDescriptor}
      onSortChange={(d) => setSorting(toSortingState(d))}
      selectionMode={enableRowSelection ? "multiple" : "none"}
      selectionBehavior="toggle"
      selectedKeys={enableRowSelection ? (selectedKeys ?? new Set<string>()) : undefined}
      onSelectionChange={
        enableRowSelection
          ? (keys) => onSelectionChange?.(keys === "all" ? "all" : new Set(Array.from(keys, String)))
          : undefined
      }
    >
      <Table.Header>
        {headers.map((header, index) => {
          const isActions = header.id === "actions" || header.id === "row_actions"
          return (
            <Table.Column
              key={header.id}
              id={header.id}
              isRowHeader={index === rowHeaderIndex}
              allowsSorting={header.column.getCanSort()}
              minWidth={header.column.columnDef.size ?? 80}
              {...getColumnWidthProps(header)}
              className={cn(
                "sticky top-0 z-10 bg-zinc-50 border-b border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                isActions && stickyActions && "sticky right-0 z-20 bg-white border-l border-zinc-200/50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]"
              )}
            >
              {({ sortDirection }) => (
                <>
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </Table.SortableColumnHeader>
                  {enableResizing && !isActions && <Table.ColumnResizer />}
                </>
              )}
            </Table.Column>
          )
        })}
      </Table.Header>
      <Table.Body
        renderEmptyState={() => (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            {isLoading ? (
              <>
                <Spinner size="md" color="accent" />
                <Typography.Paragraph size="sm" className="text-zinc-500 font-medium">Loading data...</Typography.Paragraph>
              </>
            ) : (
              <Typography.Paragraph size="sm" className="text-zinc-500">
                {emptyMessage}
              </Typography.Paragraph>
            )}
          </div>
        )}
      >
        {rows.map((row) => (
          <Fragment key={row.id}>
            <Table.Row
              id={row.id}
              className={onRowClick ? "cursor-pointer group" : "group"}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const isSelect = cell.column.id === "__select"
                const isActions = cell.column.id === "actions" || cell.column.id === "row_actions"
                return (
                  <Table.Cell
                    key={cell.id}
                    onPointerDown={!isSelect ? (e) => e.stopPropagation() : undefined}
                    onMouseDown={!isSelect ? (e) => e.stopPropagation() : undefined}
                    className={cn(isActions && stickyActions && "sticky right-0 z-10 bg-white group-hover:bg-zinc-50/80 group-data-[selected]:bg-indigo-50/30 group-data-[selected]:group-hover:bg-indigo-50/60 border-l border-zinc-200/50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Table.Cell>
                )
              })}
            </Table.Row>
            {renderSubRow && expandedSubRows.has(row.original.id) && (
              <Table.Row id={`${row.id}__sub`} textValue="Details">
                <Table.Cell
                  colSpan={headers.length}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderSubRow(row.original)}
                </Table.Cell>
              </Table.Row>
            )}
          </Fragment>
        ))}
      </Table.Body>
    </Table.Content>
  )

  return (
    <Table className={cn("relative flex flex-col h-full", className)}>
      {enableResizing ? (
        <Table.ResizableContainer onResizeEnd={handleResizeEnd} style={{ maxHeight, overflow: "auto" }}>
          {tableContent}
        </Table.ResizableContainer>
      ) : (
        <Table.ScrollContainer style={{ maxHeight, overflow: "auto" }}>
          {tableContent}
        </Table.ScrollContainer>
      )}
      {enablePagination && (
        <Table.Footer className="sticky bottom-0 z-30 bg-white border-t border-zinc-200/60 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <Pagination size="sm">
            <Pagination.Summary>
              {start} to {end} of {total} results
            </Pagination.Summary>
            <Pagination.Content>
              <Pagination.Item>
                <Pagination.Previous
                  isDisabled={!table.getCanPreviousPage()}
                  onPress={() => table.previousPage()}
                >
                  <Pagination.PreviousIcon />
                  Prev
                </Pagination.Previous>
              </Pagination.Item>
              {paginationRange.map((p, i) => (
                <Pagination.Item key={i}>
                  {p === "..." ? (
                    <Typography.Paragraph size="sm" className="px-2 text-zinc-400">...</Typography.Paragraph>
                  ) : (
                    <Pagination.Link
                      isActive={p === pageIndex + 1}
                      onPress={() => table.setPageIndex((p as number) - 1)}
                    >
                      {p}
                    </Pagination.Link>
                  )}
                </Pagination.Item>
              ))}
              <Pagination.Item>
                <Pagination.Next
                  isDisabled={!table.getCanNextPage()}
                  onPress={() => table.nextPage()}
                >
                  Next
                  <Pagination.NextIcon />
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium">Rows per page:</span>
            <Dropdown>
              <Dropdown.Trigger className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors text-xs font-semibold text-zinc-700 cursor-pointer">
                <span>{localPageSize}</span>
                <ChevronDown width="12" height="12" className="text-zinc-400" />
              </Dropdown.Trigger>
              <Dropdown.Popover className="rounded-xl border border-zinc-200 bg-white shadow-lg p-1 z-50">
                <Dropdown.Menu
                  selectionMode="single"
                  selectedKeys={new Set([String(localPageSize)])}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0]
                    if (selected) {
                      handlePageSizeChange(Number(selected))
                    }
                  }}
                >
                  {[20, 50, 100, 500].map((size) => (
                    <Dropdown.Item
                      key={String(size)}
                      id={String(size)}
                      className="text-xs px-3 py-2 cursor-pointer outline-none hover:bg-zinc-50 data-[focused]:bg-indigo-50 data-[selected]:text-indigo-700 data-[selected]:font-medium"
                    >
                      {size}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </Table.Footer>
      )}
    </Table>
  )
}

export default DataTable
