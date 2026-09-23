/**
 * Pure Supabase Storage-Based Vector Store
 * Stores 512-dimensional CLIP vector embeddings as a high-performance
 * vector manifest file inside Supabase Storage (vector-store/manifest.json)
 * AND syncs directly to Supabase storage_image_vectors database table.
 */

import { supabase } from "@/lib/supabase/client"
import { listFolder, getPublicUrl } from "@/lib/supabase/storage"
import { generateImageEmbedding, normalizeVector } from "./embeddingService"
import type { FolderKey } from "@/lib/content-folders"

const VECTOR_BUCKET = "images"
const MANIFEST_PATH = "vector-store/manifest.json"
const ORGANIZED_FOLDERS: FolderKey[] = ["Head", "Floor", "Corner", "Closeup", "Tag", "Unorganized"]

export type VectorManifest = Record<string, number[]>

let memoryManifestCache: VectorManifest | null = null

/**
 * Downloads the vector manifest file from Supabase Storage.
 */
export async function loadVectorManifest(): Promise<VectorManifest> {
  if (memoryManifestCache) return memoryManifestCache

  try {
    const { data: blob, error } = await supabase.storage
      .from(VECTOR_BUCKET)
      .download(MANIFEST_PATH)

    if (error || !blob) {
      return {}
    }

    const text = await blob.text()
    const manifest: VectorManifest = JSON.parse(text)
    memoryManifestCache = manifest
    return manifest
  } catch (err) {
    console.warn("No existing vector manifest found in storage, starting fresh.")
    return {}
  }
}

/**
 * Uploads the updated vector manifest back to Supabase Storage.
 * Uses Buffer.from for 100% Node.js Server Action compatibility.
 */
export async function saveVectorManifest(manifest: VectorManifest): Promise<void> {
  memoryManifestCache = manifest
  const jsonStr = JSON.stringify(manifest)
  const buffer = Buffer.from(jsonStr, "utf-8")

  const { error } = await supabase.storage
    .from(VECTOR_BUCKET)
    .upload(MANIFEST_PATH, buffer, {
      contentType: "application/json",
      upsert: true,
    })

  if (error) {
    console.error("Failed to save vector manifest to storage:", error)
    throw error
  }
}

/**
 * Scans all Supabase Storage folders, generates 512-dim CLIP vectors for unindexed images,
 * and saves the updated manifest to Storage AND upserts into storage_image_vectors DB table.
 */
export async function indexStorageImagesToVectorStore(
  batchSize = 25
): Promise<{
  success: boolean
  totalFound: number
  alreadyIndexed: number
  newlyIndexed: number
  totalInStore: number
  dbUpsertErrors: number
  error?: string
}> {
  try {
    const manifest = await loadVectorManifest()

    // Query existing records in storage_image_vectors DB table as well
    const dbVectorPaths = new Set<string>()
    try {
      const { data: existingDbRows } = await (supabase as any)
        .from("storage_image_vectors")
        .select("storage_path")
      if (existingDbRows && Array.isArray(existingDbRows)) {
        for (const row of existingDbRows) {
          if (row.storage_path) dbVectorPaths.add(row.storage_path)
        }
      }
    } catch (e) {
      // Table might not exist yet
    }

    const storageFiles: { storagePath: string; publicUrl: string }[] = []

    for (const folder of ORGANIZED_FOLDERS) {
      const path = folder === "Unorganized" ? "media" : `media/${folder}`
      try {
        const items = await listFolder(VECTOR_BUCKET, path, { limit: 1000 })
        for (const item of items) {
          if (!item.name || item.name === ".emptyFolderPlaceholder" || item.name.endsWith("/")) continue
          const isFile = item.id !== null || item.name.includes(".") || item.metadata !== undefined
          if (!isFile) continue

          const storagePath = folder === "Unorganized" ? `media/${item.name}` : `media/${folder}/${item.name}`
          const publicUrl = getPublicUrl(VECTOR_BUCKET, storagePath)
          storageFiles.push({ storagePath, publicUrl })
        }
      } catch (e: any) {
        console.warn(`Could not list ${path}:`, e?.message)
      }
    }

    let newlyIndexed = 0
    let alreadyIndexed = 0
    let dbUpsertErrors = 0

    // Filter unindexed files (unindexed in either Storage Manifest OR DB Table)
    const unindexedFiles = storageFiles.filter((file) => {
      const isStoredInManifest = !!manifest[file.storagePath]
      const isStoredInDb = dbVectorPaths.has(file.storagePath)

      if (isStoredInManifest && isStoredInDb) {
        alreadyIndexed++
        return false
      }
      return true
    })

    // Take current batch
    const batch = unindexedFiles.slice(0, batchSize)

    for (const file of batch) {
      try {
        const vec = await generateImageEmbedding(file.publicUrl)
        const vectorJson = JSON.stringify(vec)

        // 1. Update manifest cache
        manifest[file.storagePath] = vec

        // 2. Direct DB Upsert to storage_image_vectors in Supabase Postgres
        try {
          const { error: dbErr } = await (supabase as any)
            .from("storage_image_vectors")
            .upsert(
              {
                storage_path: file.storagePath,
                public_url: file.publicUrl,
                bucket_id: VECTOR_BUCKET,
                embedding: vectorJson,
              },
              { onConflict: "storage_path" }
            )

          if (dbErr) {
            console.error(`DB Upsert Error for ${file.storagePath}:`, dbErr)
            dbUpsertErrors++
          }
        } catch (dbE: any) {
          console.error("DB Upsert exception:", dbE?.message)
          dbUpsertErrors++
        }

        newlyIndexed++
      } catch (err) {
        console.error(`Failed to generate vector for ${file.storagePath}:`, err)
      }
    }

    if (newlyIndexed > 0) {
      await saveVectorManifest(manifest)
    }

    return {
      success: true,
      totalFound: storageFiles.length,
      alreadyIndexed,
      newlyIndexed,
      totalInStore: Object.keys(manifest).length,
      dbUpsertErrors,
    }
  } catch (err: any) {
    console.error("indexStorageImagesToVectorStore error:", err)
    return {
      success: false,
      totalFound: 0,
      alreadyIndexed: 0,
      newlyIndexed: 0,
      totalInStore: 0,
      dbUpsertErrors: 0,
      error: err.message || "Failed to index storage vectors.",
    }
  }
}

/**
 * Computes cosine similarity between two unit vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
  }
  return dot
}

export interface StorageSimilarityMatch {
  storagePath: string
  publicUrl: string
  similarity: number
  fileName: string
}

/**
 * Fast in-memory cosine similarity search across all vectors stored in vector-store/manifest.json.
 */
export async function findSimilarStorageVectors(
  queryVector: number[],
  topK = 20,
  excludePath?: string
): Promise<StorageSimilarityMatch[]> {
  const manifest = await loadVectorManifest()
  const normQuery = normalizeVector(queryVector)
  const matches: StorageSimilarityMatch[] = []

  for (const [storagePath, vector] of Object.entries(manifest)) {
    if (excludePath && storagePath === excludePath) continue

    const sim = cosineSimilarity(normQuery, vector)
    const fileName = storagePath.split("/").pop() || storagePath
    const publicUrl = getPublicUrl(VECTOR_BUCKET, storagePath)

    matches.push({
      storagePath,
      publicUrl,
      similarity: sim,
      fileName,
    })
  }

  // Sort descending by similarity
  matches.sort((a, b) => b.similarity - a.similarity)
  return matches.slice(0, topK)
}
