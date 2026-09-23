"use client"

import { Tabs } from "@heroui/react"
import type { Key } from "react"
import { cn } from "@/lib/utils"

export type AppTabItem = {
  id: string
  label: React.ReactNode
  content: React.ReactNode
  /** Per-tab override merged onto the shared panelClassName (twMerge wins on conflicts). */
  panelClassName?: string
}

type AppTabsProps = {
  tabs: AppTabItem[]
  variant?: "primary" | "secondary"
  /** Uncontrolled: which tab is open on first render */
  defaultTab?: string
  /** Controlled: active tab key */
  selectedKey?: string
  /** Controlled: fires when the active tab changes */
  onSelectionChange?: (key: string) => void
  /** className on the root <Tabs> element (use for layout: flex, overflow, etc.) */
  className?: string
  /** className on <Tabs.ListContainer> */
  listContainerClassName?: string
  /** className on <Tabs.List> */
  listClassName?: string
  /**
   * className on every <Tabs.Tab>.
   * Safe to use for text color / font — avoid sizing props (w-*, px-*)
   * as those break HeroUI's natural indicator-width calculation.
   */
  tabClassName?: string
  /**
   * className on every <Tabs.Indicator>.
   * Use only for visual properties: bg-*, h-*.
   * Never set w-* here — HeroUI sizes the indicator to match its parent tab automatically.
   */
  indicatorClassName?: string
  /** className on every <Tabs.Panel> */
  panelClassName?: string
  "aria-label"?: string
}

export default function AppTabs({
  tabs,
  variant = "secondary",
  defaultTab,
  selectedKey,
  onSelectionChange,
  className,
  listContainerClassName,
  listClassName,
  tabClassName,
  indicatorClassName,
  panelClassName,
  "aria-label": ariaLabel = "Navigation tabs",
}: AppTabsProps) {
  const controlled = selectedKey !== undefined

  return (
    <Tabs
      variant={variant}
      className={className}
      {...(controlled
        ? {
            selectedKey,
            onSelectionChange: (key: Key) => onSelectionChange?.(key as string),
          }
        : {
            defaultSelectedKey: defaultTab ?? tabs[0]?.id,
          })}
    >
      <Tabs.ListContainer className={listContainerClassName}>
        <Tabs.List aria-label={ariaLabel} className={listClassName}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} id={tab.id} className={tabClassName}>
              {tab.label}
              <Tabs.Indicator className={indicatorClassName} />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {tabs.map((tab) => (
        <Tabs.Panel key={tab.id} id={tab.id} className={cn(panelClassName, tab.panelClassName)}>
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs>
  )
}
