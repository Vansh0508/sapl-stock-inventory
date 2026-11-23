// ──────────────────────────────────────────────────────────
// PPT Generator — shared types
// ──────────────────────────────────────────────────────────

/** A serial number staged into a wishlist workspace, flattened for PPT export. */
export interface PptWishlistItem {
  inventoryId: string
  serialNumber: string
  productCode: string
  sku: string
  sizeLabel: string | null
  productName: string | null
  qualityName: string | null
  designName: string | null
  collectionName: string | null
  constructionName: string | null
  colorNames: string | null
  folder?: string | null
  imageUrl: string | null
}

export type PptSizeType = "ft" | "cm"

export type PptGroupByField =
  | "none"
  | "quality"
  | "collection"
  | "size"
  | "color"
  | "construction"
  | "design"
  | "product_type"

export const PPT_GROUP_BY_OPTIONS: { value: PptGroupByField; label: string }[] = [
  { value: "none", label: "No Grouping" },
  { value: "quality", label: "Quality" },
  { value: "collection", label: "Collection" },
  { value: "size", label: "Size" },
  { value: "color", label: "Color" },
  { value: "construction", label: "Construction Style" },
  { value: "design", label: "Design" },
  { value: "product_type", label: "Product Type" },
]

export type PptFolderFilter = "Head" | "Floor" | "Corner" | "Closeup" | "Tag"

export const PPT_FOLDER_FILTERS: { value: PptFolderFilter; label: string }[] = [
  { value: "Head", label: "Head Shot" },
  { value: "Floor", label: "Floor Shot" },
  { value: "Corner", label: "Corner Shot" },
  { value: "Closeup", label: "Closeup Detail" },
  { value: "Tag", label: "Tag Shot" },
]

export type PptDetailField =
  | "sku"
  | "serialNumber"
  | "productType"
  | "design"
  | "quality"
  | "collection"
  | "construction"
  | "color"
  | "size"

export const PPT_DETAIL_FIELDS: { value: PptDetailField; label: string }[] = [
  { value: "sku", label: "SKU" },
  { value: "serialNumber", label: "Serial Number" },
  { value: "productType", label: "Product Type" },
  { value: "design", label: "Design" },
  { value: "quality", label: "Quality" },
  { value: "collection", label: "Collection" },
  { value: "construction", label: "Construction" },
  { value: "color", label: "Color" },
  { value: "size", label: "Size" },
]

export type PptCoverPage = "brand-cover" | "collection-cover" | "contact-cover"

export const PPT_COVER_PAGES: { value: PptCoverPage; label: string; description: string }[] = [
  { value: "brand-cover", label: "Brand Cover", description: "Shyam Ahuja title slide" },
  { value: "collection-cover", label: "Collection Cover", description: "Collection / theme intro slide" },
  { value: "contact-cover", label: "Contact Cover", description: "Closing slide with contact details" },
]

export type PptImageQuality = "high" | "low"

export const PPT_IMAGE_QUALITY_OPTIONS: { value: PptImageQuality; label: string; description: string }[] = [
  { value: "high", label: "High-Resolution", description: "Original full-quality images. Larger file size, best for print." },
  { value: "low", label: "Low-Resolution", description: "Compressed on the fly. Smaller file, faster to export and share." },
]

export type PptDesignId = "classic"

export type PptLayoutVariant = "full-details" | "grid-split" | "multi-shot" | "clean-card"

export const PPT_LAYOUT_VARIANTS: { value: PptLayoutVariant; label: string; description: string; tag?: string }[] = [
  { value: "multi-shot", label: "Multi-Shot (Hero + Details)", description: "Hero head shot on left, companion shots + 2-column specs on right", tag: "New" },
  { value: "full-details", label: "Full Image + Specifications", description: "Large product visual with full specs" },
  { value: "grid-split", label: "2-Grid Split Layout", description: "Side-by-side shot comparison" },
  { value: "clean-card", label: "Clean Card Layout (Coming Soon)", description: "Minimalist centered card layout", tag: "Coming Soon" },
]

export interface PptConfig {
  projectName: string
  designId: PptDesignId
  layoutVariant: PptLayoutVariant
  maxShotsPerSlide?: 3 | 4 | 5
  sizeType: PptSizeType
  imageQuality: PptImageQuality
  coverPages: PptCoverPage[]
  groupBy: PptGroupByField
  folderFilters: PptFolderFilter[]
  selectedFields: PptDetailField[]
  showGroupDividers: boolean
  coverImageUrl?: string | null
  backImageUrl?: string | null
  logoUrl?: string | null
  grouperImageUrl?: string | null
}

export const DEFAULT_PPT_CONFIG: Omit<PptConfig, "projectName"> = {
  designId: "classic",
  layoutVariant: "multi-shot",
  maxShotsPerSlide: 3,
  sizeType: "ft",
  imageQuality: "high",
  coverPages: ["brand-cover"],
  groupBy: "none",
  folderFilters: ["Head", "Floor", "Corner", "Closeup", "Tag"],
  selectedFields: [
    "sku",
    "serialNumber",
    "productType",
    "design",
    "quality",
    "collection",
    "construction",
    "color",
    "size",
  ],
  showGroupDividers: true,
  coverImageUrl: null,
  backImageUrl: null,
  logoUrl: null,
  grouperImageUrl: null,
}

