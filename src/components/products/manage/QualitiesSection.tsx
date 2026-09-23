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

interface QualityCode {
  id: string
  quality_id: string
  quality_code: string
  quality_prefix: string
  created_at: string
  updated_at: string
}

interface Quality {
  id: string
  quality_name: string
  created_at: string
  updated_at: string
  codes: QualityCode[]
}

type TableRow = {
  id: string
  children: TableRow[]
  rowType: "quality" | "code"
  originalQuality?: Quality
  originalCode?: QualityCode
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const qualitySchema = z.object({
  quality_name: z.string().min(1, "Quality name is required").max(100),
})

const codeSchema = z.object({
  quality_code:   z.string().min(1, "Quality code is required").max(20),
  quality_prefix: z.string().min(1, "Quality prefix is required").max(10),
})

type QualityForm = z.infer<typeof qualitySchema>
type CodeForm    = z.infer<typeof codeSchema>

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

function useQualities() {
  const [qualities, setQualities] = useState<Quality[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: qRows, error: qErr } = await (supabase
        .from("qualities" as any) as any)
        .select("id, quality_name, created_at, updated_at")
        .order("quality_name")
      if (qErr) throw qErr

      const { data: cRows, error: cErr } = await (supabase
        .from("quality_codes" as any) as any)
        .select("id, quality_id, quality_code, quality_prefix, created_at, updated_at")
        .order("quality_code")
      if (cErr) throw cErr

      const codesByQuality = ((cRows as any[]) ?? []).reduce<Record<string, QualityCode[]>>((acc, c: any) => {
        if (!acc[c.quality_id]) acc[c.quality_id] = []
        acc[c.quality_id].push(c)
        return acc
      }, {})

      setQualities(
        ((qRows as any[]) ?? []).map((q: any) => ({ ...q, codes: codesByQuality[q.id] ?? [] }))
      )
    } catch (err) {
      console.error(err)
      toast.danger("Failed to load qualities")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  const createQuality = useCallback(async (name: string) => {
    const { error } = await (supabase.from("qualities" as any) as any).insert({ quality_name: name })
    if (error) throw error
    await fetch()
  }, [fetch])

  const updateQuality = useCallback(async (id: string, name: string) => {
    const { error } = await (supabase.from("qualities" as any) as any).update({ quality_name: name, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const deleteQuality = useCallback(async (id: string) => {
    const { error } = await (supabase.from("qualities" as any) as any).delete().eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const createCode = useCallback(async (quality_id: string, code: string, prefix: string) => {
    const { error } = await (supabase.from("quality_codes" as any) as any).insert({ quality_id, quality_code: code, quality_prefix: prefix })
    if (error) throw error
    await fetch()
  }, [fetch])

  const updateCode = useCallback(async (id: string, code: string, prefix: string) => {
    const { error } = await (supabase.from("quality_codes" as any) as any).update({ quality_code: code, quality_prefix: prefix, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  const deleteCode = useCallback(async (id: string) => {
    const { error } = await (supabase.from("quality_codes" as any) as any).delete().eq("id", id)
    if (error) throw error
    await fetch()
  }, [fetch])

  return { qualities, isLoading, createQuality, updateQuality, deleteQuality, createCode, updateCode, deleteCode }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QualitiesSection() {
  const {
    qualities, isLoading,
    createQuality, updateQuality, deleteQuality,
    createCode, updateCode, deleteCode,
  } = useQualities()

  const [search, setSearch]             = useState("")

  // Quality modals
  const [qualityModal, setQualityModal]       = useState<"add" | "edit" | null>(null)
  const [editingQuality, setEditingQuality]   = useState<Quality | null>(null)
  const [deletingQuality, setDeletingQuality] = useState<Quality | null>(null)
  const [isQDelOpen, setQDelOpen]             = useState(false)
  const [isSubmitting, setSubmitting]         = useState(false)

  // Code modals
  const [codeModal, setCodeModal]       = useState<"add" | "edit" | null>(null)
  const [codeParent, setCodeParent]     = useState<Quality | null>(null)
  const [editingCode, setEditingCode]   = useState<QualityCode | null>(null)
  const [deletingCode, setDeletingCode] = useState<QualityCode | null>(null)
  const [isCDelOpen, setCDelOpen]       = useState(false)

  // ── Forms ────────────────────────────────────────────────────────────────────

  const qualityForm = useForm<QualityForm>({ resolver: zodResolver(qualitySchema) })
  const codeForm    = useForm<CodeForm>({ resolver: zodResolver(codeSchema) })

  const watchedQualityName = useWatch({ control: qualityForm.control, name: "quality_name" })
  const watchedCode        = useWatch({ control: codeForm.control, name: "quality_code" })
  const watchedPrefix      = useWatch({ control: codeForm.control, name: "quality_prefix" })

  const isDupQuality = useMemo(() => {
    const v = (watchedQualityName ?? "").trim().toLowerCase()
    if (!v) return false
    return qualities.some(
      (q) => q.quality_name.trim().toLowerCase() === v && q.id !== editingQuality?.id
    )
  }, [watchedQualityName, qualities, editingQuality])

  const isDupCode = useMemo(() => {
    const vc = (watchedCode ?? "").trim().toLowerCase()
    const vp = (watchedPrefix ?? "").trim().toLowerCase()
    const allCodes = qualities.flatMap((q) => q.codes)
    const dupCode   = vc && allCodes.some((c) => c.quality_code.toLowerCase() === vc && c.id !== editingCode?.id)
    const dupPrefix = vp && allCodes.some((c) => c.quality_prefix.toLowerCase() === vp && c.id !== editingCode?.id)
    return { code: !!dupCode, prefix: !!dupPrefix, any: !!(dupCode || dupPrefix) }
  }, [watchedCode, watchedPrefix, qualities, editingCode])

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return qualities
    const q = search.toLowerCase()
    return qualities.filter(
      (item) =>
        item.quality_name.toLowerCase().includes(q) ||
        item.codes.some(
          (c) =>
            c.quality_code.toLowerCase().includes(q) ||
            c.quality_prefix.toLowerCase().includes(q)
        )
    )
  }, [qualities, search])

  // ── Tree table data ───────────────────────────────────────────────────────────

  const tableData = useMemo<TableRow[]>(
    () =>
      filtered.map((q) => ({
        id: q.id,
        rowType: "quality" as const,
        originalQuality: q,
        children: q.codes.map((c) => ({
          id: c.id,
          rowType: "code" as const,
          originalCode: c,
          children: [],
        })),
      })),
    [filtered]
  )

  // ── Quality handlers ──────────────────────────────────────────────────────────

  const openAddQuality = () => {
    setEditingQuality(null)
    qualityForm.reset({ quality_name: "" })
    setQualityModal("add")
  }

  const openEditQuality = (q: Quality) => {
    setEditingQuality(q)
    qualityForm.reset({ quality_name: q.quality_name })
    setQualityModal("edit")
  }

  const submitQuality = qualityForm.handleSubmit(async (data) => {
    if (isDupQuality) return
    setSubmitting(true)
    try {
      if (editingQuality) {
        await updateQuality(editingQuality.id, data.quality_name)
        toast.success("Quality updated!")
      } else {
        await createQuality(data.quality_name)
        toast.success("Quality created!")
      }
      setQualityModal(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  })

  const confirmDeleteQuality = async () => {
    if (!deletingQuality) return
    setSubmitting(true)
    try {
      await deleteQuality(deletingQuality.id)
      toast.success("Quality deleted!")
      setQDelOpen(false)
      setDeletingQuality(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Reassign options for Quality deletion:
  // Options = all quality_codes NOT belonging to the quality being deleted
  const qualityDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingQuality) return []
    return qualities
      .filter((q) => q.id !== deletingQuality.id)
      .flatMap((q) =>
        q.codes.map((c) => ({
          id: c.id,
          label: `${q.quality_name} / ${c.quality_code}`,
          metadata: { quality_id: q.id, quality_code: c.quality_code },
        }))
      )
  }, [deletingQuality, qualities])

  const getQualityAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingQuality) return 0
    const { count } = await (supabase
      .from("inventory" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("quality_id", deletingQuality.id)
    return count ?? 0
  }, [deletingQuality])

  const onReassignQuality = useCallback(async (opt: ReassignOption) => {
    if (!deletingQuality || !opt.metadata) return
    const newQualityId = opt.metadata.quality_id
    const newQualityCode = opt.metadata.quality_code

    // 1. Fetch new quality prefix
    let newQualityPrefix = ""
    const { data: qc } = await (supabase
      .from("quality_codes" as any) as any)
      .select("quality_prefix")
      .eq("quality_id", newQualityId)
      .eq("quality_code", newQualityCode)
      .limit(1)
      .maybeSingle()
    newQualityPrefix = (qc as any)?.quality_prefix || ""

    // 2. Fetch affected inventory rows
    const { data: invRows } = await (supabase
      .from("inventory" as any) as any)
      .select("id, design_code, size_id")
      .eq("quality_id", deletingQuality.id)

    // 3. Recompute SKU and update inventory rows directly
    if (invRows && (invRows as any[]).length > 0) {
      await Promise.all(
        (invRows as any[]).map(async (row: any) => {
          let soSeq = ""
          if (row.size_id) {
            const { data: sz } = await (supabase
              .from("sizes" as any) as any)
              .select("so_seq")
              .eq("id", row.size_id)
              .maybeSingle()
            soSeq = (sz as any)?.so_seq ? String((sz as any).so_seq) : ""
          }

          const productCode = `${newQualityPrefix}${row.design_code || ""}`
          const sku = (productCode || soSeq) ? `SA-${productCode}-${soSeq ? 'SO' + soSeq : ''}` : null

          return (supabase
            .from("inventory" as any) as any)
            .update({
              quality_id: newQualityId,
              quality_code: newQualityCode,
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
        .update({ quality_id: newQualityId, quality_code: newQualityCode })
        .eq("quality_id", deletingQuality.id)
    } catch {
      // ignore
    }
  }, [deletingQuality])

  const doDeleteQuality = useCallback(async () => {
    if (!deletingQuality) return
    await deleteQuality(deletingQuality.id)
    toast.success("Quality deleted and inventory pieces reassigned!")
    setDeletingQuality(null)
  }, [deletingQuality, deleteQuality])

  // ── Code handlers ─────────────────────────────────────────────────────────────

  const openAddCode = (quality: Quality) => {
    setCodeParent(quality)
    setEditingCode(null)
    codeForm.reset({ quality_code: "", quality_prefix: "" })
    setCodeModal("add")
  }

  const openEditCode = (code: QualityCode) => {
    const parent = qualities.find((q) => q.id === code.quality_id) ?? null
    setCodeParent(parent)
    setEditingCode(code)
    codeForm.reset({ quality_code: code.quality_code, quality_prefix: code.quality_prefix })
    setCodeModal("edit")
  }

  const submitCode = codeForm.handleSubmit(async (data) => {
    if (isDupCode.any) return
    setSubmitting(true)
    try {
      if (editingCode) {
        await updateCode(editingCode.id, data.quality_code, data.quality_prefix)
        toast.success("Quality code updated!")
      } else if (codeParent) {
        await createCode(codeParent.id, data.quality_code, data.quality_prefix)
        toast.success("Quality code added!")
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
      toast.success("Quality code deleted!")
      setCDelOpen(false)
      setDeletingCode(null)
    } catch (err) {
      toast.danger(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Reassign options for Quality Code deletion:
  // Options = all quality_codes across all qualities EXCEPT the one being deleted
  const codeDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingCode) return []
    return qualities
      .flatMap((q) =>
        q.codes
          .filter((c) => c.id !== deletingCode.id)
          .map((c) => ({
            id: c.id,
            label: `${q.quality_name} / ${c.quality_code}`,
            metadata: { quality_id: q.id, quality_code: c.quality_code },
          }))
      )
  }, [deletingCode, qualities])

  const getCodeAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingCode) return 0
    const { count } = await (supabase
      .from("inventory" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("quality_code", deletingCode.quality_code)
    return count ?? 0
  }, [deletingCode])

  const onReassignCode = useCallback(async (opt: ReassignOption) => {
    if (!deletingCode || !opt.metadata) return
    const newQualityId = opt.metadata.quality_id
    const newQualityCode = opt.metadata.quality_code

    let newQualityPrefix = ""
    const { data: qc } = await (supabase
      .from("quality_codes" as any) as any)
      .select("quality_prefix")
      .eq("quality_id", newQualityId)
      .eq("quality_code", newQualityCode)
      .limit(1)
      .maybeSingle()
    newQualityPrefix = (qc as any)?.quality_prefix || ""

    const { data: invRows } = await (supabase
      .from("inventory" as any) as any)
      .select("id, design_code, size_id")
      .eq("quality_code", deletingCode.quality_code)

    if (invRows && (invRows as any[]).length > 0) {
      await Promise.all(
        (invRows as any[]).map(async (row: any) => {
          let soSeq = ""
          if (row.size_id) {
            const { data: sz } = await (supabase
              .from("sizes" as any) as any)
              .select("so_seq")
              .eq("id", row.size_id)
              .maybeSingle()
            soSeq = (sz as any)?.so_seq ? String((sz as any).so_seq) : ""
          }

          const productCode = `${newQualityPrefix}${row.design_code || ""}`
          const sku = (productCode || soSeq) ? `SA-${productCode}-${soSeq ? 'SO' + soSeq : ''}` : null

          return (supabase
            .from("inventory" as any) as any)
            .update({
              quality_id: newQualityId,
              quality_code: newQualityCode,
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
        .update({ quality_id: newQualityId, quality_code: newQualityCode })
        .eq("quality_code", deletingCode.quality_code)
    } catch {
      // ignore
    }
  }, [deletingCode])

  const doDeleteCode = useCallback(async () => {
    if (!deletingCode) return
    await deleteCode(deletingCode.id)
    toast.success("Quality code deleted and inventory pieces reassigned!")
    setDeletingCode(null)
  }, [deletingCode, deleteCode])

  // ── Row renderer ──────────────────────────────────────────────────────────────

  const columnHelper = useMemo(() => createColumnHelper<TableRow>(), [])

  const columns = useMemo<ColumnDef<TableRow, any>[]>(
    () => [
      columnHelper.accessor((row) => row.rowType === "quality" ? row.originalQuality?.quality_name : row.originalCode?.quality_code, {
        id: "name",
        header: "Quality / Code",
        cell: ({ row, getValue }) => {
          const isQuality = row.original.rowType === "quality"
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
              {isQuality ? (
                <Typography.Paragraph size="sm" weight="semibold" className="text-zinc-900">{getValue() as string}</Typography.Paragraph>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-semibold font-mono border border-indigo-100">
                  {getValue() as string}
                </span>
              )}
            </div>
          )
        }
      }),
      columnHelper.accessor((row) => row.rowType === "quality" ? "" : row.originalCode?.quality_prefix, {
        id: "prefix",
        header: "Prefix",
        cell: ({ row, getValue }) => {
          const isQuality = row.original.rowType === "quality"
          const q = row.original.originalQuality
          if (isQuality) {
            return (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                (q?.codes.length ?? 0) > 0 ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-500"
              )}>
                {q?.codes.length ?? 0} code{(q?.codes.length ?? 0) !== 1 ? "s" : ""}
              </span>
            )
          }
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-xs font-mono">
              {getValue() as string}
            </span>
          )
        }
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        size: 44,
        cell: ({ row }) => {
          const isQuality = row.original.rowType === "quality"
          const q = row.original.originalQuality
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
                  aria-label={isQuality ? "Quality actions" : "Quality code actions"}
                >
                  <MoreIcon />
                </Dropdown.Trigger>
                <Dropdown.Popover placement="bottom end" className="min-w-[170px]">
                  <Dropdown.Menu aria-label="Row actions">
                    {isQuality && q && (
                      <Dropdown.Item
                        id="add-code"
                        onAction={() => openAddCode(q)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-indigo-50 hover:text-indigo-700 data-[focused]:bg-indigo-50 data-[focused]:text-indigo-700"
                      >
                        <PlusIcon />
                        Add Code
                      </Dropdown.Item>
                    )}
                    <Dropdown.Item
                      id="edit"
                      onAction={() => {
                        if (isQuality && q) openEditQuality(q)
                        else if (c) openEditCode(c)
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 rounded-lg cursor-pointer outline-hidden hover:bg-indigo-50 hover:text-indigo-700 data-[focused]:bg-indigo-50 data-[focused]:text-indigo-700"
                    >
                      <EditIcon />
                      Edit
                    </Dropdown.Item>
                    <Dropdown.Item
                      id="delete"
                      onAction={() => {
                        if (isQuality && q) { setDeletingQuality(q); setQDelOpen(true) }
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
    [qualities]
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Quality</Typography.Heading>
          <Typography.Paragraph size="sm" className="text-zinc-500 mt-0.5">
            Each quality can have one or more quality codes and prefixes.
          </Typography.Paragraph>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search qualities or codes…"
            ariaLabel="Search qualities"
          />
          <Button
            onPress={openAddQuality}
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-10 px-4 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Quality
          </Button>
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={tableData}
        columns={columns}
        ariaLabel="Qualities table"
        isLoading={isLoading}
        emptyMessage={search ? "No qualities match your search." : "No qualities yet — add one above."}
        entityName="Quality"
        getSubRows={(row) => row.children}
      />

      {/* ── Add / Edit Quality Modal ── */}
      <Modal isOpen={qualityModal !== null} onOpenChange={(open) => { if (!open) setQualityModal(null) }}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={submitQuality}>
                  <Modal.Header className="flex flex-col gap-1 text-zinc-900 border-b border-zinc-100">
                    {qualityModal === "edit" ? "Edit Quality" : "Add New Quality"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDupQuality && <FormAlert message="A quality with this name already exists." />}
                    <FormTextField
                      control={qualityForm.control}
                      name="quality_name"
                      label="Quality Name *"
                      placeholder="e.g. Hand Knotted 100"
                      error={qualityForm.formState.errors.quality_name?.message}
                    />
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button variant="outline" onPress={close} className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer" isDisabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium" isDisabled={isSubmitting || isDupQuality}>
                      {isSubmitting ? "Saving…" : qualityModal === "edit" ? "Save Changes" : "Create Quality"}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Add / Edit Quality Code Modal ── */}
      <Modal isOpen={codeModal !== null} onOpenChange={(open) => { if (!open) setCodeModal(null) }}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={submitCode}>
                  <Modal.Header className="flex flex-col gap-0.5 text-zinc-900 border-b border-zinc-100">
                    <span>{codeModal === "edit" ? "Edit Quality Code" : "Add Quality Code"}</span>
                    {codeParent && (
                      <Typography.Paragraph size="xs" weight="normal" className="text-zinc-500">
                        Quality: <span className="font-medium text-indigo-600">{codeParent.quality_name}</span>
                      </Typography.Paragraph>
                    )}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDupCode.code && <FormAlert message="This quality code is already in use globally." />}
                    {!isDupCode.code && isDupCode.prefix && <FormAlert message="This quality prefix is already in use globally." />}
                    <FormTextField
                      control={codeForm.control}
                      name="quality_code"
                      label="Quality Code *"
                      placeholder="e.g. HK100, Q200"
                      error={codeForm.formState.errors.quality_code?.message}
                    />
                    <FormTextField
                      control={codeForm.control}
                      name="quality_prefix"
                      label="Quality Prefix *"
                      placeholder="e.g. SA, SB"
                      error={codeForm.formState.errors.quality_prefix?.message}
                    />
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button variant="outline" onPress={close} className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer" isDisabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium" isDisabled={isSubmitting || isDupCode.any}>
                      {isSubmitting ? "Saving…" : codeModal === "edit" ? "Save Changes" : "Add Code"}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Reassign & Delete Quality Modal ── */}
      <ReassignDeleteModal
        isOpen={isQDelOpen}
        onClose={() => { setQDelOpen(false); setDeletingQuality(null) }}
        deletingLabel={deletingQuality?.quality_name ?? ""}
        entityType="Quality"
        getAffectedCount={getQualityAffectedCount}
        options={qualityDeleteOptions}
        onReassign={onReassignQuality}
        onDelete={doDeleteQuality}
      />

      {/* ── Reassign & Delete Quality Code Modal ── */}
      <ReassignDeleteModal
        isOpen={isCDelOpen}
        onClose={() => { setCDelOpen(false); setDeletingCode(null) }}
        deletingLabel={deletingCode?.quality_code ?? ""}
        entityType="Quality Code"
        getAffectedCount={getCodeAffectedCount}
        options={codeDeleteOptions}
        onReassign={onReassignCode}
        onDelete={doDeleteCode}
      />
    </div>
  )
}
