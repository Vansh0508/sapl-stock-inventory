"use client"

import { useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import TopNav from "./TopNav"
import Sidebar from "./Sidebar"
import ReapprovalAlertModal from "@/components/shared/ReapprovalAlertModal"

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#141937] text-white">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Stack Card Layer (Sitting behind the main card) */}
      <motion.div
        animate={{
          x: isSidebarOpen ? 295 : 0,
          scaleX: isSidebarOpen ? 0.90 : 1,
          scaleY: isSidebarOpen ? 0.86 : 1,
          opacity: isSidebarOpen ? 0.85 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 32,
          mass: 0.8,
        }}
        style={{ transformOrigin: "left center" }}
        className="absolute inset-0 h-full w-full bg-white/40 border border-white/60 shadow-lg z-11 rounded-3xl pointer-events-none"
      />

      {/* Main Screen Container (Shifts & rounds on open) */}
      <motion.div
        animate={{
          x: isSidebarOpen ? 320 : 0,
          scale: isSidebarOpen ? 0.90 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 32,
          mass: 0.8,
        }}
        style={{ transformOrigin: "left center" }}
        className={cn(
          "absolute inset-0 h-full w-full flex flex-col overflow-hidden bg-[#f4f4f5] shadow-2xl z-20",
          isSidebarOpen ? "rounded-3xl" : "rounded-none"
        )}
      >
        {/* Click Overlay (closes sidebar when main content is clicked) */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="absolute inset-0 z-40 bg-zinc-900/[0.04] backdrop-blur-[0.5px] cursor-pointer"
            aria-hidden="true"
          />
        )}

        <TopNav isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
        <main className="flex-1 flex flex-col m-[5px] bg-white border border-zinc-200/80 rounded-[20px] shadow-xs overflow-hidden">
          {children}
        </main>
      </motion.div>

      <ReapprovalAlertModal />
    </div>
  )
}
