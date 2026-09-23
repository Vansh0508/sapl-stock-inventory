import type { PptGroupByField, PptWishlistItem } from "@/types/ppt.types"

export interface PptItemGroup {
  label: string
  items: PptWishlistItem[]
}

function keyFor(item: PptWishlistItem, groupBy: PptGroupByField): string {
  switch (groupBy) {
    case "size":
      return item.sizeLabel ?? "Unspecified size"
    case "color":
      return item.colorNames ?? "Unspecified color"
    case "quality":
      return item.qualityName ?? "Unspecified quality"
    case "design":
      return item.designName ?? "Unspecified design"
    case "construction":
      return item.constructionName ?? "Unspecified construction"
    case "product_type":
      return item.productName ?? "Unspecified product type"
    default:
      return "All Products"
  }
}

/** Groups wishlist items by the chosen Separator parameter, preserving first-seen order. */
export function groupWishlistItems(items: PptWishlistItem[], groupBy: PptGroupByField): PptItemGroup[] {
  if (groupBy === "none") return items.length > 0 ? [{ label: "All Products", items }] : []

  const map = new Map<string, PptWishlistItem[]>()
  for (const item of items) {
    const key = keyFor(item, groupBy)
    const list = map.get(key) ?? []
    list.push(item)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([label, groupItems]) => ({ label, items: groupItems }))
}

/** One size available under a Product Code, with how many pieces of it are in the wishlist. */
export interface PptSizeCount {
  sizeLabel: string
  count: number
}

/** A Product Code summary — the "ecom style" size/count hierarchy shown ahead of that code's detail slides. */
export interface PptProductCodeSummary {
  productCode: string
  productName: string | null
  designName: string | null
  qualityName: string | null
  colorNames: string | null
  constructionName: string | null
  imageUrl: string | null
  sizes: PptSizeCount[]
  totalCount: number
  /** The flattened items under this Product Code, in first-seen order — feeds the unchanged per-serial detail slides. */
  items: PptWishlistItem[]
}

/** Sub-groups a list of wishlist items by Product Code, preserving first-seen order of both codes and sizes. */
export function groupItemsByProductCode(items: PptWishlistItem[]): PptProductCodeSummary[] {
  const map = new Map<string, PptProductCodeSummary>()

  for (const item of items) {
    let group = map.get(item.productCode)
    if (!group) {
      group = {
        productCode: item.productCode,
        productName: item.productName,
        designName: item.designName,
        qualityName: item.qualityName,
        colorNames: item.colorNames,
        constructionName: item.constructionName,
        imageUrl: item.imageUrl,
        sizes: [],
        totalCount: 0,
        items: [],
      }
      map.set(item.productCode, group)
    }

    group.items.push(item)
    group.totalCount += 1
    if (!group.imageUrl && item.imageUrl) group.imageUrl = item.imageUrl

    const sizeLabel = item.sizeLabel ?? "Unspecified size"
    const sizeEntry = group.sizes.find((s) => s.sizeLabel === sizeLabel)
    if (sizeEntry) sizeEntry.count += 1
    else group.sizes.push({ sizeLabel, count: 1 })
  }

  return Array.from(map.values())
}
