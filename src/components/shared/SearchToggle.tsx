"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import SearchBar from "@/components/shared/SearchBar"
import { cn } from "@/lib/utils"

const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="11" cy="11" r="8" />
    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
  </svg>
)

interface SearchToggleProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  /** Width in pixels when the search field is open. Defaults to 256. */
  expandedWidth?: number
}

/**
 * Animated search toggle: shows a compact icon button that expands into a
 * full SearchBar on click. Collapses back when Escape is pressed or the user
 * clicks outside while the field is empty. Mirrors the search pattern used
 * in the main Toolbar.
 */
export default function SearchToggle({
  value,
  onChange,
  placeholder = "Search...",
  ariaLabel = "Search",
  expandedWidth = 256,
}: SearchToggleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (!value) setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [value])

  const handleClose = () => {
    onChange("")
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative flex items-center h-9">
      <AnimatePresence mode="wait" initial={false}>
        {!isOpen ? (
          <motion.button
            key="search-btn"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={ariaLabel}
            aria-pressed={false}
            className={cn(
              "flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
              "text-zinc-600 hover:bg-zinc-100 border-transparent whitespace-nowrap"
            )}
          >
            <SearchIcon />
            <span>Search</span>
          </motion.button>
        ) : (
          <motion.div
            key="search-field"
            initial={{ width: 40, opacity: 0 }}
            animate={{ width: expandedWidth, opacity: 1 }}
            exit={{ width: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden flex items-center"
          >
            <SearchBar
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              ariaLabel={ariaLabel}
              groupClassName="h-9 rounded-lg bg-zinc-50 border-zinc-200/80 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500"
              className="w-full"
              autoFocus
              onEscape={handleClose}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
