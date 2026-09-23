"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface SerialNumberSubNavProps {
  currentPath?: string
}

export default function SerialNumberSubNav({ currentPath }: SerialNumberSubNavProps) {
  const pathname = usePathname()
  const activePath = currentPath || pathname

  const navItems = [
    {
      label: "Inventory Pieces",
      href: "/products/serial-numbers",
      active: activePath === "/products/serial-numbers",
    },
    {
      label: "SKU & Catalog Sync",
      href: "/products/serial-numbers/sync",
      active: activePath === "/products/serial-numbers/sync",
    },
  ]

  return (
    <div className="flex items-center gap-1 border-b border-zinc-200 pb-2">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            item.active
              ? "bg-zinc-900 text-white shadow-xs"
              : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
