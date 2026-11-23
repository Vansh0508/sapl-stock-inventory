"use client"

import { useEffect, useState } from "react"
import { Button, Spinner, toast } from "@heroui/react"
import { getVectorStatsAction, bulkGenerateEmbeddingsAction, type IndexStats } from "@/app/actions/similarityActions"
import { Sparkles } from "@gravity-ui/icons"

export default function VectorIndexingCard() {
  const [stats, setStats] = useState<IndexStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)

  const fetchStats = async () => {
    setLoading(true)
    const res = await getVectorStatsAction()
    if (res.success && res.stats) {
      setStats(res.stats)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleBulkIndexing = async () => {
    setIndexing(true)
    let totalImagesIndexed = 0
    let totalCatalogIndexed = 0
    toast.info("Generating 512-dim vector embeddings...")

    try {
      while (true) {
        const res = await bulkGenerateEmbeddingsAction()
        if (!res.success) {
          toast.danger(res.error || "Failed to index batch.")
          break
        }

        totalImagesIndexed += res.indexedImages
        totalCatalogIndexed += res.indexedCatalog
        await fetchStats()

        if (res.indexedImages === 0 && res.indexedCatalog === 0) {
          break
        }
      }

      toast.success(
        `Bulk indexing complete! Indexed ${totalImagesIndexed} images & ${totalCatalogIndexed} catalog items.`
      )
    } catch (err: any) {
      toast.danger("Indexing error: " + err.message)
    } finally {
      setIndexing(false)
    }
  }

  const imgPercent = stats?.totalImages ? Math.round((stats.indexedImages / stats.totalImages) * 100) : 0
  const catPercent = stats?.totalCatalog ? Math.round((stats.indexedCatalog / stats.totalCatalog) * 100) : 0

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Sparkles width="20" height="20" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Vector Embedding Indexing
            </h3>
            <p className="text-xs text-zinc-500">
              Powers image visual pattern matching and catalog data-point similarity search
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          isDisabled={indexing || loading}
          onPress={handleBulkIndexing}
          className="font-bold text-xs"
        >
          {indexing ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" color="warning" />
              <span>Indexing All Items...</span>
            </div>
          ) : (
            "Index All Missing Embeddings"
          )}
        </Button>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Spinner size="sm" color="warning" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 pt-5 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span className="text-zinc-700 dark:text-zinc-300">Inventory Image Vectors</span>
              <span className="text-amber-600 dark:text-amber-400">
                {stats?.indexedImages || 0} / {stats?.totalImages || 0} ({imgPercent}%)
              </span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${imgPercent}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span className="text-zinc-700 dark:text-zinc-300">Catalog Spec Vectors</span>
              <span className="text-amber-600 dark:text-amber-400">
                {stats?.indexedCatalog || 0} / {stats?.totalCatalog || 0} ({catPercent}%)
              </span>
            </div>
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${catPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
