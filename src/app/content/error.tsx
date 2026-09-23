"use client"

import { useEffect } from "react"
import { Button } from "@heroui/react"

export default function ContentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Content library crashed:", error)
  }, [error])

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-zinc-50/30 p-6 text-center">
      <div>
        <h2 className="text-sm font-bold text-zinc-900">Something went wrong loading this view</h2>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm">
          The asset library hit an unexpected error. Your data is safe — retry to reload this view.
        </p>
      </div>
      <Button
        onPress={() => reset()}
        className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs px-4 h-9 cursor-pointer font-semibold shadow-xs"
      >
        Retry
      </Button>
    </div>
  )
}
