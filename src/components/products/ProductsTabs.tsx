"use client"

import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export default function ProductsTabs() {
  const pathname = usePathname()
  const router = useRouter()

  let selectedKey = "dashboard"
  if (pathname.includes("/products/gallery")) {
    selectedKey = "gallery"
  } else if (pathname.includes("/products/catalog")) {
    selectedKey = "catalog"
  } else if (pathname.includes("/products/manage")) {
    selectedKey = "manage"
  }

  const tabs = [
    { key: "dashboard", label: "Dashboard" },
    { key: "gallery", label: "Gallery" },
    { key: "catalog", label: "Catalog" },
    { key: "manage", label: "Manage" },
  ]

  return (
    <div className="w-full px-4 md:px-6 pt-4 shrink-0 border-b border-zinc-200/60 flex items-end">
      <div className="flex w-full md:w-auto relative gap-4 md:gap-6 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = selectedKey === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => router.push(`/products/${tab.key}`)}
              className={cn(
                "pb-3 flex-1 shrink-0 whitespace-nowrap text-center text-base font-medium transition-colors relative cursor-pointer",
                isActive ? "text-blue-600" : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
