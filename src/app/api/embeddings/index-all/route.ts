import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase/client"
import { generateCatalogTextEmbedding } from "@/lib/embeddings/embeddingService"
import { indexStorageImagesToVectorStore } from "@/lib/embeddings/storageVectorStore"

export const maxDuration = 300 // 5 minutes execution budget for batch processing

export async function POST() {
  try {
    let indexedImages = 0
    let indexedCatalog = 0

    // 1. Index storage files into Supabase Storage Vectors
    const storageResult = await indexStorageImagesToVectorStore(100)
    indexedImages = storageResult.newlyIndexed

    // 2. Scan Catalog SKUs without text embeddings
    const { data: catalogItems } = await (supabase as any)
      .from("view_catalog_full")
      .select("*")

    if (catalogItems && catalogItems.length > 0) {
      for (const cat of (catalogItems as any[])) {
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
          } catch (e: any) {
            console.error(`Failed to process catalog SKU ${cat.id}:`, e)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Vector embedding scan completed. Indexed ${indexedImages} storage images and ${indexedCatalog} catalog records.`,
      totalStorageFilesFound: storageResult.totalFound,
      totalInStore: storageResult.totalInStore,
      indexedImages,
      indexedCatalog,
    })
  } catch (err: any) {
    console.error("Embedding API route error:", err)
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process vector embeddings." },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
