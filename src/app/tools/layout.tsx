import { Suspense } from "react"
import { Typography } from "@heroui/react"
import AppShell from "@/components/layout/AppShell"

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#eef2ff] flex items-center justify-center"><Typography.Paragraph weight="medium" className="text-indigo-900">Loading Tools...</Typography.Paragraph></div>}>
      <AppShell>
        <div className="flex flex-col flex-1 overflow-hidden relative bg-white">
          {children}
        </div>
      </AppShell>
    </Suspense>
  )
}
