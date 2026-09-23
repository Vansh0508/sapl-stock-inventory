"use client"

import { usePathname, useRouter } from "next/navigation"
import { Typography } from "@heroui/react"
import { cn } from "@/lib/utils"
import VectorIndexingCard from "@/components/products/manage/VectorIndexingCard"

export const sections = [
  {
    key: "currencies",
    label: "Currencies",
    description: "Manage system currencies and display symbols.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "locations",
    label: "Locations",
    description: "Stores, warehouses, and online channel locations.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "colors",
    label: "Colors",
    description: "Color master dictionary and identifier codes.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  },
  {
    key: "qualities",
    label: "Quality",
    description: "Quality grades, prefixes, and SKU formula mappings.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  {
    key: "designs",
    label: "Design",
    description: "Design patterns, names, and design codes.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    key: "collections",
    label: "Collections",
    description: "Named rug lines, collections, and styling ranges.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    key: "fibers",
    label: "Fiber List",
    description: "Raw material categories and fiber types.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l-.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
      </svg>
    ),
  },
  {
    key: "constructions",
    label: "Construction",
    description: "Weaving methods and construction classifications.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    key: "product_types",
    label: "Product Types",
    description: "Product category types such as Rug, Dhurrie, Carpet.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    key: "sizes",
    label: "Sizes",
    description: "Valid width x length dimensions and SO tags.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
      </svg>
    ),
  },
  {
    key: "lengths",
    label: "Lengths",
    description: "Discrete length reference measurements.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    key: "widths",
    label: "Widths",
    description: "Discrete width reference measurements.",
    implemented: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v12m0 0l-4-4m4 4l4-4m6 0V4m0 0l4 4m-4-4l-4 4" />
      </svg>
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
