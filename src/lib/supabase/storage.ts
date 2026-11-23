import { supabase } from "./client"
import {
  CONTENT_STORAGE_BUCKET,
  EMPTY_FOLDER_PLACEHOLDER,
  FABRIC_SUBFOLDERS,
  FABRICS_STORAGE_PREFIX,
} from "@/lib/content-folders"

export interface StorageListOptions {
  limit?: number
  offset?: number
  search?: string
}

export interface StorageListItem {
  name: string
  id: string | null
  created_at: string | null
  metadata?: { size: number; mimetype: string }
}

/** Thin wrapper around bucket.list() so callers get a consistent page-shaped result. */
export async function listFolder(
  bucket: string,
  path: string,
  { limit = 60, offset = 0, search }: StorageListOptions = {}
): Promise<StorageListItem[]> {
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    limit,
    offset,
    search,
    sortBy: { column: "created_at", order: "desc" },
  })
  if (error) throw error
  return (data ?? []) as StorageListItem[]
}

/** Pass `upsert: false` to make the upload fail (409) instead of overwriting an existing file. */
export async function uploadImage(
  bucket: string,
  path: string,
  file: File,
  { upsert = true }: { upsert?: boolean } = {}
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert })
  if (error) throw error
  return getPublicUrl(bucket, path)
}

export async function deleteImage(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

/**
 * Relocates a file within a bucket via download → upload → delete instead of the
 * native move()/copy() endpoints — those returned 400s against this project's
 * self-hosted storage-api version even for files that demonstrably exist.
 */
export async function moveImage(bucket: string, oldPath: string, newPath: string): Promise<void> {
  const { data: blob, error: downloadErr } = await supabase.storage.from(bucket).download(oldPath)
  if (downloadErr || !blob) throw downloadErr ?? new Error(`Could not download ${oldPath}`)

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(newPath, blob, { upsert: true })
  if (uploadErr) throw uploadErr

  const { error: removeErr } = await supabase.storage.from(bucket).remove([oldPath])
  if (removeErr) throw removeErr
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

let ensureFabricsPromise: Promise<void> | null = null

/**
 * Ensures the Fabrics subfolders (Closeup, Head, Tag, Texture) exist under
 * `images/Fabrics/` (mapped to `/stub/images/Fabrics/...` on self-hosted storage).
 * Idempotent: runs once per session and never overwrites existing objects.
 */
export function ensureFabricsFolders(): Promise<void> {
  if (ensureFabricsPromise) return ensureFabricsPromise

  ensureFabricsPromise = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(CONTENT_STORAGE_BUCKET)
        .list(FABRICS_STORAGE_PREFIX, { limit: 100 })

      if (error) {
        console.warn("Could not inspect Fabrics folder in storage:", error.message)
        ensureFabricsPromise = null
        return
      }

      const existing = new Set((data ?? []).map((item) => item.name.toLowerCase()))
      const missing = FABRIC_SUBFOLDERS.filter((sub) => !existing.has(sub.toLowerCase()))

      if (missing.length === 0) return

      await Promise.all(
        missing.map(async (sub) => {
          const placeholderPath = `${FABRICS_STORAGE_PREFIX}/${sub}/${EMPTY_FOLDER_PLACEHOLDER}`
          const placeholder = new Blob([""], { type: "text/plain" })
          const { error: uploadErr } = await supabase.storage
            .from(CONTENT_STORAGE_BUCKET)
            .upload(placeholderPath, placeholder, { upsert: false, contentType: "text/plain" })

          if (uploadErr) {
            const errObj = uploadErr as { statusCode?: string | number; status?: string | number; message?: string }
            const status = String(errObj.statusCode ?? errObj.status ?? "")
            const isDuplicate = status === "409" || /already exists|duplicate/i.test(errObj.message ?? "")
            if (!isDuplicate) {
              console.warn(`Could not initialize folder ${FABRICS_STORAGE_PREFIX}/${sub}:`, uploadErr.message)
            }
          }
        })
      )
    } catch (err) {
      console.warn("Failed to ensure Fabrics storage folders:", err)
      ensureFabricsPromise = null
    }
  })()

  return ensureFabricsPromise
}

/**
 * ImageKit real-time on-the-fly image optimization helper.
 * If NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is configured, routes the public URL
 * through ImageKit.io with real-time format auto-conversions (WebP/AVIF) and
 * high-fidelity quality presets without modifying or storing files on ImageKit servers.
 * Supports multi-bucket/multi-folder paths and HTTP/HTTPS VPS storage origins.
 * Falls back cleanly to original publicUrl if no endpoint is configured.
 */
export function getThumbnailUrl(
  publicUrl: string,
  opts: { width?: number; quality?: number; format?: string } = {}
): string {
  if (!publicUrl) return ""
  if (publicUrl.startsWith("data:") || publicUrl.startsWith("blob:")) {
    return publicUrl
  }
  if (publicUrl.startsWith("/api/image-proxy?")) {
    return publicUrl
  }

  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
  if (endpoint) {
    // Guard for local/LAN network URLs (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x, 172.16-31.x.x).
    if (
      !publicUrl.includes("://localhost") &&
      !publicUrl.includes("://127.0.0.1") &&
      !publicUrl.includes("://::1") &&
      !/:\/\/192\.168\./.test(publicUrl) &&
      !/:\/\/10\./.test(publicUrl) &&
      !/:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(publicUrl)
    ) {
      const { width, quality = 75, format = "auto" } = opts
      const cleanEndpoint = endpoint.replace(/\/$/, "")

      const trParts: string[] = [`q-${quality}`, `f-${format}`]
      if (width) trParts.push(`w-${width}`)
      const transformParam = `tr:${trParts.join(",")}`

      if (publicUrl.includes("/object/public/")) {
        const relativePath = publicUrl.split("/object/public/")[1]
        return `${cleanEndpoint}/${transformParam}/${relativePath}`
      }

      if (publicUrl.startsWith("http://") || publicUrl.startsWith("https://")) {
        return `${cleanEndpoint}/${transformParam}/${publicUrl}`
      }

      const cleanPath = publicUrl.replace(/^\//, "")
      return `${cleanEndpoint}/${transformParam}/${cleanPath}`
    }
  }

  // Use local Web Proxy endpoint to compress and optimize images on the fly via Sharp
  const { width = 400, quality = 75, format = "webp" } = opts
  return `/api/image-proxy?url=${encodeURIComponent(publicUrl)}&w=${width}&q=${quality}&fmt=${format}`
}

/**
 * Strips any real-time transformation parameters (such as ImageKit web proxy paths or local image proxy)
 * to ensure that downloading or saving an image locally fetches the original, un-transformed
 * full-resolution file directly from storage.
 */
export function getOriginalPublicUrl(url: string): string {
  if (!url) return ""
  if (url.includes("/api/image-proxy?")) {
    try {
      const match = url.match(/url=([^&]+)/)
      if (match) return decodeURIComponent(match[1])
    } catch {
      // fallback
    }
  }
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
  if (endpoint) {
    const cleanEndpoint = endpoint.replace(/\/$/, "")
    if (url.startsWith(cleanEndpoint)) {
      const webProxyMatch = url.match(/\/tr:[^/]+\/(https?:\/\/.+)/)
      if (webProxyMatch) return webProxyMatch[1]

      const relPathMatch = url.replace(`${cleanEndpoint}/`, "").replace(/^tr:[^/]+\//, "")
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321"
      return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${relPathMatch}`
    }
  }
  return url
}
