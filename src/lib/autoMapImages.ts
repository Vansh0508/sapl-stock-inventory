import { supabase } from "@/lib/supabase/client"

export interface AutoMapResult {
  mappedCount: number
  scannedCount: number
  message: string
}

export async function autoMapMediaImagesToSerials(): Promise<AutoMapResult> {
  const bucketName = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "images"

  // 1. Fetch all inventory serial numbers and IDs (paginated)
  const allInventory: Array<{ id: string; serial_number: string }> = []
  let invFrom = 0
  let invHasMore = true

  while (invHasMore) {
    const { data, error } = await (supabase
      .from("inventory" as any) as any)
      .select("id, serial_number")
      .range(invFrom, invFrom + 999)

    if (error) {
      console.error("Failed to fetch inventory rows:", error)
      throw new Error(`Inventory query failed: ${error.message}`)
    }

    if (data && (data as any[]).length > 0) {
      allInventory.push(...(data as any[]))
      if ((data as any[]).length < 1000) invHasMore = false
      else invFrom += 1000
    } else {
      invHasMore = false
    }
  }

  if (allInventory.length === 0) {
    return { mappedCount: 0, scannedCount: 0, message: "No inventory serial numbers found in database." }
  }

  // Build Map of normalized serial number -> inventory id
  const serialToIdMap = new Map<string, string>()
  allInventory.forEach((inv) => {
    if (inv.serial_number) {
      const norm = inv.serial_number.trim().toLowerCase()
      serialToIdMap.set(norm, inv.id)
    }
  })

  // 2. Fetch existing inventory_images mapping (paginated) to avoid duplicate requests
  const existingImagesMap = new Map<string, string>() // storage_path -> id
  let imgFrom = 0
  let imgHasMore = true

  while (imgHasMore) {
    const { data, error } = await (supabase
      .from("inventory_images" as any) as any)
      .select("id, storage_path")
      .range(imgFrom, imgFrom + 999)

    if (error) break

    if (data && (data as any[]).length > 0) {
      (data as any[]).forEach((r: any) => {
        if (r.storage_path) existingImagesMap.set(r.storage_path, r.id)
      })
      if ((data as any[]).length < 1000) imgHasMore = false
      else imgFrom += 1000
    } else {
      imgHasMore = false
    }
  }

  // 3. Scan media folders in Supabase Storage with offset pagination
  const baseFolders = [
    "media",
    "media/Head",
    "media/Floor",
    "media/Corner",
    "media/Closeup",
    "media/Tag",
    "media/Unorganized",
    "",
  ]

  const discoveredFolders = new Set<string>(baseFolders)

  // Discover any additional dynamic subfolders inside "media"
  try {
    const { data: mediaItems } = await supabase.storage.from(bucketName).list("media", { limit: 1000 })
    if (mediaItems) {
      for (const item of mediaItems) {
        if (!item.id && item.name && !item.name.startsWith(".")) {
          discoveredFolders.add(`media/${item.name}`)
        }
      }
    }
  } catch (e) {
    // Ignore discovery error
  }

  const imageFiles: Array<{ name: string; path: string }> = []

  for (const folderPath of Array.from(discoveredFolders)) {
    let offset = 0
    let hasMoreFiles = true

    while (hasMoreFiles) {
      try {
        const { data: fileList, error: listErr } = await supabase.storage.from(bucketName).list(folderPath, {
          limit: 1000,
          offset: offset,
          sortBy: { column: "name", order: "asc" },
        })

        if (listErr || !fileList || fileList.length === 0) {
          hasMoreFiles = false
          break
        }

        for (const item of fileList) {
          if (!item.name || item.name.startsWith(".")) continue
          // File check: either has item.id or metadata size
          const isFile = item.id || (item.metadata && Object.keys(item.metadata).length > 0)
          if (isFile) {
            const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name
            imageFiles.push({ name: item.name, path: fullPath })
          }
        }

        if (fileList.length < 1000) {
          hasMoreFiles = false
        } else {
          offset += 1000
        }
      } catch (e) {
        hasMoreFiles = false
      }
    }
  }

  if (imageFiles.length === 0) {
    return { mappedCount: 0, scannedCount: 0, message: "No image files found in storage media folders." }
  }

  // 4. Match image filenames to serial numbers & prepare database batch operations
  const recordsToInsert: Array<{ inventory_id: string; storage_path: string; public_url: string; sort_order: number }> = []
  const recordsToUpdate: Array<{ id: string; inventory_id: string; public_url: string }> = []

  let mappedCount = 0

  for (const file of imageFiles) {
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "").trim()
    
    // Pattern 1: match SP-xxxxx or SP-xxxx (e.g. SP-00997)
    const spMatch = nameWithoutExt.match(/^(SP-[A-Za-z0-9]+)/i)
    
    let matchedSerial = ""
    if (spMatch) {
      matchedSerial = spMatch[1].trim().toLowerCase()
    } else {
      // Pattern 2: split by space, parenthesis, underscore, or dot
      const parts = nameWithoutExt.split(/[\s(_.-]/)
      if (parts[0]) {
        matchedSerial = parts[0].trim().toLowerCase()
      }
    }

    if (!matchedSerial) continue

    const invId = serialToIdMap.get(matchedSerial)
    if (!invId) continue

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(file.path)

    const publicUrl = urlData.publicUrl
    const existingId = existingImagesMap.get(file.path)

    if (existingId) {
      recordsToUpdate.push({
        id: existingId,
        inventory_id: invId,
        public_url: publicUrl,
      })
      mappedCount++
    } else {
      recordsToInsert.push({
        inventory_id: invId,
        storage_path: file.path,
        public_url: publicUrl,
        sort_order: 0,
      })
      mappedCount++
    }
  }

  // 5. Batch insert new records in chunks of 500
  const CHUNK_SIZE = 500
  for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
    const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE)
    const { error: insertErr } = await (supabase.from("inventory_images" as any) as any).insert(chunk)
    if (insertErr) {
      console.error("Batch insert inventory_images error:", insertErr)
    }
  }

  // Batch update existing records in chunks
  for (const item of recordsToUpdate) {
    await (supabase
      .from("inventory_images" as any) as any)
      .update({ inventory_id: item.inventory_id, public_url: item.public_url })
      .eq("id", item.id)
  }

  return {
    mappedCount,
    scannedCount: imageFiles.length,
    message: `Successfully mapped ${mappedCount} images out of ${imageFiles.length} storage files scanned across all media folders.`,
  }
}
