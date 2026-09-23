import { Suspense } from "react"
import { Typography } from "@heroui/react"
import AppShell from "@/components/layout/AppShell"
import ProductsTabs from "@/components/products/ProductsTabs"

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#eef2ff] flex items-center justify-center"><Typography.Paragraph weight="medium" className="text-indigo-900">Loading Shyam Ahuja Inventory...</Typography.Paragraph></div>}>
      <AppShell>
        <div className="flex flex-col flex-1 overflow-hidden">
          <ProductsTabs />
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col relative">
            {children}
          </div>
        </div>
      </AppShell>
    </Suspense>
  )
}
