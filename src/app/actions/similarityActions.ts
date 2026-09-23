"use server"

import { supabase } from "@/lib/supabase/client"
import { listFolder, getPublicUrl } from "@/lib/supabase/storage"
import { generateImageEmbedding, generateCatalogTextEmbedding, type CatalogMetadataInput } from "@/lib/embeddings/embeddingService"
import {
  findSimilarStorageVectors,
  indexStorageImagesToVectorStore,
  loadVectorManifest,
} from "@/lib/embeddings/storageVectorStore"

export interface SimilarImageResult {
  image_id: string
  inventory_id: string
  storage_path: string
  public_url: string
  similarity: number
  sku: string | null
  serial_number: string | null
  product_name: string | null
  quality_name: string | null
  design_name: string | null
  color_names: string | null
  collection_name: string | null
  size_label: string | null
}

export interface SimilarCatalogResult {
  catalog_id: string
  sku: string
  product_name: string | null
  quality_name: string | null
  design_name: string | null
  color_names: string | null
  collection_name: string | null
  size_label: string | null
  construction_name: string | null
  fiber_configuration: string | null
  similarity: number
  sample_image_url: string | null
}

export interface SearchSimilarityResponse {
  success: boolean
  imageMatches: SimilarImageResult[]
  catalogMatches: SimilarCatalogResult[]
  error?: string
}

/**
 * Searches for visually similar images and matching catalog data-points.
 * Uses Supabase Storage Vector RPC + Storage Vector Store fallback.
 */
export async function findSimilarItemsAction(params: {
  imageUrl?: string
  imageId?: string
  catalogId?: string
  catalogMetadata?: CatalogMetadataInput
  limit?: number
}): Promise<SearchSimilarityResponse> {
  try {
    const limit = params.limit || 20
    let queryEmbedding: number[] | null = null

    // 1. If imageId is provided, check if it already has a saved embedding
    if (params.imageId) {
      const { data: imgData } = await (supabase as any)
        .from("storage_image_vectors")
        .select("embedding, public_url")
        .eq("storage_path", params.imageId)
        .maybeSingle()

      const rawImg = imgData as any
      if (rawImg?.embedding && Array.isArray(rawImg.embedding)) {
        queryEmbedding = rawImg.embedding
      } else if (rawImg?.public_url) {
        queryEmbedding = await generateImageEmbedding(rawImg.public_url)
      }
    }

    // 2. If imageUrl is provided and no embedding found yet
    if (!queryEmbedding && params.imageUrl) {
      queryEmbedding = await generateImageEmbedding(params.imageUrl)
    }

    // 3. If catalogMetadata is provided
    if (!queryEmbedding && params.catalogMetadata) {
      queryEmbedding = await generateCatalogTextEmbedding(params.catalogMetadata)
    }

    // 4. Fallback if no embedding could be generated
    if (!queryEmbedding) {
      return { success: false, imageMatches: [], catalogMatches: [], error: "Could not generate search embedding vector." }
    }

    const vectorString = JSON.stringify(queryEmbedding)
    let imageMatches: SimilarImageResult[] = []

    // Attempt Supabase Storage Vector RPC (match_storage_images)
    try {
      const { data: storageRpcData, error: storageRpcErr } = await (supabase as any).rpc("match_storage_images", {
        query_embedding: vectorString,
        match_threshold: 0.0,
        match_count: limit,
        exclude_path: params.imageId || null,
      })

      if (!storageRpcErr && storageRpcData && storageRpcData.length > 0) {
        imageMatches = storageRpcData.map((row: any) => ({
          image_id: row.storage_path,
          inventory_id: row.storage_path,
          storage_path: row.storage_path,
          public_url: row.public_url,
          similarity: row.similarity,
          sku: row.storage_path.split("/").pop() || row.storage_path,
          serial_number: null,
          product_name: row.storage_path.split("/").pop() || row.storage_path,
          quality_name: null,
          design_name: null,
          color_names: null,
          collection_name: null,
          size_label: null,
        }))
      }
    } catch (e) {
      console.warn("Storage Vector RPC match_storage_images warning:", e)
    }

    // If match_storage_images returned no matches, try match_similar_images RPC
    if (imageMatches.length === 0) {
      try {
        const { data: rawImages, error: imgErr } = await (supabase as any).rpc("match_similar_images", {
          query_embedding: vectorString,
          match_threshold: 0.0,
          match_count: limit,
          exclude_image_id: params.imageId || null,
        })

        if (!imgErr && rawImages && rawImages.length > 0) {
          imageMatches = rawImages as SimilarImageResult[]
        }
      } catch (e) {
        console.warn("DB vector RPC match_similar_images warning:", e)
      }
    }

    // If still no matches, fallback to Storage Vector Store manifest.json
    if (imageMatches.length === 0) {
      const storageMatches = await findSimilarStorageVectors(queryEmbedding, limit, params.imageId)
      imageMatches = storageMatches.map((m) => ({
        image_id: m.storagePath,
        inventory_id: m.storagePath,
        storage_path: m.storagePath,
        public_url: m.publicUrl,
        similarity: m.similarity,
        sku: m.fileName,
        serial_number: null,
        product_name: m.fileName,
        quality_name: null,
        design_name: null,
        color_names: null,
        collection_name: null,
        size_label: null,
      }))
    }

    // Call RPC match_similar_catalog
    let catalogMatches: SimilarCatalogResult[] = []
    try {
      const { data: rawCatalog } = await (supabase as any).rpc("match_similar_catalog", {
        query_embedding: vectorString,
        match_threshold: 0.0,
        match_count: limit,
        exclude_catalog_id: params.catalogId || null,
      })
      if (rawCatalog) catalogMatches = rawCatalog as SimilarCatalogResult[]
    } catch (e) {
      console.warn("Catalog similarity RPC warning:", e)
    }

    return {
      success: true,
      imageMatches,
      catalogMatches,
    }
  } catch (err: any) {
    console.error("findSimilarItemsAction error:", err)
    return {
      success: false,
      imageMatches: [],
      catalogMatches: [],
      error: err.message || "An unexpected error occurred during similarity search.",
    }
  }
}

export interface IndexStats {
  totalImages: number
  indexedImages: number
  totalCatalog: number
  indexedCatalog: number
}

/**
 * Retrieves vector indexing statistics from Supabase Storage and Catalog DB.
 */
export async function getVectorStatsAction(): Promise<{ success: boolean; stats?: IndexStats; error?: string }> {
  try {
    const folders = ["Head", "Floor", "Corner", "Closeup", "Tag", "Unorganized"] as const
    let storageFileCount = 0

    for (const folder of folders) {
      const path = folder === "Unorganized" ? "media" : `media/${folder}`
      try {
        const items = await listFolder("images", path, { limit: 1000 })
        const fileItems = items.filter((i) => i.id !== null || (i.name && i.name.includes(".")))
        storageFileCount += fileItems.length
      } catch (e) {
        // ignore folder list error
      }
    }

    // Storage Vector table count
    let storageVectorCount = 0
    try {
      const { count } = await (supabase as any).from("storage_image_vectors").select("*", { count: "exact", head: true })
      storageVectorCount = count || 0
    } catch (e) {
      // table might not exist yet
    }

    const storageManifest = await loadVectorManifest()
    const manifestVectorCount = Object.keys(storageManifest).length
    const totalVectorCount = Math.max(storageVectorCount, manifestVectorCount)

    // Database catalog count
    let totalCatalog = 0
    let indexedCatalog = 0

    try {
      const { count: dbCatCount } = await (supabase.from("catalog" as any) as any).select("*", { count: "exact", head: true })
      totalCatalog = dbCatCount || 0
      const { count: dbIndexedCatCount } = await (supabase.from("catalog" as any) as any).select("*", { count: "exact", head: true }).not("embedding", "is", null)
      indexedCatalog = dbIndexedCatCount || 0
    } catch (e) {
      // DB table might not exist yet
    }

    return {
      success: true,
      stats: {
        totalImages: storageFileCount,
        indexedImages: totalVectorCount,
        totalCatalog,
        indexedCatalog,
      },
    }
  } catch (err: any) {
    const storageManifest = await loadVectorManifest()
    const count = Object.keys(storageManifest).length
    return {
      success: true,
      stats: {
        totalImages: count,
        indexedImages: count,
        totalCatalog: 0,
        indexedCatalog: 0,
      },
    }
  }
}

/**
 * Bulk indexes un-indexed images into Supabase Storage Vectors and Catalog DB.
 */
export async function bulkGenerateEmbeddingsAction(): Promise<{
  success: boolean
  indexedImages: number
  indexedCatalog: number
  error?: string
}> {
  try {
    // 1. Index storage files into storageVectorStore & storage_image_vectors
    const storageResult = await indexStorageImagesToVectorStore(25)
    let indexedImages = storageResult.newlyIndexed

    // Also sync vectors to storage_image_vectors table if it exists
    const storageManifest = await loadVectorManifest()
    for (const [storagePath, vector] of Object.entries(storageManifest)) {
      try {
        const publicUrl = getPublicUrl("images", storagePath)
        await (supabase as any)
          .from("storage_image_vectors")
          .upsert({
            storage_path: storagePath,
            public_url: publicUrl,
            bucket_id: "images",
            embedding: JSON.stringify(vector) as any,
          }, { onConflict: "storage_path" })
      } catch (e) {
        // DB table optional
      }
    }

    // 2. Database catalog vector indexer
    let indexedCatalog = 0
    const { data: unindexedCat } = await (supabase as any)
      .from("view_catalog_full")
      .select("*")

    if (unindexedCat && unindexedCat.length > 0) {
      for (const cat of (unindexedCat as any[])) {
        if (!cat.id) continue
        const { data: catRecord } = await (supabase as any)
          .from("catalog")
          .select("embedding")
          .eq("id", cat.id)
          .single()

        if (catRecord && !(catRecord as any).embedding) {
          try {
            const vec = await generateCatalogTextEmbedding({
              product_name: cat.product_name,
              sku: cat.sku,
              quality_name: cat.quality_name,
              design_name: cat.design_name,
              collection_name: cat.collection_name,
              construction_name: cat.construction_name,
              color_names: cat.color_names,
              fiber_configuration: cat.fiber_configuration,
              size_label: cat.size_label,
            })

            await (supabase as any)
              .from("catalog")
              .update({ embedding: JSON.stringify(vec) } as any)
              .eq("id", cat.id)
            indexedCatalog++
          } catch (e) {
            console.error(`Failed to index catalog ${cat.id}:`, e)
          }
        }
      }
    }

    return { success: true, indexedImages, indexedCatalog }
  } catch (err: any) {
    console.error("bulkGenerateEmbeddingsAction error:", err)
    return { success: false, indexedImages: 0, indexedCatalog: 0, error: err.message }
  }
}
