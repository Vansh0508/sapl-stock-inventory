"use client"

import { useMemo, useState, useCallback } from "react"
import { useForm, useWatch, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Modal, toast, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import SearchToggle from "@/components/shared/SearchToggle"
import FormTextField from "@/components/shared/FormTextField"
import FormAlert from "@/components/shared/FormAlert"
import { useDictionary } from "@/hooks/useDictionary"
import { supabase } from "@/lib/supabase/client"
import ReassignDeleteModal, { type ReassignOption } from "@/components/shared/ReassignDeleteModal"

interface DictionaryRow {
  id: string
  created_at: string
  updated_at: string
}

const rowValue = <R,>(row: R, key: string) =>
  String((row as Record<string, unknown>)[key] ?? "")

export interface DictField {
  /** Column / form field key — must match the DB column name. */
  key: string
  /** Form field label. */
  label: string
  /** Optional input placeholder. */
  placeholder?: string
  /** Max length for validation. */
  maxLength?: number
  /** Whether the value is required. Defaults to true. */
  required?: boolean
  /** Enforce client-side case-insensitive uniqueness on this field. */
  unique?: boolean
  /** Render the value as a monospace code badge in the table. */
  mono?: boolean
  /** Override the table column header (defaults to `label`). */
  headerLabel?: string
}

export interface ReassignConfig {
  referencingTable: string
  referencingColumn: string
  displayColumn: string
}

export interface DictionarySectionProps<Row extends DictionaryRow> {
  /** Supabase table name. */
  table: string
  /** Column to sort by. */
  orderColumn: keyof Row & string
  /** Section heading. */
  title: string
  /** Singular entity noun (e.g. "Quality") used in buttons, toasts, modals. */
  entityName: string
  /** Field definitions — drive the table columns and the add/edit form. */
  fields: DictField[]
  /** Optional config for reassigning referencing rows before deleting. */
  reassignConfig?: ReassignConfig
}

/**
 * Config-driven CRUD section for the simple Manage dictionary tables.
 * Renders a header (title + search + add), the reusable DataTable, and the
 * add/edit + delete modals — all derived from the `fields` config.
 */
export function DictionarySection<Row extends DictionaryRow>({
  table,
  orderColumn,
  title,
  entityName,
  fields,
  reassignConfig,
}: DictionarySectionProps<Row>) {
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

  const getAffectedCount = useCallback(async (): Promise<number> => {
    if (!deletingRecord || !reassignConfig) return 0
    const { count } = await (supabase.from(reassignConfig.referencingTable as any) as any)
      .select("id", { count: "exact", head: true })
      .eq(reassignConfig.referencingColumn, deletingRecord.id)
    return count ?? 0
  }, [deletingRecord, reassignConfig])

  const reassignOptions = useMemo<ReassignOption[]>(() => {
    if (!deletingRecord || !reassignConfig) return []
    return data
      .filter((item) => item.id !== deletingRecord.id)
      .map((item) => ({
        id: item.id,
        label: rowValue(item, reassignConfig.displayColumn),
      }))
  }, [data, deletingRecord, reassignConfig])

  const onReassign = useCallback(
    async (opt: ReassignOption) => {
      if (!deletingRecord || !reassignConfig) return
      const { error } = await (supabase.from(reassignConfig.referencingTable as any) as any)
        .update({ [reassignConfig.referencingColumn]: opt.id, updated_at: new Date().toISOString() })
        .eq(reassignConfig.referencingColumn, deletingRecord.id)
      if (error) throw error

      if (reassignConfig.referencingTable === "inventory") {
        try {
          await (supabase.from("catalog" as any) as any)
            .update({ [reassignConfig.referencingColumn]: opt.id })
            .eq(reassignConfig.referencingColumn, deletingRecord.id)
        } catch {
          // ignore if catalog doesn't have it
        }
      }
    },
    [deletingRecord, reassignConfig]
  )

  const doDeleteWithReassign = useCallback(async () => {
    if (!deletingRecord) return
    await deleteRecord(deletingRecord.id)
    toast.success(`${entityName} deleted successfully!`)
    setDeletingRecord(null)
  }, [deletingRecord, deleteRecord, entityName])

  // Dynamic Zod schema built from the field config.
  const schema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const f of fields) {
      let s = z.string()
      if (f.required !== false) s = s.min(1, `${f.label} is required`)
      if (f.maxLength) s = s.max(f.maxLength)
      shape[f.key] = s
    }
    return z.object(shape)
  }, [fields])

  type FormData = Record<string, string>

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) as Resolver<FormData> })

  const emptyValues = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, ""])) as FormData,
    [fields]
  )

  // Live duplicate detection on any unique field (excluding the edited row).
  const watchedValues = useWatch({ control }) as FormData
  const duplicateField = useMemo(() => {
    for (const f of fields) {
      if (!f.unique) continue
      const value = (watchedValues[f.key] ?? "").trim().toLowerCase()
      if (!value) continue
      const exists = data.some(
        (item) =>
          rowValue(item, f.key).trim().toLowerCase() === value &&
          (!editingRecord || item.id !== editingRecord.id)
      )
      if (exists) return f
    }
    return null
  }, [watchedValues, data, fields, editingRecord])
  const isDuplicate = !!duplicateField

  const handleAddClick = () => {
    setEditingRecord(null)
    reset(emptyValues)
    setIsFormOpen(true)
  }

  const handleEditClick = (record: Row) => {
    setEditingRecord(record)
    reset(Object.fromEntries(fields.map((f) => [f.key, rowValue(record, f.key)])) as FormData)
    setIsFormOpen(true)
  }

  const handleDeleteClick = (record: Row) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }

  const onSubmit = async (formData: FormData) => {
    if (isDuplicate) return
    setIsSubmitting(true)
    try {
      // Client-side uniqueness checks (case-insensitive, excluding self).
      for (const f of fields) {
        if (!f.unique) continue
        const value = formData[f.key]?.trim().toLowerCase()
        const duplicate = data.some(
          (item) =>
            rowValue(item, f.key).trim().toLowerCase() === value &&
            (!editingRecord || item.id !== editingRecord.id)
        )
        if (duplicate) {
          setError(f.key, { type: "manual", message: `This ${f.label.toLowerCase()} is already in use.` })
          setIsSubmitting(false)
          return
        }
      }

      const payload = formData as unknown as Omit<Row, "id" | "created_at" | "updated_at">

      if (editingRecord) {
        await update(editingRecord.id, payload)
        toast.success(`${entityName} updated successfully!`)
      } else {
        await create(payload)
        toast.success(`${entityName} added successfully!`)
      }
      setIsFormOpen(false)
      reset(emptyValues)
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
    fields.some((f) => rowValue(item, f.key).toLowerCase().includes(search.toLowerCase()))
  )

  const columnHelper = useMemo(() => createColumnHelper<Row>(), [])

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      fields.map((f, index) =>
        columnHelper.accessor((row) => rowValue(row, f.key), {
          id: f.key,
          header: f.headerLabel ?? f.label,
          cell: (info) => {
            const value = info.getValue()
            if (f.mono) {
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-semibold font-mono">
                  {value}
                </span>
              )
            }
            if (index === 0) {
              return <Typography.Paragraph weight="medium" className="text-zinc-900">{value}</Typography.Paragraph>
            }
            return value || "—"
          },
        })
      ) as ColumnDef<Row, unknown>[],
    [fields, columnHelper]
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">{title}</Typography.Heading>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder={`Search ${title.toLowerCase()}...`}
            ariaLabel={`Search ${title.toLowerCase()}`}
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
                    {isDuplicate && (
                      <FormAlert
                        message={`This ${duplicateField?.label.toLowerCase()} already exists.`}
                      />
                    )}
                    {fields.map((f) => (
                      <FormTextField
                        key={f.key}
                        control={control}
                        name={f.key}
                        label={`${f.label}${f.required !== false ? " *" : ""}`}
                        placeholder={f.placeholder}
                        error={errors[f.key]?.message as string | undefined}
                      />
                    ))}
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
      {reassignConfig ? (
        <ReassignDeleteModal
          isOpen={isDeleteOpen}
          onClose={() => {
            setIsDeleteOpen(false)
            setDeletingRecord(null)
          }}
          deletingLabel={deletingRecord ? rowValue(deletingRecord, fields[0].key) : ""}
          entityType={entityName}
          getAffectedCount={getAffectedCount}
          options={reassignOptions}
          onReassign={onReassign}
          onDelete={doDeleteWithReassign}
        />
      ) : (
        <Modal isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <Modal.Backdrop>
            <Modal.Container size="sm">
              <Modal.Dialog>
                {({ close }) => (
                  <>
                    <Modal.Header className="flex gap-2 items-center text-red-600 border-b border-zinc-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-red-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      Delete {entityName}?
                    </Modal.Header>
                    <Modal.Body className="py-6">
                      <Typography.Paragraph size="sm" className="text-zinc-600">
                        Are you sure you want to delete{" "}
                        <span className="font-semibold text-zinc-900">
                          {deletingRecord ? rowValue(deletingRecord, fields[0].key) : ""}
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
      )}
    </div>
  )
}

export default DictionarySection
