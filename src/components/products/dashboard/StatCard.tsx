"use client"

import { Card, Chip, Typography } from "@heroui/react"
import type { Trend } from "@/hooks/useDashboardStats"

export interface StatCardProps {
  label: string
  value: string
  trend?: Trend | null
}

const ArrowUp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
  </svg>
)
const ArrowDown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />
  </svg>
)

export default function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <Card className="rounded-2xl border border-zinc-200/70 shadow-xs">
      <Card.Content className="p-5">
        <Typography.Heading level={3} color="muted" weight="medium" className="text-xs tracking-normal">
          {label}
        </Typography.Heading>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Typography.Heading level={3} weight="bold" className="tabular-nums">
            {value}
          </Typography.Heading>
          {trend && (
            <Chip color={trend.direction === "up" ? "success" : "danger"} variant="soft" size="sm">
              <Chip.Label className="inline-flex items-center gap-1">
                {trend.direction === "up" ? <ArrowUp /> : <ArrowDown />}
                {trend.value.toFixed(1)}%
              </Chip.Label>
            </Chip>
          )}
        </div>
      </Card.Content>
    </Card>
  )
}
