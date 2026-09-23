// App-level types shared across the inventory UI (toolbar, views, filters).
// DB row shapes live in database.types.ts — these describe UI/interaction state.

/** Logical data type of a column — drives which filter operators apply. */
export type ColumnType = "text" | "number" | "boolean"

/** Row density for data grids. */
export type RowHeight = "compact" | "normal" | "tall"

/** Sort direction. */
export type SortDirection = "asc" | "desc"

/** Gallery view modes (used by the Gallery tab; shared toolbar is agnostic). */
export type ViewMode = "grid" | "gallery" | "kanban" | "record"

/** Operators available for text columns. */
export type TextOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "isEmpty"
  | "isNotEmpty"

/** Operators available for number columns. */
export type NumberOperator = "eq" | "neq" | "gt" | "lt" | "gte" | "lte"

/** Operators available for boolean columns. */
export type BooleanOperator = "isTrue" | "isFalse"

export type FilterFieldType =
  | 'text'           // SKU, product_code — string operators
  | 'enum'           // single FK field — is / is_not / is_any_of / is_none_of
  | 'enum_nullable'  // same as enum but also offers is_empty / is_not_empty
  | 'multi_enum'     // junction table field — has_any_of / has_all_of / has_none_of / is_exactly
  | 'boolean'        // is_active — is_true / is_false only
  | 'date';          // created_at, updated_at — date range operators

export interface FilterField {
  key: string;            // matches the column name used in Supabase queries
  label: string;          // display label shown in the field dropdown
  type: FilterFieldType;
  // For enum / enum_nullable / multi_enum fields:
  // fetchOptions is an async function that returns the values currently in use
  // in the dataset (not the full master table). The panel calls this lazily
  // when the user picks that field.
  fetchOptions?: () => Promise<{ label: string; value: string }[]>;
}

export type FilterOperator =
  | 'is' | 'is_not'
  | 'is_any_of' | 'is_none_of'
  | 'has_any_of' | 'has_all_of' | 'has_none_of' | 'is_exactly'
  | 'contains' | 'does_not_contain' | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty'
  | 'is_before' | 'is_after' | 'is_on_or_before' | 'is_on_or_after'
  | 'is_within'
  | 'is_true' | 'is_false';

export interface FilterCondition {
  id: string;                        // nanoid(), used as React key
  field: string;                     // FilterField.key
  operator: FilterOperator;
  value: string | string[] | null;   // null for zero-value operators (is_empty, is_true, etc.)
}

export interface FilterGroup {
  id: string;                        // nanoid()
  conjunction: 'AND' | 'OR';        // how conditions inside this group are joined
  conditions: FilterCondition[];
}

export interface FilterState {
  groups: FilterGroup[];
  groupConjunction: 'AND' | 'OR';   // how groups are joined to each other
  isDirty: boolean;                  // true if edited since last Apply
}

/** A single sort rule. Multiple rules are applied in order. */
export interface SortRule {
  id: string
  field: string
  direction: SortDirection
}

/**
 * Describes a column the toolbar can operate on. Each tab supplies its own
 * column set so the Toolbar stays generic and reusable across Catalog/Gallery.
 */
export interface ToolbarColumn {
  /** Stable id — matches the underlying data/view field name. */
  id: string
  /** Human-readable header label. */
  label: string
  /** Data type — determines available filter operators. */
  type: ColumnType
  /** When false, the column cannot be hidden via Hide Columns. Defaults to true. */
  hideable?: boolean
  /** When false, the column is excluded from grouping. Defaults to true. */
  groupable?: boolean
}

/** Operators that take no value (presence/boolean checks). */
export const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set<FilterOperator>([
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
])

/** Operator option lists, grouped by column type, with display labels. */
export const OPERATORS_BY_TYPE: Record<
  ColumnType,
  ReadonlyArray<{ value: FilterOperator; label: string }>
> = {
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
  number: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  boolean: [
    { value: "is_true", label: "is active" },
    { value: "is_false", label: "is discontinued" },
  ],
}

/** Row-height option metadata (label + pixel height for grid rows). */
export const ROW_HEIGHT_OPTIONS: ReadonlyArray<{
  value: RowHeight
  label: string
  px: number
}> = [
  { value: "compact", label: "Compact", px: 36 },
  { value: "normal", label: "Normal", px: 56 },
  { value: "tall", label: "Tall", px: 80 },
]
