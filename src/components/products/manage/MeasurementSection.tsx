"use client"

import { useMemo, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Input, Modal, toast, TextField, Label, FieldError, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/shared/DataTable"
import SearchBar from "@/components/shared/SearchBar"
import FormAlert from "@/components/shared/FormAlert"
import { useDictionary } from "@/hooks/useDictionary"
import { Plus, TriangleExclamation } from "@gravity-ui/icons"

interface MeasurementRow {
  id: string
  created_at: string
  updated_at: string
}

const UOM_OPTIONS = ["ft", "cm"] as const
type Uom = (typeof UOM_OPTIONS)[number]

const measurementSchema = z.object({
  measure: z
    .string()
    .min(1, "Value is required")
    .regex(/^\d+(\.\d+)?$/, "Enter a valid number"),
  uom: z.enum(UOM_OPTIONS),
})

type MeasurementFormData = z.infer<typeof measurementSchema>

const rowValue = <R,>(row: R, key: string) =>
  String((row as Record<string, unknown>)[key] ?? "")

const buildValue = (measure: string, uom: string) => `${measure.trim()} ${uom}`

/** Split a stored value like "8 ft" back into its number + unit parts. */
const parseValue = (raw: string): MeasurementFormData => {
  const m = raw.trim().match(/^(.*?)\s*(ft|cm)$/i)
  if (m) return { measure: m[1].trim(), uom: m[2].toLowerCase() as Uom }
  return { measure: raw.trim(), uom: "ft" }
}

export interface MeasurementSectionProps<Row extends MeasurementRow> {
  table: string
  orderColumn: keyof Row & string
  /** Column that stores the combined "<number> <uom>" value. */
  valueColumn: keyof Row & string
  title: string
  description: string
  entityName: string
}

/**
 * CRUD section for measurement dictionaries (Lengths, Widths): a numeric value
 * plus a ft/cm unit toggle, stored together as e.g. "8 ft". Blocks duplicates
 * live with an inline alert and a disabled save button.
 */
export function MeasurementSection<Row extends MeasurementRow>({
  table,
  orderColumn,
  valueColumn,
  title,
  description,
  entityName,
}: MeasurementSectionProps<Row>) {
  const { data, isLoading, create, update, delete: deleteRecord } = useDictionary<Row>(
    table,
    orderColumn
  )
  const [search, setSearch] = useState("")

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<Row | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<Row | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MeasurementFormData>({
    resolver: zodResolver(measurementSchema),
    defaultValues: { measure: "", uom: "ft" },
  })

  const watchedMeasure = useWatch({ control, name: "measure" })
  const watchedUom = useWatch({ control, name: "uom" })

  // Live duplicate detection on the combined value (excluding the edited row).
  const isDuplicate = useMemo(() => {
    if (!/^\d+(\.\d+)?$/.test((watchedMeasure ?? "").trim())) return false
    const candidate = buildValue(watchedMeasure, watchedUom).toLowerCase()
    return data.some(
      (item) =>
        rowValue(item, valueColumn).trim().toLowerCase() === candidate &&
        (!editingRecord || item.id !== editingRecord.id)
    )
  }, [watchedMeasure, watchedUom, data, valueColumn, editingRecord])

  const handleAddClick = () => {
    setEditingRecord(null)
    reset({ measure: "", uom: "ft" })
    setIsFormOpen(true)
  }

  const handleEditClick = (record: Row) => {
    setEditingRecord(record)
    reset(parseValue(rowValue(record, valueColumn)))
    setIsFormOpen(true)
  }

  const handleDeleteClick = (record: Row) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }

  const onSubmit = async (formData: MeasurementFormData) => {
    if (isDuplicate) return
    setIsSubmitting(true)
    try {
      const value = buildValue(formData.measure, formData.uom)
      const payload = { [valueColumn]: value } as unknown as Omit<
        Row,
        "id" | "created_at" | "updated_at"
      >
      if (editingRecord) {
        await update(editingRecord.id, payload)
        toast.success(`${entityName} updated successfully!`)
      } else {
        await create(payload)
        toast.success(`${entityName} added successfully!`)
      }
      setIsFormOpen(false)
      reset({ measure: "", uom: "ft" })
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error saving ${entityName.toLowerCase()}: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingRecord) return
    setIsSubmitting(true)
    try {
      await deleteRecord(deletingRecord.id)
      toast.success(`${entityName} deleted successfully!`)
      setIsDeleteOpen(false)
      setDeletingRecord(null)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error deleting ${entityName.toLowerCase()}: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredData = data.filter((item) =>
    rowValue(item, valueColumn).toLowerCase().includes(search.toLowerCase())
  )

  const columnHelper = useMemo(() => createColumnHelper<Row>(), [])
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      [
        columnHelper.accessor((row) => rowValue(row, valueColumn), {
          id: valueColumn,
          header: title.replace(/s$/, ""),
          cell: (info) => <Typography.Paragraph weight="medium" className="text-zinc-900">{info.getValue()}</Typography.Paragraph>,
        }),
      ] as ColumnDef<Row, unknown>[],
    [columnHelper, valueColumn, title]
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">{title}</Typography.Heading>
          <Typography.Paragraph size="xs" className="text-zinc-500 mt-1">{description}</Typography.Paragraph>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={`Search ${title.toLowerCase()}...`}
            ariaLabel={`Search ${title.toLowerCase()}`}
            className="flex-1 sm:w-64"
          />
          <Button
            onPress={handleAddClick}
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-10 px-4 cursor-pointer"
          >
            <Plus className="mr-1.5" />
            Add {entityName}
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <DataTable
        data={filteredData}
        columns={columns}
        ariaLabel={`${title} table`}
        isLoading={isLoading}
        emptyMessage={`No ${title.toLowerCase()} found`}
        entityName={entityName}
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
                    {editingRecord ? `Edit ${entityName}` : `Add New ${entityName}`}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDuplicate && <FormAlert message={`This ${entityName.toLowerCase()} already exists.`} />}

                    <div className="w-full flex flex-col gap-1.5">
                      <Label className="text-xs font-semibold text-zinc-700">
                        {entityName} Value *
                      </Label>
                      <div className="flex gap-2">
                        <Controller
                          name="measure"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              isInvalid={!!errors.measure}
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              className="flex-1 flex flex-col gap-1.5"
                            >
                              <Input
                                ref={field.ref}
                                inputMode="decimal"
                                placeholder="e.g. 8"
                                variant="primary"
                                className="w-full text-zinc-900 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl px-3.5 h-11 text-sm transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </TextField>
                          )}
                        />
                        <Controller
                          name="uom"
                          control={control}
                          render={({ field }) => (
                            <div className="flex rounded-xl border border-zinc-200/80 overflow-hidden shrink-0 h-11">
                              {UOM_OPTIONS.map((u) => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => field.onChange(u)}
                                  className={cn(
                                    "px-4 text-sm font-medium transition-colors cursor-pointer",
                                    field.value === u
                                      ? "bg-indigo-600 text-white"
                                      : "bg-white text-zinc-600 hover:bg-zinc-50"
                                  )}
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          )}
                        />
                      </div>
                      <FieldError className="text-xs text-red-500 font-medium">
                        {errors.measure?.message}
                      </FieldError>
                      {watchedMeasure && (
                        <Typography.Paragraph size="xs" className="text-zinc-500">
                          Saved as{" "}
                          <span className="font-semibold text-zinc-700">
                            {buildValue(watchedMeasure, watchedUom)}
                          </span>
                        </Typography.Paragraph>
                      )}
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
                      isDisabled={isSubmitting || isDuplicate}
                    >
                      {isSubmitting
                        ? "Saving..."
                        : editingRecord
                          ? "Save Changes"
                          : `Create ${entityName}`}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Modal.Backdrop>
          <Modal.Container size="sm">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="flex gap-2 items-center text-red-600 border-b border-zinc-100">
                    <TriangleExclamation width="20" height="20" className="text-red-500" />
                    Delete {entityName}?
                  </Modal.Header>
                  <Modal.Body className="py-6">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      Are you sure you want to delete{" "}
                      <span className="font-semibold text-zinc-900">
                        {deletingRecord ? rowValue(deletingRecord, valueColumn) : ""}
                      </span>
                      ? This action is permanent and cannot be undone.
                    </Typography.Paragraph>
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
                      onPress={confirmDelete}
                      variant="danger"
                      className="bg-red-600 text-white rounded-xl cursor-pointer font-medium"
                      isDisabled={isSubmitting}
                    >
                      {isSubmitting ? "Deleting..." : "Delete"}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  )
}

export default MeasurementSection
