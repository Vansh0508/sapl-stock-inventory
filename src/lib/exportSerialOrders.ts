import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase/client"
import { toast } from "@heroui/react"

/**
 * Cleans and trims strings safely.
 */
function cleanStr(val: any): string {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

/**
 * Formats a Date object or ISO string cleanly into YYYY-MM-DD.
 */
function formatDate(val: any): string {
  if (!val) return ""
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return String(val)
    return d.toISOString().split("T")[0]
  } catch {
    return String(val)
  }
}

/**
 * Exports all unique serial numbers / inventory pieces with exact, complete parameters
 * (strictly 1 row per unique physical Serial Number) to an Excel (.xlsx) file,
 * resolving all attributes without row duplication.
 */
export async function exportSerialOrdersToExcel(): Promise<void> {
  // 1. Fetch all reference lookup dictionaries in parallel
  const [
    typesRes,
    sizesRes,
    qualitiesRes,
    designsRes,
    qualityCodesRes,
    designCodesRes,
    collectionsRes,
    constructionsRes,
    colorsRes,
    fibersRes,
    locationsRes,
  ] = await Promise.all([
    (supabase.from("product_types" as any) as any).select("id, product_name"),
    (supabase.from("sizes" as any) as any).select("id, size_label, so_seq, so_number"),
    (supabase.from("qualities" as any) as any).select("id, quality_name"),
    (supabase.from("designs" as any) as any).select("id, design_name"),
    (supabase.from("quality_codes" as any) as any).select("id, quality_id, quality_code, quality_prefix"),
    (supabase.from("design_codes" as any) as any).select("id, design_id, design_code"),
    (supabase.from("collections" as any) as any).select("id, collection_name"),
    (supabase.from("constructions" as any) as any).select("id, construction_name"),
    (supabase.from("colors" as any) as any).select("id, color_name, color_code"),
    (supabase.from("fiber_list" as any) as any).select("id, fiber_name"),
    (supabase.from("locations" as any) as any).select("id, location_name, state, country"),
  ])

  // Dictionaries
  const productTypesMap = new Map<string, string>()
  ;(typesRes.data || []).forEach((t: any) => productTypesMap.set(t.id, t.product_name))

  const sizesMap = new Map<string, { size_label: string; so_number: string }>()
  ;(sizesRes.data || []).forEach((s: any) => {
    const so = s.so_number
      ? String(s.so_number).startsWith("SO")
        ? s.so_number
        : `SO${s.so_number}`
      : `SO${s.so_seq ?? 1}`
    sizesMap.set(s.id, { size_label: s.size_label || "", so_number: so })
  })

  const qualitiesMap = new Map<string, string>()
  ;(qualitiesRes.data || []).forEach((q: any) => qualitiesMap.set(q.id, q.quality_name))

  const designsMap = new Map<string, string>()
  ;(designsRes.data || []).forEach((d: any) => designsMap.set(d.id, d.design_name))

  const qualityCodesList: any[] = qualityCodesRes.data || []
  const designCodesList: any[] = designCodesRes.data || []

  const collectionsMap = new Map<string, string>()
  ;(collectionsRes.data || []).forEach((c: any) => collectionsMap.set(c.id, c.collection_name))

  const constructionsMap = new Map<string, string>()
  ;(constructionsRes.data || []).forEach((c: any) => constructionsMap.set(c.id, c.construction_name))

  const colorsMap = new Map<string, { name: string; code: string }>()
  ;(colorsRes.data || []).forEach((c: any) =>
    colorsMap.set(c.id, { name: c.color_name, code: c.color_code })
  )

  const fibersMap = new Map<string, string>()
  ;(fibersRes.data || []).forEach((f: any) => fibersMap.set(f.id, f.fiber_name))

  const locationsMap = new Map<string, { name: string; state: string; country: string }>()
  ;(locationsRes.data || []).forEach((l: any) =>
    locationsMap.set(l.id, {
      name: l.location_name || "",
      state: l.state || "",
      country: l.country || "",
    })
  )

  // 2. Fetch all Catalog Full Views, Catalog Colors, and Catalog Fibers
  let catalogFullRows: any[] = []
  let catFrom = 0
  let catHasMore = true

  while (catHasMore) {
    const { data, error } = await (supabase
      .from("view_catalog_full" as any) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(catFrom, catFrom + 999)

    if (error) break
    if (!data || data.length === 0) {
      catHasMore = false
    } else {
      catalogFullRows = catalogFullRows.concat(data)
      if (data.length < 1000) catHasMore = false
      else catFrom += 1000
    }
  }

  const catalogFullById = new Map<string, any>()
  const catalogFullBySku = new Map<string, any>()
  for (const row of catalogFullRows) {
    catalogFullById.set(row.id, row)
    if (row.sku) catalogFullBySku.set(cleanStr(row.sku).toUpperCase(), row)
  }

  // Fetch catalog_colors & catalog_fibers mappings for full fallback
  const [catalogColorsRes, catalogFibersRes] = await Promise.all([
    (supabase.from("catalog_colors" as any) as any).select("catalog_id, color_id"),
    (supabase.from("catalog_fibers" as any) as any).select("catalog_id, fiber_id, percentage"),
  ])

  const colorsByCatalogId = new Map<string, { names: string[]; codes: string[] }>()
  for (const cc of catalogColorsRes.data || []) {
    if (!colorsByCatalogId.has(cc.catalog_id)) {
      colorsByCatalogId.set(cc.catalog_id, { names: [], codes: [] })
    }
    const cObj = colorsMap.get(cc.color_id)
    if (cObj) {
      colorsByCatalogId.get(cc.catalog_id)!.names.push(cObj.name)
      colorsByCatalogId.get(cc.catalog_id)!.codes.push(cObj.code)
    }
  }

  const fibersByCatalogId = new Map<string, string[]>()
  for (const cf of catalogFibersRes.data || []) {
    if (!fibersByCatalogId.has(cf.catalog_id)) {
      fibersByCatalogId.set(cf.catalog_id, [])
    }
    const fName = fibersMap.get(cf.fiber_id) || ""
    if (fName) {
      fibersByCatalogId.get(cf.catalog_id)!.push(`${cf.percentage}% ${fName}`)
    }
  }

  // 3. Fetch all Inventory pieces deterministically using view_inventory_gallery / inventory
  let rawRows: any[] = []
  let from = 0
  let hasMore = true
  let usedGalleryView = true

  while (hasMore) {
    const { data, error } = await (supabase
      .from("view_inventory_gallery" as any) as any)
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999)

    if (error) {
      console.warn("view_inventory_gallery query error, falling back to inventory table:", error)
      usedGalleryView = false
      break
    }

    if (!data || data.length === 0) {
      hasMore = false
    } else {
      rawRows = rawRows.concat(data)
      if (data.length < 1000) {
        hasMore = false
      } else {
        from += 1000
      }
    }
  }

  // Fallback: Fetch directly from inventory table if view_inventory_gallery was unavailable
  if (!usedGalleryView || rawRows.length === 0) {
    rawRows = []
    from = 0
    hasMore = true
    while (hasMore) {
      const { data, error } = await (supabase
        .from("inventory" as any) as any)
        .select(`
          id,
          serial_number,
          sku,
          catalog_id,
          location_id,
          product_type_id,
          size_id,
          quality_id,
          design_id,
          collection_id,
          construction_id,
          quality_code,
          design_code,
          product_code,
          created_at,
          updated_at,
          is_sold
        `)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + 999)

      if (error) throw new Error(`Failed to load inventory: ${error.message}`)
      if (!data || data.length === 0) {
        hasMore = false
      } else {
        rawRows = rawRows.concat(data)
        if (data.length < 1000) {
          hasMore = false
        } else {
          from += 1000
        }
      }
    }
  }

  if (rawRows.length === 0) {
    toast.danger("No serial numbers found in inventory to export.")
    return
  }

  // 4. Strict Deduplication: Ensure each Serial Number appears exactly ONCE
  const seenSerialNumbers = new Set<string>()
  const seenIds = new Set<string>()
  const uniqueItems: any[] = []

  for (const item of rawRows) {
    const sNum = cleanStr(item.serial_number).toUpperCase()
    const itemId = cleanStr(item.id)

    // Skip if this exact ID or exact Serial Number has already been processed
    if (itemId && seenIds.has(itemId)) continue
    if (sNum && seenSerialNumbers.has(sNum)) continue

    if (itemId) seenIds.add(itemId)
    if (sNum) seenSerialNumbers.add(sNum)

    uniqueItems.push(item)
  }

  // 5. Transform and resolve exact data points for every unique serial number
  const exportData = uniqueItems.map((item) => {
    // Linked catalog master row (if any)
    const linkedCat =
      (item.catalog_id ? catalogFullById.get(item.catalog_id) : null) ||
      (item.sku ? catalogFullBySku.get(cleanStr(item.sku).toUpperCase()) : null)

    // Product Type
    const productType =
      cleanStr(item.product_name) ||
      cleanStr(linkedCat?.product_name) ||
      (item.product_type_id ? productTypesMap.get(item.product_type_id) : "") ||
      (linkedCat?.product_type_id ? productTypesMap.get(linkedCat.product_type_id) : "") ||
      ""

    // Quality Name
    let qualityName =
      cleanStr(item.quality_name) ||
      cleanStr(linkedCat?.quality_name) ||
      (item.quality_id ? qualitiesMap.get(item.quality_id) : "") ||
      (linkedCat?.quality_id ? qualitiesMap.get(linkedCat.quality_id) : "") ||
      ""

    // Quality Code
    let qualityCode = cleanStr(item.quality_code || linkedCat?.quality_code)
    if (!qualityCode && (item.quality_id || linkedCat?.quality_id)) {
      const qId = item.quality_id || linkedCat?.quality_id
      const match = qualityCodesList.find((qc) => qc.quality_id === qId)
      if (match) qualityCode = match.quality_code
    }
    if (!qualityName && qualityCode) {
      const match = qualityCodesList.find((qc) => qc.quality_code === qualityCode)
      if (match && match.quality_id) {
        qualityName = qualitiesMap.get(match.quality_id) || ""
      }
    }

    // Quality Prefix
    let qualityPrefix = cleanStr(item.quality_prefix || linkedCat?.quality_prefix)
    if (!qualityPrefix && qualityCode) {
      const match = qualityCodesList.find(
        (qc) => qc.quality_code === qualityCode || qc.quality_id === item.quality_id
      )
      if (match) qualityPrefix = match.quality_prefix || ""
    }

    // Design Name
    let designName =
      cleanStr(item.design_name) ||
      cleanStr(linkedCat?.design_name) ||
      (item.design_id ? designsMap.get(item.design_id) : "") ||
      (linkedCat?.design_id ? designsMap.get(linkedCat.design_id) : "") ||
      ""

    // Design Code
    let designCode = cleanStr(item.design_code || linkedCat?.design_code)
    if (!designCode && (item.design_id || linkedCat?.design_id)) {
      const dId = item.design_id || linkedCat?.design_id
      const match = designCodesList.find((dc) => dc.design_id === dId)
      if (match) designCode = match.design_code
    }
    if (!designName && designCode) {
      const match = designCodesList.find((dc) => dc.design_code === designCode)
      if (match && match.design_id) {
        designName = designsMap.get(match.design_id) || ""
      }
    }

    // Size Label & SO Number
    const sizeInfo =
      (item.size_id ? sizesMap.get(item.size_id) : null) ||
      (linkedCat?.size_id ? sizesMap.get(linkedCat.size_id) : null)

    const sizeLabel =
      cleanStr(item.size_label) ||
      cleanStr(linkedCat?.size_label) ||
      sizeInfo?.size_label ||
      ""

    let soNumber =
      cleanStr(item.so_number) ||
      cleanStr(linkedCat?.so_number) ||
      sizeInfo?.so_number ||
      ""

    if (soNumber && !soNumber.startsWith("SO")) {
      soNumber = `SO${soNumber}`
    }

    // Colors & Color Codes
    let colorNames = cleanStr(item.color_names || linkedCat?.color_names)
    let colorCodes = cleanStr(item.color_codes || linkedCat?.color_codes)

    if (!colorNames && linkedCat?.id) {
      const catColors = colorsByCatalogId.get(linkedCat.id)
      if (catColors && catColors.names.length > 0) {
        colorNames = catColors.names.join(", ")
        colorCodes = catColors.codes.join("X")
      }
    }

    // Fibers
    let fiberConfig = cleanStr(item.fiber_configuration || linkedCat?.fiber_configuration)
    if (!fiberConfig && linkedCat?.id) {
      const catFibers = fibersByCatalogId.get(linkedCat.id)
      if (catFibers && catFibers.length > 0) {
        fiberConfig = catFibers.join(" / ")
      }
    }

    // Collection
    const collectionName =
      cleanStr(item.collection_name) ||
      cleanStr(linkedCat?.collection_name) ||
      (item.collection_id ? collectionsMap.get(item.collection_id) : "") ||
      (linkedCat?.collection_id ? collectionsMap.get(linkedCat.collection_id) : "") ||
      ""

    // Construction
    const constructionName =
      cleanStr(item.construction_name) ||
      cleanStr(linkedCat?.construction_name) ||
      (item.construction_id ? constructionsMap.get(item.construction_id) : "") ||
      (linkedCat?.construction_id ? constructionsMap.get(linkedCat.construction_id) : "") ||
      ""

    // Location, State, Country
    const locInfo = item.location_id ? locationsMap.get(item.location_id) : null
    const locationName = cleanStr(item.location_name) || locInfo?.name || ""
    const stateName = cleanStr(item.location_state || item.state) || locInfo?.state || ""
    const countryName = cleanStr(item.location_country || item.country) || locInfo?.country || ""

    // Product Code & SKU
    let productCode = cleanStr(item.product_code || linkedCat?.product_code)
    if (!productCode && (qualityPrefix || qualityCode) && designCode) {
      productCode = `${qualityPrefix || qualityCode}${designCode}${colorCodes ? `${colorCodes}` : ""}`
    }

    let sku = cleanStr(item.sku || linkedCat?.sku)
    if (!sku && productCode && soNumber) {
      sku = `SA-${productCode}-${soNumber}`
    }

    // Status
    const itemStatus = item.is_sold ? "Sold" : "Available"
    const catalogStatus =
      item.is_active === false || linkedCat?.is_active === false
        ? "Discontinued"
        : "Active"
    const createdDate = formatDate(item.created_at)

    return {
      "Serial Number": cleanStr(item.serial_number),
      "SKU": sku,
      "Product Type": productType,
      "Product Code": productCode,
      "Quality": qualityName,
      "Quality Code": qualityCode,
      "Quality Prefix": qualityPrefix,
      "Design": designName,
      "Design Code": designCode,
      "Colors": colorNames,
      "Color Codes": colorCodes,
      "Size": sizeLabel,
      "SO Number": soNumber,
      "Collection": collectionName,
      "Construction": constructionName,
      "Fibers": fiberConfig,
      "Location": locationName,
      "State": stateName,
      "Country": countryName,
      "Item Status": itemStatus,
      "Catalog Status": catalogStatus,
      "Created Date": createdDate,
    }
  })

  // 6. Generate Excel workbook
  const ws = XLSX.utils.json_to_sheet(exportData)

  // Auto-adjust column widths based on content length
  const colWidths = Object.keys(exportData[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...exportData.map((row) => String((row as any)[key] || "").length)
    )
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) }
  })
  ws["!cols"] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Serial_Numbers")
  XLSX.writeFile(wb, `shyam_ahuja_serial_numbers_export_${Date.now()}.xlsx`)
  toast.success(`Exported ${exportData.length} unique serial number records!`)
}
