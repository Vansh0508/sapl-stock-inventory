"use client"

import { useEffect, useRef, useState } from "react"
import { useMasonry, usePositioner, useResizeObserver } from "masonic"
import type { RenderComponentProps } from "masonic"

interface MasonryGridProps<Item> {
  items: Item[]
  /** The scrollable ancestor to virtualize against (e.g. a HeroUI ScrollShadow's DOM node) — not `window`, since the app shell never lets the window itself scroll. */
  scrollElement: HTMLElement | null
  itemKey: (data: Item, index: number) => string | number
  render: React.ComponentType<RenderComponentProps<Item>>
  columnWidth?: number
  columnGutter?: number
  /** Extra vertical space (px) rendered above/below the visible viewport before items unmount. */
  overscanBy?: number
}

/**
 * A masonry grid virtualized against a nested scrollable container instead of `window`
 * (which the batteries-included `<Masonry>` component from masonic assumes). Only the
 * items within `scrollElement`'s visible range (+ overscan) are ever mounted, so item
 * count no longer determines scroll cost — the fix for the lag/glitching that a fully
 * mounted, unvirtualized image wall causes at folder sizes in the thousands.
 *
 * This outer component only measures (a plain wrapper div — never touches masonic's hooks).
 * `MasonryGridInner`, which actually calls `useMasonry`, only mounts once a real width is
 * known. That matters because masonic forces exactly one internal remount of its whole grid
 * the first time `useMasonry` ever renders (a built-in "remount after hydration" trick — see
 * `didEverMount` in masonic's use-masonry.js). If that first render happened with `width === 0`
 * (unavoidable for one tick when virtualizing a nested container, since the real width only
 * arrives via an async ResizeObserver callback), the forced remount would replace a
 * zero-width layout with a correctly-sized one — which is exactly the "renders, then the
 * whole grid disappears/reflows" symptom this avoids by simply not mounting masonic until
 * the first render can already use a correct width.
 */
export function MasonryGrid<Item>({
  items,
  scrollElement,
  itemKey,
  render,
  columnWidth = 240,
  columnGutter = 16,
  overscanBy = 4,
}: MasonryGridProps<Item>) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)

  // Track items reference changes to force a fresh positioner instance on data changes
  const [resetKey, setResetKey] = useState(0)
  const prevItemsRef = useRef(items)

  if (items !== prevItemsRef.current) {
    prevItemsRef.current = items
    setResetKey((k) => k + 1)
  }

  // Track the scrollable ancestor's own viewport height
  useEffect(() => {
    if (!scrollElement) return
    const update = () => setViewportHeight(scrollElement.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(scrollElement)
    return () => ro.disconnect()
  }, [scrollElement])

  // Track this grid's own rendered width (drives how many columns fit)
  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    const update = () => setWidth(node.offsetWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  // Track scroll position of the ancestor, offset by how far this grid sits from that
  // ancestor's scroll origin (there's a breadcrumb/toolbar above it sharing the same scroller).
  useEffect(() => {
    if (!scrollElement) return
    let scrollingTimeout: ReturnType<typeof setTimeout> | undefined
    let raf = 0

    const measure = () => {
      const node = wrapperRef.current
      if (!node) return
      const offsetTop = node.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop
      setScrollTop(Math.max(0, scrollElement.scrollTop - offsetTop))
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
      setIsScrolling(true)
      clearTimeout(scrollingTimeout)
      scrollingTimeout = setTimeout(() => setIsScrolling(false), 150)
    }

    measure()
    scrollElement.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
      clearTimeout(scrollingTimeout)
    }
  }, [scrollElement])

  return (
    <div ref={wrapperRef} className="w-full">
      {width > 0 && (
        <MasonryGridInner
          key={resetKey}
          items={items}
          width={width}
          height={viewportHeight || 600}
          scrollTop={scrollTop}
          isScrolling={isScrolling}
          itemKey={itemKey}
          render={render}
          columnWidth={columnWidth}
          columnGutter={columnGutter}
          overscanBy={overscanBy}
        />
      )}
    </div>
  )
}

interface MasonryGridInnerProps<Item> {
  items: Item[]
  width: number
  height: number
  scrollTop: number
  isScrolling: boolean
  itemKey: (data: Item, index: number) => string | number
  render: React.ComponentType<RenderComponentProps<Item>>
  columnWidth: number
  columnGutter: number
  overscanBy: number
}

function MasonryGridInner<Item>({
  items,
  width,
  height,
  scrollTop,
  isScrolling,
  itemKey,
  render,
  columnWidth: targetColumnWidth,
  columnGutter,
  overscanBy,
}: MasonryGridInnerProps<Item>) {
  // Calculate dynamic column count and exact column width so columns stretch 100% flush from left to right edge
  const columnCount = Math.max(1, Math.floor((width + columnGutter) / (targetColumnWidth + columnGutter)))
  const effectiveColumnWidth = Math.floor((width - (columnCount - 1) * columnGutter) / columnCount)

  const positioner = usePositioner(
    { width, columnWidth: effectiveColumnWidth, columnGutter, columnCount }
  )
  const resizeObserver = useResizeObserver(positioner)

  return (
    <div className="w-full text-left" dir="ltr">
      {useMasonry<Item>({
        positioner,
        resizeObserver,
        items,
        height,
        scrollTop,
        isScrolling,
        overscanBy,
        itemKey,
        render,
      })}
    </div>
  )
}
