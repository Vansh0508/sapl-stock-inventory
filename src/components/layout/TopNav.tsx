"use client"

import { usePathname, useRouter } from "next/navigation"
import { Breadcrumbs } from "@heroui/react"
import { Bars } from "@gravity-ui/icons"

interface TopNavProps {
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

const MANAGE_TABLE_LABELS: Record<string, string> = {
  currencies: "Currencies",
  locations: "Locations",
  colors: "Colors",
  sizes: "Sizes",
  qualities: "Qualities",
  designs: "Designs",
  collections: "Collections",
  fibers: "Fiber List",
  constructions: "Construction",
  product_types: "Product Types",
  lengths: "Lengths",
  widths: "Widths",
}

interface Crumb {
  label: string
  href?: string
}

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname.startsWith("/products/dashboard")) {
    return [{ label: "Products", href: "/products" }, { label: "Dashboard" }]
  }
  if (pathname.startsWith("/products/gallery")) {
    return [{ label: "Products", href: "/products" }, { label: "Gallery" }]
  }
  if (pathname.startsWith("/products/manage")) {
    const segments = pathname.split("/").filter(Boolean)
    const crumbs: Crumb[] = [
      { label: "Products", href: "/products" },
      { label: "Manage", href: "/products/manage" },
    ]
    const table = segments[2]
    if (table) {
      crumbs.push({ label: MANAGE_TABLE_LABELS[table] ?? table })
    }
    return crumbs
  }
  if (pathname.startsWith("/products/bulk-edit")) {
    return [
      { label: "Products", href: "/products" },
      { label: "Catalog", href: "/products/catalog" },
      { label: "Bulk Edit" },
    ]
  }
  if (pathname.startsWith("/products/catalog")) {
    return [{ label: "Products", href: "/products" }, { label: "Catalog" }]
  }
  if (pathname.startsWith("/products")) {
    return [{ label: "Products" }]
  }
  if (pathname.startsWith("/content")) {
    return [{ label: "Content" }]
  }
  return [{ label: "Products" }]
}

export default function TopNav({ isSidebarOpen, onToggleSidebar }: TopNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const crumbs = buildCrumbs(pathname)

  return (
    <header className="sticky top-0 z-30 h-14 bg-[#f4f4f5] flex items-center">
      <div className="w-full flex items-center gap-3 px-4 md:px-6">
        {/* Hamburger Menu Trigger */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
          aria-expanded={isSidebarOpen}
        >
          <Bars width="20" height="20" aria-hidden="true" />
        </button>

        {/* Breadcrumbs */}
        <Breadcrumbs>
          {crumbs.map((crumb) => (
            <Breadcrumbs.Item
              key={crumb.label}
              {...(crumb.href ? { onPress: () => router.push(crumb.href!) } : {})}
            >
              {crumb.label}
            </Breadcrumbs.Item>
          ))}
        </Breadcrumbs>
      </div>
    </header>
  )
}
