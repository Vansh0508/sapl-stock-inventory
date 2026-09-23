"use client"

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { Checkbox, Popover, Modal, Typography } from "@heroui/react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useViewStore } from "@/stores/viewStore"
import ToolbarControl from "@/components/ui/ToolbarControl"
import SearchBar from "@/components/shared/SearchBar"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useIsMobile } from "@/hooks/useMediaQuery"
import {
  ROW_HEIGHT_OPTIONS,
  type ToolbarColumn,
  type FilterCondition,
} from "@/types/app.types"
import FilterPanel from "./FilterPanel"
import { catalogFilterFields, galleryFilterFields } from "@/lib/filterFields"
import ScrollerShadow from "@/components/ui/ScrollerShadow"

// --- Icons (inline, 16px, currentColor) ----------------------------------
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
  </svg>
)
const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M10 16h4" />
  </svg>
)
const SortIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h12M3 12h8M3 17h4M17 4v16m0 0l-3-3m3 3l3-3" />
  </svg>
)
const GroupIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h13M7 18h13M3.5 12h.01M3.5 18h.01" />
  </svg>
)
const RowHeightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h10M3 10h10M3 14h10M3 18h10M18 4v16M15 7l3-3 3 3M15 17l3 3 3-3" />
  </svg>
)

export const ColumnsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM10 4v16M16 4v16" />
  </svg>
)
const ChevronDown = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.5 12a2 2 0 01-2 2H9.5a2 2 0 01-2-2L7 7" />
  </svg>
)
const CloseX = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// --- Styled native select (in-flow, no portal — safe inside popovers) -----
const FieldSelect = ({
  value,
  onChange,
  ariaLabel,
  className,
  children,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  children: React.ReactNode
}) => (
  <div className={cn("relative", className)}>
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-lg border border-zinc-200 bg-white pl-2.5 pr-7 h-9 text-sm text-zinc-800 outline-none transition-colors hover:border-zinc-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400" />
  </div>
)

const sectionBtn =
  "flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer"

const DATE_PRESET_OPTIONS = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
]

function SortPanel({ columns }: { columns: ToolbarColumn[] }) {
  const sorts = useViewStore((s) => s.sorts)
  const addSort = useViewStore((s) => s.addSort)
  const updateSort = useViewStore((s) => s.updateSort)
  const removeSort = useViewStore((s) => s.removeSort)
  const clearSorts = useViewStore((s) => s.clearSorts)

  const usedFields = new Set(sorts.map((r) => r.field))
  const nextUnusedField = columns.find((c) => !usedFields.has(c.id))?.id

  return (
    <div className="flex flex-col gap-2.5">
      {sorts.length === 0 && (
        <Typography.Paragraph size="xs" className="text-zinc-500 px-0.5 py-1">No sorts applied to this view.</Typography.Paragraph>
      )}

      {sorts.map((r) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <FieldSelect
            ariaLabel="Sort field"
            value={r.field}
            onChange={(field) => updateSort(r.id, { field })}
            className="flex-1"
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </FieldSelect>

          <div className="flex rounded-lg border border-zinc-200 overflow-hidden shrink-0">
            {(["asc", "desc"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => updateSort(r.id, { direction: dir })}
                className={cn(
                  "h-9 px-2.5 text-xs font-medium transition-colors cursor-pointer",
                  r.direction === dir
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-white text-zinc-500 hover:bg-zinc-50"
                )}
              >
                {dir === "asc" ? "A→Z" : "Z→A"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => removeSort(r.id)}
            aria-label="Remove sort"
            className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          disabled={!nextUnusedField}
          onClick={() => nextUnusedField && addSort(nextUnusedField)}
          className={cn(
            sectionBtn,
            "px-2",
            nextUnusedField
              ? "text-indigo-600 hover:bg-indigo-50"
              : "text-zinc-300 cursor-not-allowed"
          )}
        >
          <PlusIcon />
          Add sort
        </button>
        {sorts.length > 0 && (
          <button
            type="button"
            onClick={clearSorts}
            className={cn(sectionBtn, "px-2 text-zinc-500 hover:bg-zinc-100")}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}

function GroupPanel({ columns }: { columns: ToolbarColumn[] }) {
  const groupBy = useViewStore((s) => s.groupBy)
  const setGroupBy = useViewStore((s) => s.setGroupBy)
  const groupable = columns.filter((c) => c.groupable !== false)

  const optionRow = (key: string, label: string, selected: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full px-2.5 h-9 rounded-lg text-sm transition-colors cursor-pointer",
        selected ? "bg-indigo-50 text-indigo-700 font-medium" : "text-zinc-700 hover:bg-zinc-100"
      )}
    >
      {label}
      {selected && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )

  return (
    <ScrollerShadow size="max-h-72" className="flex flex-col gap-0.5">
      {optionRow("__none", "No grouping", groupBy === null, () => setGroupBy(null))}
      <div className="my-1 h-px bg-zinc-100" />
      {groupable.map((c) => optionRow(c.id, c.label, groupBy === c.id, () => setGroupBy(c.id)))}
    </ScrollerShadow>
  )
}

function RowHeightPanel() {
  const rowHeight = useViewStore((s) => s.rowHeight)
  const setRowHeight = useViewStore((s) => s.setRowHeight)

  return (
    <div className="flex flex-col gap-0.5">
      {ROW_HEIGHT_OPTIONS.map((opt) => {
        const selected = rowHeight === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRowHeight(opt.value)}
            className={cn(
              "flex items-center justify-between w-full px-2.5 h-9 rounded-lg text-sm transition-colors cursor-pointer",
              selected ? "bg-indigo-50 text-indigo-700 font-medium" : "text-zinc-700 hover:bg-zinc-100"
            )}
          >
            <span className="flex items-center gap-2.5">
              <span className="flex flex-col gap-[3px]" aria-hidden="true">
                {Array.from({ length: opt.value === "compact" ? 3 : opt.value === "normal" ? 2 : 1 }).map(
                  (_, i) => (
                    <span key={i} className="block w-4 h-0.5 rounded-full bg-current opacity-60" />
                  )
                )}
              </span>
              {opt.label}
            </span>
            <span className="text-[11px] text-zinc-400">{opt.px}px</span>
          </button>
        )
      })}
    </div>
  )
}

export function HideColumnsPanel({ columns }: { columns: ToolbarColumn[] }) {
  const hiddenColumns = useViewStore((s) => s.hiddenColumns)
  const toggleColumn = useViewStore((s) => s.toggleColumn)
  const showAllColumns = useViewStore((s) => s.showAllColumns)
  const hideable = columns.filter((c) => c.hideable !== false)

  return (
    <div className="flex flex-col gap-1">
      <ScrollerShadow size="max-h-72" className="flex flex-col gap-0.5">
        {hideable.map((c) => {
          const visible = !hiddenColumns.includes(c.id)
          return (
            <Checkbox
              key={c.id}
              isSelected={visible}
              onChange={() => toggleColumn(c.id)}
              aria-label={c.label}
              className="w-full"
            >
              <Checkbox.Content className="flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-zinc-50 cursor-pointer w-full">
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className="text-sm text-zinc-700 select-none">{c.label}</span>
              </Checkbox.Content>
            </Checkbox>
          )
        })}
      </ScrollerShadow>
      {hiddenColumns.length > 0 && (
        <button
          type="button"
          onClick={showAllColumns}
          className={cn(sectionBtn, "px-2 self-start text-indigo-600 hover:bg-indigo-50")}
        >
          Show all columns
        </button>
      )}
    </div>
  )
}

// --- Removable Pill for Toolbar chips ------------------------------------
const ConditionChip = ({
  children,
  onRemove,
  onClick,
}: {
  children: React.ReactNode
  onRemove: () => void
  onClick?: () => void
}) => {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full border text-xs font-medium whitespace-nowrap bg-indigo-50 text-indigo-700 border-indigo-200 cursor-pointer hover:bg-indigo-100 transition-colors"
      )}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label="Remove condition"
        className="p-0.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer shrink-0"
      >
        <CloseX />
      </button>
    </span>
  )
}

// --- Toolbar --------------------------------------------------------------
export interface ToolbarProps {
  /** Columns this view exposes — drives filter/sort/group/hide controls. */
  columns: ToolbarColumn[]
  /** Extra classes for the toolbar bar container. */
  className?: string
  /** Context to specify which tab this toolbar belongs to */
  context?: "catalog" | "gallery"
}

export default function Toolbar({ columns, className, context = "catalog" }: ToolbarProps) {
  const isMobile = useIsMobile()

  // Search state
  const isSearchOpen = useViewStore((s) => s.isSearchOpen)
  const toggleSearch = useViewStore((s) => s.toggleSearch)
  const closeSearch = useViewStore((s) => s.closeSearch)
  const setSearchQuery = useViewStore((s) => s.setSearchQuery)

  // Filters state
  const {
    catalogFilter,
    galleryFilter,
    setStagedFilter,
    applyFilter,
    resetStagedFilter,
    removeConditionFromApplied,
  } = useViewStore()

  const filterSlice = context === "catalog" ? catalogFilter : galleryFilter
  const staged = filterSlice.staged
  const applied = filterSlice.applied

  const fields = context === "catalog" ? catalogFilterFields : galleryFilterFields

  // Sorts and grouping
  const sorts = useViewStore((s) => s.sorts)
  const groupBy = useViewStore((s) => s.groupBy)
  const hiddenColumns = useViewStore((s) => s.hiddenColumns)

  // Popover open state
  const [filterOpen, setFilterOpen] = useState(false)

  // Label map cache for UUID to Human name lookup on chips
  const [labelMap, setLabelMap] = useState<Record<string, string>>({})

  // Local search input -> debounced -> store (300ms)
  const [searchInput, setSearchInput] = useState("")
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  useEffect(() => {
    setSearchQuery(debouncedSearch)
  }, [debouncedSearch, setSearchQuery])

  const searchRef = useRef<HTMLDivElement>(null)

  // Handle clicking outside the search box (if empty) to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (!isSearchOpen) return
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        if (searchInput.trim() === "") {
          closeSearch()
          setSearchInput("")
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [isSearchOpen, searchInput, closeSearch])

  // Populate human labels for enums/relationships in applied filters
  useEffect(() => {
    const uuidConditions = applied.groups
      .flatMap((g) => g.conditions)
      .filter((c) => {
        const f = fields.find((field) => field.key === c.field)
        return (
          f &&
          (f.type === "enum" || f.type === "enum_nullable" || f.type === "multi_enum")
        )
      })

    if (uuidConditions.length === 0) return

    uuidConditions.forEach(async (c) => {
      const f = fields.find((field) => field.key === c.field)
      if (f && f.fetchOptions) {
        try {
          const opts = await f.fetchOptions()
          const newLabels: Record<string, string> = {}
          opts.forEach((o) => {
            newLabels[o.value] = o.label
          })
          setLabelMap((prev) => ({ ...prev, ...newLabels }))
        } catch (err) {
          console.error(err)
        }
      }
    })
  }, [applied, fields])

  const handleCloseSearch = () => {
    setSearchInput("")
    closeSearch()
  }

  const totalAppliedConditions = useMemo(() => {
    return applied.groups.reduce((acc, g) => acc + g.conditions.length, 0)
  }, [applied])

  const handleOpenChange = (open: boolean) => {
    if (open) {
      resetStagedFilter(context)
    }
    setFilterOpen(open)
  }

  const handleChipClick = (condId: string) => {
    resetStagedFilter(context)
    setFilterOpen(true)
    
    // Perform smooth scroll after a brief layout delay
    setTimeout(() => {
      const el = document.querySelector(`[data-condition-id="${condId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 250)
  }

  // --- Display label logic for chips ---------------------------------------
  const getOperatorLabel = useCallback((fieldKey: string, operator: string) => {
    const f = fields.find((f) => f.key === fieldKey)
    if (!f) return operator
    const list =
      f.type === "text"
        ? [
            { value: "contains", label: "contains" },
            { value: "does_not_contain", label: "does not contain" },
            { value: "starts_with", label: "starts with" },
            { value: "ends_with", label: "ends with" },
            { value: "is", label: "is" },
            { value: "is_not", label: "is not" },
            { value: "is_empty", label: "is empty" },
            { value: "is_not_empty", label: "is not empty" },
          ]
        : f.type === "enum" || f.type === "enum_nullable"
        ? [
            { value: "is", label: "is" },
            { value: "is_not", label: "is not" },
            { value: "is_any_of", label: "is any of" },
            { value: "is_none_of", label: "is none of" },
            { value: "is_empty", label: "is empty" },
            { value: "is_not_empty", label: "is not empty" },
          ]
        : f.type === "multi_enum"
        ? [
            { value: "has_any_of", label: "has any of" },
            { value: "has_all_of", label: "has all of" },
            { value: "has_none_of", label: "has none of" },
            { value: "is_exactly", label: "is exactly" },
          ]
        : f.type === "boolean"
        ? [
            { value: "is_true", label: "is active" },
            { value: "is_false", label: "is discontinued" },
          ]
        : [
            { value: "is", label: "is" },
            { value: "is_not", label: "is not" },
            { value: "is_before", label: "is before" },
            { value: "is_after", label: "is after" },
            { value: "is_on_or_before", label: "is on or before" },
            { value: "is_on_or_after", label: "is on or after" },
            { value: "is_within", label: "is within" },
            { value: "is_empty", label: "is empty" },
            { value: "is_not_empty", label: "is not empty" },
          ]
    
    return list.find((o) => o.value === operator)?.label || operator
  }, [fields])

  const getChipSummary = useCallback((cond: FilterCondition) => {
    const f = fields.find((field) => field.key === cond.field)
    if (!f) return ""

    const isValueless =
      cond.operator === "is_empty" ||
      cond.operator === "is_not_empty" ||
      cond.operator === "is_true" ||
      cond.operator === "is_false"

    if (isValueless || f.type === "boolean") {
      return ""
    }

    const resolveLabel = (val: string) => labelMap[val] || val

    if (Array.isArray(cond.value)) {
      if (cond.operator === "is_within") {
        return `: ${cond.value.join(" to ")}`
      }
      const labels = cond.value.map(resolveLabel)
      if (labels.length <= 3) {
        return `: ${labels.join(", ")}`
      }
      return `: ${labels.slice(0, 3).join(", ")} +${labels.length - 3}`
    }

    if (typeof cond.value === "string") {
      if (cond.operator === "is_within") {
        const matched = DATE_PRESET_OPTIONS.find((o) => o.value === cond.value)
        return matched ? `: ${matched.label}` : `: ${cond.value}`
      }
      return `: ${resolveLabel(cond.value)}`
    }

    return ""
  }, [fields, labelMap])

  // Active filter condition chips
  const activeChips = useMemo(() => {
    return applied.groups.flatMap((group) =>
      group.conditions
        .filter((c) =>
          c.operator === "is_empty" ||
          c.operator === "is_not_empty" ||
          c.operator === "is_true" ||
          c.operator === "is_false" ||
          (c.value !== null && c.value !== "")
        )
        .map((c) => {
          const field = fields.find((f) => f.key === c.field)
          const fieldLabel = field ? field.label : c.field
          const opLabel = getOperatorLabel(c.field, c.operator)
          const summary = getChipSummary(c)
          return {
            id: c.id,
            label: `${fieldLabel}: ${opLabel}${summary}`,
          }
        })
    )
  }, [applied.groups, fields, getOperatorLabel, getChipSummary])

  // --- Filter Panel desktop/mobile trigger and popover --------------------
  const renderFilterControl = () => {
    const triggerBtn = (
      <button
        type="button"
        onClick={() => {
          if (isMobile) {
            resetStagedFilter(context)
            setFilterOpen(true)
          }
        }}
        className={cn(
          "relative flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
          totalAppliedConditions > 0 || filterOpen
            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
            : "text-zinc-600 hover:bg-zinc-100 border-transparent"
        )}
      >
        <FilterIcon />
        <span className="hidden md:inline">Filter</span>
        {totalAppliedConditions > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold leading-none">
            {totalAppliedConditions}
          </span>
        )}
      </button>
    )

    if (isMobile) {
      return (
        <>
          {triggerBtn}
          <Modal
            isOpen={filterOpen}
            onOpenChange={(open) => {
              if (!open) {
                resetStagedFilter(context)
              }
              setFilterOpen(open)
            }}
          >
            <Modal.Backdrop>
              <Modal.Container size="full" placement="bottom" scroll="inside">
                <Modal.Dialog className="rounded-t-2xl bg-white max-h-[85dvh] overflow-hidden flex flex-col p-4 w-full">
                  {({ close }) => (
                    <FilterPanel
                      fields={fields}
                      value={staged}
                      onChange={(nextState) => setStagedFilter(context, nextState)}
                      onApply={() => {
                        applyFilter(context)
                        close()
                      }}
                      onClose={() => {
                        resetStagedFilter(context)
                        close()
                      }}
                    />
                  )}
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>
        </>
      )
    }

    return (
      <Popover isOpen={filterOpen} onOpenChange={handleOpenChange}>
        <Popover.Trigger>{triggerBtn}</Popover.Trigger>
        <Popover.Content className="bg-white border border-zinc-200 shadow-xl rounded-2xl p-4 w-[640px] max-w-[640px] max-h-[480px] overflow-hidden z-[100]">
          <Popover.Dialog className="outline-hidden max-h-[448px] overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="h-full flex flex-col max-h-[440px]"
            >
              <FilterPanel
                fields={fields}
                value={staged}
                onChange={(nextState) => setStagedFilter(context, nextState)}
                onApply={() => {
                  applyFilter(context)
                  setFilterOpen(false)
                }}
                onClose={() => {
                  resetStagedFilter(context)
                  setFilterOpen(false)
                }}
              />
            </motion.div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Primary Toolbar Row */}
      <div className={cn("flex items-center gap-1", className)}>
        {/* Search toggle / field container */}
        <div ref={searchRef} className="relative flex items-center h-9">
          <AnimatePresence mode="wait" initial={false}>
            {!isSearchOpen ? (
              <motion.button
                key="search-btn"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                type="button"
                onClick={toggleSearch}
                aria-label="Search"
                aria-pressed={isSearchOpen}
                className={cn(
                  "flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
                  "text-zinc-600 hover:bg-zinc-100 border-transparent whitespace-nowrap"
                )}
              >
                <SearchIcon />
                <span className="hidden md:inline">Search</span>
              </motion.button>
            ) : (
              <motion.div
                key="search-field"
                initial={{ width: 40, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 40, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden flex items-center"
              >
                <SearchBar
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder="Search SKU, product, color..."
                  ariaLabel="Search catalog"
                  groupClassName="h-9 rounded-lg bg-zinc-50 border-zinc-200/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500"
                  className="w-[380px]"
                  autoFocus
                  onEscape={handleCloseSearch}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <span className="w-px h-5 bg-zinc-200 mx-0.5" />

        {/* Rebuilt Filter Panel Trigger */}
        {renderFilterControl()}

        {/* Sort Control */}
        <ToolbarControl icon={<SortIcon />} label="Sort" badge={sorts.length} active={sorts.length > 0} align="end" panelClassName="w-80">
          {() => <SortPanel columns={columns} />}
        </ToolbarControl>

        {/* Group Control */}
        <ToolbarControl icon={<GroupIcon />} label="Group" active={groupBy !== null} align="end">
          {() => <GroupPanel columns={columns} />}
        </ToolbarControl>

        {/* Row Height Control */}
        <ToolbarControl icon={<RowHeightIcon />} label="Row Height" align="end">
          {() => <RowHeightPanel />}
        </ToolbarControl>

        {/* Hide Columns Control */}
        <ToolbarControl
          icon={<ColumnsIcon />}
          label="Hide Columns"
          badge={hiddenColumns.length}
          active={hiddenColumns.length > 0}
          align="end"
        >
          {() => <HideColumnsPanel columns={columns} />}
        </ToolbarControl>
      </div>

      {/* Rebuilt Active Filter Chips below Toolbar row */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 py-1 max-h-24 overflow-x-auto md:overflow-x-visible scrollbar-thin">
          {activeChips.map((chip) => (
            <ConditionChip
              key={chip.id}
              onClick={() => handleChipClick(chip.id)}
              onRemove={() => removeConditionFromApplied(context, chip.id)}
            >
              {chip.label}
            </ConditionChip>
          ))}
        </div>
      )}
    </div>
  )
}
