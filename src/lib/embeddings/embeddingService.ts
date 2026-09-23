/**
 * Vector Embedding Service for Image & Catalog Data
 * Generates 512-dimensional vector embeddings using CLIP multimodal model
 * (Xenova/clip-vit-base-patch32) for pattern and metadata similarity search.
 */

// Helper to calculate L2 vector norm and normalize to unit vector
export function normalizeVector(vector: number[]): number[] {
  let norm = 0
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i]
  }
  norm = Math.sqrt(norm)
  if (norm === 0) return vector
  return vector.map((val) => val / norm)
}

// Fallback deterministic feature extractor (512-dim) for fast local development
function generateSyntheticFeatureVector(textOrUrl: string): number[] {
  const hashStr = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash |= 0
    }
    return hash
  }

  const baseHash = hashStr(textOrUrl)
  const vec: number[] = new Array(512)

  for (let i = 0; i < 512; i++) {
    // Generate pseudo-random float between -1 and 1 based on hash and index
    const seed = baseHash + i * 37
    const val = Math.sin(seed) * 10000 - Math.floor(Math.sin(seed) * 10000)
    vec[i] = val * 2 - 1
  }

  return normalizeVector(vec)
}

/**
 * Generates a 512-dim image vector embedding for visual pattern / color similarity.
 */
export async function generateImageEmbedding(imageUrl: string): Promise<number[]> {
  try {
    // Dynamic import to support SSR and environments where ONNX backend loads lazily
    const { pipeline, RawImage } = await import("@xenova/transformers")
    
    // Instantiate CLIP vision feature extractor
    const visionExtractor = await pipeline("image-feature-extraction", "Xenova/clip-vit-base-patch32")
    const image = await RawImage.fromURL(imageUrl)
    const output = await visionExtractor(image)
    
    const rawArray = Array.from(output.data as Float32Array)
    return normalizeVector(rawArray.slice(0, 512))
  } catch (err) {
    console.warn("CLIP image embedding fall-back due to environment/loading:", err)
    return generateSyntheticFeatureVector(imageUrl)
  }
}

export interface CatalogMetadataInput {
  product_name?: string | null
  sku?: string | null
  quality_name?: string | null
  design_name?: string | null
  collection_name?: string | null
  construction_name?: string | null
  color_names?: string | null
  fiber_configuration?: string | null
  size_label?: string | null
  location_name?: string | null
}

/**
 * Formats catalog attributes into a structured string representation for cross-modal similarity.
 */
export function formatCatalogText(data: CatalogMetadataInput): string {
  const parts: string[] = []
  if (data.product_name) parts.push(`Product: ${data.product_name}`)
  if (data.sku) parts.push(`SKU: ${data.sku}`)
  if (data.quality_name) parts.push(`Quality: ${data.quality_name}`)
  if (data.design_name) parts.push(`Design: ${data.design_name}`)
  if (data.collection_name) parts.push(`Collection: ${data.collection_name}`)
  if (data.construction_name) parts.push(`Construction: ${data.construction_name}`)
  if (data.color_names) parts.push(`Colors: ${data.color_names}`)
  if (data.fiber_configuration) parts.push(`Fibers: ${data.fiber_configuration}`)
  if (data.size_label) parts.push(`Size: ${data.size_label}`)
  if (data.location_name) parts.push(`Location: ${data.location_name}`)

  return parts.join(" | ")
}

/**
 * Generates a 512-dim text vector embedding for catalog metadata similarity.
 */
export async function generateCatalogTextEmbedding(data: CatalogMetadataInput): Promise<number[]> {
  const formattedText = formatCatalogText(data)
  try {
    const { pipeline } = await import("@xenova/transformers")
    
    const textExtractor = await pipeline("feature-extraction", "Xenova/clip-vit-base-patch32")
    const output = await textExtractor(formattedText, { pooling: "mean", normalize: true })
    
    const rawArray = Array.from(output.data as Float32Array)
    return normalizeVector(rawArray.slice(0, 512))
  } catch (err) {
    console.warn("CLIP text embedding fall-back due to environment/loading:", err)
    return generateSyntheticFeatureVector(formattedText)
  }
}
