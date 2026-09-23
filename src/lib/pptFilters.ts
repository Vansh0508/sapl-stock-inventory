import type { PptProductCodeGroup } from "@/types/ppt.types"
import type { ProductCodeFilterState } from "@/components/tools/ppt-generator/ProductCodeFilters"

export function filterProductCodes(
  groups: PptProductCodeGroup[],
  filters: ProductCodeFilterState,
  search: string
): PptProductCodeGroup[] {
  const q = search.trim().toLowerCase()

  return groups.filter((g) => {
    if (q !== "") {
      const haystack = [g.productCode, g.productName, g.qualityName, g.designName, g.colorNames]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    if (filters.productTypeIds.length > 0 && !filters.productTypeIds.includes(g.productTypeId ?? "")) return false
    if (filters.qualityIds.length > 0 && !filters.qualityIds.includes(g.qualityId ?? "")) return false
    if (filters.designIds.length > 0 && !filters.designIds.includes(g.designId ?? "")) return false
    if (filters.constructionIds.length > 0 && !filters.constructionIds.includes(g.constructionId ?? "")) return false
    if (filters.collectionIds.length > 0 && !filters.collectionIds.includes(g.collectionId ?? "")) return false

    if (filters.colorNames.length > 0) {
      const groupColors = (g.colorNames ?? "").split(/[/,]/).map((c) => c.trim())
      const hasMatch = filters.colorNames.some((c) => groupColors.includes(c))
      if (!hasMatch) return false
    }

    if (filters.priceMin != null && (g.maxPrice == null || g.maxPrice < filters.priceMin)) return false
    if (filters.priceMax != null && (g.minPrice == null || g.minPrice > filters.priceMax)) return false

    return true
  })
}
