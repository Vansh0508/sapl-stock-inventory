"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/useMediaQuery"
import BottomSheet from "./BottomSheet"

interface ToolbarControlProps {
  /** Icon shown in the trigger button. */
  icon: React.ReactNode
  /** Text label — hidden on mobile (icon-only) but used as the sheet title. */
  label: string
  /** Optional count badge (e.g. number of active filters/sorts). */
  badge?: number
  /** Highlight the trigger when the control has an active state. */
  active?: boolean
  /** Render-prop for the panel content; receives a `close` callback. */
  children: (close: () => void) => React.ReactNode
  /** Desktop popover alignment relative to the trigger. */
  align?: "start" | "end"
  /** Extra classes for the desktop popover panel (e.g. width). */
  panelClassName?: string
}

/**
 * A single toolbar control: an icon/label trigger that opens its content in a
 * Motion-animated popover on desktop and a bottom sheet on mobile. Reused for
 * Filter, Sort, Group, Row Height and Hide Columns across Catalog and Gallery.
 */
export default function ToolbarControl({
  icon,
  label,
  badge,
  active,
  children,
  align = "start",
  panelClassName,
}: ToolbarControlProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const close = () => setOpen(false)

  // Desktop: close on outside click / Escape.
  useEffect(() => {
    if (!open || isMobile) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, isMobile])

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        "relative flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border",
        active || open
          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
          : "text-zinc-600 hover:bg-zinc-100 border-transparent"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="hidden md:inline">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold leading-none">
          {badge}
        </span>
      )}
    </button>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={close} title={label}>
          {children(close)}
        </BottomSheet>
      </>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            className={cn(
              "absolute z-[100] mt-2 rounded-xl border border-zinc-200 bg-white shadow-lg shadow-zinc-200/60 p-3",
              align === "end" ? "right-0" : "left-0",
              panelClassName ?? "w-72"
            )}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
