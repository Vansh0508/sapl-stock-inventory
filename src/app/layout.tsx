import type { Metadata } from "next"
import "../styles/globals.css"
import { Toast } from "@heroui/react"

export const metadata: Metadata = {
  title: "Shyam Ahuja Inventory",
  description: "Inventory management for Shyam Ahuja luxury rugs and carpets",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-background text-foreground antialiased">
        <Toast.Provider />
        <div className="min-h-full flex flex-col">{children}</div>
      </body>
    </html>
  )
}

