"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { Typography } from "@heroui/react"
import { Xmark } from "@gravity-ui/icons"

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

/**
 * Mobile bottom sheet. Slides up from the bottom with a dimmed backdrop.
 * Closes on backdrop tap or Escape. Rendered in a portal so it escapes any
 * overflow/transform ancestors. Motion drives the open/close animation.
 */
export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(timer)
  }, [])

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-zinc-900/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Sheet */}
          <motion.div
            className="relative bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {/* Grab handle */}
            <div className="flex justify-center pt-3 pb-1">
              <span className="h-1.5 w-10 rounded-full bg-zinc-300" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3 pt-1 border-b border-zinc-100">
              <Typography.Heading level={6} className="text-zinc-900">{title}</Typography.Heading>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <Xmark width="20" height="20" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
