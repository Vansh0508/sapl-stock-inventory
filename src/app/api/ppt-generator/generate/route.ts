import { NextResponse } from "next/server"
import PptxGenJS from "pptxgenjs"
import sharp from "sharp"
import type { PptConfig, PptSizeType, PptWishlistItem } from "@/types/ppt.types"
import { PPT_COVER_PAGES } from "@/types/ppt.types"
import { groupItemsByProductCode, groupWishlistItems } from "@/lib/pptGrouping"
import { getOriginalPublicUrl } from "@/lib/supabase/storage"

export const runtime = "nodejs"

interface ImageDataResult {
  dataUri: string
  width?: number
  height?: number
}

/** Extract width and height in pixels directly from image buffer headers (PNG, JPEG, WebP). */
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    // 1. PNG
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    // 2. JPEG
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break
        const marker = buffer[offset + 1]
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
        }
        const length = buffer.readUInt16BE(offset + 2)
        offset += 2 + length
      }
    }
    // 3. WebP
    if (buffer.length >= 30 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") {
      const vp8Type = buffer.subarray(12, 16).toString()
      if (vp8Type === "VP8 ") {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
      } else if (vp8Type === "VP8L") {
        const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24]
        return {
          width: 1 + (((b1 & 0x3f) << 8) | b0),
          height: 1 + (((b3 & 0xf) << 12) | (b2 << 4) | ((b1 & 0xc0) >> 6)),
        }
      } else if (vp8Type === "VP8X") {
        return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }
      }
    }
  } catch {
    // fallback
  }
  return null
}

/** Downloads image using original high-resolution URL, extracts aspect ratio, and converts to base64 data URI for pptxgenjs. */
async function fetchImageData(url: string | null): Promise<ImageDataResult | null> {
  if (!url) return null
  try {
    const highResUrl = getOriginalPublicUrl(url)
    let res = await fetch(highResUrl)
    if (!res.ok) res = await fetch(url)
    if (!res.ok) return null

    const buf = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const base64 = buf.toString("base64")
    let dimensions = getImageDimensions(buf)
    if (!dimensions || !dimensions.width || !dimensions.height) {
      try {
        const meta = await sharp(buf).metadata()
        if (meta.width && meta.height) {
          dimensions = { width: meta.width, height: meta.height }
        }
      } catch {
        // ignore
      }
    }

    return {
      dataUri: `data:${contentType};base64,${base64}`,
      width: dimensions?.width,
      height: dimensions?.height,
    }
  } catch (err) {
    console.warn("Failed to fetch high-res image for PPT:", url, err)
    return null
  }
}

/** Adds an image fitted strictly to the container while preserving true aspect ratio. */
function addFitToHeightImage(
  slide: any,
  imageData: ImageDataResult,
  box: { x: number; y: number; maxW: number; maxH: number; alignY?: "top" | "center" }
): { posX: number; posY: number; calcW: number; calcH: number } {
  const { x, y, maxW, maxH, alignY = "top" } = box
  let calcW = maxW
  let calcH = maxH

  if (imageData.width && imageData.height && imageData.height > 0) {
    const aspect = imageData.width / imageData.height
    // Fit to container height first
    calcH = maxH
    calcW = calcH * aspect

    // If calculated width exceeds maxW container width, scale down proportionally
    if (calcW > maxW) {
      calcW = maxW
      calcH = calcW / aspect
    }
  }

  // Center proportionally horizontally, align vertically per alignY
  const posX = x + (maxW - calcW) / 2
  const posY = alignY === "center" ? y + (maxH - calcH) / 2 : y

  slide.addImage({
    data: imageData.dataUri,
    x: posX,
    y: posY,
    w: calcW,
    h: calcH,
  })

  return { posX, posY, calcW, calcH }
}

function convertSize(sizeLabel: string | null, sizeType: PptSizeType): string {
  if (!sizeLabel) return "—"
  if (sizeType === "ft") return sizeLabel
  const match = sizeLabel.match(/^([\d.]+)\s*x\s*([\d.]+)\s*ft$/i)
  if (!match) return sizeLabel
  const widthCm = Math.round(parseFloat(match[1]) * 30.48)
  const lengthCm = Math.round(parseFloat(match[2]) * 30.48)
  return `${widthCm} x ${lengthCm} cm`
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "_").trim() || "presentation"
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const config: PptConfig | undefined = body?.config
    const items: PptWishlistItem[] | undefined = body?.items

    if (!config || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Missing PPT configuration or items" }, { status: 400 })
    }

    // Filter items based on active folder shot filters
    const folderFilters = config.folderFilters ?? ["Head", "Floor", "Corner", "Closeup", "Tag"]
    const eligibleItems = items.filter((item) => {
      if (!item.folder) return true
      return folderFilters.includes(item.folder as any)
    })

    const targetItems = eligibleItems.length > 0 ? eligibleItems : items
    const selectedFields = config.selectedFields ?? [
      "sku",
      "serialNumber",
      "productType",
      "design",
      "quality",
      "collection",
      "construction",
      "color",
      "size",
    ]

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: "SAPL_16x9", width: 13.33, height: 7.5 })
    pptx.layout = "SAPL_16x9"

    // Load preloaded logo and custom cover/back data URIs in parallel
    const [logoData, coverData, backData, grouperData] = await Promise.all([
      config.logoUrl ? fetchImageData(config.logoUrl) : null,
      config.coverImageUrl ? fetchImageData(config.coverImageUrl) : null,
      config.backImageUrl ? fetchImageData(config.backImageUrl) : null,
      config.grouperImageUrl ? fetchImageData(config.grouperImageUrl) : null,
    ])

    // ── 1. Custom Cover Slide (First Slide) ──
    if (coverData) {
      const coverSlide = pptx.addSlide()
      coverSlide.addImage({
        data: coverData.dataUri,
        x: 0, y: 0, w: 13.33, h: 7.5,
        sizing: { type: "contain", w: 13.33, h: 7.5 },
      })
      coverSlide.addText(config.projectName || "Presentation", {
        x: 1, y: 3, w: 11.33, h: 1.5,
        align: "center", fontSize: 40, bold: true, color: "FFFFFF",
        shadow: { type: "outer", blur: 4, offset: 2, angle: 45, opacity: 0.8 },
      })
    } else {
      // Standard Title Slide
      for (const coverId of config.coverPages || ["brand-cover"]) {
        const cover = PPT_COVER_PAGES.find((c) => c.value === coverId)
        const slide = pptx.addSlide()
        slide.background = { color: "141937" }

        if (logoData) {
          slide.addImage({
            data: logoData.dataUri,
            x: 5.66, y: 1.2, w: 2.0, h: 1.2,
            sizing: { type: "contain", w: 2.0, h: 1.2 },
          })
        }

        slide.addText(config.projectName || "Shyam Ahuja Catalog", {
          x: 0, y: 3.2, w: "100%", h: 1, align: "center", fontSize: 36, bold: true, color: "FFFFFF",
        })
        if (cover) {
          slide.addText(cover.description, {
            x: 0, y: 4.2, w: "100%", h: 0.5, align: "center", fontSize: 14, color: "C7D2FE",
          })
        }
      }
    }

    // ── 2. Product slides, grouped by the chosen parameter ──
    const groups = groupWishlistItems(targetItems, config.groupBy)

    for (const group of groups) {
      // ── Independent Group Section Divider Slide ──
      if (config.groupBy !== "none" && config.showGroupDividers !== false) {
        const sectionSlide = pptx.addSlide()

        if (grouperData) {
          sectionSlide.addImage({
            data: grouperData.dataUri,
            x: 0, y: 0, w: 13.33, h: 7.5,
            sizing: { type: "contain", w: 13.33, h: 7.5 },
          })
          sectionSlide.addText(group.label, {
            x: 1, y: 3, w: 11.33, h: 1.5,
            align: "center", fontSize: 38, bold: true, color: "FFFFFF",
            shadow: { type: "outer", blur: 4, offset: 2, angle: 45, opacity: 0.8 },
          })
        } else {
          sectionSlide.background = { color: "18181B" }
          if (logoData) {
            sectionSlide.addImage({
              data: logoData.dataUri,
              x: 1, y: 0.6, w: 1.8, h: 0.8,
              sizing: { type: "contain", w: 1.8, h: 0.8 },
            })
          }
          sectionSlide.addText(group.label, {
            x: 1, y: 2.8, w: 11.33, h: 1.8,
            align: "left", fontSize: 38, bold: true, color: "FFFFFF",
          })
          sectionSlide.addText(`Section Category · ${config.groupBy.toUpperCase()}`, {
            x: 1, y: 4.5, w: 11.33, h: 0.5,
            align: "left", fontSize: 14, color: "A1A1AA", charSpacing: 1,
          })
        }
      }

      if (config.layoutVariant === "multi-shot") {
        // Group items in this category by serialNumber (or sku or inventoryId)
        const pieceGroups = new Map<string, PptWishlistItem[]>()
        for (const item of group.items) {
          const key = item.serialNumber || item.sku || item.inventoryId
          const list = pieceGroups.get(key) ?? []
          list.push(item)
          pieceGroups.set(key, list)
        }

        const SHOT_PRIORITY: Record<string, number> = {
          Head: 1,
          Floor: 2,
          Corner: 3,
          Closeup: 4,
          Tag: 5,
        }

        const maxShots = config.maxShotsPerSlide ?? 3

        for (const [, pieceItems] of pieceGroups.entries()) {
          // Sort items by shot type priority: Head first, then Floor, Corner, Closeup, Tag
          const sortedItems = [...pieceItems].sort((a, b) => {
            const pA = a.folder ? (SHOT_PRIORITY[a.folder] ?? 99) : 99
            const pB = b.folder ? (SHOT_PRIORITY[b.folder] ?? 99) : 99
            return pA - pB
          })

          const targetShots = sortedItems.slice(0, maxShots)
          const primaryItem = targetShots[0] || pieceItems[0]

          const slide = pptx.addSlide()
          slide.background = { color: "FFFFFF" }

          // Fetch all images for this slide in parallel
          const imagesData = await Promise.all(
            targetShots.map((item) => (item.imageUrl ? fetchImageData(item.imageUrl) : Promise.resolve(null)))
          )

          const validImages = imagesData.filter((d): d is ImageDataResult => d !== null)

          // ── Layout Rendering with consistent sizing across Shot 2, 3, 4+ ──
          let img2Result: { posX: number; posY: number; calcW: number; calcH: number } | null = null

          if (validImages.length === 1) {
            // 1 image available (Head shot)
            addFitToHeightImage(slide, validImages[0], { x: 0.4, y: 0.4, maxW: 5.2, maxH: 6.7, alignY: "top" })
          } else if (validImages.length === 2) {
            // 2 images: Head on left, 1 secondary on right
            addFitToHeightImage(slide, validImages[0], { x: 0.4, y: 0.4, maxW: 4.6, maxH: 6.7, alignY: "top" })
            img2Result = addFitToHeightImage(slide, validImages[1], { x: 5.2, y: 0.4, maxW: 7.7, maxH: 4.8, alignY: "top" })
          } else if (validImages.length === 3) {
            // 3 images: Head on left, Shot 2 & Shot 3 EQUALLY SIZED side-by-side
            addFitToHeightImage(slide, validImages[0], { x: 0.4, y: 0.4, maxW: 4.6, maxH: 6.7, alignY: "top" })
            // Both Shot 2 and Shot 3 share identical bounding container (maxW: 3.85, maxH: 5.4)
            img2Result = addFitToHeightImage(slide, validImages[1], { x: 5.15, y: 0.4, maxW: 3.85, maxH: 5.4, alignY: "top" })
            addFitToHeightImage(slide, validImages[2], { x: 9.15, y: 0.4, maxW: 3.85, maxH: 5.4, alignY: "top" })
          } else if (validImages.length === 4) {
            // 4 images: Head on left, Shots 2, 3, and 4 ALL EQUALLY SIZED in 2x2 grid
            addFitToHeightImage(slide, validImages[0], { x: 0.4, y: 0.4, maxW: 4.5, maxH: 6.7, alignY: "top" })
            addFitToHeightImage(slide, validImages[1], { x: 5.1, y: 0.4, maxW: 3.85, maxH: 3.25, alignY: "top" })
            addFitToHeightImage(slide, validImages[2], { x: 9.1, y: 0.4, maxW: 3.85, maxH: 3.25, alignY: "top" })
            addFitToHeightImage(slide, validImages[3], { x: 5.1, y: 3.85, maxW: 3.85, maxH: 3.25, alignY: "top" })
          } else if (validImages.length >= 5) {
            // 5 images: Head on left, Shots 2, 3, 4, 5 ALL EQUALLY SIZED
            addFitToHeightImage(slide, validImages[0], { x: 0.4, y: 0.4, maxW: 4.5, maxH: 6.7, alignY: "top" })
            addFitToHeightImage(slide, validImages[1], { x: 5.1, y: 0.4, maxW: 2.52, maxH: 3.25, alignY: "top" })
            addFitToHeightImage(slide, validImages[2], { x: 7.78, y: 0.4, maxW: 2.52, maxH: 3.25, alignY: "top" })
            addFitToHeightImage(slide, validImages[3], { x: 10.46, y: 0.4, maxW: 2.52, maxH: 3.25, alignY: "top" })
            addFitToHeightImage(slide, validImages[4], { x: 5.1, y: 3.85, maxW: 2.52, maxH: 3.25, alignY: "top" })
          }

          // ── Build Specifications for Single-Column Display ──
          const specEntries: Array<{ label: string; value: string }> = []
          if (selectedFields.includes("design") && primaryItem.designName) {
            specEntries.push({ label: "Design Code", value: primaryItem.designName })
          }
          if (selectedFields.includes("serialNumber") && primaryItem.serialNumber) {
            specEntries.push({ label: "Serial", value: primaryItem.serialNumber })
          }
          if (selectedFields.includes("sku") && primaryItem.sku) {
            specEntries.push({ label: "SKU", value: primaryItem.sku })
          }
          if (selectedFields.includes("size") && primaryItem.sizeLabel) {
            specEntries.push({ label: "Size", value: convertSize(primaryItem.sizeLabel, config.sizeType) })
          }
          if (selectedFields.includes("collection") && primaryItem.collectionName) {
            specEntries.push({ label: "Collection", value: primaryItem.collectionName })
          }
          if (selectedFields.includes("quality") && primaryItem.qualityName) {
            specEntries.push({ label: "Quality", value: primaryItem.qualityName })
          }
          if (selectedFields.includes("color") && primaryItem.colorNames) {
            specEntries.push({ label: "Color", value: primaryItem.colorNames })
          }
          if (selectedFields.includes("construction") && primaryItem.constructionName) {
            specEntries.push({ label: "Construction", value: primaryItem.constructionName })
          }
          if (selectedFields.includes("productType") && primaryItem.productName) {
            specEntries.push({ label: "Product Type", value: primaryItem.productName })
          }

          const singleColText = specEntries.flatMap((s, idx) => [
            { text: `${s.label}: `, options: { bold: true, fontSize: 10, color: "18181B" } },
            { text: `${s.value}${idx < specEntries.length - 1 ? "\n" : ""}`, options: { bold: false, fontSize: 10, color: "3F3F46" } },
          ])

          // Position single-column specs based on layout image count
          if (validImages.length === 1) {
            if (singleColText.length > 0) {
              slide.addText(singleColText, { x: 6.0, y: 1.5, w: 6.5, h: 4.5, lineSpacing: 20 })
            }
          } else if (validImages.length === 2) {
            if (singleColText.length > 0) {
              const textY = img2Result ? Math.min(Math.max(img2Result.posY + img2Result.calcH + 0.15, 3.8), 5.4) : 5.3
              slide.addText(singleColText, { x: 5.2, y: textY, w: 5.5, h: Math.max(7.1 - textY, 1.5), lineSpacing: 15, fontSize: 10 })
            }
          } else if (validImages.length === 3) {
            // Directly under Image 2 (middle image), matching reference layout
            if (singleColText.length > 0) {
              const textY = img2Result ? Math.min(Math.max(img2Result.posY + img2Result.calcH + 0.15, 3.8), 5.5) : 4.8
              slide.addText(singleColText, { x: 5.15, y: textY, w: 3.85, h: Math.max(7.1 - textY, 1.5), lineSpacing: 15, fontSize: 10 })
            }
          } else if (validImages.length === 4) {
            // In bottom right quadrant (next to Image 4, directly under Image 3)
            if (singleColText.length > 0) {
              slide.addText(singleColText, { x: 9.1, y: 3.85, w: 3.85, h: 2.7, lineSpacing: 15, fontSize: 10 })
            }
          } else {
            // For 5+ images, to the right of bottom-left Image 5
            if (singleColText.length > 0) {
              slide.addText(singleColText, { x: 7.78, y: 3.85, w: 5.2, h: 2.7, lineSpacing: 15, fontSize: 10 })
            }
          }

          // ── Brand Logo / Text at Bottom Right ──
          if (logoData) {
            slide.addImage({
              data: logoData.dataUri,
              x: 9.6, y: 6.4, w: 3.1, h: 0.65,
              sizing: { type: "contain", w: 3.1, h: 0.65 },
            })
          } else {
            slide.addText("SHYAM AHUJA", {
              x: 9.5, y: 6.4, w: 3.2, h: 0.6,
              align: "right", fontSize: 16, color: "18181B", fontFace: "Georgia", charSpacing: 3,
            })
          }
        }
      } else {
        for (const productGroup of groupItemsByProductCode(group.items)) {
          // ── Per-Item Detail Slides (Single Image Mode) ──
          for (const item of productGroup.items) {
            const slide = pptx.addSlide()
            slide.background = { color: "FFFFFF" }

            if (logoData) {
              slide.addImage({
                data: logoData.dataUri,
                x: 11, y: 0.4, w: 1.8, h: 0.6,
                sizing: { type: "contain", w: 1.8, h: 0.6 },
              })
            }

            const imageData = item.imageUrl ? await fetchImageData(item.imageUrl) : null

            // Render main left product image fitted strictly to container height preserving true aspect ratio
            if (imageData) {
              addFitToHeightImage(slide, imageData, { x: 0.5, y: 0.5, maxW: 6.0, maxH: 6.5 })
            }

            // Build dynamic specification text lines based on selectedFields checkbox choices
            const specLines: Array<{ text: string }> = []
            if (selectedFields.includes("productType") && item.productName) {
              specLines.push({ text: `Product Type: ${item.productName}\n` })
            }
            if (selectedFields.includes("design") && item.designName) {
              specLines.push({ text: `Design: ${item.designName}\n` })
            }
            if (selectedFields.includes("quality") && item.qualityName) {
              specLines.push({ text: `Quality: ${item.qualityName}\n` })
            }
            if (selectedFields.includes("collection") && item.collectionName) {
              specLines.push({ text: `Collection: ${item.collectionName}\n` })
            }
            if (selectedFields.includes("construction") && item.constructionName) {
              specLines.push({ text: `Construction: ${item.constructionName}\n` })
            }
            if (selectedFields.includes("color") && item.colorNames) {
              specLines.push({ text: `Color: ${item.colorNames}\n` })
            }
            if (selectedFields.includes("size") && item.sizeLabel) {
              specLines.push({ text: `Size: ${convertSize(item.sizeLabel, config.sizeType)}\n` })
            }
            if (selectedFields.includes("serialNumber") && item.serialNumber) {
              specLines.push({ text: `Serial No: ${item.serialNumber}\n` })
            }

            const titleText = selectedFields.includes("sku") ? item.sku : (item.productName || item.serialNumber)
            slide.addText(titleText, { x: 7, y: 0.6, w: 5.8, h: 0.6, fontSize: 20, bold: true, color: "18181B" })

            if (specLines.length > 0) {
              slide.addText(specLines, { x: 7, y: 1.3, w: 5.8, h: 4.5, fontSize: 13, color: "3F3F46", lineSpacing: 22 })
            }
          }
        }
      }
    }

    // ── 3. Custom Back Slide (Last Slide) ──
    if (backData) {
      const backSlide = pptx.addSlide()
      backSlide.addImage({
        data: backData.dataUri,
        x: 0, y: 0, w: 13.33, h: 7.5,
        sizing: { type: "contain", w: 13.33, h: 7.5 },
      })
    }

    const buffer = await pptx.write({ outputType: "nodebuffer" })

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${sanitizeFileName(config.projectName)}.pptx"`,
      },
    })
  } catch (err) {
    console.error("PPT generation error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PPT generation failed" },
      { status: 500 }
    )
  }
}
