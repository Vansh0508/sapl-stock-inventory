"use client"

import { useEffect, useRef } from "react"
import { SearchField } from "@heroui/react"
import { cn } from "@/lib/utils"

interface SearchBarProps {
  /** Current search value (controlled). */
  value: string
  /** Called with the new value on change / clear. */
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible label for the field. */
  ariaLabel?: string
  /** Wrapper class — use for width (e.g. "flex-1 sm:w-64"). */
  className?: string
  /** Focus the input on mount (used when opened via toolbar / Ctrl+F). */
  autoFocus?: boolean
  /** Called when Escape is pressed in the field (e.g. to close the bar). */
  onEscape?: () => void
  /** Class name for the inner SearchField.Group container. */
  groupClassName?: string
  /** Disable the global Ctrl+F shortcut. */
  disableShortcut?: boolean
}

/**
 * Reusable search input built on HeroUI's SearchField. Pressing Ctrl+F
 * (or Cmd+F on macOS) focuses the field from anywhere. The native clear button
 * comes from HeroUI; Escape is forwarded via `onEscape` when provided.
 */
export default function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  ariaLabel,
  className,
  autoFocus = false,
  onEscape,
  groupClassName,
  disableShortcut = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (disableShortcut) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [disableShortcut])

  // Autofocus when the bar is opened.
  useEffect(() => {
    if (autoFocus) {
      // rAF ensures the element is laid out (esp. after an enter animation).
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [autoFocus])

  return (
    <SearchField
      value={value}
      onChange={onChange}
      aria-label={ariaLabel ?? placeholder}
      className={cn("w-full", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") onEscape?.()
      }}
    >
      <SearchField.Group
        className={cn(
          "w-full bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 h-10 flex items-center gap-2 transition-all focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500",
          groupClassName
        )}
      >
        <SearchField.SearchIcon className="text-zinc-400 shrink-0" />
        <SearchField.Input
          ref={inputRef}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-hidden border-0"
        />
        <SearchField.ClearButton className="text-zinc-400 hover:text-zinc-600 cursor-pointer" />
      </SearchField.Group>
    </SearchField>
  )
}
