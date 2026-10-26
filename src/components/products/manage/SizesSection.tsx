"use client"

import { useMemo, useState, useCallback } from "react"
import { useForm, Controller, useWatch, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Button,
  Modal,
  toast,
  Select,
  ListBox,
  ListBoxItem,
  Typography,
} from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import SearchToggle from "@/components/shared/SearchToggle"
import FormAlert from "@/components/shared/FormAlert"
import { useSizes, type SizeRow } from "@/hooks/useSizes"
import { useDictionary } from "@/hooks/useDictionary"
import type { Database } from "@/types/database.types"
import ScrollerShadow from "@/components/ui/ScrollerShadow"
import ReassignDeleteModal, { type ReassignOption } from "@/components/shared/ReassignDeleteModal"
import { supabase } from "@/lib/supabase/client"

type LengthRow = Database["public"]["Tables"]["lengths"]["Row"]
type WidthRow = Database["public"]["Tables"]["widths"]["Row"]

const sizeSchema = z.object({
  width_id: z.string().uuid("Please select a width"),
  length_id: z.string().uuid("Please select a length"),
})

type SizeFormData = z.infer<typeof sizeSchema>

const columnHelper = createColumnHelper<SizeRow>()

export default function SizesSection() {
  const { data, isLoading, create, update, delete: deleteSize } = useSizes()
  const { data: lengths } = useDictionary<LengthRow>("lengths", "length_name")
  const { data: widths } = useDictionary<WidthRow>("widths", "width_name")
  const [search, setSearch] = useState("")

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SizeRow | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<SizeRow | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SizeFormData>({
    resolver: zodResolver(sizeSchema),
    defaultValues: { width_id: "", length_id: "" },
  })

  const watchedWidth = useWatch({ control, name: "width_id" })
  const watchedLength = useWatch({ control, name: "length_id" })

  // Derive unit from a dimension name (last word, e.g. "8 ft" → "ft")
  const extractUnit = (name: string): "ft" | "cm" | null => {
    const m = name.trim().match(/(ft|cm)$/i)
    return m ? (m[1].toLowerCase() as "ft" | "cm") : null
  }

  const selectedWidthUnit = useMemo(() => {
    const w = widths.find((x) => x.id === watchedWidth)
    return w ? extractUnit(w.width_name) : null
  }, [widths, watchedWidth])

  const selectedLengthUnit = useMemo(() => {
    const l = lengths.find((x) => x.id === watchedLength)
    return l ? extractUnit(l.length_name) : null
  }, [lengths, watchedLength])

  // Active unit constraint: whichever dimension is selected first drives the unit
  const activeUnit = selectedWidthUnit ?? selectedLengthUnit

  // Filtered options: constrain both dimensions to the active unit
  const filteredWidthOptions = useMemo(() => {
    if (!activeUnit) return widths.map((w) => ({ id: w.id, label: w.width_name }))
    return widths
      .filter((w) => extractUnit(w.width_name) === activeUnit)
      .map((w) => ({ id: w.id, label: w.width_name }))
  }, [widths, activeUnit])

  const filteredLengthOptions = useMemo(() => {
    if (!activeUnit) return lengths.map((l) => ({ id: l.id, label: l.length_name }))
    return lengths
      .filter((l) => extractUnit(l.length_name) === activeUnit)
      .map((l) => ({ id: l.id, label: l.length_name }))
  }, [lengths, activeUnit])

  const stripUnit = (name: string) => name.trim().replace(/\s*(ft|cm)\s*$/i, "").trim()

  // Auto-configure the size label: Width × Length (units stripped from dimension names).
  const computedLabel = useMemo(() => {
    const w = widths.find((x) => x.id === watchedWidth)?.width_name
    const l = lengths.find((x) => x.id === watchedLength)?.length_name
    if (!w || !l) return ""
    return `${stripUnit(w)} × ${stripUnit(l)}`
  }, [widths, lengths, watchedWidth, watchedLength])

  // Live duplicate detection on the computed label (excluding the edited row).
  const isDuplicate = useMemo(() => {
    if (!computedLabel) return false
    return data.some(
      (s) =>
        s.size_label.trim().toLowerCase() === computedLabel.trim().toLowerCase() &&
        (!editingRecord || s.id !== editingRecord.id)
    )
  }, [computedLabel, data, editingRecord])

  const handleAddClick = () => {
    setEditingRecord(null)
    reset({ width_id: "", length_id: "" })
    setIsFormOpen(true)
  }

  const handleEditClick = (record: SizeRow) => {
    setEditingRecord(record)
    reset({
      width_id: record.width_id,
      length_id: record.length_id,
    })
    setIsFormOpen(true)
  }

  const handleDeleteClick = (record: SizeRow) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }

  const onSubmit = async (formData: SizeFormData) => {
    if (isDuplicate || !computedLabel) return
    setIsSubmitting(true)
    try {
      const payload = { ...formData, size_label: computedLabel }
      if (editingRecord) {
        await update(editingRecord.id, payload)
        toast.success("Size updated successfully!")
      } else {
        await create(payload)
        toast.success("Size added successfully!")
      }
      setIsFormOpen(false)
      reset()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error saving size: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const sizeDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingRecord) return []
    return data
      .filter((s) => s.id !== deletingRecord.id)
      .map((s) => ({
        id: s.id,
        label: `${s.size_label}${s.so_number ? ` (${s.so_number})` : ""}`,
      }))
  }, [deletingRecord, data])

  const getSizeAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingRecord) return 0
    const { count } = await (supabase
      .from("inventory" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("size_id", deletingRecord.id)
    return count ?? 0
  }, [deletingRecord])

  const onReassignSize = useCallback(
    async (opt: ReassignOption) => {
      if (!deletingRecord) return
      const newSizeId = opt.id

      const { data: newSz } = await (supabase
        .from("sizes" as any) as any)
        .select("so_seq")
        .eq("id", newSizeId)
        .maybeSingle()
      const newSoSeq = (newSz as any)?.so_seq ? String((newSz as any).so_seq) : ""

      const { data: invRows } = await (supabase
        .from("inventory" as any) as any)
        .select("id, product_code, quality_code, design_code, quality_id")
        .eq("size_id", deletingRecord.id)

      if (invRows && (invRows as any[]).length > 0) {
        await Promise.all(
          (invRows as any[]).map(async (row: any) => {
            let pCode = row.product_code || ""
            if (!pCode && row.quality_id) {
              const { data: qc } = await (supabase
                .from("quality_codes" as any) as any)
                .select("quality_prefix")
                .eq("quality_id", row.quality_id)
                .limit(1)
                .maybeSingle()
              pCode = `${(qc as any)?.quality_prefix || ""}${row.design_code || ""}`
            }

            const sku = pCode || newSoSeq ? `SA-${pCode}-${newSoSeq ? "SO" + newSoSeq : ""}` : null

            return (supabase
              .from("inventory" as any) as any)
              .update({
                size_id: newSizeId,
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
          .update({ size_id: newSizeId })
          .eq("size_id", deletingRecord.id)
      } catch {
        // ignore
      }
    },
    [deletingRecord]
  )

  const doDeleteSize = useCallback(async () => {
    if (!deletingRecord) return
    await deleteSize(deletingRecord.id)
    toast.success("Size deleted and inventory pieces reassigned!")
    setDeletingRecord(null)
  }, [deletingRecord, deleteSize])

  const filteredData = data.filter(
    (item) =>
      item.size_label.toLowerCase().includes(search.toLowerCase()) ||
      item.width_name.toLowerCase().includes(search.toLowerCase()) ||
      item.length_name.toLowerCase().includes(search.toLowerCase()) ||
      item.so_number.toLowerCase().includes(search.toLowerCase())
  )

  const columns = useMemo<ColumnDef<SizeRow, unknown>[]>(
    () => [
      columnHelper.accessor("size_label", {
        header: "Size Label",
        cell: (info) => <Typography.Paragraph weight="medium" className="text-zinc-900">{info.getValue()}</Typography.Paragraph>,
      }),
      columnHelper.accessor("width_name", {
        header: "Width",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("length_name", {
        header: "Length",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("so_number", {
        header: "SO Number",
        cell: (info) =>
          info.getValue() ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-semibold font-mono">
              {info.getValue()}
            </span>
          ) : (
            "—"
          ),
      }),
    ] as ColumnDef<SizeRow, unknown>[],
    []
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Sizes</Typography.Heading>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search sizes..."
            ariaLabel="Search sizes"
          />

          <Button
            onPress={handleAddClick}
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-10 px-4 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              className="mr-1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Size
          </Button>
        </div>
      </div>

      <DataTable
        data={filteredData}
        columns={columns}
        ariaLabel="Sizes table"
        isLoading={isLoading}
        emptyMessage="No sizes found"
        entityName="Size"
        onRowClick={handleEditClick}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      <Modal isOpen={isFormOpen} onOpenChange={setIsFormOpen}>
        <Modal.Backdrop>
          <Modal.Container size="md">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={handleSubmit(onSubmit)}>
                  <Modal.Header className="flex flex-col gap-1 text-zinc-900 border-b border-zinc-100">
                    {editingRecord ? "Edit Size" : "Add New Size"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDuplicate && <FormAlert message="A size with this combination already exists." />}

                    {activeUnit && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-indigo-500 shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <Typography.Paragraph size="xs" className="text-indigo-700">
                          Both dimensions filtered to{" "}
                          <span className="font-semibold uppercase">{activeUnit}</span> to keep units consistent.
                        </Typography.Paragraph>
                      </div>
                    )}

                    <FkSelect
                      control={control}
                      name="width_id"
                      label="Width *"
                      placeholder="Select width"
                      isInvalid={!!errors.width_id}
                      errorMessage={errors.width_id?.message}
                      options={filteredWidthOptions}
                    />

                    <FkSelect
                      control={control}
                      name="length_id"
                      label="Length *"
                      placeholder="Select length"
                      isInvalid={!!errors.length_id}
                      errorMessage={errors.length_id?.message}
                      options={filteredLengthOptions}
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-zinc-700">
                        Size Label (auto-generated)
                      </label>
                      <div className="w-full bg-zinc-50 border border-zinc-200/80 rounded-xl px-3.5 h-11 flex items-center text-sm text-zinc-900">
                        {computedLabel || (
                          <span className="text-zinc-400">Select width and length…</span>
                        )}
                      </div>
                    </div>
                  </Modal.Body>
                  <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50">
                    <Button
                      variant="outline"
                      onPress={close}
                      className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                      isDisabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium"
                      isDisabled={isSubmitting || isDuplicate || !computedLabel}
                    >
                      {isSubmitting ? "Saving..." : editingRecord ? "Save Changes" : "Create Size"}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <ReassignDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false)
          setDeletingRecord(null)
        }}
        deletingLabel={deletingRecord?.size_label ?? "Size"}
        entityType="Size"
        getAffectedCount={getSizeAffectedCount}
        options={sizeDeleteOptions}
        onReassign={onReassignSize}
        onDelete={doDeleteSize}
      />
    </div>
  )
}

interface FkSelectProps {
  control: Control<SizeFormData>
  name: "width_id" | "length_id"
  label: string
  placeholder: string
  isInvalid: boolean
  errorMessage?: string
  options: { id: string; label: string }[]
}

const FkSelect = ({
  control,
  name,
  label,
  placeholder,
  isInvalid,
  errorMessage,
  options,
}: FkSelectProps) => (
  <Controller
    name={name}
    control={control}
    render={({ field }) => (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-xs font-semibold text-zinc-700">{label}</label>
        <Select
          selectedKey={field.value || null}
          onSelectionChange={(key) => field.onChange(key ? String(key) : "")}
          className="w-full"
          isInvalid={isInvalid}
        >
          <Select.Trigger
            className={`w-full bg-white border ${isInvalid
                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                : "border-zinc-200/80 hover:border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500"
              } rounded-xl px-3.5 h-11 flex items-center justify-between text-sm text-zinc-900 transition-colors focus:outline-hidden focus:ring-1 cursor-pointer`}
          >
            <Select.Value className="text-left font-normal placeholder-zinc-400">
              {options.find((o) => o.id === field.value)?.label || placeholder}
            </Select.Value>
            <Select.Indicator className="text-zinc-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover className="bg-white border border-zinc-200 shadow-xl rounded-2xl overflow-hidden p-1.5 min-w-[280px] z-50 animate-in fade-in-50 slide-in-from-top-1 duration-100">
            <ScrollerShadow size="max-h-60" className="outline-hidden flex flex-col gap-0.5">
              <ListBox className="outline-hidden flex flex-col gap-0.5">
                {options.map((o) => (
                  <ListBoxItem
                    key={o.id}
                    id={o.id}
                    className="px-3 py-2 text-sm rounded-xl text-zinc-900 cursor-pointer outline-hidden flex items-center justify-between transition-colors hover:bg-zinc-50 focus:bg-zinc-50 data-selected:bg-indigo-50 data-selected:text-indigo-700"
                  >
                    <span>{o.label}</span>
                    {field.value === o.id && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-indigo-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </ListBoxItem>
                ))}
              </ListBox>
            </ScrollerShadow>
          </Select.Popover>
        </Select>
        {errorMessage && <p className="text-xs text-red-600 font-medium">{errorMessage}</p>}
      </div>
    )}
  />
)
