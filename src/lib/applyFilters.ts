/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FilterState, FilterGroup, FilterCondition } from "@/types/app.types"
import { supabase } from "@/lib/supabase/client"

/**
 * Computes a date range from a preset string or custom range.
 */
function getDateRange(
  preset: string,
  customVal?: string | string[] | null
): { start: string; end: string } | null {
  const now = new Date()
  let start = new Date()
  const end = now

  if (preset === "last_7_days") {
    start.setDate(now.getDate() - 7)
  } else if (preset === "last_30_days") {
    start.setDate(now.getDate() - 30)
  } else if (preset === "last_90_days") {
    start.setDate(now.getDate() - 90)
  } else if (preset === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (preset === "this_quarter") {
    const quarter = Math.floor(now.getMonth() / 3)
    start = new Date(now.getFullYear(), quarter * 3, 1)
  } else if (preset === "this_year") {
    start = new Date(now.getFullYear(), 0, 1)
  } else if (preset === "custom") {
    if (Array.isArray(customVal) && customVal.length >= 2) {
      return {
        start: new Date(customVal[0]).toISOString(),
        end: new Date(customVal[1]).toISOString(),
      }
    } else if (typeof customVal === "string" && customVal.includes(",")) {
      const parts = customVal.split(",")
      return {
        start: new Date(parts[0]).toISOString(),
        end: new Date(parts[1]).toISOString(),
      }
    }
    return null
  } else {
    return null
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Calls PostgreSQL RPC function to get catalog IDs that match a color or fiber list.
 */
async function fetchRpcIds(condition: FilterCondition): Promise<string[] | null> {
  const isColor = condition.field === "color_ids"
  const isFiber = condition.field === "fiber_ids"
  if (!isColor && !isFiber) return null

  const matchType =
    condition.operator === "has_any_of"
      ? "any"
      : condition.operator === "has_all_of"
      ? "all"
      : condition.operator === "has_none_of"
      ? "none"
      : condition.operator === "is_exactly"
      ? "exactly"
      : null

  if (!matchType) return null

  const values = Array.isArray(condition.value)
    ? condition.value
    : condition.value
    ? [condition.value]
    : []

  if (values.length === 0) return []

  if (isColor) {
    const { data, error } = await (supabase.rpc as any)("get_catalog_ids_by_colors", {
      color_id_list: values,
      match_type: matchType,
    })
    if (error) {
      console.error("Error in RPC get_catalog_ids_by_colors:", error)
      return []
    }
    return (data as string[]) || []
  } else {
    const { data, error } = await (supabase.rpc as any)("get_catalog_ids_by_fibers", {
      fiber_id_list: values,
      match_type: matchType,
    })
    if (error) {
      console.error("Error in RPC get_catalog_ids_by_fibers:", error)
      return []
    }
    return (data as string[]) || []
  }
}

/**
 * Formats a standard condition as a Postgrest `.or()` filter string.
 */
function buildOrFilterString(cond: FilterCondition): string | null {
  const { field, operator, value } = cond
  if (operator === "is_empty") {
    return `${field}.is.null`
  }
  if (operator === "is_not_empty") {
    return `${field}.not.is.null`
  }
  if (operator === "is_true") {
    return `${field}.eq.true`
  }
  if (operator === "is_false") {
    return `${field}.eq.false`
  }

  if (value === null || value === undefined) return null

  if (operator === "is") {
    return `${field}.eq.${value}`
  }
  if (operator === "is_not") {
    return `${field}.neq.${value}`
  }
  if (operator === "is_any_of") {
    const vals = Array.isArray(value) ? value : [value]
    return `${field}.in.(${vals.join(",")})`
  }
  if (operator === "is_none_of") {
    const vals = Array.isArray(value) ? value : [value]
    return `${field}.not.in.(${vals.join(",")})`
  }
  if (operator === "contains") {
    return `${field}.ilike.%${value}%`
  }
  if (operator === "does_not_contain") {
    return `${field}.not.ilike.%${value}%`
  }
  if (operator === "starts_with") {
    return `${field}.ilike.${value}%`
  }
  if (operator === "ends_with") {
    return `${field}.ilike.%${value}`
  }
  if (operator === "is_before") {
    return `${field}.lt.${new Date(value as string).toISOString()}`
  }
  if (operator === "is_after") {
    return `${field}.gt.${new Date(value as string).toISOString()}`
  }
  if (operator === "is_on_or_before") {
    return `${field}.lte.${new Date(value as string).toISOString()}`
  }
  if (operator === "is_on_or_after") {
    return `${field}.gte.${new Date(value as string).toISOString()}`
  }
  if (operator === "is_within") {
    const range = getDateRange(value as string, cond.value)
    if (range) {
      return `and(${field}.gte.${range.start},${field}.lte.${range.end})`
    }
  }

  return null
}

/**
 * Chains a standard condition directly on a Postgrest filter builder.
 */
function applyStandardCondition(query: any, cond: FilterCondition): any {
  const { field, operator, value } = cond
  if (operator === "is_empty") {
    return query.is(field, null)
  }
  if (operator === "is_not_empty") {
    return query.not(field, "is", null)
  }
  if (operator === "is_true") {
    return query.eq(field, true)
  }
  if (operator === "is_false") {
    return query.eq(field, false)
  }

  if (value === null || value === undefined) return query

  if (operator === "is") {
    return query.eq(field, value)
  }
  if (operator === "is_not") {
    return query.neq(field, value)
  }
  if (operator === "is_any_of") {
    const vals = Array.isArray(value) ? value : [value]
    return query.in(field, vals)
  }
  if (operator === "is_none_of") {
    const vals = Array.isArray(value) ? value : [value]
    return query.not(field, "in", `(${vals.join(",")})`)
  }
  if (operator === "contains") {
    return query.ilike(field, `%${value}%`)
  }
  if (operator === "does_not_contain") {
    return query.not(field, "ilike", `%${value}%`)
  }
  if (operator === "starts_with") {
    return query.ilike(field, `${value}%`)
  }
  if (operator === "ends_with") {
    return query.ilike(field, `%${value}`)
  }
  if (operator === "is_before") {
    return query.lt(field, new Date(value as string).toISOString())
  }
  if (operator === "is_after") {
    return query.gt(field, new Date(value as string).toISOString())
  }
  if (operator === "is_on_or_before") {
    return query.lte(field, new Date(value as string).toISOString())
  }
  if (operator === "is_on_or_after") {
    return query.gte(field, new Date(value as string).toISOString())
  }
  if (operator === "is_within") {
    const range = getDateRange(value as string, cond.value)
    if (range) {
      return query.gte(field, range.start).lte(field, range.end)
    }
  }

  return query
}

/**
 * Applies all conditions inside a single FilterGroup to the query.
 */
async function applyGroupToQuery(query: any, group: FilterGroup, isGallery: boolean = false): Promise<any> {
  const activeConditions = group.conditions.filter(
    (c) => c.operator === "is_empty" || c.operator === "is_not_empty" || c.operator === "is_true" || c.operator === "is_false" || (c.value !== null && c.value !== "")
  )

  if (activeConditions.length === 0) return query

  if (group.conjunction === "AND") {
    const junctionConditions = activeConditions.filter(
      (c) => c.field === "color_ids" || c.field === "fiber_ids"
    )
    const standardConditions = activeConditions.filter(
      (c) => c.field !== "color_ids" && c.field !== "fiber_ids"
    )

    let nextQuery = query

    if (junctionConditions.length > 0) {
      let intersectedIds: string[] | null = null
      for (const cond of junctionConditions) {
        const ids = await fetchRpcIds(cond)
        if (ids !== null) {
          if (intersectedIds === null) {
            intersectedIds = ids
          } else {
            intersectedIds = intersectedIds.filter((id) => ids.includes(id))
          }
        }
      }
      if (intersectedIds !== null) {
        nextQuery = nextQuery.in(isGallery ? "catalog_id" : "id", intersectedIds)
      }
    }

    for (const cond of standardConditions) {
      nextQuery = applyStandardCondition(nextQuery, cond)
    }

    return nextQuery
  } else {
    // group.conjunction === 'OR'
    const hasJunction = activeConditions.some(
      (c) => c.field === "color_ids" || c.field === "fiber_ids"
    )

    if (!hasJunction) {
      const parts: string[] = []
      for (const cond of activeConditions) {
        const part = buildOrFilterString(cond)
        if (part) parts.push(part)
      }
      if (parts.length > 0) {
        return query.or(parts.join(","))
      }
      return query
    }

    // Mixed standard + junction in OR
    const unionedIds = new Set<string>()

    for (const cond of activeConditions) {
      if (cond.field === "color_ids" || cond.field === "fiber_ids") {
        const ids = await fetchRpcIds(cond)
        if (ids) {
          ids.forEach((id) => unionedIds.add(id))
        }
      } else {
        let subQuery = supabase.from(isGallery ? "view_inventory_gallery" : "view_catalog_full").select(isGallery ? "catalog_id" : "id")
        subQuery = applyStandardCondition(subQuery, cond)
        const { data, error } = await subQuery
        if (!error && data) {
          data.forEach((row: any) => unionedIds.add(isGallery ? row.catalog_id : row.id))
        }
      }
    }

    return query.in(isGallery ? "catalog_id" : "id", Array.from(unionedIds))
  }
}

/**
 * Translates a complete FilterState logic into a Supabase query builder.
 */
export async function buildCatalogQuery(
  baseQuery: any,
  filterState: FilterState
): Promise<any> {
  const activeGroups = filterState.groups.filter((g) =>
    g.conditions.some(
      (c) => c.operator === "is_empty" || c.operator === "is_not_empty" || c.operator === "is_true" || c.operator === "is_false" || (c.value !== null && c.value !== "")
    )
  )

  if (activeGroups.length === 0) {
    return baseQuery
  }

  if (filterState.groupConjunction === "AND" || activeGroups.length === 1) {
    let nextQuery = baseQuery
    for (const group of activeGroups) {
      nextQuery = await applyGroupToQuery(nextQuery, group, false)
    }
    return nextQuery
  } else {
    // groupConjunction === 'OR'
    const unionedIds = new Set<string>()
    for (const group of activeGroups) {
      let groupQuery = supabase.from("view_catalog_full").select("id")
      groupQuery = await applyGroupToQuery(groupQuery, group, false)
      const { data, error } = await groupQuery
      if (!error && data) {
        data.forEach((row: any) => unionedIds.add(row.id))
      }
    }
    return baseQuery.in("id", Array.from(unionedIds))
  }
}

/**
 * Translates a complete FilterState logic into a Supabase query builder for view_inventory_gallery.
 */
export async function buildGalleryQuery(
  baseQuery: any,
  filterState: FilterState
): Promise<any> {
  const activeGroups = filterState.groups.filter((g) =>
    g.conditions.some(
      (c) => c.operator === "is_empty" || c.operator === "is_not_empty" || c.operator === "is_true" || c.operator === "is_false" || (c.value !== null && c.value !== "")
    )
  )

  if (activeGroups.length === 0) {
    return baseQuery
  }

  if (filterState.groupConjunction === "AND" || activeGroups.length === 1) {
    let nextQuery = baseQuery
    for (const group of activeGroups) {
      nextQuery = await applyGroupToQuery(nextQuery, group, true)
    }
    return nextQuery
  } else {
    // groupConjunction === 'OR'
    const unionedIds = new Set<string>()
    for (const group of activeGroups) {
      let groupQuery = supabase.from("view_inventory_gallery").select("id")
      groupQuery = await applyGroupToQuery(groupQuery, group, true)
      const { data, error } = await groupQuery
      if (!error && data) {
        data.forEach((row: any) => unionedIds.add(row.id))
      }
    }
    return baseQuery.in("id", Array.from(unionedIds))
  }
}
