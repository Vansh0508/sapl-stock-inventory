"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Button, Checkbox, Modal, toast, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { uploadImage, getPublicUrl, getThumbnailUrl } from "@/lib/supabase/storage"
import SearchBar from "@/components/shared/SearchBar"
import { cn, getFolderForFilename } from "@/lib/utils"
import { FOLDER_KEYS, getFileStoragePath, getFolderStoragePath, isVisibleStorageItem } from "@/lib/content-folders"
import { PlayFill, Plus } from "@gravity-ui/icons"

interface MediaSelectorFile {
  name: string
  id: string | null
  created_at: string | null
  metadata?: {
    size: number
    mimetype: string
  }
  storagePath: string
  publicUrl: string
}

interface MediaSelectorModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelected: (files: { name: string; publicUrl: string; storagePath: string }[]) => void
  alreadySelectedPaths: string[]
  defaultSearchQuery?: string
}

function getImageSortWeight(filename: string): number {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "")
  const underscoreMatch = nameWithoutExt.match(/__(\d+)_+$/)
  if (underscoreMatch) return parseInt(underscoreMatch[1], 10)
  const parenMatch = nameWithoutExt.match(/\((\d+)\)$/)
  if (parenMatch) return parseInt(parenMatch[1], 10)
  const plainUnderscoreMatch = nameWithoutExt.match(/_(\d+)$/)
  if (plainUnderscoreMatch) return parseInt(plainUnderscoreMatch[1], 10)
  return 100
}

export default function MediaSelectorModal({
  isOpen,
  onOpenChange,
  onSelected,
  alreadySelectedPaths,
  defaultSearchQuery = "",
}: MediaSelectorModalProps) {
  const [files, setFiles] = useState<MediaSelectorFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize selected paths and search query when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPaths(new Set(alreadySelectedPaths))
      setSearchQuery(defaultSearchQuery)
    }
  }, [isOpen, alreadySelectedPaths, defaultSearchQuery])

  // Fetch files inside images/media and images/Fabrics folders in parallel
  const fetchFiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const listPromises = FOLDER_KEYS.map(async (folder) => {
        const folderPath = getFolderStoragePath(folder)
        const { data: storageList, error: storageErr } = await supabase.storage
          .from("images")
          .list(folderPath, {
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          })
        if (storageErr) throw storageErr
        return (storageList ?? [])
          .filter((file) => isVisibleStorageItem({ id: file.id, name: file.name }))
          .map((file) => {
            const storagePath = getFileStoragePath(folder, file.name)
            return {
              name: file.name,
              id: file.id,
              created_at: file.created_at,
              metadata: file.metadata ? {
                size: file.metadata.size,
                mimetype: file.metadata.mimetype,
              } : undefined,
              storagePath,
              publicUrl: getPublicUrl("images", storagePath),
            }
          })
      })

      const allLists = await Promise.all(listPromises)
      setFiles(allLists.flat())
    } catch (e) {
      console.error(e)
      toast.danger("Failed to load files library")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchFiles()
    }
  }, [isOpen, fetchFiles])

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [files, searchQuery])

  // Handle upload files from selector
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list || list.length === 0) return

    toast.success(`Uploading ${list.length} file(s)…`)

    const newlyUploadedPaths: string[] = []

    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const folder = getFolderForFilename(file.name)
        const path = `media/${folder}/${cleanName}`
        await uploadImage("images", path, file)
        newlyUploadedPaths.push(path)

        // Auto-assign to inventory piece if SP Number matches
        try {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "")
          const baseSP = nameWithoutExt
            .replace(/__\d+_+$/, "")      // replaces "__3_"
            .replace(/\s*\(\d+\)$/, "")    // replaces " (1)"
            .replace(/_\d+$/, "")         // replaces "_1"
            .trim()

          const { data: inv } = await (supabase
            .from("inventory" as any) as any)
            .select("id")
            .eq("serial_number", baseSP)
            .maybeSingle()

          if (inv) {
            // Check if already linked
            const { data: existingLink } = await (supabase
              .from("inventory_images" as any) as any)
              .select("id")
              .eq("inventory_id", (inv as any).id)
              .eq("storage_path", path)
              .maybeSingle()

            if (!existingLink) {
              const { count } = await (supabase
                .from("inventory_images" as any) as any)
                .select("id", { count: "exact", head: true })
                .eq("inventory_id", (inv as any).id)

              const nextOrder = getImageSortWeight(file.name)
              const publicUrl = getPublicUrl("images", path)
              
              const { error: linkErr } = await (supabase
                .from("inventory_images" as any) as any)
                .insert({
                  inventory_id: (inv as any).id,
                  storage_path: path,
                  public_url: publicUrl,
                  sort_order: nextOrder
                })

              if (linkErr) {
                console.warn("Auto-assignment failed to link database row:", linkErr)
              } else {
                console.log(`Auto-assigned image ${file.name} to SP Number ${baseSP}`)
              }
            }
          }
        } catch (assignErr) {
          console.error("Error auto-assigning image:", assignErr)
        }
      } catch (err) {
        console.error("Upload failed in selector for:", file.name, err)
        toast.danger(`Failed to upload ${file.name}`)
      }
    }

    if (newlyUploadedPaths.length > 0) {
      toast.success(`Uploaded and selected ${newlyUploadedPaths.length} file(s)!`)
      // Refresh files list
      await fetchFiles()
      // Autoselect the newly uploaded files
      setSelectedPaths((prev) => {
        const next = new Set(prev)
        newlyUploadedPaths.forEach((path) => next.add(path))
        return next
      })
    }
    e.target.value = ""
  }

  // Toggle selection
  const handleToggleFile = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // Save selected list back to parent
  const handleDone = () => {
    const selectedFiles = files
      .filter((f) => selectedPaths.has(f.storagePath))
      .map((f) => ({
        name: f.name,
        publicUrl: f.publicUrl,
        storagePath: f.storagePath,
      }))
    
    onSelected(selectedFiles)
    onOpenChange(false)
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="lg" className="z-[200]">
          <Modal.Dialog>
            {({ close }) => (
              <div className="flex flex-col max-h-[85vh] bg-white rounded-2xl overflow-hidden">
                {/* Modal Header */}
                <Modal.Header className="border-b border-zinc-150 px-6 py-4 flex items-center justify-between text-zinc-900 font-semibold shrink-0">
                  <span>Select file</span>
                </Modal.Header>

                {/* Search / Upload Action Toolbar */}
                <div className="px-6 py-3 border-b border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row gap-3 sm:items-center justify-between shrink-0">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    disableShortcut
                    placeholder="Search files..."
                    className="w-full sm:max-w-xs"
                    groupClassName="bg-white border-zinc-200"
                  />
                  <div>
                    <Button
                      variant="outline"
                      onPress={() => fileInputRef.current?.click()}
                      className="h-9 px-3.5 rounded-xl border border-zinc-200 text-zinc-800 bg-white hover:bg-zinc-50 cursor-pointer font-medium text-xs flex items-center"
                    >
                      <Plus width="14" height="14" className="mr-1.5" />
                      Add media
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={handleUpload}
                    />
                  </div>
                </div>

                {/* Modal Body / Media Grid */}
                <Modal.Body className="overflow-y-auto p-6 flex-1 min-h-[300px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-48">
                      <Typography.Paragraph size="sm" className="text-zinc-400">Loading files…</Typography.Paragraph>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="flex items-center justify-center h-48">
                      <Typography.Paragraph size="sm" className="text-zinc-400">
                        No files found. Add media to get started!
                      </Typography.Paragraph>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {filteredFiles.map((file) => {
                        const isChecked = selectedPaths.has(file.storagePath)
                        const isVideo = file.metadata?.mimetype?.startsWith("video/")
                        return (
                          <div
                            key={file.id || file.name}
                            onClick={() => handleToggleFile(file.storagePath)}
                            className={cn(
                              "relative aspect-square rounded-xl overflow-hidden bg-zinc-50 border border-zinc-200 hover:border-indigo-400 cursor-pointer transition-all flex flex-col items-center justify-center group select-none",
                              isChecked && "border-indigo-600 ring-2 ring-indigo-500/25 bg-indigo-50/5"
                            )}
                          >
                            {/* Checkbox Overlay */}
                            <div className="absolute top-2 left-2 z-10">
                              <Checkbox
                                isSelected={isChecked}
                                onChange={() => handleToggleFile(file.storagePath)}
                                aria-label={`Select ${file.name}`}
                              >
                                <Checkbox.Content className="flex items-center justify-center">
                                  <Checkbox.Control>
                                    <Checkbox.Indicator />
                                  </Checkbox.Control>
                                </Checkbox.Content>
                              </Checkbox>
                            </div>

                            {/* Media content */}
                            <div className="relative w-full h-full">
                              {isVideo ? (
                                <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                                  <PlayFill width="20" height="20" className="text-white opacity-80" />
                                </div>
                              ) : (
                                <Image
                                  src={getThumbnailUrl(file.publicUrl, { width: 240, quality: 75 })}
                                  alt={file.name}
                                  fill
                                  unoptimized
                                  sizes="160px"
                                  className="object-cover group-hover:scale-102 transition-transform duration-300"
                                />
                              )}
                            </div>

                            {/* Hover info overlay */}
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-2 py-1 font-mono truncate opacity-0 group-hover:opacity-100 transition-opacity">
                              {file.name}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Modal.Body>

                {/* Footer Buttons */}
                <Modal.Footer className="border-t border-zinc-150 bg-zinc-50/50 p-4 flex items-center justify-end shrink-0 gap-2">
                  <Button
                    variant="outline"
                    onPress={close}
                    className="bg-white border border-zinc-200 text-zinc-800 rounded-xl cursor-pointer text-xs h-9 font-medium hover:bg-zinc-50 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onPress={handleDone}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer text-xs h-9 font-medium px-4"
                  >
                    Done {selectedPaths.size > 0 && `(${selectedPaths.size})`}
                  </Button>
                </Modal.Footer>
              </div>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
