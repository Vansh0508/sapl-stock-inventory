"use client"

import { Card } from "@heroui/react"
import { cn } from "@/lib/utils"

export interface ChartCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export default function ChartCard({ title, description, children, className, action }: ChartCardProps) {
  return (
    <Card className={cn("rounded-2xl border border-zinc-200/70 shadow-xs", className)}>
      <Card.Header className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <Card.Title className="text-sm font-semibold text-zinc-900">{title}</Card.Title>
          {description && <Card.Description className="text-xs text-zinc-500">{description}</Card.Description>}
        </div>
        {action}
      </Card.Header>
      <Card.Content className="pt-0">{children}</Card.Content>
    </Card>
  )
}
