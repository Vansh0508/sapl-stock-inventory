"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Modal, Button, Spinner, toast } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { getPublicUrl, listFolder, getThumbnailUrl } from "@/lib/supabase/storage"
import { cn } from "@/lib/utils"

interface PptAssetPickerModalProps {
  isOpen: boolean
  onClose: () => void
  folder: "cover-images" | "back-images" | "logo" | "grouper-images"
  title: string
  selectedUrl?: string | null
  onSelectImage: (url: string) => void
}

interface BucketAsset {
  name: string
  storagePath: string
  publicUrl: string
  created_at: string | null
}

export default function PptAssetPickerModal({
  isOpen,
  onClose,
  folder,
  title,
  selectedUrl,
  onSelectImage,
}: PptAssetPickerModalProps) {
  const [assets, setAssets] = useState<BucketAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setIsLoading(true)

    const fetchBucketFiles = async () => {
      try {
        const items = await listFolder("ppt-assets", folder, { limit: 100 })
        if (cancelled) return

        const formatted: BucketAsset[] = items
          .filter((i) => i.name && i.id !== null)
          .map((item) => {
            const storagePath = `${folder}/${item.name}`
            return {
              name: item.name,
              storagePath,
              publicUrl: getPublicUrl("ppt-assets", storagePath),
              created_at: item.created_at,
            }
          })

        setAssets(formatted)
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to list bucket assets:", e)
          setAssets([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchBucketFiles()

    return () => {
      cancelled = true
    }
  }, [isOpen, folder])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`

      const { error } = await supabase.storage.from("ppt-assets").upload(fileName, file, { upsert: true })
      if (error) throw error

      const publicUrl = getPublicUrl("ppt-assets", fileName)
      toast.success("Image uploaded successfully!")

      // Add to local state and auto-select
      const newAsset: BucketAsset = {
        name: file.name,
        storagePath: fileName,
        publicUrl,
        created_at: new Date().toISOString(),
      }
      setAssets((prev) => [newAsset, ...prev])
      onSelectImage(publicUrl)
      onClose()
    } catch (err: any) {
      console.error("Failed to upload image:", err)
      toast.danger(err.message || "Failed to upload image")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <Modal.Backdrop className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[10000] flex items-center justify-center p-4 overflow-y-auto">
        <Modal.Container className="w-full max-w-5xl my-auto">
          <Modal.Dialog className="rounded-3xl shadow-2xl bg-white border border-zinc-200 overflow-hidden w-full relative z-[10001]">
            <Modal.Header className="px-6 pt-5 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900">{title}</h3>
                <p className="text-xs text-zinc-400 font-medium">
                  Select an existing image from the <code className="bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">ppt-assets/{folder}</code> bucket or upload a new file.
                </p>
              </div>
            </Modal.Header>

            <Modal.Body className="p-6 flex flex-col gap-5 max-h-[75vh] overflow-y-auto">
              {/* Upload New Image Banner */}
              <div className="p-4 bg-zinc-50 border border-dashed border-zinc-300 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-800 block">Upload New Asset</span>
                  <span className="text-[11px] text-zinc-500 font-medium">
                    Uploads a new image directly to the <code className="bg-zinc-100 px-1 rounded text-zinc-700">{folder}</code> bucket
                  </span>
                </div>

                <label className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all flex items-center gap-2 shadow-xs">
                  {isUploading ? (
                    <>
                      <Spinner size="sm" color="current" />
                      <span>Uploading…</span>
                    </>
                  ) : (
                    <span>Upload New File</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Grid of Existing Bucket Images */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                  Existing Bucket Images ({assets.length})
                </span>

                {isLoading ? (
                  <div className="flex items-center justify-center p-12 text-xs text-indigo-600 font-medium gap-2">
                    <Spinner size="sm" color="current" />
                    <span>Loading bucket assets…</span>
                  </div>
                ) : assets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-400 font-medium border border-zinc-200 rounded-2xl bg-zinc-50">
                    No images found in <code className="bg-zinc-100 px-1 py-0.5 rounded font-mono">ppt-assets/{folder}</code> yet. Use the upload button above to add your first asset!
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                    {assets.map((asset) => {
                      const isSelected = selectedUrl === asset.publicUrl
                      return (
                        <div
                          key={asset.storagePath}
                          onClick={() => {
                            onSelectImage(asset.publicUrl)
                            onClose()
                          }}
                          className={cn(
                            "group relative aspect-square rounded-2xl overflow-hidden border cursor-pointer transition-all flex flex-col bg-zinc-50 select-none",
                            isSelected
                              ? "ring-3 ring-indigo-500 border-indigo-500 shadow-md"
                              : "border-zinc-200 hover:border-zinc-400 hover:shadow-xs"
                          )}
                        >
                          <Image
                            src={getThumbnailUrl(asset.publicUrl, { width: 300, quality: 75 })}
                            alt={asset.name}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                              Selected
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Modal.Body>

            <Modal.Footer className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end">
              <Button
                type="button"
                onPress={onClose}
                className="bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-xl text-xs px-4 h-9 font-bold cursor-pointer transition-all"
              >
                Cancel
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
