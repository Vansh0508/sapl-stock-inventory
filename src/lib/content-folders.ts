export const MEDIA_ORGANIZED_FOLDERS = ["Head", "Floor", "Corner", "Closeup", "Tag"] as const
export type MediaOrganizedFolder = (typeof MEDIA_ORGANIZED_FOLDERS)[number]

export const MEDIA_FOLDER_KEYS = [...MEDIA_ORGANIZED_FOLDERS, "Unorganized"] as const
export type MediaFolderKey = (typeof MEDIA_FOLDER_KEYS)[number]

export const FABRIC_SUBFOLDERS = ["Closeup", "Head", "Tag", "Texture"] as const
export type FabricSubfolder = (typeof FABRIC_SUBFOLDERS)[number]

export const FABRIC_FOLDER_KEYS = [
  "Fabrics/Closeup",
  "Fabrics/Head",
  "Fabrics/Tag",
  "Fabrics/Texture",
] as const
export type FabricFolderKey = (typeof FABRIC_FOLDER_KEYS)[number]

export const FOLDER_KEYS = [...MEDIA_FOLDER_KEYS, ...FABRIC_FOLDER_KEYS] as const
export type FolderKey = (typeof FOLDER_KEYS)[number]

export const CONTENT_STORAGE_BUCKET = "images"
export const FABRICS_STORAGE_PREFIX = "Fabrics"
export const EMPTY_FOLDER_PLACEHOLDER = ".emptyFolderPlaceholder"

export function isFabricFolder(folder: FolderKey | "root"): folder is FabricFolderKey {
  return folder.startsWith(`${FABRICS_STORAGE_PREFIX}/`)
}

export function getFolderStoragePath(folder: FolderKey): string {
  if (folder === "Unorganized") return "media"
  if (isFabricFolder(folder)) return folder
  return `media/${folder}`
}

export function getFileStoragePath(folder: FolderKey, fileName: string): string {
  return `${getFolderStoragePath(folder)}/${fileName}`
}

export function folderFromStoragePath(storagePath: string): FolderKey {
  const parts = storagePath.split("/")
  if (parts[0] === FABRICS_STORAGE_PREFIX && (FABRIC_SUBFOLDERS as readonly string[]).includes(parts[1])) {
    return `${FABRICS_STORAGE_PREFIX}/${parts[1]}` as FabricFolderKey
  }
  if (parts[0] === "media" && (MEDIA_ORGANIZED_FOLDERS as readonly string[]).includes(parts[1])) {
    return parts[1] as MediaOrganizedFolder
  }
  return "Unorganized"
}

export function folderToSlug(folder: FolderKey): string {
  return folder.toLowerCase()
}

export function slugToFolder(slug: string): FolderKey | null {
  return FOLDER_KEYS.find((f) => f.toLowerCase() === slug.toLowerCase()) ?? null
}

export function fabricSlugToFolder(slug: string): FabricFolderKey | null {
  const match = FABRIC_SUBFOLDERS.find((sub) => sub.toLowerCase() === slug.toLowerCase())
  return match ? (`${FABRICS_STORAGE_PREFIX}/${match}` as FabricFolderKey) : null
}

export function getFolderDisplayName(folder: FolderKey): string {
  return isFabricFolder(folder) ? folder.slice(FABRICS_STORAGE_PREFIX.length + 1) : folder
}

export function getFolderFullLabel(folder: FolderKey): string {
  return isFabricFolder(folder) ? `Fabrics / ${getFolderDisplayName(folder)}` : folder
}

export function isVisibleStorageItem(item: { id: string | null; name: string }): boolean {
  return (
    item.id !== null &&
    Boolean(item.name) &&
    item.name !== EMPTY_FOLDER_PLACEHOLDER &&
    !item.name.startsWith(".")
  )
}
