"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import {
  Modal,
  Button,
  Spinner,
  Chip,
} from "@heroui/react"
import { motion } from "motion/react"
import {
  findSimilarItemsAction,
  type SimilarImageResult,
  type SimilarCatalogResult,
} from "@/app/actions/similarityActions"
import type { CatalogMetadataInput } from "@/lib/embeddings/embeddingService"
import { FileText, Picture, Sparkles } from "@gravity-ui/icons"

interface SimilarItemsModalProps {
  isOpen: boolean
  onClose: () => void
  targetImageUrl?: string
  targetImageId?: string
  targetTitle?: string
  targetMetadata?: CatalogMetadataInput
}

export default function SimilarItemsModal({
  isOpen,
  onClose,
  targetImageUrl,
  targetImageId,
  targetTitle,
  targetMetadata,
}: SimilarItemsModalProps) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"visual" | "catalog">("visual")
  const [imageMatches, setImageMatches] = useState<SimilarImageResult[]>([])
  const [catalogMatches, setCatalogMatches] = useState<SimilarCatalogResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [activeImagePreview, setActiveImagePreview] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && (targetImageUrl || targetImageId || targetMetadata)) {
      setLoading(true)
      setErrorMsg(null)

      findSimilarItemsAction({
        imageUrl: targetImageUrl,
        imageId: targetImageId,
        catalogMetadata: targetMetadata,
        limit: 18,
      })
        .then((res) => {
          if (res.success) {
            setImageMatches(res.imageMatches || [])
            setCatalogMatches(res.catalogMatches || [])
          } else {
            setErrorMsg(res.error || "Failed to find similar items.")
          }
        })
        .catch((err) => {
          console.error("Error fetching similarity:", err)
          setErrorMsg("Failed to execute similarity search.")
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [isOpen, targetImageUrl, targetImageId, targetMetadata])

  const formatSimilarityPercent = (score: number) => {
    const pct = Math.min(Math.max(score * 100, 0), 100)
    return `${pct.toFixed(1)}%`
  }

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl">
              <Modal.Header className="flex flex-col gap-1 border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Sparkles width="18" height="18" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                        Vector Similarity Search
                      </h3>
                      <p className="text-xs text-zinc-500 font-normal">
                        Matches based on pattern aesthetics, color palettes, and catalog specifications
                      </p>
                    </div>
                  </div>
                </div>

                {/* Target Image & Metadata Context Bar */}
                <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {targetImageUrl ? (
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-zinc-300 dark:border-zinc-700 bg-zinc-200 shrink-0">
                        <Image
                          src={getThumbnailUrl(targetImageUrl, { width: 120, quality: 75 })}
                          alt={targetTitle || "Target image"}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-center text-amber-600">
                        <Sparkles width="18" height="18" />
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        Query Target: {targetTitle || "Selected Rug Image"}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 max-w-xl truncate">
                        {targetMetadata
                          ? `${targetMetadata.quality_name || ""} • ${targetMetadata.design_name || ""} • ${targetMetadata.color_names || ""}`
                          : targetImageUrl
                          ? "Analyzing 512-dim CLIP visual embedding features..."
                          : "Catalog metadata data-point embedding"}
                      </div>
                    </div>
                  </div>
                  <Chip size="sm" variant="soft" color="warning" className="text-xs">
                    512-dim Cosine Vector Space
                  </Chip>
                </div>
              </Modal.Header>

              <Modal.Body className="py-5 px-6 min-h-[400px]">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Spinner size="lg" color="warning" />
                    <p className="text-sm text-zinc-500 font-medium animate-pulse">
                      Computing vector similarity across images & catalog database...
                    </p>
                  </div>
                ) : errorMsg ? (
                  <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm">
                    {errorMsg}
                  </div>
                ) : (
                  <div>
                    {/* Tabs */}
                    <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab("visual")}
                          className={`flex items-center px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            activeTab === "visual"
                              ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <Picture className="mr-1.5" />
                          Visual Pattern Matches ({imageMatches.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("catalog")}
                          className={`flex items-center px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            activeTab === "catalog"
                              ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                              : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                        >
                          <FileText className="mr-1.5" />
                          Catalog Data Matches ({catalogMatches.length})
                        </button>
                      </div>
                    </div>

                    {/* Tab Content 1: Visual Pattern Matches */}
                    {activeTab === "visual" && (
                      <div>
                        {imageMatches.length === 0 ? (
                          <div className="text-center py-16 text-zinc-400 text-sm">
                            No visual pattern matches found. Try indexing more images in the Manage tab.
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {imageMatches.map((item, idx) => (
                              <motion.div
                                key={item.image_id || idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: idx * 0.03 }}
                                className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all"
                              >
                                {/* Similarity Score Badge */}
                                <div className="absolute top-2 right-2 z-10">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-md">
                                    {formatSimilarityPercent(item.similarity)} match
                                  </span>
                                </div>

                                {/* Thumbnail */}
                                <div
                                  onClick={() => setActiveImagePreview(item.public_url)}
                                  className="relative aspect-4/3 w-full bg-zinc-100 dark:bg-zinc-800 cursor-pointer overflow-hidden"
                                >
                                  <Image
                                    src={getThumbnailUrl(item.public_url, { width: 320, quality: 75 })}
                                    alt={item.product_name || item.sku || "Similar image"}
                                    fill
                                    unoptimized
                                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="px-3 py-1 bg-white/90 text-zinc-900 text-xs font-semibold rounded-lg shadow">
                                      Quick View
                                    </span>
                                  </div>
                                </div>

                                {/* Details */}
                                <div className="p-3">
                                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {item.sku || item.serial_number || "Rug Asset"}
                                  </div>
                                  <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                                    {[item.quality_name, item.design_name].filter(Boolean).join(" • ") || "Pattern item"}
                                  </div>
                                  {item.color_names && (
                                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium truncate mt-1">
                                      🎨 {item.color_names}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab Content 2: Catalog Specification Matches */}
                    {activeTab === "catalog" && (
                      <div>
                        {catalogMatches.length === 0 ? (
                          <div className="text-center py-16 text-zinc-400 text-sm">
                            No catalog spec matches found.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                            {catalogMatches.map((cat, idx) => (
                              <motion.div
                                key={cat.catalog_id || idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: idx * 0.03 }}
                                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-amber-400 transition-all"
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                      <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                                        {cat.sku}
                                      </span>
                                      <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                        {cat.product_name || "Catalog Product"}
                                      </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                      {formatSimilarityPercent(cat.similarity)} match
                                    </span>
                                  </div>

                                  {/* Sample Image if available */}
                                  {cat.sample_image_url && (
                                    <div className="relative aspect-16/9 w-full rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-3 border border-zinc-200/60 dark:border-zinc-700">
                                      <Image
                                        src={getThumbnailUrl(cat.sample_image_url, { width: 360, quality: 75 })}
                                        alt={cat.sku}
                                        fill
                                        unoptimized
                                        className="object-cover"
                                      />
                                    </div>
                                  )}

                                  <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    {cat.quality_name && <div><strong>Quality:</strong> {cat.quality_name}</div>}
                                    {cat.design_name && <div><strong>Design:</strong> {cat.design_name}</div>}
                                    {cat.construction_name && <div><strong>Construction:</strong> {cat.construction_name}</div>}
                                    {cat.fiber_configuration && <div><strong>Fibers:</strong> {cat.fiber_configuration}</div>}
                                    {cat.size_label && <div><strong>Size:</strong> {cat.size_label}</div>}
                                  </div>
                                </div>

                                {cat.color_names && (
                                  <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                    Colors: {cat.color_names}
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Modal.Body>

              <Modal.Footer className="border-t border-zinc-100 dark:border-zinc-800/80">
                <Button variant="secondary" onPress={onClose}>
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Lightbox Preview Modal */}
      {activeImagePreview && (
        <Modal isOpen={!!activeImagePreview} onOpenChange={(open) => { if (!open) setActiveImagePreview(null) }}>
          <Modal.Backdrop>
            <Modal.Container size="lg">
              <Modal.Dialog className="bg-black/95 border border-zinc-800">
                <Modal.Body className="p-2 flex items-center justify-center">
                  <div className="relative w-full aspect-4/3 max-h-[80vh]">
                    <Image src={getThumbnailUrl(activeImagePreview, { width: 1000, quality: 85 })} alt="Preview" fill unoptimized className="object-contain" />
                  </div>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      )}
    </>
  )
}
