"use client"

import { useMemo, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Modal, toast, Typography } from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import SearchToggle from "@/components/shared/SearchToggle"
import FormTextField from "@/components/shared/FormTextField"
import FormAlert from "@/components/shared/FormAlert"
import { useCurrencies } from "@/hooks/useCurrencies"
import type { Database } from "@/types/database.types"

type Currency = Database["public"]["Tables"]["currencies"]["Row"]

const columnHelper = createColumnHelper<Currency>()

const currencySchema = z.object({
  currency_code: z.string().min(1, "Currency code is required").max(10),
  currency_name: z.string().min(1, "Currency name is required").max(100),
  symbol: z.string().min(1, "Symbol is required").max(10),
})

type CurrencyFormData = z.infer<typeof currencySchema>

export default function CurrenciesSection() {
  const { data, isLoading, create, update, delete: deleteCurrency } = useCurrencies()
  const [search, setSearch] = useState("")

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<Currency | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<Currency | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CurrencyFormData>({
    resolver: zodResolver(currencySchema),
  })

  // Live duplicate detection on currency name (excluding the edited row).
  const watchedName = useWatch({ control, name: "currency_name" })
  const isDuplicate = useMemo(() => {
    const value = (watchedName ?? "").trim().toLowerCase()
    if (!value) return false
    return data.some(
      (c) =>
        c.currency_name.trim().toLowerCase() === value &&
        (!editingRecord || c.id !== editingRecord.id)
    )
  }, [watchedName, data, editingRecord])

  // Open modal for adding
  const handleAddClick = () => {
    setEditingRecord(null)
    reset({ currency_code: "", currency_name: "", symbol: "" })
    setIsFormOpen(true)
  }

  // Open modal for editing
  const handleEditClick = (record: Currency) => {
    setEditingRecord(record)
    reset({
      currency_code: record.currency_code,
      currency_name: record.currency_name,
      symbol: record.symbol,
    })
    setIsFormOpen(true)
  }

  // Open delete dialog
  const handleDeleteClick = (record: Currency) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }

  // Handle Form Submit (Add/Edit)
  const onSubmit = async (formData: CurrencyFormData) => {
    if (isDuplicate) return
    setIsSubmitting(true)
    try {
      // Check for client-side name uniqueness (excluding self)
      const isDuplicate = data.some(
        (c) =>
          c.currency_name.toLowerCase() === formData.currency_name.toLowerCase() &&
          (!editingRecord || c.id !== editingRecord.id)
      )

      if (isDuplicate) {
        toast.danger("A currency with this name already exists.")
        setIsSubmitting(false)
        return
      }

      if (editingRecord) {
        await update(editingRecord.id, formData)
        toast.success("Currency updated successfully!")
      } else {
        await create(formData)
        toast.success("Currency added successfully!")
      }
      setIsFormOpen(false)
      reset()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error saving currency: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete Confirm
  const confirmDelete = async () => {
    if (!deletingRecord) return
    setIsSubmitting(true)
    try {
      await deleteCurrency(deletingRecord.id)
      toast.success("Currency deleted successfully!")
      setIsDeleteOpen(false)
      setDeletingRecord(null)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error deleting currency: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter list by search query
  const filteredData = data.filter(
    (item) =>
      item.currency_name.toLowerCase().includes(search.toLowerCase()) ||
      item.currency_code.toLowerCase().includes(search.toLowerCase()) ||
      item.symbol.toLowerCase().includes(search.toLowerCase())
  )

  // Column definitions for the reusable DataTable
  const columns = useMemo<ColumnDef<Currency, unknown>[]>(
    () => [
      columnHelper.accessor("currency_code", {
        header: "Code",
        cell: (info) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-semibold font-mono">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("currency_name", {
        header: "Currency Name",
        cell: (info) => (
          <Typography.Paragraph weight="medium" className="text-zinc-900">{info.getValue()}</Typography.Paragraph>
        ),
      }),
      columnHelper.accessor("symbol", {
        header: "Symbol",
        cell: (info) => <Typography.Paragraph className="font-mono">{info.getValue()}</Typography.Paragraph>,
      }),
    ] as ColumnDef<Currency, unknown>[],
    []
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Currencies</Typography.Heading>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search currencies..."
            ariaLabel="Search currencies"
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
            Add Currency
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <DataTable
        data={filteredData}
        columns={columns}
        ariaLabel="Currencies table"
        isLoading={isLoading}
        emptyMessage="No currencies found"
        entityName="Currency"
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
                    {editingRecord ? "Edit Currency" : "Add New Currency"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDuplicate && <FormAlert message="A currency with this name already exists." />}
                    <FormTextField
                      control={control}
                      name="currency_code"
                      label="Currency Code *"
                      placeholder="e.g. USD, INR, EUR"
                      error={errors.currency_code?.message}
                    />
                    <FormTextField
                      control={control}
                      name="currency_name"
                      label="Currency Name *"
                      placeholder="e.g. US Dollar"
                      error={errors.currency_name?.message}
                    />
                    <FormTextField
                      control={control}
                      name="symbol"
                      label="Currency Symbol *"
                      placeholder="e.g. $, ₹, €"
                      error={errors.symbol?.message}
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
                      {isSubmitting ? "Saving..." : (editingRecord ? "Save Changes" : "Create Currency")}
                    </Button>
                  </Modal.Footer>
                </form>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Delete Confirmation Alert Dialog */}
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
                    Delete Currency?
                  </Modal.Header>
                  <Modal.Body className="py-6">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      Are you sure you want to delete{" "}
                      <span className="font-semibold text-zinc-950">
                        {deletingRecord?.currency_name} ({deletingRecord?.symbol})
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
