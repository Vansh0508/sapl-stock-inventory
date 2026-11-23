"use client"

import { Typography } from "@heroui/react"
import { CircleExclamation } from "@gravity-ui/icons"

/** Inline form banner used to surface blocking validation (e.g. duplicates). */
export default function FormAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
    >
      <CircleExclamation className="shrink-0" aria-hidden="true" />
      <Typography.Paragraph size="xs" weight="medium" className="text-red-700">
        {message}
      </Typography.Paragraph>
    </div>
  )
}
