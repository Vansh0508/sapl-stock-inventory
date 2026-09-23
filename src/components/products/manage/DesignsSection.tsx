"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Dropdown, Modal, toast, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import SearchToggle from "@/components/shared/SearchToggle"
import FormTextField from "@/components/shared/FormTextField"
import FormAlert from "@/components/shared/FormAlert"
import ReassignDeleteModal, { type ReassignOption } from "@/components/shared/ReassignDeleteModal"

// ── Types ────────────────────────────────────────────────────────────────────

interface DesignCode {
  id: string
  design_id: string
  design_code: string
  created_at: string
  updated_at: string
}

interface Design {
  id: string
  design_name: string
  created_at: string
  updated_at: string
  codes: DesignCode[]
}

type TableRow = {
  id: string
  children: TableRow[]
  rowType: "design" | "code"
  originalDesign?: Design
  originalCode?: DesignCode
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const designSchema = z.object({
  design_name: z.string().min(1, "Design name is required").max(100),
})

const codeSchema = z.object({
  design_code: z.string().min(1, "Design code is required").max(20),
})

type DesignForm = z.infer<typeof designSchema>
type CodeForm   = z.infer<typeof codeSchema>

// ── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
  </svg>
)

const EditIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0l-.5 12a2 2 0 01-2 2H9.5a2 2 0 01-2-2L7 7" />
  </svg>
)

const MoreIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="5" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="12" cy="19" r="1.75" />
  </svg>
)

const WarnIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-red-500">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

// ── Data hook ─────────────────────────────────────────────────────────────────

function useDesigns() {
  const [designs, setDesigns]   = useState<Design[]>([])
  const [isLoading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data: dRows, error: dErr } = await (supabase
        .from("designs" as any) as any)
        .select("id, design_name, created_at, updated_at")
        .order("design_name")
      if (dErr) throw dErr

      const { data: cRows, error: cErr } = await (supabase
        .from("design_codes" as any) as any)
        .select("id, design_id, design_code, created_at, updated_at")
        .order("design_code")
      if (cErr) throw cErr

      const codesByDesign = ((cRows as any[]) ?? []).reduce<Record<string, DesignCode[]>>((acc, c: any) => {
        if (!acc[c.design_id]) acc[c.design_id] = []
        acc[c.design_id].push(c)
        return acc
      }, {})

      setDesigns(
        ((dRows as any[]) ?? []).map((d: any) => ({ ...d, codes: codesByDesign[d.id] ?? [] }))
      )
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ?? JSON.stringify(err)
      console.error("DesignsSection fetch error:", msg, err)
      toast.danger(`Failed to load designs: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  const createDesign = useCallback(async (name: string) => {
    const { error } = await (supabase.from("designs" as any) as any).insert({ design_name: name })
    if (error) throw error
    await fetch()
  }, [fetch])

  const updateDesign = useCallback(async (id: string, name: string) => {
    const { error } = await (supabase
      .from("designs" as any) as any)
      .update({ design_name: name, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const deleteDesign = useCallback(async (id: string) => {
    const { error } = await (supabase.from("designs" as any) as any).delete().eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const createCode = useCallback(async (design_id: string, code: string) => {
    const { error } = await (supabase
      .from("design_codes" as any) as any)
      .insert({ design_id, design_code: code })
    if (error) throw error
    await fetch()
  }, [fetch])

  const updateCode = useCallback(async (id: string, code: string) => {
    const { error } = await (supabase
      .from("design_codes" as any) as any)
      .update({ design_code: code, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const deleteCode = useCallback(async (id: string) => {
    const { error } = await (supabase.from("design_codes" as any) as any).delete().eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  return { designs, isLoading, createDesign, updateDesign, deleteDesign, createCode, updateCode, deleteCode }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DesignsSection() {
  const {
    designs, isLoading,
    createDesign, updateDesign, deleteDesign,
    createCode, updateCode, deleteCode,
  } = useDesigns()

  const [search, setSearch]             = useState("")

  // Design modals
  const [designModal, setDesignModal]       = useState<"add" | "edit" | null>(null)
  const [editingDesign, setEditingDesign]   = useState<Design | null>(null)
  const [isSubmitting, setSubmitting]       = useState(false)

  // Reassign-delete modals
  const [deletingDesign, setDeletingDesign] = useState<Design | null>(null)
  const [isDDelOpen, setDDelOpen]           = useState(false)
  const [deletingCode, setDeletingCode]     = useState<DesignCode | null>(null)
  const [isCDelOpen, setCDelOpen]           = useState(false)

  // Code modals
  const [codeModal, setCodeModal]       = useState<"add" | "edit" | null>(null)
  const [codeParent, setCodeParent]     = useState<Design | null>(null)
  const [editingCode, setEditingCode]   = useState<DesignCode | null>(null)

  // ── Forms ────────────────────────────────────────────────────────────────────

  const designForm = useForm<DesignForm>({ resolver: zodResolver(designSchema) })
  const codeForm   = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })

  const watchedDesignName = useWatch({ control: designForm.control, name: "design_name" })
  const watchedCode       = useWatch({ control: codeForm.control, name: "design_code" })

  const isDupDesign = useMemo(() => {
    const v = (watchedDesignName ?? "").trim().toLowerCase()
    if (!v) return false
    return designs.some(
      (d) => d.design_name.trim().toLowerCase() === v && d.id !== editingDesign?.id
    )
  }, [watchedDesignName, designs, editingDesign])

  const isDupCode = useMemo(() => {
    const vc = (watchedCode ?? "").trim().toLowerCase()
    const allCodes = designs.flatMap((d) => d.codes)
    return vc && allCodes.some((c) => c.design_code.toLowerCase() === vc && c.id !== editingCode?.id)
  }, [watchedCode, designs, editingCode])

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return designs
    const q = search.toLowerCase()
    return designs.filter(
      (item) =>
        item.design_name.toLowerCase().includes(q) ||
        item.codes.some((c) => c.design_code.toLowerCase().includes(q))
    )
  }, [designs, search])

  // ── Tree table data ───────────────────────────────────────────────────────────

  const tableData = useMemo<TableRow[]>(
    () =>
      filtered.map((d) => ({
        id: d.id,
        rowType: "design" as const,
        originalDesign: d,
        children: d.codes.map((c) => ({
          id: c.id,
          rowType: "code" as const,
          originalCode: c,
          children: [],
        })),
      })),
    [filtered]
  )

  // ── Design handlers ───────────────────────────────────────────────────────────

  const openAddDesign = () => {
    setEditingDesign(null)
    designForm.reset({ design_name: "" })
    setDesignModal("add")
  }

  const openEditDesign = (d: Design) => {
    setEditingDesign(d)
    designForm.reset({ design_name: d.design_name })
    setDesignModal("edit")
  }

  const submitDesign = designForm.handleSubmit(async (data) => {
    if (isDupDesign) return
    setSubmitting(true)
    try {
      if (editingDesign) {
        await updateDesign(editingDesign.id, data.design_name)
        toast.success("Design updated!")
      } else {
        await createDesign(data.design_name)
        toast.success("Design created!")
      }
      setDesignModal(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  })

  const confirmDeleteDesign = async () => {
    if (!deletingDesign) return
    setSubmitting(true)
    try {
      await deleteDesign(deletingDesign.id)
      toast.success("Design deleted!")
      setDDelOpen(false)
      setDeletingDesign(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Build ReassignOption list for Design deletion:
  // Options = all design_codes NOT belonging to the design being deleted
  const designDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingDesign) return []
    return designs
      .filter((d) => d.id !== deletingDesign.id)
      .flatMap((d) =>
        d.codes.map((c) => ({
          id: c.id,
          label: `${d.design_name} / ${c.design_code}`,
          metadata: { design_id: d.id, design_code: c.design_code },
        }))
      )
  }, [deletingDesign, designs])

  const getDesignAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingDesign) return 0
    const { count } = await (supabase
      .from("inventory" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("design_id", deletingDesign.id)
    return count ?? 0
  }, [deletingDesign])

  const onReassignDesign = useCallback(async (opt: ReassignOption) => {
    if (!deletingDesign || !opt.metadata) return
    const newDesignId = opt.metadata.design_id
    const newDesignCode = opt.metadata.design_code

    // 1. Fetch affected inventory rows
    const { data: invRows } = await (supabase
      .from("inventory" as any) as any)
      .select("id, quality_id, size_id")
      .eq("design_id", deletingDesign.id)

    // 2. Recompute SKU and update inventory rows directly
    if (invRows && (invRows as any[]).length > 0) {
      await Promise.all(
        (invRows as any[]).map(async (row: any) => {
          let qualityPrefix = ""
          if (row.quality_id) {
            const { data: qc } = await (supabase
              .from("quality_codes" as any) as any)
              .select("quality_prefix")
              .eq("quality_id", row.quality_id)
              .limit(1)
              .maybeSingle()
            qualityPrefix = (qc as any)?.quality_prefix || ""
          }

          let soSeq = ""
          if (row.size_id) {
            const { data: sz } = await (supabase
              .from("sizes" as any) as any)
              .select("so_seq")
              .eq("id", row.size_id)
              .maybeSingle()
            soSeq = (sz as any)?.so_seq ? String((sz as any).so_seq) : ""
          }

          const productCode = `${qualityPrefix}${newDesignCode}`
          const sku = (productCode || soSeq) ? `SA-${productCode}-${soSeq ? 'SO' + soSeq : ''}` : null

          return (supabase
            .from("inventory" as any) as any)
            .update({
              design_id: newDesignId,
              design_code: newDesignCode,
              product_code: productCode || null,
              sku: sku,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
        })
      )
    }

    // Keep legacy catalog consistent if referenced
    try {
      await (supabase
        .from("catalog" as any) as any)
        .update({ design_id: newDesignId, design_code: newDesignCode })
        .eq("design_id", deletingDesign.id)
    } catch {
      // ignore
    }
  }, [deletingDesign])

  const doDeleteDesign = useCallback(async () => {
    if (!deletingDesign) return
    await deleteDesign(deletingDesign.id)
    toast.success("Design deleted and inventory pieces reassigned!")
    setDeletingDesign(null)
  }, [deletingDesign, deleteDesign])

  // ── Code handlers ─────────────────────────────────────────────────────────────

  const openAddCode = (design: Design) => {
    setCodeParent(design)
    setEditingCode(null)
    codeForm.reset({ design_code: "" })
    setCodeModal("add")
  }

  const openEditCode = (code: DesignCode) => {
    const parent = designs.find((d) => d.id === code.design_id) ?? null
    setCodeParent(parent)
    setEditingCode(code)
    codeForm.reset({ design_code: code.design_code })
    setCodeModal("edit")
  }

  const submitCode = codeForm.handleSubmit(async (data) => {
    if (isDupCode) return
    setSubmitting(true)
    try {
      if (editingCode) {
        await updateCode(editingCode.id, data.design_code)
        toast.success("Design code updated!")
      } else if (codeParent) {
        await createCode(codeParent.id, data.design_code)
        toast.success("Design code added!")
      }
      setCodeModal(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  })

  const confirmDeleteCode = async () => {
    if (!deletingCode) return
    setSubmitting(true)
    try {
      await deleteCode(deletingCode.id)
      toast.success("Design code deleted!")
      setCDelOpen(false)
      setDeletingCode(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Build ReassignOption list for Design Code deletion:
  // Options = all design_codes across all designs EXCEPT the one being deleted
  const codeDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingCode) return []
    return designs
      .flatMap((d) =>
        d.codes
          .filter((c) => c.id !== deletingCode.id)
          .map((c) => ({
            id: c.id,
            label: `${d.design_name} / ${c.design_code}`,
            metadata: { design_id: d.id, design_code: c.design_code },
          }))
      )
  }, [deletingCode, designs])

  const getCodeAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingCode) return 0
    const { count } = await (supabase
      .from("inventory" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("design_code", deletingCode.design_code)
    return count ?? 0
  }, [deletingCode])

  const onReassignCode = useCallback(async (opt: ReassignOption) => {
    if (!deletingCode || !opt.metadata) return
    const newDesignId = opt.metadata.design_id
    const newDesignCode = opt.metadata.design_code

    const { data: invRows } = await (supabase
      .from("inventory" as any) as any)
      .select("id, quality_id, size_id")
      .eq("design_code", deletingCode.design_code)

    if (invRows && (invRows as any[]).length > 0) {
      await Promise.all(
        (invRows as any[]).map(async (row: any) => {
          let qualityPrefix = ""
          if (row.quality_id) {
            const { data: qc } = await (supabase
              .from("quality_codes" as any) as any)
              .select("quality_prefix")
              .eq("quality_id", row.quality_id)
              .limit(1)
              .maybeSingle()
            qualityPrefix = (qc as any)?.quality_prefix || ""
          }

          let soSeq = ""
          if (row.size_id) {
            const { data: sz } = await (supabase
              .from("sizes" as any) as any)
              .select("so_seq")
              .eq("id", row.size_id)
              .maybeSingle()
            soSeq = (sz as any)?.so_seq ? String((sz as any).so_seq) : ""
          }

          const productCode = `${qualityPrefix}${newDesignCode}`
          const sku = (productCode || soSeq) ? `SA-${productCode}-${soSeq ? 'SO' + soSeq : ''}` : null

          return (supabase
            .from("inventory" as any) as any)
            .update({
              design_id: newDesignId,
              design_code: newDesignCode,
              product_code: productCode || null,
              sku: sku,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
        })
      )
    }

    try {
      await (supabase
        .from("catalog" as any) as any)
        .update({ design_id: newDesignId, design_code: newDesignCode })
        .eq("design_code", deletingCode.design_code)
    } catch {
      // ignore
    }
  }, [deletingCode])

  const doDeleteCode = useCallback(async () => {
    if (!deletingCode) return
    await deleteCode(deletingCode.id)
    toast.success("Design code deleted and inventory pieces reassigned!")
    setDeletingCode(null)
  }, [deletingCode, deleteCode])

  // ── Row renderer ──────────────────────────────────────────────────────────────

  const columnHelper = useMemo(() => createColumnHelper<TableRow>(), [])

  const columns = useMemo<ColumnDef<TableRow, any>[]>(
    () => [
      columnHelper.accessor((row) => row.rowType === "design" ? row.originalDesign?.design_name : row.originalCode?.design_code, {
        id: "name",
        header: "Design / Code",
        cell: ({ row, getValue }) => {
          const isDesign = row.original.rowType === "design"
          return (
            <div style={{ paddingLeft: `${row.depth * 1.5}rem` }} className="flex items-center gap-2">
              {row.getCanExpand() ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    row.toggleExpanded()
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500 cursor-pointer"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={cn("transition-transform duration-150", row.getIsExpanded() ? "rotate-90" : "")}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ) : (
                <span className="w-5" /> // spacer for children
              )}
              {isDesign ? (
                <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-900">{getValue() as string}</Typography.Paragraph>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 text-xs font-semibold font-mono border border-violet-100">
                  {getValue() as string}
                </span>
              )}
            </div>
          )
        }
      }),
      columnHelper.display({
        id: "meta",
        header: "Codes",
        cell: ({ row }) => {
          const isDesign = row.original.rowType === "design"
          const d = row.original.originalDesign
          if (isDesign) {
            return (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                (d?.codes.length ?? 0) > 0 ? "bg-violet-100 text-violet-700" : "bg-zinc-100 text-zinc-500"
              )}>
                {d?.codes.length ?? 0} code{(d?.codes.length ?? 0) !== 1 ? "s" : ""}
              </span>
            )
          }
          return <Typography.Paragraph size="xs" className="text-zinc-400 font-mono">code</Typography.Paragraph>
        }
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        size: 44,
        cell: ({ row }) => {
          const isDesign = row.original.rowType === "design"
          const d = row.original.originalDesign
          const c = row.original.originalCode
          return (
            <div
              className="flex items-center justify-end"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Dropdown>
                <Dropdown.Trigger
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
                  aria-label={isDesign ? "Design actions" : "Design code actions"}
                >
                  <MoreIcon />
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end" className="min-w-[170px]">
                  <Dropdown.Menu aria-label="Row actions">
                    {isDesign && d && (
                      <Dropdown.Item
                        id="add-code"
                        onAction={() => openAddCode(d)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-violet-50 hover:text-violet-700 data-[focused]:bg-violet-50 data-[focused]:text-violet-700"
                      >
                        <PlusIcon />
                        Add Code
                      </Dropdown.Item>
                    )}
                    <Dropdown.Item
                      id="edit"
                      onAction={() => {
                        if (isDesign && d) openEditDesign(d)
                        else if (c) openEditCode(c)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-violet-50 hover:text-violet-700 data-[focused]:bg-violet-50 data-[focused]:text-violet-700"
                    >
                      <EditIcon />
                      Edit
                    </Dropdown.Item>
                    <Dropdown.Item
                      id="delete"
                      onAction={() => {
                        if (isDesign && d) { setDeletingDesign(d); setDDelOpen(true) }
                        else if (c) { setDeletingCode(c); setCDelOpen(true) }
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg cursor-pointer outline-hidden hover:bg-red-50 data-[focused]:bg-red-50"
                    >
                      <TrashIcon />
                      Delete
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          )
        }
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designs]
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Design</Typography.Heading>
          <Typography.Paragraph size="sm" className="text-zinc-500 mt-0.5">
            Each design can have one or more design codes used in the SKU formula.
          </Typography.Paragraph>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search designs or codes…"
            ariaLabel="Search designs"
          />
          <Button
            onPress={openAddDesign}
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-10 px-4 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Design
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={tableData}
        columns={columns}
        ariaLabel="Designs table"
        isLoading={isLoading}
        emptyMessage={search ? "No designs match your search." : "No designs yet — add one above."}
        entityName="Design"
        getSubRows={(row) => row.children}
      />

      {/* ── Add / Edit Design Modal ── */}
      <Modal isOpen={designModal !== null} onOpenChange={(open) => { if (!open) setDesignModal(null) }}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={submitDesign}>
                  <Modal.Header className="flex flex-col gap-1 text-zinc-900 border-b border-zinc-100">
                    {designModal === "edit" ? "Edit Design" : "Add New Design"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDupDesign && <FormAlert message="A design with this name already exists." />}
                    <FormTextField
                      control={designForm.control}
                      name="design_name"
                      label="Design Name *"
                      placeholder="e.g. Floral Trellis"
                      error={designForm.formState.errors.design_name?.message}
                    />
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button variant="outline" onPress={close} className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer" isDisabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium" isDisabled={isSubmitting || isDupDesign}>
                      {isSubmitting ? "Saving…" : designModal === "edit" ? "Save Changes" : "Create Design"}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Add / Edit Design Code Modal ── */}
      <Modal isOpen={codeModal !== null} onOpenChange={(open) => { if (!open) setCodeModal(null) }}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={submitCode}>
                  <Modal.Header className="flex flex-col gap-0.5 text-zinc-900 border-b border-zinc-100">
                    <span>{codeModal === "edit" ? "Edit Design Code" : "Add Design Code"}</span>
                    {codeParent && (
                      <Typography.Paragraph size="xs" weight="normal" className="text-zinc-500">
                        Design: <span className="font-medium text-violet-600">{codeParent.design_name}</span>
                      </Typography.Paragraph>
                    )}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDupCode && <FormAlert message="This design code is already in use globally." />}
                    <FormTextField
                      control={codeForm.control}
                      name="design_code"
                      label="Design Code *"
                      placeholder="e.g. D001, FT02"
                      error={codeForm.formState.errors.design_code?.message}
                    />
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button variant="outline" onPress={close} className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer" isDisabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium" isDisabled={isSubmitting || !!isDupCode}>
                      {isSubmitting ? "Saving…" : codeModal === "edit" ? "Save Changes" : "Add Code"}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Reassign & Delete Design Modal ── */}
      <ReassignDeleteModal
        isOpen={isDDelOpen}
        onClose={() => { setDDelOpen(false); setDeletingDesign(null) }}
        deletingLabel={deletingDesign?.design_name ?? ""}
        entityType="Design"
        getAffectedCount={getDesignAffectedCount}
        options={designDeleteOptions}
        onReassign={onReassignDesign}
        onDelete={doDeleteDesign}
      />

      {/* ── Reassign & Delete Design Code Modal ── */}
      <ReassignDeleteModal
        isOpen={isCDelOpen}
        onClose={() => { setCDelOpen(false); setDeletingCode(null) }}
        deletingLabel={deletingCode?.design_code ?? ""}
        entityType="Design Code"
        getAffectedCount={getCodeAffectedCount}
        options={codeDeleteOptions}
        onReassign={onReassignCode}
        onDelete={doDeleteCode}
      />
    </div>
  )
}
