"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Typography } from "@heroui/react"
import { cn } from "@/lib/utils"
import SignOutButton from "@/components/auth/SignOutButton"
import Logo from "@/components/shared/Logo"
import { Cubes3, Picture } from "@gravity-ui/icons"

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()

  const menuGroups = [
    {
      group: "INVENTORY",
      items: [
        {
          name: "Products",
          href: "/products",
          icon: (
            <Cubes3 width="18" height="18" aria-hidden="true" />
          ),
          active: pathname.startsWith("/products"),
        },
        {
          name: "Content",
          href: "/content",
          icon: (
            <Picture width="18" height="18" aria-hidden="true" />
          ),
          active: pathname.startsWith("/content"),
        },
      ],
    },
  ]

  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 w-[280px] bg-[#141937] text-white flex flex-col z-15 transition-opacity duration-300",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Profile Header */}
      <div className="p-6 flex flex-col gap-1.5 border-b border-indigo-950/40">
        <Logo height={26} invert priority />
        <Typography.Paragraph
          size="xs"
          weight="medium"
          className="text-indigo-200/50 uppercase tracking-wider"
        >
          Inventory System
        </Typography.Paragraph>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-4 py-6 overflow-y-auto space-y-7" aria-label="Sidebar navigation">
        {menuGroups.map((group) => (
          <div key={group.group} className="space-y-2">
            <Typography.Paragraph
              size="xs"
              weight="bold"
              className="px-3 text-indigo-200/40 tracking-wider"
            >
              {group.group}
            </Typography.Paragraph>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer",
                      item.active
                        ? "bg-indigo-500/25 text-white font-medium shadow-xs"
                        : "text-indigo-200/80 hover:bg-indigo-500/10 hover:text-white"
                    )}
                  >
                    <span className="text-indigo-300">
                      {item.icon}
                    </span>
                    <span>{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: signed-in user + sign out */}
      <SignOutButton />
    </div>
  )
}
