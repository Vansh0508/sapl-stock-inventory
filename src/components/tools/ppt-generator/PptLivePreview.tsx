"use client"

import Image from "next/image"
import { getThumbnailUrl } from "@/lib/supabase/storage"
import { PPT_COVER_PAGES } from "@/types/ppt.types"
import type { PptConfig } from "@/types/ppt.types"
import { groupItemsByProductCode, groupWishlistItems } from "@/lib/pptGrouping"
import type { PptWishlistItem } from "@/types/ppt.types"

interface PptLivePreviewProps {
  config: PptConfig
  items: PptWishlistItem[]
}

function convertSize(sizeLabel: string | null, sizeType: PptConfig["sizeType"]): string {
  if (!sizeLabel) return "—"
  if (sizeType === "ft") return sizeLabel
  // sizeLabel is stored as "{width} x {length} ft" — convert the numeric parts to cm (1 ft = 30.48 cm).
  const match = sizeLabel.match(/^([\d.]+)\s*x\s*([\d.]+)\s*ft$/i)
  if (!match) return sizeLabel
  const widthCm = Math.round(parseFloat(match[1]) * 30.48)
  const lengthCm = Math.round(parseFloat(match[2]) * 30.48)
  return `${widthCm} x ${lengthCm} cm`
}

function SlideFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="shrink-0 w-full">
      <div className="aspect-video w-full rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
        {children}
      </div>
      <p className="text-[10px] text-zinc-400 font-semibold mt-1.5 text-center uppercase tracking-wide">{label}</p>
    </div>
  )
}

export default function PptLivePreview({ config, items }: PptLivePreviewProps) {
  const groups = groupWishlistItems(items, config.groupBy)

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Cover slides */}
      {config.coverPages.map((coverId) => {
        const cover = PPT_COVER_PAGES.find((c) => c.value === coverId)
        return (
          <SlideFrame key={coverId} label={cover?.label ?? coverId}>
            <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 to-zinc-900 text-white p-6">
              <span className="text-lg font-bold tracking-wide">{config.projectName || "Untitled Project"}</span>
              <span className="text-[11px] text-indigo-200/70 mt-1">{cover?.description}</span>
            </div>
          </SlideFrame>
        )
      })}

      {items.length === 0 ? (
        <p className="text-xs text-zinc-400 text-center py-8">
          Add serial numbers to this workspace to see slides here.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-4">
            {config.groupBy !== "none" && (
              <SlideFrame label="Section heading">
                <div className="flex-1 flex items-center justify-center bg-zinc-50">
                  <span className="text-base font-bold text-zinc-900">{group.label}</span>
                </div>
              </SlideFrame>
            )}

            {groupItemsByProductCode(group.items).map((productGroup) => (
              <div key={productGroup.productCode} className="flex flex-col gap-4">
                <SlideFrame label="Product Code summary">
                  <div className="flex-1 flex">
                    <div className="w-1/2 relative bg-zinc-100">
                      {productGroup.imageUrl ? (
                        <Image
                          src={getThumbnailUrl(productGroup.imageUrl, { width: 500, quality: 75 })}
                          alt={productGroup.productCode}
                          fill
                          unoptimized
                          sizes="300px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300 text-[10px]">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="w-1/2 p-4 flex flex-col gap-2 justify-center">
                      <span className="font-mono text-sm font-bold text-zinc-900">{productGroup.productCode}</span>
                      <span className="text-[11px] text-zinc-500">
                        {[productGroup.productName, productGroup.qualityName, productGroup.colorNames]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                      <div className="flex flex-col gap-0.5 mt-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                          Sizes available
                        </span>
                        {productGroup.sizes.map((s) => (
                          <div key={s.sizeLabel} className="flex items-center justify-between text-[11px] text-zinc-600">
                            <span>{convertSize(s.sizeLabel, config.sizeType)}</span>
                            <span className="font-semibold text-zinc-900">x{s.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </SlideFrame>

                {productGroup.items.map((item) => (
                  <SlideFrame key={item.inventoryId} label={`Product · ${item.serialNumber}`}>
                    <div className="flex-1 flex">
                      <div className="w-1/2 relative bg-zinc-100">
                        {item.imageUrl ? (
                          <Image
                            src={getThumbnailUrl(item.imageUrl, { width: 500, quality: 75 })}
                            alt={item.sku}
                            fill
                            unoptimized
                            sizes="300px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-[10px]">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="w-1/2 p-4 flex flex-col gap-1 justify-center">
                        <span className="font-mono text-xs font-bold text-zinc-900">{item.sku}</span>
                        <span className="text-[11px] text-zinc-500">{item.productName ?? "—"}</span>
                        <span className="text-[11px] text-zinc-500">{item.designName ?? "—"}</span>
                        <span className="text-[11px] text-zinc-500">
                          {convertSize(item.sizeLabel, config.sizeType)}
                        </span>
                        <span className="text-[11px] text-zinc-400 font-mono mt-1">SP: {item.serialNumber}</span>
                      </div>
                    </div>
                  </SlideFrame>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
