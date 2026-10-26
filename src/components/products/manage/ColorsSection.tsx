"use client"

import { useMemo, useState, useCallback } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Modal, toast, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import SearchToggle from "@/components/shared/SearchToggle"
import FormTextField from "@/components/shared/FormTextField"
import FormAlert from "@/components/shared/FormAlert"
import { useColors } from "@/hooks/useColors"
import type { Database } from "@/types/database.types"
import { supabase } from "@/lib/supabase/client"
import ReassignDeleteModal, { type ReassignOption } from "@/components/shared/ReassignDeleteModal"

type ColorRow = Database["public"]["Tables"]["colors"]["Row"]

const columnHelper = createColumnHelper<ColorRow>()

const colorSchema = z.object({
  color_name: z.string().min(1, "Color name is required").max(100),
  color_code: z.string().min(1, "Color code is required").max(20),
})

type ColorFormData = z.infer<typeof colorSchema>

export default function ColorsSection() {
  const { data, isLoading, create, update, delete: deleteColor } = useColors()
  const [search, setSearch] = useState("")

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ColorRow | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<ColorRow | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ColorFormData>({
    resolver: zodResolver(colorSchema),
  })

  // Live duplicate detection on color name / code (excluding the edited row).
  const watchedName = useWatch({ control, name: "color_name" })
  const watchedCode = useWatch({ control, name: "color_code" })
  const duplicateMessage = useMemo(() => {
    const name = (watchedName ?? "").trim().toLowerCase()
    const code = (watchedCode ?? "").trim().toLowerCase()
    const others = data.filter((c) => !editingRecord || c.id !== editingRecord.id)
    if (code && others.some((c) => c.color_code.trim().toLowerCase() === code))
      return "This color code is already in use."
    if (name && others.some((c) => c.color_name.trim().toLowerCase() === name))
      return "This color name is already in use."
    return null
  }, [watchedName, watchedCode, data, editingRecord])
  const isDuplicate = !!duplicateMessage

  // Open modal for adding
  const handleAddClick = () => {
    setEditingRecord(null)
    reset({ color_name: "", color_code: "" })
    setIsFormOpen(true)
  }

  // Open modal for editing
  const handleEditClick = (record: ColorRow) => {
    setEditingRecord(record)
    reset({
      color_name: record.color_name,
      color_code: record.color_code,
    })
    setIsFormOpen(true)
  }

  // Open delete dialog
  const handleDeleteClick = (record: ColorRow) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }


  // Handle Form Submit (Add/Edit)
  const onSubmit = async (formData: ColorFormData) => {
    if (isDuplicate) return
    setIsSubmitting(true)
    try {
      // 1. Client-side validation: Check for unique color code (excluding self if editing)
      const codeDuplicate = data.some(
        (c) =>
          c.color_code.trim().toLowerCase() === formData.color_code.trim().toLowerCase() &&
          (!editingRecord || c.id !== editingRecord.id)
      )

      if (codeDuplicate) {
        setError("color_code", {
          type: "manual",
          message: "This color code is already in use.",
        })
        setIsSubmitting(false)
        return
      }

      // 2. Client-side validation: Check for unique color name (excluding self if editing)
      const nameDuplicate = data.some(
        (c) =>
          c.color_name.trim().toLowerCase() === formData.color_name.trim().toLowerCase() &&
          (!editingRecord || c.id !== editingRecord.id)
      )

      if (nameDuplicate) {
        setError("color_name", {
          type: "manual",
          message: "This color name is already in use.",
        })
        setIsSubmitting(false)
        return
      }

      if (editingRecord) {
        await update(editingRecord.id, formData)
        toast.success("Color updated successfully!")
      } else {
        await create(formData)
        toast.success("Color added successfully!")
      }
      setIsFormOpen(false)
      reset()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error saving color: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete Confirm — replaced by ReassignDeleteModal flow

  // How many catalog_colors rows reference this color?
  const getColorAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingRecord) return 0
    const { count } = await (supabase
      .from("catalog_colors" as any) as any)
      .select("catalog_id", { count: "exact", head: true })
      .eq("color_id", deletingRecord.id)
    return count ?? 0
  }, [deletingRecord])

  // Reassign options = all other colors
  const colorDeleteOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingRecord) return []
    return data
      .filter((c) => c.id !== deletingRecord.id)
      .map((c) => ({
        id: c.id,
        label: `${c.color_name} (${c.color_code})`,
      }))
  }, [deletingRecord, data])

  const onReassignColor = useCallback(async (opt: ReassignOption) => {
    if (!deletingRecord) return
    const { error } = await (supabase
      .from("catalog_colors" as any) as any)
      .update({ color_id: opt.id })
      .eq("color_id", deletingRecord.id)
    if (error) throw error
  }, [deletingRecord])

  const doDeleteColor = useCallback(async () => {
    if (!deletingRecord) return
    await deleteColor(deletingRecord.id)
    toast.success("Color deleted and inventory pieces reassigned!")
    setDeletingRecord(null)
  }, [deletingRecord, deleteColor])

  // Filter list by search query
  const filteredData = data.filter(
    (item) =>
      item.color_name.toLowerCase().includes(search.toLowerCase()) ||
      item.color_code.toLowerCase().includes(search.toLowerCase())
  )

  // Column definitions for the reusable DataTable
  const columns = useMemo<ColumnDef<ColorRow, unknown>[]>(
    () => [
      columnHelper.accessor("color_name", {
        header: "Color Name",
        cell: (info) => (
          <Typography.Paragraph weight="medium" className="text-zinc-900">{info.getValue()}</Typography.Paragraph>
        ),
      }),
      columnHelper.accessor("color_code", {
        header: "Color Code (e.g. C01, C02)",
        cell: (info) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-semibold font-mono">
            {info.getValue()}
          </span>
        ),
      }),
    ] as ColumnDef<ColorRow, unknown>[],
    []
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Colors</Typography.Heading>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search colors..."
            ariaLabel="Search colors"
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
            Add Color
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <DataTable
        data={filteredData}
        columns={columns}
        ariaLabel="Colors table"
        isLoading={isLoading}
        emptyMessage="No colors found"
        entityName="Color"
        onRowClick={handleEditClick}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
      />

      {/* Add / Edit Modal */}
      <Modal isOpen={isFormOpen} onOpenChange={setIsFormOpen}>
        <Modal.Backdrop>
          <Modal.Container size="md">
            <Modal.Dialog>
              {({ close }) => (
                <form onSubmit={handleSubmit(onSubmit)}>
                  <Modal.Header className="flex flex-col gap-1 text-zinc-900 border-b border-zinc-100">
                    {editingRecord ? "Edit Color" : "Add New Color"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {duplicateMessage && <FormAlert message={duplicateMessage} />}
                    <FormTextField
                      control={control}
                      name="color_name"
                      label="Color Name *"
                      placeholder="e.g. Ivory White"
                      error={errors.color_name?.message}
                    />
                    <FormTextField
                      control={control}
                      name="color_code"
                      label="Color Code *"
                      placeholder="e.g. C01, C02, etc."
                      error={errors.color_code?.message}
                    />
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
                      isDisabled={isSubmitting || isDuplicate}
                    >
                      {isSubmitting ? "Saving..." : (editingRecord ? "Save Changes" : "Create Color")}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* ── Reassign & Delete Color Modal ── */}
      <ReassignDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => { setIsDeleteOpen(false); setDeletingRecord(null) }}
        deletingLabel={deletingRecord ? `${deletingRecord.color_name} (${deletingRecord.color_code})` : ""}
        entityType="Color"
        getAffectedCount={getColorAffectedCount}
        options={colorDeleteOptions}
        onReassign={onReassignColor}
        onDelete={doDeleteColor}
      />
    </div>
  )
}
