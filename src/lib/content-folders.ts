export const FOLDER_KEYS = ["Head", "Floor", "Corner", "Closeup", "Tag", "Unorganized"] as const

export type FolderKey = (typeof FOLDER_KEYS)[number]

export function folderToSlug(folder: FolderKey): string {
  return folder.toLowerCase()
}

export function slugToFolder(slug: string): FolderKey | null {
  return FOLDER_KEYS.find((f) => f.toLowerCase() === slug.toLowerCase()) ?? null
}
