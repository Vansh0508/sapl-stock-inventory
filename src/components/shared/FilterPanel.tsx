"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Reorder, useDragControls } from "motion/react"
import { Button, AlertDialog, Spinner, Typography } from "@heroui/react"
import { Select, ListBox, ListBoxItem } from "@heroui/react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/useMediaQuery"
import type {
  FilterField,
  FilterFieldType,
  FilterOperator,
  FilterCondition,
  FilterGroup,
  FilterState,
} from "@/types/app.types"
import { buildCatalogQuery } from "@/lib/applyFilters"
import { supabase } from "@/lib/supabase/client"
import ScrollerShadow from "@/components/ui/ScrollerShadow"

// --- Icons ----------------------------------------------------------------
const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M10 16h4" />
  </svg>
)
const DragIcon = () => (
  <svg width="10" height="16" viewBox="0 0 12 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-400">
    <circle cx="2" cy="2" r="1.5" fill="currentColor"/>
    <circle cx="2" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="2" cy="16" r="1.5" fill="currentColor"/>
    <circle cx="10" cy="2" r="1.5" fill="currentColor"/>
    <circle cx="10" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="10" cy="16" r="1.5" fill="currentColor"/>
  </svg>
)
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.5 12a2 2 0 01-2 2H9.5a2 2 0 01-2-2L7 7" />
  </svg>
)
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)
const HelpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// --- Operators Configuration ----------------------------------------------
const OPERATORS_BY_FIELD_TYPE: Record<FilterFieldType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "does_not_contain", label: "does not contain" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  enum: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_none_of", label: "is none of" },
  ],
  enum_nullable: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_none_of", label: "is none of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  multi_enum: [
    { value: "has_any_of", label: "has any of" },
    { value: "has_all_of", label: "has all of" },
    { value: "has_none_of", label: "has none of" },
    { value: "is_exactly", label: "is exactly" },
  ],
  boolean: [
    { value: "is_true", label: "is active" },
    { value: "is_false", label: "is discontinued" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_before", label: "is before" },
    { value: "is_after", label: "is after" },
    { value: "is_on_or_before", label: "is on or before" },
    { value: "is_on_or_after", label: "is on or after" },
    { value: "is_within", label: "is within" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
}

const ZERO_VALUE_OPERATORS: ReadonlySet<FilterOperator> = new Set<FilterOperator>([
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
])

const DATE_PRESET_OPTIONS = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom range" },
]

// --- Helper HeroUI Select -------------------------------------------------
interface HeroUISelectProps {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
  ariaLabel: string
  isInsideUnifiedBar?: boolean
}

function HeroUISelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
  ariaLabel,
  isInsideUnifiedBar = false,
}: HeroUISelectProps) {
  return (
    <Select
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : "")}
      className={className}
      aria-label={ariaLabel}
    >
      <Select.Trigger className={cn(
        "w-full flex items-center justify-between text-sm text-zinc-800 transition-colors focus:outline-hidden cursor-pointer",
        isInsideUnifiedBar
          ? "bg-transparent border-none shadow-none rounded-none px-3 h-full hover:bg-zinc-550 hover:bg-zinc-50"
          : "bg-white border border-zinc-200 hover:border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500 rounded-lg px-2.5 h-9 focus:ring-1"
      )}>
        <Select.Value className="text-left font-normal placeholder-zinc-400">
          {options.find((o) => o.value === value)?.label || placeholder}
        </Select.Value>
        <Select.Indicator className="text-zinc-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="bg-white border border-zinc-200 shadow-xl rounded-xl overflow-hidden p-1 min-w-[140px] z-[60] animate-in fade-in-50 slide-in-from-top-1 duration-100">
        <ScrollerShadow size="max-h-60" className="outline-hidden flex flex-col gap-0.5">
          <ListBox className="outline-hidden flex flex-col gap-0.5">
            {options.map((o) => (
              <ListBoxItem
                key={o.value}
                id={o.value}
                className="px-2.5 py-1.5 text-xs rounded-lg text-zinc-800 cursor-pointer outline-hidden flex items-center justify-between transition-colors hover:bg-zinc-50 focus:bg-zinc-50 data-selected:bg-indigo-50 data-selected:text-indigo-700"
              >
                <span>{o.label}</span>
                {value === o.value && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </ListBoxItem>
            ))}
          </ListBox>
        </ScrollerShadow>
      </Select.Popover>
    </Select>
  )
}

// --- Searchable Enum / Tag Select -----------------------------------------
interface SearchableEnumSelectProps {
  fieldKey: string
  fetchOptions?: () => Promise<{ label: string; value: string }[]>
  value: string | string[] | null
  onChange: (val: string | string[] | null) => void
  multiple: boolean
  optionsCache: Record<string, { label: string; value: string }[]>
  setOptionsCache: React.Dispatch<React.SetStateAction<Record<string, { label: string; value: string }[]>>>
  isInsideUnifiedBar?: boolean
}

function SearchableEnumSelect({
  fieldKey,
  fetchOptions,
  value,
  onChange,
  multiple,
  optionsCache,
  setOptionsCache,
  isInsideUnifiedBar = false,
}: SearchableEnumSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const cachedOptions = optionsCache[fieldKey] || []

  const handleTriggerClick = async () => {
    setIsOpen(true)
    if (!optionsCache[fieldKey] && fetchOptions) {
      setIsLoading(true)
      try {
        const opts = await fetchOptions()
        setOptionsCache((prev) => ({ ...prev, [fieldKey]: opts }))
      } catch (err) {
        console.error("Failed to fetch options:", err)
      } finally {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredOptions = cachedOptions.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  const selectedValues = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : value ? [value] : []
    } else {
      return typeof value === "string" ? [value] : []
    }
  }, [value, multiple])

  const handleSelectOption = (optVal: string) => {
    if (multiple) {
      const next = selectedValues.includes(optVal)
        ? selectedValues.filter((v) => v !== optVal)
        : [...selectedValues, optVal]
      onChange(next.length > 0 ? next : null)
    } else {
      onChange(optVal)
      setIsOpen(false)
      setSearch("")
    }
  }

  const handleRemoveValue = (optVal: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = selectedValues.filter((v) => v !== optVal)
    onChange(next.length > 0 ? next : null)
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 h-full">
      <div
        onClick={handleTriggerClick}
        className={cn(
          "w-full flex flex-wrap gap-1 items-center text-sm text-zinc-800 transition-colors cursor-pointer",
          isInsideUnifiedBar
            ? "bg-transparent border-none shadow-none rounded-none px-3 h-full hover:bg-zinc-50/50 py-1"
            : "min-h-9 bg-white border border-zinc-200 hover:border-zinc-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 rounded-lg px-2.5 py-1"
        )}
      >
        {selectedValues.map((val) => {
          const opt = cachedOptions.find((o) => o.value === val)
          return (
            <span
              key={val}
              className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium"
            >
              {opt ? opt.label : val}
              <button
                type="button"
                onClick={(e) => handleRemoveValue(val, e)}
                className="hover:bg-indigo-100 rounded-full p-0.5 leading-none font-bold text-zinc-500"
              >
                ×
              </button>
            </span>
          )
        })}

        {!multiple && selectedValues.length === 0 && (
          <Typography.Paragraph size="xs" className="text-zinc-400">Select option...</Typography.Paragraph>
        )}
        {multiple && selectedValues.length === 0 && (
          <Typography.Paragraph size="xs" className="text-zinc-400">Search / Select options...</Typography.Paragraph>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
          }}
          placeholder=""
          className="border-none outline-none flex-1 min-w-[60px] bg-transparent text-sm p-0 h-6 focus:ring-0 focus:outline-hidden"
        />
      </div>

      {isOpen && (
        <ScrollerShadow
          size="max-h-48"
          className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 shadow-xl rounded-xl p-1 z-[70] flex flex-col gap-0.5"
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Spinner size="sm" className="text-indigo-600" />
            </div>
          ) : filteredOptions.length === 0 ? (
            <Typography.Paragraph size="xs" align="center" className="text-zinc-400 p-3">No options found</Typography.Paragraph>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredOptions.map((o) => {
                const selected = selectedValues.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => handleSelectOption(o.value)}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg text-zinc-800 cursor-pointer hover:bg-zinc-50 flex items-center justify-between transition-colors data-selected:bg-indigo-50 data-selected:text-indigo-700 font-normal"
                    data-selected={selected ? "true" : "false"}
                  >
                    <span>{o.label}</span>
                    {selected && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollerShadow>
      )}
    </div>
  )
}

// --- Conjunction Select ---------------------------------------------------
interface ConjunctionSelectProps {
  value: "AND" | "OR"
  onChange: (val: "AND" | "OR") => void
  ariaLabel: string
}

function ConjunctionSelect({ value, onChange, ariaLabel }: ConjunctionSelectProps) {
  return (
    <Select
      selectedKey={value}
      onSelectionChange={(key) => onChange(key === "OR" ? "OR" : "AND")}
      aria-label={ariaLabel}
      className="w-16 shrink-0"
    >
      <Select.Trigger className="w-full bg-zinc-150 hover:bg-zinc-200 border border-zinc-200 rounded-lg px-2 h-7 flex items-center justify-between text-xs font-semibold text-zinc-800 transition-colors cursor-pointer outline-hidden">
        <Select.Value className="text-left lowercase">
          {value === "AND" ? "and" : "or"}
        </Select.Value>
        <Select.Indicator className="text-zinc-500">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className="bg-white border border-zinc-200 shadow-lg rounded-lg overflow-hidden p-1 min-w-[70px] z-[70]">
        <ListBox className="outline-hidden flex flex-col gap-0.5">
          <ListBoxItem
            key="AND"
            id="AND"
            className="px-2 py-1 text-xs rounded-md text-zinc-800 cursor-pointer outline-hidden hover:bg-zinc-50 focus:bg-zinc-50 data-selected:bg-indigo-50 data-selected:text-indigo-700"
          >
            and
          </ListBoxItem>
          <ListBoxItem
            key="OR"
            id="OR"
            className="px-2 py-1 text-xs rounded-md text-zinc-800 cursor-pointer outline-hidden hover:bg-zinc-50 focus:bg-zinc-50 data-selected:bg-indigo-50 data-selected:text-indigo-700"
          >
            or
          </ListBoxItem>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

// --- Unified Condition Row ------------------------------------------------
interface ConditionRowProps {
  condition: FilterCondition
  fields: FilterField[]
  onUpdateCondition: (condId: string, patch: Partial<FilterCondition>) => void
  onRemoveCondition: (condId: string) => void
  optionsCache: Record<string, { label: string; value: string }[]>
  setOptionsCache: React.Dispatch<React.SetStateAction<Record<string, { label: string; value: string }[]>>>
  leftElement?: React.ReactNode
  isInsideGroup?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragControls?: any
}

function ConditionRow({
  condition,
  fields,
  onUpdateCondition,
  onRemoveCondition,
  optionsCache,
  setOptionsCache,
  leftElement,
  isInsideGroup = false,
  dragControls,
}: ConditionRowProps) {
  const isMobile = useIsMobile()
  const localDragControls = useDragControls()
  const activeDragControls = dragControls || localDragControls

  const currentField = useMemo(
    () => fields.find((f) => f.key === condition.field) || fields[0],
    [fields, condition.field]
  )

  const operators = useMemo(
    () => OPERATORS_BY_FIELD_TYPE[currentField.type],
    [currentField]
  )

  const needsValue = !ZERO_VALUE_OPERATORS.has(condition.operator)

  const handleFieldChange = (newKey: string) => {
    const targetField = fields.find((f) => f.key === newKey) || fields[0]
    const defaultOp = OPERATORS_BY_FIELD_TYPE[targetField.type][0].value
    onUpdateCondition(condition.id, {
      field: newKey,
      operator: defaultOp,
      value: null,
    })
  }

  const renderValueInput = () => {
    if (!needsValue) {
      return (
        <input
          type="text"
          disabled
          placeholder="No value needed"
          className="flex-1 bg-transparent border-none text-zinc-400 font-normal outline-none focus:outline-hidden focus:ring-0 text-sm px-3 h-full cursor-not-allowed"
        />
      )
    }

    if (condition.operator === "is_within") {
      const presetVal = Array.isArray(condition.value) ? "custom" : condition.value || ""
      const isCustom = presetVal === "custom" || Array.isArray(condition.value)
      
      const customDates = Array.isArray(condition.value)
        ? condition.value
        : typeof condition.value === "string" && condition.value.includes(",")
        ? condition.value.split(",")
        : ["", ""]

      return (
        <div className="flex items-center gap-2 flex-1 min-w-0 h-full px-2">
          <HeroUISelect
            value={isCustom ? "custom" : presetVal}
            onChange={(val) => {
              if (val === "custom") {
                onUpdateCondition(condition.id, { value: ["", ""] })
              } else {
                onUpdateCondition(condition.id, { value: val })
              }
            }}
            options={DATE_PRESET_OPTIONS}
            ariaLabel="Date range preset"
            className="w-28 shrink-0"
            isInsideUnifiedBar
          />
          {isCustom && (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                type="date"
                aria-label="Start date"
                value={customDates[0] || ""}
                onChange={(e) => {
                  const end = customDates[1] || ""
                  onUpdateCondition(condition.id, { value: [e.target.value, end] })
                }}
                className="flex-1 min-w-0 border-none bg-transparent px-1 h-8 text-xs text-zinc-800 outline-none focus:ring-0"
              />
              <Typography.Paragraph size="xs" className="text-zinc-400 shrink-0">to</Typography.Paragraph>
              <input
                type="date"
                aria-label="End date"
                value={customDates[1] || ""}
                onChange={(e) => {
                  const start = customDates[0] || ""
                  onUpdateCondition(condition.id, { value: [start, e.target.value] })
                }}
                className="flex-1 min-w-0 border-none bg-transparent px-1 h-8 text-xs text-zinc-800 outline-none focus:ring-0"
              />
            </div>
          )}
        </div>
      )
    }

    if (currentField.type === "date") {
      return (
        <input
          type="date"
          aria-label="Filter date"
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onUpdateCondition(condition.id, { value: e.target.value })}
          className="flex-1 min-w-0 border-none bg-transparent px-3 h-full text-sm text-zinc-800 outline-none focus:ring-0"
        />
      )
    }

    if (
      currentField.type === "enum" ||
      currentField.type === "enum_nullable" ||
      currentField.type === "multi_enum"
    ) {
      const isMultiOperator =
        condition.operator === "is_any_of" ||
        condition.operator === "is_none_of" ||
        condition.operator === "has_any_of" ||
        condition.operator === "has_all_of" ||
        condition.operator === "has_none_of" ||
        condition.operator === "is_exactly"

      return (
        <div className="flex-1 min-w-0 h-full flex items-center">
          <SearchableEnumSelect
            fieldKey={condition.field}
            fetchOptions={currentField.fetchOptions}
            value={condition.value}
            onChange={(val) => onUpdateCondition(condition.id, { value: val })}
            multiple={isMultiOperator}
            optionsCache={optionsCache}
            setOptionsCache={setOptionsCache}
            isInsideUnifiedBar
          />
        </div>
      )
    }

    return (
      <input
        type="text"
        aria-label="Filter text value"
        value={typeof condition.value === "string" ? condition.value : ""}
        onChange={(e) => onUpdateCondition(condition.id, { value: e.target.value })}
        placeholder="Enter a value"
        className="flex-1 min-w-0 bg-transparent border-none text-zinc-800 placeholder-zinc-400 outline-none focus:outline-hidden focus:ring-0 text-sm px-3 h-full"
      />
    )
  }

  const selectFieldsOptions = fields.map((f) => ({ value: f.key, label: f.label }))
  const selectOperatorOptions = operators.map((o) => ({ value: o.value, label: o.label }))

  const unifiedBox = (
    <div className="flex items-center bg-white border border-zinc-200 rounded-lg overflow-hidden h-9 flex-1 min-w-0 shadow-2xs">
      <HeroUISelect
        value={condition.field}
        onChange={handleFieldChange}
        options={selectFieldsOptions}
        ariaLabel="Filter field select"
        className="w-32 sm:w-36 shrink-0"
        isInsideUnifiedBar
      />

      <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />

      <HeroUISelect
        value={condition.operator}
        onChange={(val) =>
          onUpdateCondition(condition.id, { operator: val as FilterOperator })
        }
        options={selectOperatorOptions}
        ariaLabel="Filter operator select"
        className="w-28 sm:w-32 shrink-0"
        isInsideUnifiedBar
      />

      <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />

      {renderValueInput()}

      <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />

      <button
        type="button"
        onClick={() => onRemoveCondition(condition.id)}
        className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
        aria-label="Remove condition"
      >
        <TrashIcon />
      </button>

      {!isMobile && !isInsideGroup && (
        <>
          <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />
          <div
            onPointerDown={(e) => activeDragControls.start(e)}
            className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-550 hover:bg-zinc-50 cursor-grab active:cursor-grabbing shrink-0"
            aria-label="Drag to reorder"
          >
            <DragIcon />
          </div>
        </>
      )}
    </div>
  )

  if (isInsideGroup) {
    return unifiedBox
  }

  return (
    <Reorder.Item
      value={condition}
      dragListener={false}
      dragControls={activeDragControls}
      className="flex items-center gap-3 w-full bg-transparent"
    >
      {leftElement && (
        <div className="w-16 flex items-center justify-end shrink-0 select-none">
          {leftElement}
        </div>
      )}
      {unifiedBox}
    </Reorder.Item>
  )
}

// --- Nested Group Component (satisfies Rules of Hooks) ---------------------
interface GroupBlockRowProps {
  item: { type: "group"; id: string; group: FilterGroup; groupIndex: number }
  value: FilterState
  fields: FilterField[]
  optionsCache: Record<string, { label: string; value: string }[]>
  setOptionsCache: React.Dispatch<React.SetStateAction<Record<string, { label: string; value: string }[]>>>
  isMobile: boolean
  onChange: (state: FilterState) => void
  handleUpdateCondition: (groupId: string, condId: string, patch: Partial<FilterCondition>) => void
  handleRemoveCondition: (groupId: string, condId: string) => void
  handleRemoveGroup: (groupId: string) => void
  handleAddCondition: (groupId: string) => void
  handleUpdateGroupConjunction: (groupId: string, conjunction: "AND" | "OR") => void
}

function GroupBlockRow({
  item,
  value,
  fields,
  optionsCache,
  setOptionsCache,
  isMobile,
  onChange,
  handleUpdateCondition,
  handleRemoveCondition,
  handleRemoveGroup,
  handleAddCondition,
  handleUpdateGroupConjunction,
}: GroupBlockRowProps) {
  const group = item.group
  const hasConditions = group.conditions.length > 0
  const groupControls = useDragControls()

  const leftLabel = (
    <ConjunctionSelect
      value={value.groupConjunction}
      onChange={(conj) =>
        onChange({ ...value, groupConjunction: conj, isDirty: true })
      }
      ariaLabel="Global group conjunction select"
    />
  )

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={groupControls}
      className="flex items-start gap-3 w-full bg-transparent animate-in fade-in-50 duration-100"
    >
      <div className="w-16 flex items-center justify-end shrink-0 pt-1 select-none">
        {leftLabel}
      </div>

      {/* Group box container */}
      <div className="flex-1 min-w-0">
        {!hasConditions ? (
          // Empty group box matching Image 3
          <div className="flex items-center justify-between border border-zinc-200 bg-zinc-50/30 rounded-lg h-9 w-full overflow-hidden select-none">
            <Typography.Paragraph size="xs" className="text-zinc-400 px-3 font-normal">
              Drag conditions here to add them to this group
            </Typography.Paragraph>
            <div className="flex items-center h-full shrink-0">
              <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />
              <button
                type="button"
                onClick={() => handleAddCondition(group.id)}
                className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-indigo-600 hover:bg-zinc-100 transition-colors cursor-pointer shrink-0"
                aria-label="Add condition"
              >
                <PlusIcon />
              </button>
              <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />
              <button
                type="button"
                onClick={() => handleRemoveGroup(group.id)}
                className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                aria-label="Remove group"
              >
                <TrashIcon />
              </button>
              {!isMobile && (
                <>
                  <div className="w-px h-9 bg-zinc-200 self-stretch shrink-0" />
                  <div
                    onPointerDown={(e) => groupControls.start(e)}
                    className="w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-zinc-650 hover:text-zinc-600 hover:bg-zinc-100 cursor-grab active:cursor-grabbing shrink-0"
                    aria-label="Drag group"
                  >
                    <DragIcon />
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          // Non-empty nested conditions block
          <div className="border border-zinc-200 bg-zinc-50/20 rounded-lg p-2.5 flex flex-col gap-2.5 w-full">
            {group.conditions.map((nestedCond, nestedIndex) => {
              const isFirstNested = nestedIndex === 0
              const nestedLeft = isFirstNested ? (
                <Typography.Paragraph size="xs" weight="bold" className="text-zinc-400 select-none">Where</Typography.Paragraph>
              ) : (
                <ConjunctionSelect
                  value={group.conjunction}
                  onChange={(conj) => handleUpdateGroupConjunction(group.id, conj)}
                  ariaLabel="Nested group conjunction"
                />
              )

              return (
                <div key={nestedCond.id} className="flex items-center gap-3 w-full">
                  <div className="w-16 flex items-center justify-end shrink-0 select-none">
                    {nestedLeft}
                  </div>
                  <ConditionRow
                    condition={nestedCond}
                    fields={fields}
                    onUpdateCondition={(condId, patch) =>
                      handleUpdateCondition(group.id, condId, patch)
                    }
                    onRemoveCondition={(condId) =>
                      handleRemoveCondition(group.id, condId)
                    }
                    optionsCache={optionsCache}
                    setOptionsCache={setOptionsCache}
                    isInsideGroup={true}
                  />
                </div>
              )
            })}

            {/* Actions line for non-empty group */}
            <div className="flex items-center justify-between border-t border-zinc-200/60 pt-2 mt-1 shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <span>Group Conjunction:</span>
                <div className="flex rounded-md border border-zinc-200 overflow-hidden bg-white shrink-0">
                  {(["AND", "OR"] as const).map((conj) => (
                    <button
                      key={conj}
                      type="button"
                      onClick={() => handleUpdateGroupConjunction(group.id, conj)}
                      className={cn(
                        "h-6 px-2 text-[10px] font-semibold cursor-pointer transition-colors",
                        group.conjunction === conj
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-zinc-500 hover:bg-zinc-50"
                      )}
                    >
                      {conj === "AND" ? "and" : "or"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddCondition(group.id)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md px-2 py-1 transition-colors cursor-pointer"
                >
                  + Add condition
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(group.id)}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md px-2 py-1 transition-colors cursor-pointer"
                >
                  Delete group
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Reorder.Item>
  )
}

// --- Top Level Union Item -------------------------------------------------
type TopLevelItem =
  | { type: "condition"; id: string; condition: FilterCondition; groupIndex: number; conditionIndex: number }
  | { type: "group"; id: string; group: FilterGroup; groupIndex: number }

// --- Main Filter Panel Component ------------------------------------------
export interface FilterPanelProps {
  fields: FilterField[]
  value: FilterState
  onChange: (state: FilterState) => void
  onApply: (state: FilterState) => void
  onClose: () => void
}

export default function FilterPanel({
  fields,
  value,
  onChange,
  onApply,
  onClose,
}: FilterPanelProps) {
  const isMobile = useIsMobile()
  const [optionsCache, setOptionsCache] = useState<Record<string, { label: string; value: string }[]>>({})
  
  // Count states
  const [matchCount, setMatchCount] = useState<number | null>(null)
  const [countLoading, setCountLoading] = useState(false)

  // Discard alert open state
  const [isAlertOpen, setIsAlertOpen] = useState(false)

  // Live count query firing 400ms after onChange
  useEffect(() => {
    const totalConditions = value.groups.reduce((acc, g) => acc + g.conditions.length, 0)
    if (totalConditions === 0) {
      const timer = setTimeout(() => {
        setMatchCount(null)
        setCountLoading(false)
      }, 0)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(async () => {
      setCountLoading(true)
      try {
        let q = supabase.from("view_catalog_full").select("*", { count: "exact", head: true })
        q = await buildCatalogQuery(q, value)
        const { count, error } = await q
        if (!error && count !== null) {
          setMatchCount(count)
        } else {
          setMatchCount(0)
        }
      } catch (err) {
        console.error(err)
        setMatchCount(0)
      } finally {
        setCountLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [value])

  // --- Compile Top Level Reorderable Items ---------------------------------
  const topLevelItems = useMemo(() => {
    const items: TopLevelItem[] = []
    
    // Group 1's conditions are rendered directly at the top level
    if (value.groups.length > 0) {
      const firstGroup = value.groups[0]
      firstGroup.conditions.forEach((cond, index) => {
        items.push({
          type: "condition",
          id: cond.id,
          condition: cond,
          groupIndex: 0,
          conditionIndex: index,
        })
      })
    }
    
    // Subsequent groups are rendered as top-level group blocks
    for (let i = 1; i < value.groups.length; i++) {
      const group = value.groups[i]
      items.push({
        type: "group",
        id: group.id,
        group: group,
        groupIndex: i,
      })
    }
    
    return items
  }, [value.groups])

  const handleReorderTopLevel = (newItems: TopLevelItem[]) => {
    const firstGroupConditions: FilterCondition[] = []
    const otherGroups: FilterGroup[] = []
    const firstGroupId = value.groups[0]?.id || Math.random().toString(36).slice(2)
    const firstGroupConjunction = value.groups[0]?.conjunction || "AND"

    newItems.forEach((item) => {
      if (item.type === "condition") {
        firstGroupConditions.push(item.condition)
      } else {
        otherGroups.push(item.group)
      }
    })

    const newGroups: FilterGroup[] = [
      {
        id: firstGroupId,
        conjunction: firstGroupConjunction,
        conditions: firstGroupConditions,
      },
      ...otherGroups,
    ]

    onChange({
      ...value,
      groups: newGroups,
      isDirty: true,
    })
  }

  // --- Group Level Actions ------------------------------------------------
  const handleAddGroupEmpty = () => {
    const newGroup: FilterGroup = {
      id: Math.random().toString(36).slice(2),
      conjunction: "AND",
      conditions: [],
    }
    onChange({
      ...value,
      groups: [...value.groups, newGroup],
      isDirty: true,
    })
  }

  const handleRemoveGroup = (groupId: string) => {
    const nextGroups = value.groups.filter((g) => g.id !== groupId)
    onChange({
      ...value,
      groups: nextGroups.length > 0 ? nextGroups : value.groups,
      isDirty: true,
    })
  }

  const handleUpdateGroupConjunction = (groupId: string, conjunction: "AND" | "OR") => {
    const nextGroups = value.groups.map((g) =>
      g.id === groupId ? { ...g, conjunction } : g
    )
    onChange({
      ...value,
      groups: nextGroups,
      isDirty: true,
    })
  }

  // --- Condition Level Actions --------------------------------------------
  const handleAddConditionToFirstGroup = () => {
    const defaultField = fields[0]
    const defaultOp = OPERATORS_BY_FIELD_TYPE[defaultField.type][0].value
    const newCond: FilterCondition = {
      id: Math.random().toString(36).slice(2),
      field: defaultField.key,
      operator: defaultOp,
      value: null,
    }

    if (value.groups.length === 0) {
      onChange({
        ...value,
        groups: [
          {
            id: Math.random().toString(36).slice(2),
            conjunction: "AND",
            conditions: [newCond],
          },
        ],
        isDirty: true,
      })
    } else {
      const nextGroups = value.groups.map((g, idx) => {
        if (idx === 0) {
          return {
            ...g,
            conditions: [...g.conditions, newCond],
          }
        }
        return g
      })
      onChange({
        ...value,
        groups: nextGroups,
        isDirty: true,
      })
    }
  }

  const handleAddCondition = (groupId: string) => {
    const nextGroups = value.groups.map((g) => {
      if (g.id === groupId) {
        const defaultField = fields[0]
        const defaultOp = OPERATORS_BY_FIELD_TYPE[defaultField.type][0].value
        return {
          ...g,
          conditions: [
            ...g.conditions,
            {
              id: Math.random().toString(36).slice(2),
              field: defaultField.key,
              operator: defaultOp,
              value: null,
            },
          ],
        }
      }
      return g
    })
    onChange({
      ...value,
      groups: nextGroups,
      isDirty: true,
    })
  }

  const handleUpdateCondition = (
    groupId: string,
    condId: string,
    patch: Partial<FilterCondition>
  ) => {
    const nextGroups = value.groups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          conditions: g.conditions.map((c) => (c.id === condId ? { ...c, ...patch } : c)),
        }
      }
      return g
    })
    onChange({
      ...value,
      groups: nextGroups,
      isDirty: true,
    })
  }

  const handleRemoveCondition = (groupId: string, condId: string) => {
    const nextGroups = value.groups
      .map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            conditions: g.conditions.filter((c) => c.id !== condId),
          }
        }
        return g
      })
      .filter((g, index, arr) => g.conditions.length > 0 || arr.length === 1)

    onChange({
      ...value,
      groups: nextGroups,
      isDirty: true,
    })
  }

  const handleClearAll = () => {
    const cleanGroups: FilterGroup[] = [
      {
        id: Math.random().toString(36).slice(2),
        conjunction: "AND",
        conditions: [],
      },
    ]
    onChange({
      groups: cleanGroups,
      groupConjunction: "AND",
      isDirty: true,
    })
  }

  const handleCancel = () => {
    if (value.isDirty) {
      setIsAlertOpen(true)
    } else {
      onClose()
    }
  }

  const totalConditions = value.groups.reduce((acc, g) => acc + g.conditions.length, 0)
  const isFiltersEmpty = totalConditions === 0

  // --- Empty State View ----------------------------------------------------
  if (isFiltersEmpty) {
    return (
      <div className="flex flex-col h-full bg-white select-none max-h-inherit">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-zinc-550 text-zinc-500 font-semibold">
              <FilterIcon />
            </span>
            <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-900">Filters</Typography.Paragraph>
          </div>
        </div>

        {/* Empty Body matching Image 1 */}
        <div className="flex-1 flex flex-col justify-center items-start gap-4 py-8 px-4">
          <Typography.Paragraph size="sm" className="text-zinc-500 font-normal">
            No filter conditions are applied
          </Typography.Paragraph>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleAddConditionToFirstGroup}
              className="text-blue-600 hover:text-blue-700 font-semibold text-[13px] flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-none p-0"
            >
              <PlusIcon /> Add condition
            </button>
            <button
              type="button"
              onClick={handleAddGroupEmpty}
              className="text-zinc-500 hover:text-zinc-700 font-semibold text-[13px] flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-none p-0"
            >
              <PlusIcon /> Add condition group
            </button>
            <HelpIcon />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-zinc-100 pt-3 mt-4 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onPress={handleCancel}
              className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl px-4 py-2 font-semibold text-xs h-9 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={() => onApply(value)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 font-semibold text-xs h-9 cursor-pointer"
            >
              Apply filters
            </Button>
          </div>
        </div>

        {/* Discard changes AlertDialog */}
        <AlertDialog isOpen={isAlertOpen} onOpenChange={setIsAlertOpen}>
          <AlertDialog.Backdrop className="z-[200]">
            <AlertDialog.Container size="sm" className="z-[200]">
              <AlertDialog.Dialog>
                {({ close }) => (
                  <>
                    <AlertDialog.Header className="flex gap-2 items-center text-zinc-900 border-b border-zinc-100">
                      Discard filter changes?
                    </AlertDialog.Header>
                    <AlertDialog.Body className="py-6">
                      <p className="text-sm text-zinc-600">
                        You have unsaved filter modifications. If you cancel, these edits
                        will be permanently discarded.
                      </p>
                    </AlertDialog.Body>
                    <AlertDialog.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                      <Button
                        variant="outline"
                        onPress={close}
                        className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                      >
                        Keep Editing
                      </Button>
                      <Button
                        onPress={() => {
                          setIsAlertOpen(false)
                          onClose()
                        }}
                        className="bg-red-600 text-white rounded-xl cursor-pointer font-medium"
                      >
                        Discard Changes
                      </Button>
                    </AlertDialog.Footer>
                  </>
                )}
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </div>
    )
  }

  // --- Active Rules State View ---------------------------------------------
  return (
    <div className="flex flex-col h-full bg-white select-none max-h-inherit">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-3 shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 font-semibold">
            <FilterIcon />
          </span>
          <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-900">Filters</Typography.Paragraph>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="text-xs font-semibold text-zinc-500 hover:text-indigo-655 hover:text-indigo-600 hover:bg-zinc-50 transition-colors px-2 py-1.5 rounded-lg cursor-pointer"
        >
          Clear all
        </button>
      </div>

      {/* Rules list */}
      <ScrollerShadow size="max-h-[calc(100%-8rem)]" className="flex-1 pr-1 flex flex-col gap-3 min-h-0">
        <Typography.Paragraph size="xs" className="text-zinc-500 text-[13px] font-normal pb-1 shrink-0">
          In this view, show records
        </Typography.Paragraph>

        <Reorder.Group
          axis="y"
          values={topLevelItems}
          onReorder={handleReorderTopLevel}
          className="flex flex-col gap-3"
        >
          {topLevelItems.map((item, index) => {
            const isFirst = index === 0

            if (item.type === "condition") {
              const leftLabel = isFirst ? (
                <Typography.Paragraph size="sm" weight="bold" className="text-zinc-800">Where</Typography.Paragraph>
              ) : (
                <ConjunctionSelect
                  value={value.groups[0].conjunction}
                  onChange={(conj) => {
                    const nextGroups = value.groups.map((g, idx) =>
                      idx === 0 ? { ...g, conjunction: conj } : g
                    )
                    onChange({ ...value, groups: nextGroups, isDirty: true })
                  }}
                  ariaLabel="First group conjunction select"
                />
              )

              return (
                <ConditionRow
                  key={item.id}
                  condition={item.condition}
                  fields={fields}
                  onUpdateCondition={(condId, patch) =>
                    handleUpdateCondition(value.groups[0].id, condId, patch)
                  }
                  onRemoveCondition={(condId) =>
                    handleRemoveCondition(value.groups[0].id, condId)
                  }
                  optionsCache={optionsCache}
                  setOptionsCache={setOptionsCache}
                  leftElement={leftLabel}
                />
              )
            } else {
              // Group block row - rendered using GroupBlockRow helper component
              return (
                <GroupBlockRow
                  key={item.id}
                  item={item}
                  value={value}
                  fields={fields}
                  optionsCache={optionsCache}
                  setOptionsCache={setOptionsCache}
                  isMobile={isMobile}
                  onChange={onChange}
                  handleUpdateCondition={handleUpdateCondition}
                  handleRemoveCondition={handleRemoveCondition}
                  handleRemoveGroup={handleRemoveGroup}
                  handleAddCondition={handleAddCondition}
                  handleUpdateGroupConjunction={handleUpdateGroupConjunction}
                />
              )
            }
          })}
        </Reorder.Group>

        {/* Inline Bottom Buttons matching Image 1/2/3 */}
        <div className="flex items-center gap-4 mt-2 pl-[76px]">
          <button
            type="button"
            onClick={handleAddConditionToFirstGroup}
            className="text-blue-600 hover:text-blue-700 font-semibold text-[13px] flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-none p-0"
          >
            <PlusIcon /> Add condition
          </button>
          <button
            type="button"
            onClick={handleAddGroupEmpty}
            className="text-zinc-500 hover:text-zinc-700 font-semibold text-[13px] flex items-center gap-1 cursor-pointer transition-colors bg-transparent border-none p-0"
          >
            <PlusIcon /> Add condition group
          </button>
          <HelpIcon />
        </div>
      </ScrollerShadow>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-3 mt-3 shrink-0 bg-white">
        {/* Live Match Count */}
        <div className="text-xs text-zinc-500 font-medium h-5 flex items-center">
          {countLoading ? (
            <span className="flex items-center gap-1.5">
              <Spinner size="sm" className="w-3.5 h-3.5 text-indigo-650" />
              Checking matches...
            </span>
          ) : matchCount !== null ? (
            <Typography.Paragraph size="xs" weight="medium" className="text-zinc-600">
              <strong className="text-indigo-600 font-semibold">{matchCount}</strong>{" "}
              {matchCount === 1 ? "product matches" : "products match"}
            </Typography.Paragraph>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onPress={handleCancel}
            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl px-4 py-2 font-semibold text-xs h-9 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={() => onApply(value)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 font-semibold text-xs h-9 cursor-pointer"
          >
            Apply filters
          </Button>
        </div>
      </div>

      {/* Discard changes AlertDialog */}
      <AlertDialog isOpen={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialog.Backdrop className="z-[200]">
          <AlertDialog.Container size="sm" className="z-[200]">
            <AlertDialog.Dialog>
              {({ close }) => (
                <>
                  <AlertDialog.Header className="flex gap-2 items-center text-zinc-900 border-b border-zinc-100">
                    Discard filter changes?
                  </AlertDialog.Header>
                  <AlertDialog.Body className="py-6">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      You have unsaved filter modifications. If you cancel, these edits
                      will be permanently discarded.
                    </Typography.Paragraph>
                  </AlertDialog.Body>
                  <AlertDialog.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button
                      variant="outline"
                      onPress={close}
                      className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                    >
                      Keep Editing
                    </Button>
                    <Button
                      onPress={() => {
                        setIsAlertOpen(false)
                        onClose()
                      }}
                      className="bg-red-600 text-white rounded-xl cursor-pointer font-medium"
                    >
                      Discard Changes
                    </Button>
                  </AlertDialog.Footer>
                </>
              )}
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
