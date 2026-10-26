"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Modal, Button, Spinner } from "@heroui/react"
import Image from "next/image"
import { supabase } from "@/lib/supabase/client"
import { uploadImage, getPublicUrl } from "@/lib/supabase/storage"
import { getFolderForFilename } from "@/lib/utils"
import type { FolderKey } from "@/lib/content-folders"

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
  targetFolder: "Head" | "Floor" | "Corner" | "Closeup" | "Tag"
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
  currentFolder: FolderKey | "root"
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

const CheckCircleIcon = ({ className = "w-4 h-4 text-emerald-600" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
  </svg>
)

const AlertCircleIcon = ({ className = "w-4 h-4 text-amber-500" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
  </svg>
)

const CopyDuplicateIcon = ({ className = "w-4 h-4 text-rose-500" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
  </svg>
)

const TrashIcon = ({ className = "w-4 h-4 text-zinc-400" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
  </svg>
)

export default function UploadSummaryModal({
  isOpen,
  onClose,
  files,
  currentFolder,
  onUploadSuccess,
  resolveDetails,
}: UploadSummaryModalProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedUploadFile[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "ready" | "duplicates" | "existing">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, currentName: "" })

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
      const targetFolder = getFolderForFilename(f.name)
      const targetPath = `media/${targetFolder}/${f.name}`
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
        const candidatePaths = candidateItems.map((c) => c.targetPath)
        const { data: dbMatches } = await (supabase.from("inventory_images" as any) as any)
          .select("storage_path")
          .in("storage_path", candidatePaths)

        const existingDbPaths = new Set(((dbMatches as any[]) ?? []).map((r) => r.storage_path))

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
            const folderPath = `media/${folder}`
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
                        (item) => item.name.trim().toLowerCase() === fileItem.name.trim().toLowerCase()
                      )
                      if (found) existingStoragePaths.add(fileItem.targetPath)
                    }
                  })
                )
              } else {
                const { data, error } = await supabase.storage.from("images").list(folderPath, {
                  limit: 1000,
                })
                if (!error && data && data.length > 0) {
                  const existingNameSet = new Set(data.map((item) => item.name.trim().toLowerCase()))
                  for (const fileItem of unverifiedFiles) {
                    if (existingNameSet.has(fileItem.name.trim().toLowerCase())) {
                      existingStoragePaths.add(fileItem.targetPath)
                    }
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
                statusMessage: `Already available in ${item.targetFolder} folder`,
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
  }, [isOpen, files, cleanupPreviewUrls])

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
        await uploadImage("images", item.targetPath, item.file)

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

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isUploading) handleClose()
      }}
    >
      <Modal.Backdrop className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <Modal.Container className="w-full max-w-4xl my-auto">
          <Modal.Dialog className="rounded-3xl shadow-2xl bg-white border border-zinc-200 overflow-hidden w-full relative z-[10000] flex flex-col max-h-[88vh]">
            {/* Modal Header */}
            <Modal.Header className="px-6 pt-5 pb-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                    Upload Summary & Verification
                    {isChecking && (
                      <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                        <Spinner size="sm" color="current" />
                        Verifying availability…
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Review and deduplicate files by filename. Only unique files not already available in the library will be uploaded
                    {currentFolder !== "root" ? ` (viewing ${currentFolder} folder)` : ""}.
                  </p>
                </div>
              </div>
            </Modal.Header>

            {/* Modal Body */}
            <Modal.Body className="p-6 flex flex-col gap-4 overflow-hidden flex-1">
              {/* Stat Cards */}
              <div className="grid grid-cols-4 gap-3 shrink-0">
                <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-3 flex flex-col">
                  <span className="text-[11px] font-semibold text-zinc-500">Total Selected</span>
                  <span className="text-xl font-bold text-zinc-900 mt-0.5">{stats.total}</span>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-3 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-800">Ready to Upload</span>
                    <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-xl font-bold text-emerald-950 mt-0.5">{stats.ready}</span>
                </div>

                <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-3 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-800">Already in Library</span>
                    <AlertCircleIcon className="w-4 h-4 text-amber-600" />
                  </div>
                  <span className="text-xl font-bold text-amber-950 mt-0.5">{stats.existing}</span>
                </div>

                <div className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-3 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-rose-800">Batch Duplicates</span>
                    <CopyDuplicateIcon className="w-4 h-4 text-rose-600" />
                  </div>
                  <span className="text-xl font-bold text-rose-950 mt-0.5">{stats.duplicates}</span>
                </div>
              </div>

              {/* Upload Progress Bar (when active) */}
              {isUploading && (
                <div className="bg-zinc-900 text-white p-3.5 rounded-2xl shadow-md shrink-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-2">
                      <Spinner size="sm" color="current" />
                      Uploading {uploadProgress.current} of {uploadProgress.total} file(s)…
                    </span>
                    <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[280px]">
                      {uploadProgress.currentName}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{
                        width: `${Math.round((uploadProgress.current / Math.max(1, uploadProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Filter Tabs & Search & Quick Deduplicate Action */}
              <div className="flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === "all" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    All ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ready")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === "ready" ? "bg-emerald-600 text-white shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Ready ({stats.ready})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("existing")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === "existing" ? "bg-amber-600 text-white shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Already Exists ({stats.existing})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("duplicates")}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      activeTab === "duplicates" ? "bg-rose-600 text-white shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Duplicates ({stats.duplicates})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search in selection…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 px-2.5 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-400 w-44"
                  />

                  {(stats.duplicates > 0 || stats.existing > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={handleRemoveDuplicates}
                      isDisabled={isUploading}
                      className="h-8 text-xs font-semibold border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100 rounded-xl cursor-pointer"
                    >
                      <TrashIcon className="w-3.5 h-3.5 text-rose-600" />
                      Remove Duplicates ({stats.duplicates + stats.existing})
                    </Button>
                  )}
                </div>
              </div>

              {/* Virtualized Files Table / Scrollable List */}
              <div
                ref={scrollContainerRef}
                onScroll={handleListScroll}
                className="flex-1 overflow-y-auto border border-zinc-200 rounded-2xl bg-zinc-50/40 relative min-h-[320px]"
              >
                {displayedFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-10 text-center text-zinc-400">
                    <p className="text-xs font-semibold">No files match the selected filter</p>
                  </div>
                ) : (
                  <div style={{ height: `${totalVirtualHeight}px`, position: "relative", width: "100%" }}>
                    {visibleFiles.map(({ fileItem, top }) => {
                      const isReady = fileItem.status === "ready"
                      const isBatchDupe = fileItem.status === "batch_duplicate"
                      const isExisting = fileItem.status === "already_exists"
                      const isUploaded = fileItem.status === "uploaded"
                      const isFileUploading = fileItem.status === "uploading"

                      return (
                        <div
                          key={fileItem.id}
                          style={{
                            position: "absolute",
                            top: `${top}px`,
                            left: 0,
                            right: 0,
                            height: `${VIRTUAL_ROW_HEIGHT}px`,
                          }}
                          className={`flex items-center justify-between px-3 border-b border-zinc-200/70 transition-colors ${
                            isBatchDupe
                              ? "bg-rose-50/30 hover:bg-rose-50/50"
                              : isExisting
                              ? "bg-amber-50/30 hover:bg-amber-50/50"
                              : isReady
                              ? "bg-white hover:bg-zinc-50"
                              : "bg-white"
                          }`}
                        >
                          {/* File info with thumbnail */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-zinc-200 shrink-0 bg-zinc-100 shadow-2xs">
                              <Image
                                src={fileItem.previewUrl}
                                alt={fileItem.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>

                            <div className="flex flex-col min-w-0 pr-4">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-semibold truncate ${
                                    isBatchDupe || isExisting ? "text-zinc-600 line-through decoration-zinc-400" : "text-zinc-900"
                                  }`}
                                  title={fileItem.name}
                                >
                                  {fileItem.name}
                                </span>
                                <span className="text-[10px] font-bold text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded-md border border-zinc-200/60">
                                  {fileItem.targetFolder}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                <span>{formatBytes(fileItem.size)}</span>
                                <span>·</span>
                                <span className="truncate">{fileItem.statusMessage}</span>
                              </div>
                            </div>
                          </div>

                          {/* Status Badge & Actions */}
                          <div className="flex items-center gap-3 shrink-0">
                            {fileItem.status === "checking" && (
                              <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                                <Spinner size="sm" color="current" />
                                Checking…
                              </span>
                            )}

                            {isReady && (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                                Ready
                              </span>
                            )}

                            {isExisting && (
                              <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                                <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600" />
                                Already in library
                              </span>
                            )}

                            {isBatchDupe && (
                              <span className="text-[11px] font-bold text-rose-800 bg-rose-100/80 border border-rose-200 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                                <CopyDuplicateIcon className="w-3.5 h-3.5 text-rose-600" />
                                Batch duplicate
                              </span>
                            )}

                            {isFileUploading && (
                              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                                <Spinner size="sm" color="current" />
                                Uploading…
                              </span>
                            )}

                            {isUploaded && (
                              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                                Uploaded
                              </span>
                            )}

                            {/* Remove button */}
                            {!isUploading && !isUploaded && (
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(fileItem.id)}
                                title="Remove from queue"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between shrink-0">
              <div className="text-xs text-zinc-500 font-medium">
                {stats.ready > 0 ? (
                  <span>
                    <strong className="text-zinc-900">{stats.ready}</strong> unique file(s) ready to upload.
                    {(stats.duplicates > 0 || stats.existing > 0) && (
                      <span className="text-amber-700 ml-1">
                        ({stats.duplicates + stats.existing} excluded duplicates will be skipped)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-rose-600 font-semibold">
                    No unique new files available to upload.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onPress={handleClose}
                  isDisabled={isUploading}
                  className="rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                >
                  {isUploading ? "Uploading…" : "Cancel"}
                </Button>

                <Button
                  onPress={handleUploadUniqueFiles}
                  isDisabled={stats.ready === 0 || isChecking || isUploading}
                  className={`rounded-xl text-xs px-5 h-9 cursor-pointer font-bold shadow-xs text-white transition-all flex items-center gap-2 ${
                    stats.ready > 0 && !isChecking && !isUploading
                      ? "bg-zinc-900 hover:bg-zinc-800"
                      : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Spinner size="sm" color="current" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Upload {stats.ready} Unique File{stats.ready === 1 ? "" : "s"}
                    </>
                  )}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
