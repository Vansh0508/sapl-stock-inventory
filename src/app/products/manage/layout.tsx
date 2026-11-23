"use client"

import { usePathname, useRouter } from "next/navigation"
import { Typography } from "@heroui/react"
import { cn } from "@/lib/utils"
import VectorIndexingCard from "@/components/products/manage/VectorIndexingCard"
import { ArrowsExpand, ArrowsExpandHorizontal, ArrowsExpandVertical, CircleDollar, Cube, Hammer, Layers, MapPin, Molecule, Palette, SealCheck, Shapes4 } from "@gravity-ui/icons"

export const sections = [
  {
    key: "currencies",
    label: "Currencies",
    description: "Manage system currencies and display symbols.",
    implemented: true,
    icon: (
      <CircleDollar width="18" height="18" />
    ),
  },
  {
    key: "locations",
    label: "Locations",
    description: "Stores, warehouses, and online channel locations.",
    implemented: true,
    icon: (
      <MapPin width="18" height="18" />
    ),
  },
  {
    key: "colors",
    label: "Colors",
    description: "Color master dictionary and identifier codes.",
    implemented: true,
    icon: (
      <Palette width="18" height="18" />
    ),
  },
  {
    key: "qualities",
    label: "Quality",
    description: "Quality grades, prefixes, and SKU formula mappings.",
    implemented: true,
    icon: (
      <SealCheck width="18" height="18" />
    ),
  },
  {
    key: "designs",
    label: "Design",
    description: "Design patterns, names, and design codes.",
    implemented: true,
    icon: (
      <Shapes4 width="18" height="18" />
    ),
  },
  {
    key: "collections",
    label: "Collections",
    description: "Named rug lines, collections, and styling ranges.",
    implemented: true,
    icon: (
      <Layers width="18" height="18" />
    ),
  },
  {
    key: "fibers",
    label: "Fiber List",
    description: "Raw material categories and fiber types.",
    implemented: true,
    icon: (
      <Molecule width="18" height="18" />
    ),
  },
  {
    key: "constructions",
    label: "Construction",
    description: "Weaving methods and construction classifications.",
    implemented: true,
    icon: (
      <Hammer width="18" height="18" />
    ),
  },
  {
    key: "product_types",
    label: "Product Types",
    description: "Product category types such as Rug, Dhurrie, Carpet.",
    implemented: true,
    icon: (
      <Cube width="18" height="18" />
    ),
  },
  {
    key: "sizes",
    label: "Sizes",
    description: "Valid width x length dimensions and SO tags.",
    implemented: true,
    icon: (
      <ArrowsExpand width="18" height="18" />
    ),
  },
  {
    key: "lengths",
    label: "Lengths",
    description: "Discrete length reference measurements.",
    implemented: true,
    icon: (
      <ArrowsExpandHorizontal width="18" height="18" />
    ),
  },
  {
    key: "widths",
    label: "Widths",
    description: "Discrete width reference measurements.",
    implemented: true,
    icon: (
      <ArrowsExpandVertical width="18" height="18" />
    ),
  },
]

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  // Find active section based on the URL parameter
  // Format: /products/manage/currencies
  const currentKey = pathname.split("/").pop() || "currencies"

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full overflow-hidden bg-zinc-50/20">
      {/* Mobile Horizontal Navigation */}
      <div className="flex md:hidden overflow-x-auto scrollbar-none gap-2 px-4 py-2.5 border-b border-zinc-200/60 bg-white shrink-0">
        {sections.map((item) => (
          <button
            key={item.key}
            onClick={() => router.push(`/products/manage/${item.key}`)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer",
              currentKey === item.key
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                : "text-zinc-600 hover:bg-zinc-100 border border-transparent"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}

      </div>

      {/* Desktop Secondary Sidebar */}
      <div className="hidden md:flex flex-col w-64 border-r border-zinc-200/60 bg-white p-4 gap-1.5 overflow-y-auto shrink-0 animate-in fade-in slide-in-from-left-4 duration-300">
        <div className="px-3 mb-2">
          <Typography.Paragraph size="xs" weight="bold" className="text-zinc-400 uppercase tracking-widest">
            Dictionary Tables
          </Typography.Paragraph>
        </div>
        <nav className="space-y-0.5" aria-label="Dictionary navigation">
          {sections.map((item) => {
            const isActive = currentKey === item.key
            return (
              <button
                key={item.key}
                onClick={() => router.push(`/products/manage/${item.key}`)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-150 group cursor-pointer",
                  isActive
                    ? "bg-indigo-50/60 text-indigo-900 font-medium shadow-xs"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "transition-colors",
                      isActive ? "text-indigo-600" : "text-zinc-400 group-hover:text-zinc-600"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="text-sm">{item.label}</span>
                </div>
                {!item.implemented && (
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-400">
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </nav>


      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-white min-w-0 p-4 md:p-6">
        <VectorIndexingCard />
        {children}
      </div>
    </div>
  )
}
