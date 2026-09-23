"use client"

import Image from "next/image"
import { useCallback, useRef, useState } from "react"
import { Reorder, motion, AnimatePresence } from "motion/react"
import { Typography } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface UploadedImage {
  id: string
  file?: File
  previewUrl: string
  publicUrl?: string
  storagePath?: string
  sort_order: number
  isUploading?: boolean
  uploadProgress?: number
  error?: string
}

interface ImageUploaderProps {
  images: UploadedImage[]
  onImagesChange: (images: UploadedImage[]) => void
  maxImages?: number
  disabled?: boolean
}

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const DragHandleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
  </svg>
)

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)

let idCounter = 0
const uniqueId = () => `img_${++idCounter}_${Math.random().toString(36).slice(2, 7)}`

export default function ImageUploader({
  images,
  onImagesChange,
  maxImages = 20,
  disabled = false,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const remaining = maxImages - images.length
      if (remaining <= 0) return
      const toAdd = Array.from(files).slice(0, remaining).filter((f) => f.type.startsWith("image/"))
      if (toAdd.length === 0) return

      const newImages: UploadedImage[] = toAdd.map((file) => ({
        id: uniqueId(),
        file,
        previewUrl: URL.createObjectURL(file),
        sort_order: 0, // temporary
        isUploading: false,
      }))

      // Combine existing images and new images
      const combined = [...images, ...newImages]

      // Sort according to sequence rules (leading sequence files, others at end)
      combined.sort((a, b) => {
        const nameA = a.file?.name || a.publicUrl || a.storagePath || ""
        const nameB = b.file?.name || b.publicUrl || b.storagePath || ""

        // Remove path prefix if publicUrl or storagePath is used
        const filenameA = nameA.split("/").pop() || ""
        const filenameB = nameB.split("/").pop() || ""

        const getSequenceInfo = (fname: string) => {
          const nameWithoutExt = fname.replace(/\.[^/.]+$/, "")
          const match = nameWithoutExt.match(/(?:[_\s\-\(]+)(\d+)\)?$/)
          if (match) {
            return { hasSeq: true, seq: parseInt(match[1], 10) }
          }
          return { hasSeq: false, seq: Infinity }
        }

        const infoA = getSequenceInfo(filenameA)
        const infoB = getSequenceInfo(filenameB)

        if (infoA.hasSeq && infoB.hasSeq) {
          return infoA.seq - infoB.seq
        }
        if (infoA.hasSeq && !infoB.hasSeq) return -1
        if (!infoA.hasSeq && infoB.hasSeq) return 1

        return filenameA.localeCompare(filenameB, undefined, { numeric: true, sensitivity: 'base' })
      })

      // Re-assign sort_order based on sorted array
      const sortedWithOrder = combined.map((img, i) => ({
        ...img,
        sort_order: i,
      }))

      onImagesChange(sortedWithOrder)
    },
    [images, maxImages, onImagesChange]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
    e.target.value = ""
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (disabled) return
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
    },
    [addFiles, disabled]
  )

  const removeImage = (id: string) => {
    const next = images.filter((img) => img.id !== id).map((img, i) => ({ ...img, sort_order: i }))
    onImagesChange(next)
  }

  const handleReorder = (reordered: UploadedImage[]) => {
    onImagesChange(reordered.map((img, i) => ({ ...img, sort_order: i })))
  }

  const moveImage = useCallback((index: number, direction: "left" | "right") => {
    const nextIndex = direction === "left" ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= images.length) return
    const next = [...images]
    // Swap
    const temp = next[index]
    next[index] = next[nextIndex]
    next[nextIndex] = temp

    onImagesChange(next.map((img, i) => ({ ...img, sort_order: i })))
  }, [images, onImagesChange])

  const canAdd = images.length < maxImages && !disabled

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      {canAdd && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 cursor-pointer transition-all",
            isDragOver
              ? "border-indigo-400 bg-indigo-50"
              : "border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50"
          )}
        >
          <div className="text-zinc-400">
            <UploadIcon />
          </div>
          <div className="text-center">
            <Typography.Paragraph size="sm" weight="medium" className="text-zinc-700">Drag photos here or click to browse</Typography.Paragraph>
            <Typography.Paragraph size="xs" className="text-zinc-400 mt-0.5">
              Up to {maxImages} images · {images.length}/{maxImages} uploaded
            </Typography.Paragraph>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
        </div>
      )}

      {/* Thumbnail grid with reordering */}
      {images.length > 0 && (
        <Reorder.Group
          axis="x"
          values={images}
          onReorder={handleReorder}
          className="flex flex-wrap gap-2"
        >
          <AnimatePresence>
            {images.map((img) => (
              <Reorder.Item
                key={img.id}
                value={img}
                className="relative group touch-none cursor-grab active:cursor-grabbing"
                whileDrag={{ scale: 1.05, zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}
                layout
              >
                {/* Thumbnail */}
                <div className="relative w-20 h-20 sm:w-[120px] sm:h-[120px] rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100">
                  <Image
                    src={img.previewUrl}
                    alt={`Uploaded image ${img.sort_order + 1}`}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />

                  {/* Upload progress overlay */}
                  {img.isUploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    </div>
                  )}

                  {/* Error overlay */}
                  {img.error && (
                    <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center">
                      <Typography.Paragraph size="xs" weight="medium" align="center" className="text-white px-1">Error</Typography.Paragraph>
                    </div>
                  )}

                  {/* Drag handle (top left) */}
                  <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded p-0.5 text-white">
                    <DragHandleIcon />
                  </div>

                  {/* Remove button */}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeImage(img.id) }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      aria-label="Remove image"
                    >
                      <XIcon />
                    </button>
                  )}
                </div>

                {/* Sort order badge */}
                <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] rounded px-1 leading-4">
                  {img.sort_order + 1}
                </div>

                {/* Reordering arrows (bottom right on hover) */}
                {!disabled && images.length > 1 && (
                  <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded p-0.5">
                    <button
                      type="button"
                      disabled={img.sort_order === 0}
                      onClick={(e) => { e.stopPropagation(); moveImage(img.sort_order, "left") }}
                      className="text-white hover:text-indigo-300 disabled:opacity-30 cursor-pointer p-0.5"
                      aria-label="Move left"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={img.sort_order === images.length - 1}
                      onClick={(e) => { e.stopPropagation(); moveImage(img.sort_order, "right") }}
                      className="text-white hover:text-indigo-300 disabled:opacity-30 cursor-pointer p-0.5"
                      aria-label="Move right"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>
                )}
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </div>
  )
}
