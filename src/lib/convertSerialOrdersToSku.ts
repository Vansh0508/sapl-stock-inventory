import { supabase } from "@/lib/supabase/client"

export interface ConvertResult {
  totalSerialsProcessed: number
  uniqueSkusCount: number
  newSkusCreated: number
  serialsUpdated: number
  message: string
}

/**
 * Normalizes SKU strings for matching.
 */
function cleanStr(val: any): string {
  if (val === null || val === undefined) return ""
  return String(val).trim()
}

/**
 * Scans all serial numbers / physical pieces in `inventory`,
 * derives and merges them into unique SKU codes, creates/updates catalog rows,
 * and points every serial number directly into its respective SKU.
 */
export async function convertSerialOrdersToSku(): Promise<ConvertResult> {
  // 1. Fetch all inventory pieces (paginated in chunks of 1000)
  let allInventory: any[] = []
  let from = 0
  let hasMore = true

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
        product_code
      `)
      .order("created_at", { ascending: true })
      .range(from, from + 999)

    if (error) throw new Error(`Failed to load inventory serials: ${error.message}`)
    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allInventory = allInventory.concat(data)
      if (data.length < 1000) {
        hasMore = false
      } else {
        from += 1000
      }
    }
  }

  if (allInventory.length === 0) {
    return {
      totalSerialsProcessed: 0,
      uniqueSkusCount: 0,
      newSkusCreated: 0,
      serialsUpdated: 0,
      message: "No serial numbers found in inventory to convert.",
    }
  }

  // 2. Fetch all current catalog rows (paginated)
  let allCatalog: any[] = []
  from = 0
  hasMore = true

  while (hasMore) {
    const { data, error } = await (supabase
      .from("catalog" as any) as any)
      .select(`
        id,
        sku,
        product_code,
        product_type_id,
        size_id,
        quality_id,
        quality_code,
        design_id,
        design_code,
        collection_id,
        construction_id,
        is_active
      `)
      .range(from, from + 999)

    if (error) throw new Error(`Failed to load catalog: ${error.message}`)
    if (!data || data.length === 0) {
      hasMore = false
    } else {
      allCatalog = allCatalog.concat(data)
      if (data.length < 1000) {
        hasMore = false
      } else {
        from += 1000
      }
    }
  }

  // Fetch reference defaults if piece lacks certain IDs
  const [typesRes, sizesRes, qualitiesRes, designsRes, qualityCodesRes, designCodesRes] = await Promise.all([
    (supabase.from("product_types" as any) as any).select("id, product_name").limit(1),
    (supabase.from("sizes" as any) as any).select("id, size_label, so_seq").limit(1),
    (supabase.from("qualities" as any) as any).select("id, quality_name").limit(1),
    (supabase.from("designs" as any) as any).select("id, design_name").limit(1),
    (supabase.from("quality_codes" as any) as any).select("id, quality_id, quality_code, quality_prefix"),
    (supabase.from("design_codes" as any) as any).select("id, design_id, design_code"),
  ])

  const defaultTypeId = typesRes.data?.[0]?.id || ""
  const defaultSizeId = sizesRes.data?.[0]?.id || ""
  const defaultQualityId = qualitiesRes.data?.[0]?.id || ""
  const defaultDesignId = designsRes.data?.[0]?.id || ""
  const allQualityCodes: any[] = qualityCodesRes.data || []
  const allDesignCodes: any[] = designCodesRes.data || []

  // Create a map of existing catalog items by their signature and by ID
  const catalogById = new Map<string, any>()
  for (const cat of allCatalog) {
    catalogById.set(cat.id, cat)
  }

  // Helper to generate a unique signature key for a SKU definition
  const getSignature = (
    typeId: string,
    qualId: string,
    qualCode: string,
    desId: string,
    desCode: string,
    sizeId: string,
    collId?: string | null,
    constId?: string | null
  ) => {
    return [
      cleanStr(typeId),
      cleanStr(qualId),
      cleanStr(qualCode).toUpperCase(),
      cleanStr(desId),
      cleanStr(desCode).toUpperCase(),
      cleanStr(sizeId),
      cleanStr(collId),
      cleanStr(constId),
    ].join("::")
  }

  // Map existing catalog items by signature
  const catalogBySignature = new Map<string, any>()
  for (const cat of allCatalog) {
    const sig = getSignature(
      cat.product_type_id,
      cat.quality_id,
      cat.quality_code,
      cat.design_id,
      cat.design_code,
      cat.size_id,
      cat.collection_id,
      cat.construction_id
    )
    if (!catalogBySignature.has(sig)) {
      catalogBySignature.set(sig, cat)
    }
  }

  // 3. Group all inventory pieces by their resolved product dimension signature
  interface SkuGroup {
    signature: string
    product_type_id: string
    quality_id: string
    quality_code: string
    design_id: string
    design_code: string
    size_id: string
    collection_id: string | null
    construction_id: string | null
    inventoryItems: any[]
    resolvedCatalogId?: string
    resolvedSku?: string
  }

  const groups = new Map<string, SkuGroup>()

  for (const item of allInventory) {
    // Resolve attributes from inventory piece directly, or fallback to linked catalog row
    const linkedCat = item.catalog_id ? catalogById.get(item.catalog_id) : null

    let typeId = item.product_type_id || linkedCat?.product_type_id || defaultTypeId
    let qualId = item.quality_id || linkedCat?.quality_id || defaultQualityId
    let qualCode = item.quality_code || linkedCat?.quality_code || ""
    let desId = item.design_id || linkedCat?.design_id || defaultDesignId
    let desCode = item.design_code || linkedCat?.design_code || ""
    let sizeId = item.size_id || linkedCat?.size_id || defaultSizeId
    let collId = item.collection_id || linkedCat?.collection_id || null
    let constId = item.construction_id || linkedCat?.construction_id || null

    // If quality_code is missing, try to find a valid code for quality_id
    if (!qualCode && qualId) {
      const matchedQc = allQualityCodes.find((qc) => qc.quality_id === qualId)
      if (matchedQc) qualCode = matchedQc.quality_code
    }

    // If design_code is missing, try to find a valid code for design_id
    if (!desCode && desId) {
      const matchedDc = allDesignCodes.find((dc) => dc.design_id === desId)
      if (matchedDc) desCode = matchedDc.design_code
    }

    const sig = getSignature(typeId, qualId, qualCode, desId, desCode, sizeId, collId, constId)

    if (!groups.has(sig)) {
      groups.set(sig, {
        signature: sig,
        product_type_id: typeId,
        quality_id: qualId,
        quality_code: qualCode,
        design_id: desId,
        design_code: desCode,
        size_id: sizeId,
        collection_id: collId,
        construction_id: constId,
        inventoryItems: [],
      })
    }

    groups.get(sig)!.inventoryItems.push(item)
  }

  let newSkusCreated = 0
  const activeCatalogIds = new Set<string>()

  // 4. For each unique group derived from serial numbers, find or create the Catalog row
  for (const group of groups.values()) {
    let matchedCat = catalogBySignature.get(group.signature)

    if (!matchedCat) {
      // Create new Catalog row for this unique SKU group
      const { data: newCat, error: catErr } = await (supabase
        .from("catalog" as any) as any)
        .insert({
          product_type_id: group.product_type_id,
          size_id: group.size_id,
          quality_id: group.quality_id,
          quality_code: group.quality_code,
          design_id: group.design_id,
          design_code: group.design_code,
          collection_id: group.collection_id,
          construction_id: group.construction_id,
          is_active: true,
        })
        .select("id, sku, product_code")
        .single()

      if (catErr) {
        console.error("Error creating new catalog SKU for group:", group, catErr)
        // If unique constraint or other error, fallback to re-fetching
        const { data: retryCat } = await (supabase
          .from("catalog" as any) as any)
          .select("id, sku, product_code")
          .eq("product_type_id", group.product_type_id)
          .eq("size_id", group.size_id)
          .eq("quality_id", group.quality_id)
          .eq("quality_code", group.quality_code)
          .eq("design_id", group.design_id)
          .eq("design_code", group.design_code)
          .maybeSingle()

        matchedCat = retryCat
      } else {
        matchedCat = newCat
        newSkusCreated++
      }

      if (matchedCat) {
        catalogBySignature.set(group.signature, matchedCat)
        catalogById.set(matchedCat.id, matchedCat)
      }
    } else {
      // Ensure existing catalog row is marked active
      if (!matchedCat.is_active) {
        await (supabase.from("catalog" as any) as any)
          .update({ is_active: true })
          .eq("id", matchedCat.id)
      }
    }

    if (matchedCat) {
      group.resolvedCatalogId = matchedCat.id
      group.resolvedSku = matchedCat.sku
      activeCatalogIds.add(matchedCat.id)
    }
  }

  // 5. Update every inventory piece to point to its resolved catalog_id and sku
  let serialsUpdated = 0
  const inventoryUpdates: Array<{
    id: string
    catalog_id: string
    sku: string | null
    product_type_id: string
    quality_id: string
    quality_code: string
    design_id: string
    design_code: string
    size_id: string
    collection_id: string | null
    construction_id: string | null
  }> = []

  for (const group of groups.values()) {
    if (!group.resolvedCatalogId) continue

    for (const inv of group.inventoryItems) {
      inventoryUpdates.push({
        id: inv.id,
        catalog_id: group.resolvedCatalogId,
        sku: group.resolvedSku || null,
        product_type_id: group.product_type_id,
        quality_id: group.quality_id,
        quality_code: group.quality_code,
        design_id: group.design_id,
        design_code: group.design_code,
        size_id: group.size_id,
        collection_id: group.collection_id,
        construction_id: group.construction_id,
      })
    }
  }

  // Execute inventory updates in batches
  const BATCH_SIZE = 50
  for (let i = 0; i < inventoryUpdates.length; i += BATCH_SIZE) {
    const batch = inventoryUpdates.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map(async (row) => {
        const { error } = await (supabase
          .from("inventory" as any) as any)
          .update({
            catalog_id: row.catalog_id,
            sku: row.sku,
            product_type_id: row.product_type_id,
            quality_id: row.quality_id,
            quality_code: row.quality_code,
            design_id: row.design_id,
            design_code: row.design_code,
            size_id: row.size_id,
            collection_id: row.collection_id,
            construction_id: row.construction_id,
          })
          .eq("id", row.id)

        if (!error) serialsUpdated++
      })
    )
  }

  // 6. Complete override: Mark any catalog rows not in the active serial definitions as discontinued / inactive
  for (const cat of allCatalog) {
    if (!activeCatalogIds.has(cat.id) && cat.is_active) {
      await (supabase.from("catalog" as any) as any)
        .update({ is_active: false })
        .eq("id", cat.id)
    }
  }

  return {
    totalSerialsProcessed: allInventory.length,
    uniqueSkusCount: groups.size,
    newSkusCreated,
    serialsUpdated,
    message: `Successfully converted ${allInventory.length} serial pieces into ${groups.size} unique SKUs (${newSkusCreated} new SKUs created, ${serialsUpdated} pieces linked).`,
  }
}
