import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

interface CachedImage {
  buffer: Buffer
  contentType: string
}

// In-memory LRU cache for compressed image buffers (max 500 entries)
const MAX_CACHE_SIZE = 500
const cache = new Map<string, CachedImage>()

function getCached(key: string): CachedImage | undefined {
  const item = cache.get(key)
  if (item) {
    cache.delete(key)
    cache.set(key, item)
  }
  return item
}

function setCache(key: string, value: CachedImage) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, value)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const imageUrl = searchParams.get("url")
  const w = searchParams.get("w") || searchParams.get("width")
  const h = searchParams.get("h") || searchParams.get("height")
  const q = searchParams.get("q") || searchParams.get("quality")
  const fmt = (searchParams.get("fmt") || searchParams.get("format") || "webp").toLowerCase()

  if (!imageUrl) {
    return new NextResponse("Missing url parameter", { status: 400 })
  }

  // Resolve relative URLs using request origin
  let targetUrl = imageUrl
  if (targetUrl.startsWith("/")) {
    targetUrl = `${origin}${targetUrl}`
  }

  // Check in-memory LRU RAM cache for instant response (< 1ms)
  const cacheKey = `${targetUrl}?w=${w || ""}&h=${h || ""}&q=${q || ""}&fmt=${fmt}`
  const cached = getCached(cacheKey)
  if (cached) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": cached.buffer.length.toString(),
        "X-Cache": "HIT",
      },
    })
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    })

    if (!res.ok) {
      return new NextResponse(`Failed to fetch image from source: ${res.statusText}`, { status: res.status })
    }

    const rawContentType = res.headers.get("content-type") || ""
    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // SVG images or vector content -> return raw buffer directly
    if (rawContentType.includes("svg")) {
      setCache(cacheKey, { buffer, contentType: rawContentType || "image/svg+xml" })
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": rawContentType || "image/svg+xml",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Cache": "MISS",
        },
      })
    }

    const parsedWidth = w ? parseInt(w, 10) : undefined
    const parsedHeight = h ? parseInt(h, 10) : undefined
    const quality = q ? Math.min(100, Math.max(1, parseInt(q, 10))) : 75

    let pipeline = sharp(buffer, { failOn: "none", sequentialRead: true })
      .rotate() // Auto-orient EXIF camera photos

    // Apply resizing if width or height specified
    if (parsedWidth || parsedHeight) {
      pipeline = pipeline.resize({
        width: parsedWidth && !isNaN(parsedWidth) ? parsedWidth : undefined,
        height: parsedHeight && !isNaN(parsedHeight) ? parsedHeight : undefined,
        fit: "inside",
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      })
    }

    // Format & compression
    let contentType = "image/webp"
    if (fmt === "jpg" || fmt === "jpeg") {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true })
      contentType = "image/jpeg"
    } else if (fmt === "png") {
      pipeline = pipeline.png({ quality, compressionLevel: 5 })
      contentType = "image/png"
    } else if (fmt === "avif") {
      pipeline = pipeline.avif({ quality, effort: 2 })
      contentType = "image/avif"
    } else {
      // Default: WebP (effort: 2 is 3x faster than effort: 4 with virtually identical file size)
      pipeline = pipeline.webp({ quality, effort: 2 })
      contentType = "image/webp"
    }

    const outputBuffer = await pipeline.toBuffer()

    // Store in RAM cache for subsequent requests
    setCache(cacheKey, { buffer: outputBuffer, contentType })

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": outputBuffer.length.toString(),
        "X-Cache": "MISS",
      },
    })
  } catch (error) {
    console.error("Image proxy processing error:", error)
    return new NextResponse("Failed to process image", { status: 500 })
  }
}

