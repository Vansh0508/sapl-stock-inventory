"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Modal, Button, Spinner } from "@heroui/react"
import Image from "next/image"
import { supabase } from "@/lib/supabase/client"
import { uploadImage, getPublicUrl } from "@/lib/supabase/storage"
import { getFolderForFilename } from "@/lib/utils"
import {
  FABRIC_FOLDER_KEYS,
  type FabricFolderKey,
  type FolderKey,
  type MediaOrganizedFolder,
  getFileStoragePath,
  getFolderDisplayName,
  getFolderFullLabel,
  getFolderStoragePath,
  isFabricFolder,
  isVisibleStorageItem,
} from "@/lib/content-folders"
import { ArrowUpFromLine, CircleCheckFill, CircleExclamationFill, Copy, Files, Folder as FolderIcon, Magnifier, TrashBin, TriangleExclamation, Xmark } from "@gravity-ui/icons"

type UploadDestination = "auto" | FabricFolderKey

export type FileUploadStatus =
  | "checking"
  | "ready"
  | "batch_duplicate"
  | "already_exists"
  | "uploading"
  | "uploaded"
  | "error"

export interface QueuedUploadFile {
  id: string
  file: File
  name: string
  size: number
  previewUrl: string
  targetFolder: MediaOrganizedFolder | FabricFolderKey
  targetPath: string
  status: FileUploadStatus
  statusMessage: string
  duplicateOf?: string
  existingLocation?: string
}

export interface InventoryDetails {
  serial_number: string | null
  sku: string | null
  product_name: string | null
  size_label: string | null
  quality_name: string | null
  design_name: string | null
  color_names: string | null
  collection_name: string | null
  construction_name: string | null
  location_name: string | null
  catalog_id?: string | null
  serial_count?: number
}

export interface StorageFile {
  name: string
  id: string | null
  created_at: string | null
  metadata?: {
    size: number
    mimetype: string
  }
  storagePath: string
  publicUrl: string
  folder: FolderKey
  details: InventoryDetails | null
}

interface UploadSummaryModalProps {
  isOpen: boolean
  onClose: () => void
  files: File[]
  currentFolder?: FolderKey | "root"
  onUploadSuccess: (newFiles: StorageFile[], folderDelta: Record<string, number>) => void
  resolveDetails: (paths: string[]) => Promise<Record<string, InventoryDetails | null>>
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return "—"
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

// Storage `list()` and PostgREST both cap a single response (~1000 rows), and a long `.in()` list
// overflows the request URL — so existence checks page/chunk instead of assuming one call is enough.
const STORAGE_LIST_PAGE_SIZE = 1000
const DB_LOOKUP_CHUNK_SIZE = 50
const DB_LOOKUP_CONCURRENCY = 5

/** Returns the lower-cased names of every file in a storage folder, however many there are. */
async function listAllFolderFileNames(folderPath: string): Promise<Set<string>> {
  const names = new Set<string>()
  let offset = 0

  for (;;) {
    const { data, error } = await supabase.storage.from("images").list(folderPath, {
      limit: STORAGE_LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    })
    if (error) throw error
    if (!data || data.length === 0) break

    for (const item of data) {
      if (isVisibleStorageItem({ id: item.id, name: item.name })) {
        names.add(item.name.trim().toLowerCase())
      }
    }

    if (data.length < STORAGE_LIST_PAGE_SIZE) break
    offset += data.length
  }

  return names
}

/** Returns the subset of `paths` that already have an `inventory_images` row. */
async function findExistingImagePaths(paths: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  const chunks: string[][] = []
  for (let i = 0; i < paths.length; i += DB_LOOKUP_CHUNK_SIZE) {
    chunks.push(paths.slice(i, i + DB_LOOKUP_CHUNK_SIZE))
  }

  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]
      const { data, error } = await (supabase.from("inventory_images" as any) as any)
        .select("storage_path")
        .in("storage_path", chunk)
      if (error) {
        console.warn("inventory_images lookup failed for a chunk:", error)
        continue
      }
      for (const row of (data as { storage_path: string }[] | null) ?? []) existing.add(row.storage_path)
    }
  }
  await Promise.all(Array.from({ length: Math.min(DB_LOOKUP_CONCURRENCY, chunks.length) }, worker))

  return existing
}

const isAlreadyExistsError = (err: unknown): boolean => {
  const e = err as { statusCode?: string | number; status?: string | number; message?: string } | null
  return String(e?.statusCode ?? e?.status ?? "") === "409" || /already exists|duplicate/i.test(e?.message ?? "")
}

export default function UploadSummaryModal({
  isOpen,
  onClose,
  files,
  currentFolder = "root",
  onUploadSuccess,
  resolveDetails,
}: UploadSummaryModalProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedUploadFile[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "ready" | "duplicates" | "existing">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentName: "" })
  const [uploadDestination, setUploadDestination] = useState<UploadDestination>(() =>
    isFabricFolder(currentFolder) ? currentFolder : "auto"
  )

  // Reset destination whenever the modal opens for a new batch
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setUploadDestination(isFabricFolder(currentFolder) ? currentFolder : "auto")
    }
  }

  const previewUrlsRef = useRef<Set<string>>(new Set())

  // Clean up object URLs
  const cleanupPreviewUrls = useCallback(() => {
    previewUrlsRef.current.forEach((url) => {
      URL.revokeObjectURL(url)
    })
    previewUrlsRef.current.clear()
  }, [])

  // Safely close modal (blocked during active upload)
  const handleClose = useCallback(() => {
    if (isUploading) return
    cleanupPreviewUrls()
    setQueuedFiles([])
    setActiveTab("all")
    setSearchQuery("")
    onClose()
  }, [isUploading, cleanupPreviewUrls, onClose])

  // Ingest files & detect batch duplicates
  useEffect(() => {
    if (!isOpen || !files || files.length === 0) return

    cleanupPreviewUrls()

    const seenNames = new Map<string, string>() // normalized filename -> first file id
    const items: QueuedUploadFile[] = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const normalizedName = f.name.trim().toLowerCase()
      const targetFolder: MediaOrganizedFolder | FabricFolderKey =
        uploadDestination === "auto" ? getFolderForFilename(f.name) : uploadDestination
      const targetPath = getFileStoragePath(targetFolder, f.name)
      const previewUrl = URL.createObjectURL(f)
      previewUrlsRef.current.add(previewUrl)

      const id = `item-${i}-${f.name}`

      if (seenNames.has(normalizedName)) {
        items.push({
          id,
          file: f,
          name: f.name,
          size: f.size,
          previewUrl,
          targetFolder,
          targetPath,
          status: "batch_duplicate",
          statusMessage: "Duplicate file name in current selection",
          duplicateOf: seenNames.get(normalizedName),
        })
      } else {
        seenNames.set(normalizedName, id)
        items.push({
          id,
          file: f,
          name: f.name,
          size: f.size,
          previewUrl,
          targetFolder,
          targetPath,
          status: "checking",
          statusMessage: "Checking library availability…",
        })
      }
    }

    setQueuedFiles(items)
    setIsChecking(true)

    // Check existing availability against Supabase Storage & inventory_images
    let cancelled = false

    const checkAvailability = async () => {
      try {
        const candidateItems = items.filter((it) => it.status === "checking")
        if (candidateItems.length === 0) {
          if (!cancelled) setIsChecking(false)
          return
        }

        // 1. Check database: inventory_images table for existing storage_path matches
        const existingDbPaths = await findExistingImagePaths(candidateItems.map((c) => c.targetPath))

        // 2. Check Supabase Storage folder contents
        // Group candidate files by target folder to batch/query efficiently
        const folderGroups = new Map<string, QueuedUploadFile[]>()
        for (const item of candidateItems) {
          const list = folderGroups.get(item.targetFolder) ?? []
          list.push(item)
          folderGroups.set(item.targetFolder, list)
        }

        const existingStoragePaths = new Set<string>()

        // Check folders in parallel: 1 fast query per folder instead of per-file requests
        await Promise.all(
          Array.from(folderGroups.entries()).map(async ([folder, groupFiles]) => {
            const folderPath = getFolderStoragePath(folder as FolderKey)
            const unverifiedFiles = groupFiles.filter((f) => !existingDbPaths.has(f.targetPath))
            if (unverifiedFiles.length === 0) return

            try {
              if (unverifiedFiles.length <= 2) {
                await Promise.all(
                  unverifiedFiles.map(async (fileItem) => {
                    const { data, error } = await supabase.storage.from("images").list(folderPath, {
                      search: fileItem.name,
                      limit: 5,
                    })
                    if (!error && data && data.length > 0) {
                      const found = data.some(
                        (item) =>
                          isVisibleStorageItem({ id: item.id, name: item.name }) &&
                          item.name.trim().toLowerCase() === fileItem.name.trim().toLowerCase()
                      )
                      if (found) existingStoragePaths.add(fileItem.targetPath)
                    }
                  })
                )
              } else {
                const existingNameSet = await listAllFolderFileNames(folderPath)
                for (const fileItem of unverifiedFiles) {
                  if (existingNameSet.has(fileItem.name.trim().toLowerCase())) {
                    existingStoragePaths.add(fileItem.targetPath)
                  }
                }
              }
            } catch (e) {
              console.warn("Storage check error for folder:", folder, e)
            }
          })
        )

        if (cancelled) return

        // Update queued files status
        setQueuedFiles((prev) =>
          prev.map((item) => {
            if (item.status === "batch_duplicate") return item

            const existsInDb = existingDbPaths.has(item.targetPath)
            const existsInStorage = existingStoragePaths.has(item.targetPath)

            if (existsInDb || existsInStorage) {
              return {
                ...item,
                status: "already_exists",
                statusMessage: `Already available in ${getFolderFullLabel(item.targetFolder)} folder`,
                existingLocation: item.targetPath,
              }
            }

            return {
              ...item,
              status: "ready",
              statusMessage: "Unique & not available in library (Ready to upload)",
            }
          })
        )
      } catch (err) {
        console.error("Failed to check file availability:", err)
      } finally {
        if (!cancelled) setIsChecking(false)
      }
    }

    checkAvailability()

    return () => {
      cancelled = true
    }
  }, [isOpen, files, uploadDestination, cleanupPreviewUrls])

  // Count summaries
  const stats = useMemo(() => {
    const total = queuedFiles.length
    const ready = queuedFiles.filter((f) => f.status === "ready" || f.status === "uploaded").length
    const duplicates = queuedFiles.filter((f) => f.status === "batch_duplicate").length
    const existing = queuedFiles.filter((f) => f.status === "already_exists").length
    const checking = queuedFiles.filter((f) => f.status === "checking").length
    return { total, ready, duplicates, existing, checking }
  }, [queuedFiles])

  // Action: Remove batch duplicates and/or existing files from queue
  const handleRemoveDuplicates = () => {
    setQueuedFiles((prev) => prev.filter((f) => f.status !== "batch_duplicate" && f.status !== "already_exists"))
  }

  // Action: Remove single file from queue
  const handleRemoveFile = (id: string) => {
    setQueuedFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
        previewUrlsRef.current.delete(removed.previewUrl)
      }
      const updated = prev.filter((f) => f.id !== id)

      // If removed was a primary item, re-evaluate batch duplicates of that same name
      const remainingSeen = new Set<string>()
      return updated.map((item) => {
        const norm = item.name.trim().toLowerCase()
        if (remainingSeen.has(norm)) {
          return {
            ...item,
            status: "batch_duplicate" as FileUploadStatus,
            statusMessage: "Duplicate file name in current selection",
          }
        }
        remainingSeen.add(norm)
        if (item.status === "batch_duplicate") {
          return {
            ...item,
            status: "ready" as FileUploadStatus,
            statusMessage: "Unique & not available in library (Ready to upload)",
          }
        }
        return item
      })
    })
  }

  // Filtered files for display in the table
  const displayedFiles = useMemo(() => {
    return queuedFiles.filter((f) => {
      // Tab filter
      if (activeTab === "ready" && f.status !== "ready" && f.status !== "uploaded") return false
      if (activeTab === "duplicates" && f.status !== "batch_duplicate") return false
      if (activeTab === "existing" && f.status !== "already_exists") return false

      // Search filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.trim().toLowerCase()
        return f.name.toLowerCase().includes(q) || f.targetFolder.toLowerCase().includes(q)
      }

      return true
    })
  }, [queuedFiles, activeTab, searchQuery])

  // Virtualization for report list: ensures smooth 60fps scrolling without DOM overload
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(380)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const updateHeight = () => {
      setContainerHeight(el.clientHeight || 380)
    }

    updateHeight()
    const ro = new ResizeObserver(updateHeight)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const VIRTUAL_ROW_HEIGHT = 60
  const VIRTUAL_OVERSCAN = 8

  const totalVirtualHeight = displayedFiles.length * VIRTUAL_ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
  const endIndex = Math.min(
    displayedFiles.length,
    Math.ceil((scrollTop + containerHeight) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN
  )

  const visibleFiles = useMemo(() => {
    return displayedFiles.slice(startIndex, endIndex).map((fileItem, idx) => ({
      fileItem,
      top: (startIndex + idx) * VIRTUAL_ROW_HEIGHT,
    }))
  }, [displayedFiles, startIndex, endIndex])

  // Execute Upload: Only upload files with status === 'ready'
  const handleUploadUniqueFiles = async () => {
    const filesToUpload = queuedFiles.filter((f) => f.status === "ready")
    if (filesToUpload.length === 0) return

    setIsUploading(true)
    setUploadProgress({ current: 0, total: filesToUpload.length, currentName: filesToUpload[0].name })

    const uploadedStorageFiles: StorageFile[] = []
    const folderDelta: Record<string, number> = {}

    for (let i = 0; i < filesToUpload.length; i++) {
      const item = filesToUpload[i]
      setUploadProgress({ current: i + 1, total: filesToUpload.length, currentName: item.name })

      // Mark this file as uploading in state
      setQueuedFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "uploading", statusMessage: "Uploading to storage…" } : f))
      )

      try {
        // upsert:false is the backstop — if the availability check missed a duplicate, storage rejects it
        // instead of silently overwriting the existing image.
        await uploadImage("images", item.targetPath, item.file, { upsert: false })

        // Auto-assign inventory row if matching serial number is found
        let attachedDetails: InventoryDetails | null = null
        try {
          const nameWithoutExt = item.name.replace(/\.[^/.]+$/, "")
          const baseSP = nameWithoutExt.replace(/__\d+_+$/, "").replace(/\s*\(\d+\)$/, "").replace(/_\d+$/, "").trim()

          const { data: inv } = await (supabase.from("inventory" as any) as any)
            .select("id")
            .eq("serial_number", baseSP)
            .maybeSingle()

          if (inv) {
            const publicUrl = getPublicUrl("images", item.targetPath)
            await (supabase.from("inventory_images" as any) as any).insert({
              inventory_id: (inv as any).id,
              storage_path: item.targetPath,
              public_url: publicUrl,
            })
            attachedDetails = (await resolveDetails([item.targetPath]))[item.targetPath] ?? null
          }
        } catch (assignErr) {
          console.warn("Failed auto-assigning image row:", assignErr)
        }

        const finalUrl = getPublicUrl("images", item.targetPath)
        const finalStorageFile: StorageFile = {
          name: item.name,
          id: null,
          created_at: new Date().toISOString(),
          metadata: { size: item.size, mimetype: item.file.type },
          storagePath: item.targetPath,
          publicUrl: finalUrl,
          folder: item.targetFolder,
          details: attachedDetails,
        }

        uploadedStorageFiles.push(finalStorageFile)
        folderDelta[item.targetFolder] = (folderDelta[item.targetFolder] ?? 0) + 1

        setQueuedFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: "uploaded", statusMessage: "Uploaded successfully!" } : f))
        )
      } catch (err: any) {
        if (isAlreadyExistsError(err)) {
          setQueuedFiles((prev) =>
            prev.map((f) =>
              f.id === item.id
                ? {
                    ...f,
                    status: "already_exists",
                    statusMessage: `Already available in ${getFolderFullLabel(item.targetFolder)} folder`,
                    existingLocation: item.targetPath,
                  }
                : f
            )
          )
          continue
        }
        console.error("Upload error for file:", item.name, err)
        setQueuedFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", statusMessage: err.message || "Upload failed. Please retry." }
              : f
          )
        )
      }
    }

    setIsUploading(false)

    if (uploadedStorageFiles.length > 0) {
      onUploadSuccess(uploadedStorageFiles, folderDelta)
    }

    // Auto close modal after brief delay if all succeeded
    if (uploadedStorageFiles.length === filesToUpload.length) {
      setTimeout(() => {
        handleClose()
      }, 700)
    }
  }

  const fmt = (n: number) => n.toLocaleString("en-IN")
  const skipped = stats.duplicates + stats.existing
  const progressPct = Math.round((uploadProgress.current / Math.max(1, uploadProgress.total)) * 100)

  // Summary cards double as the list filter
  const filterCards: {
    id: typeof activeTab
    label: string
    value: number
    icon: React.ReactNode
    idle: string
    active: string
  }[] = [
    { id: "all", label: "Selected", value: stats.total, icon: <Files className="w-4 h-4 text-zinc-500" />, idle: "border-zinc-200 bg-zinc-50/70", active: "border-zinc-900 bg-white ring-1 ring-zinc-900" },
    { id: "ready", label: "Ready", value: stats.ready, icon: <CircleCheckFill className="w-4 h-4 text-emerald-600" />, idle: "border-emerald-200 bg-emerald-50/60", active: "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" },
    { id: "existing", label: "In library", value: stats.existing, icon: <CircleExclamationFill className="w-4 h-4 text-amber-600" />, idle: "border-amber-200 bg-amber-50/60", active: "border-amber-600 bg-amber-50 ring-1 ring-amber-600" },
    { id: "duplicates", label: "Duplicates", value: stats.duplicates, icon: <Copy className="w-4 h-4 text-rose-600" />, idle: "border-rose-200 bg-rose-50/60", active: "border-rose-600 bg-rose-50 ring-1 ring-rose-600" },
  ]

  const statusPill = (item: QueuedUploadFile) => {
    const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
    switch (item.status) {
      case "checking":
        return <span className={`${base} border-zinc-200 bg-zinc-100 text-zinc-500`}><Spinner size="sm" color="current" />Checking</span>
      case "ready":
        return <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}><CircleCheckFill className="w-3.5 h-3.5" />Ready</span>
      case "already_exists":
        return <span className={`${base} border-amber-200 bg-amber-50 text-amber-800`}><CircleExclamationFill className="w-3.5 h-3.5" />In library</span>
      case "batch_duplicate":
        return <span className={`${base} border-rose-200 bg-rose-50 text-rose-700`}><Copy className="w-3.5 h-3.5" />Duplicate</span>
      case "uploading":
        return <span className={`${base} border-indigo-200 bg-indigo-50 text-indigo-700`}><Spinner size="sm" color="current" />Uploading</span>
      case "uploaded":
        return <span className={`${base} border-emerald-300 bg-emerald-100 text-emerald-800`}><CircleCheckFill className="w-3.5 h-3.5" />Uploaded</span>
      case "error":
        // The reason is long-form, so it lives in the tooltip rather than the row
        return <span className={`${base} border-red-200 bg-red-50 text-red-700`} title={item.statusMessage}><TriangleExclamation className="w-3.5 h-3.5" />Failed</span>
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isUploading) handleClose()
      }}
    >
      <Modal.Backdrop className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <Modal.Container className="w-full max-w-4xl my-auto">
          {/* HeroUI's default dialog size caps width at --container-md; widen it explicitly */}
          <Modal.Dialog className="max-w-4xl! w-full rounded-3xl shadow-2xl bg-white border border-zinc-200 overflow-hidden relative z-[10000] flex flex-col max-h-[88vh]">
            {/* Header */}
            <Modal.Header className="px-4 sm:px-6 py-4 border-b border-zinc-100 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
                <ArrowUpFromLine className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 truncate">Upload files</h3>
                {isChecking && (
                  <p className="text-[11px] font-medium text-indigo-600 flex items-center gap-1.5">
                    <Spinner size="sm" color="current" />
                    Checking library…
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                aria-label="Close"
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </Modal.Header>

            {/* Body */}
            <Modal.Body className="px-4 sm:px-6 py-4 flex flex-col gap-3 overflow-hidden flex-1 min-h-0">
              {/* Destination selector — defaults to active Fabrics folder when inside Fabrics, or Media auto-route otherwise */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3 py-2 shrink-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500 mr-1">
                  <FolderIcon className="w-3.5 h-3.5 text-zinc-400" />
                  Destination:
                </span>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setUploadDestination("auto")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed ${
                    uploadDestination === "auto"
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100"
                  }`}
                >
                  Auto-route (Media)
                </button>
                {FABRIC_FOLDER_KEYS.map((fabricKey) => {
                  const isActive = uploadDestination === fabricKey
                  return (
                    <button
                      key={fabricKey}
                      type="button"
                      disabled={isUploading}
                      onClick={() => setUploadDestination(fabricKey)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed ${
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                          : "bg-white text-zinc-700 border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/60"
                      }`}
                    >
                      Fabrics / {getFolderDisplayName(fabricKey)}
                    </button>
                  )
                })}
              </div>

              {/* Summary cards — click to filter */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0" role="tablist" aria-label="Filter files">
                {filterCards.map((card) => {
                  const isActive = activeTab === card.id
                  return (
                    <button
                      key={card.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(card.id)}
                      className={`min-w-0 rounded-2xl border px-3 py-2.5 text-left transition-all cursor-pointer ${isActive ? card.active : `${card.idle} hover:border-zinc-300`}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-zinc-500 truncate">{card.label}</span>
                        <span className="shrink-0">{card.icon}</span>
                      </span>
                      <span className="block text-lg font-bold text-zinc-900 tabular-nums leading-tight mt-0.5">{fmt(card.value)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Upload progress */}
              {isUploading && (
                <div className="shrink-0 rounded-2xl bg-zinc-900 text-white px-3.5 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
                    <Spinner size="sm" color="current" />
                    <span className="whitespace-nowrap tabular-nums">
                      {fmt(uploadProgress.current)} / {fmt(uploadProgress.total)}
                    </span>
                    <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-zinc-400">{uploadProgress.currentName}</span>
                    <span className="shrink-0 tabular-nums text-zinc-300">{progressPct}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              )}

              {/* Search + bulk remove */}
              <div className="flex items-center gap-2 shrink-0">
                <label className="relative flex-1 min-w-0">
                  <Magnifier className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search files…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search files in this upload"
                    className="w-full h-9 pl-8 pr-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 focus:bg-white"
                  />
                </label>
                {skipped > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={handleRemoveDuplicates}
                    isDisabled={isUploading}
                    className="h-9 shrink-0 text-xs font-semibold border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100 rounded-xl cursor-pointer whitespace-nowrap"
                  >
                    <TrashBin className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Remove skipped</span> ({fmt(skipped)})
                  </Button>
                )}
              </div>

              {/* File list (virtualized) */}
              <div
                ref={scrollContainerRef}
                onScroll={handleListScroll}
                className="flex-1 overflow-y-auto overflow-x-hidden border border-zinc-200 rounded-2xl bg-white relative min-h-[260px]"
              >
                {displayedFiles.length === 0 ? (
                  <div className="flex items-center justify-center p-10 text-xs font-semibold text-zinc-400">No files match</div>
                ) : (
                  <div style={{ height: `${totalVirtualHeight}px`, position: "relative", width: "100%" }}>
                    {visibleFiles.map(({ fileItem, top }) => {
                      const isSkipped = fileItem.status === "batch_duplicate" || fileItem.status === "already_exists"
                      const canRemove = !isUploading && fileItem.status !== "uploaded"
                      return (
                        <div
                          key={fileItem.id}
                          style={{ position: "absolute", top: `${top}px`, left: 0, right: 0, height: `${VIRTUAL_ROW_HEIGHT}px` }}
                          className={`flex items-center gap-3 px-3 border-b border-zinc-100 ${isSkipped ? "bg-zinc-50/70" : "bg-white hover:bg-zinc-50"}`}
                        >
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 shrink-0 bg-zinc-100">
                            <Image src={fileItem.previewUrl} alt="" fill className="object-cover" unoptimized />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-semibold truncate ${isSkipped ? "text-zinc-500 line-through decoration-zinc-300" : "text-zinc-900"}`}
                              title={fileItem.name}
                            >
                              {fileItem.name}
                            </p>
                            <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 whitespace-nowrap">
                              <span className="tabular-nums">{formatBytes(fileItem.size)}</span>
                              <span aria-hidden>·</span>
                              <span className="truncate">{getFolderFullLabel(fileItem.targetFolder)}</span>
                            </p>
                          </div>

                          <div className="shrink-0">{statusPill(fileItem)}</div>

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(fileItem.id)}
                            disabled={!canRemove}
                            aria-label={`Remove ${fileItem.name}`}
                            title="Remove from upload"
                            className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:invisible"
                          >
                            <TrashBin className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Modal.Body>

            {/* Footer */}
            <Modal.Footer className="px-4 sm:px-6 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center gap-3 shrink-0">
              <p className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                {stats.ready > 0 || isUploading ? (
                  <>
                    <strong className="text-zinc-900 tabular-nums">{fmt(stats.ready)}</strong> to upload
                    {skipped > 0 && <span className="tabular-nums"> · {fmt(skipped)} skipped</span>}
                  </>
                ) : (
                  <span className="font-semibold text-rose-600">Nothing new to upload</span>
                )}
              </p>

              {!isUploading && (
                <Button
                  variant="outline"
                  onPress={handleClose}
                  className="shrink-0 rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                >
                  Cancel
                </Button>
              )}
              <Button
                onPress={handleUploadUniqueFiles}
                isDisabled={stats.ready === 0 || isChecking || isUploading}
                className={`shrink-0 rounded-xl text-xs px-4 h-9 font-bold text-white transition-all flex items-center gap-2 whitespace-nowrap ${
                  isUploading
                    ? "bg-zinc-900 cursor-wait"
                    : stats.ready > 0 && !isChecking
                      ? "bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
                      : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                }`}
              >
                {isUploading ? (
                  <>
                    <Spinner size="sm" color="current" />
                    <span className="tabular-nums">{progressPct}%</span>
                  </>
                ) : (
                  <>
                    <ArrowUpFromLine className="w-3.5 h-3.5" />
                    Upload {fmt(stats.ready)}
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
