"use client"

import { useMemo, useState } from "react"
import { useForm, Controller, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  Button,
  Select,
  Modal,
  toast,
  ListBox,
  ListBoxItem,
  Typography,
} from "@heroui/react"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/shared/DataTable"
import SearchToggle from "@/components/shared/SearchToggle"
import FormTextField from "@/components/shared/FormTextField"
import FormAlert from "@/components/shared/FormAlert"
import { useLocations, type LocationWithCurrency } from "@/hooks/useLocations"
import { useCurrencies } from "@/hooks/useCurrencies"
import ScrollerShadow from "@/components/ui/ScrollerShadow"
import { Check as CheckIcon, ChevronDown, Plus, TriangleExclamation } from "@gravity-ui/icons"

const columnHelper = createColumnHelper<LocationWithCurrency>()

const locationSchema = z.object({
  location_name: z.string().min(1, "Location name is required").max(100),
  country: z.string().min(1, "Country is required").max(100),
  state: z.string().max(100).nullable().optional(),
  currency_id: z.string().uuid("Please select a valid currency"),
})

type LocationFormData = z.infer<typeof locationSchema>

export default function LocationsSection() {
  const { data, isLoading, create, update, delete: deleteLocation } = useLocations()
  const { data: currencies, isLoading: isCurrenciesLoading } = useCurrencies()
  const [search, setSearch] = useState("")

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LocationWithCurrency | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<LocationWithCurrency | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
  })

  // Live duplicate detection on location name (excluding the edited row).
  const watchedName = useWatch({ control, name: "location_name" })
  const isDuplicate = useMemo(() => {
    const value = (watchedName ?? "").trim().toLowerCase()
    if (!value) return false
    return data.some(
      (l) =>
        l.location_name.trim().toLowerCase() === value &&
        (!editingRecord || l.id !== editingRecord.id)
    )
  }, [watchedName, data, editingRecord])

  // Open modal for adding
  const handleAddClick = () => {
    setEditingRecord(null)
    reset({ location_name: "", country: "", state: "", currency_id: "" })
    setIsFormOpen(true)
  }

  // Open modal for editing
  const handleEditClick = (record: LocationWithCurrency) => {
    setEditingRecord(record)
    reset({
      location_name: record.location_name,
      country: record.country,
      state: record.state || "",
      currency_id: record.currency_id,
    })
    setIsFormOpen(true)
  }

  // Open delete dialog
  const handleDeleteClick = (record: LocationWithCurrency) => {
    setDeletingRecord(record)
    setIsDeleteOpen(true)
  }

  // Handle Form Submit (Add/Edit)
  const onSubmit = async (formData: LocationFormData) => {
    if (isDuplicate) return
    setIsSubmitting(true)
    try {
      // Check for client-side name uniqueness (excluding self)
      const isDuplicate = data.some(
        (l) =>
          l.location_name.toLowerCase() === formData.location_name.toLowerCase() &&
          (!editingRecord || l.id !== editingRecord.id)
      )

      if (isDuplicate) {
        toast.danger("A location with this name already exists.")
        setIsSubmitting(false)
        return
      }

      const submitData = {
        ...formData,
        state: formData.state === "" ? null : (formData.state ?? null),
      }

      if (editingRecord) {
        await update(editingRecord.id, submitData)
        toast.success("Location updated successfully!")
      } else {
        await create(submitData)
        toast.success("Location added successfully!")
      }
      setIsFormOpen(false)
      reset()
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error saving location: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete Confirm
  const confirmDelete = async () => {
    if (!deletingRecord) return
    setIsSubmitting(true)
    try {
      await deleteLocation(deletingRecord.id)
      toast.success("Location deleted successfully!")
      setIsDeleteOpen(false)
      setDeletingRecord(null)
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Error deleting location: ${msg}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter list by search query
  const filteredData = data.filter(
    (item) =>
      item.location_name.toLowerCase().includes(search.toLowerCase()) ||
      item.country.toLowerCase().includes(search.toLowerCase()) ||
      (item.state && item.state.toLowerCase().includes(search.toLowerCase())) ||
      (item.currency?.currency_name || "").toLowerCase().includes(search.toLowerCase())
  )

  // Column definitions for the reusable DataTable
  const columns = useMemo<ColumnDef<LocationWithCurrency, unknown>[]>(
    () => [
      columnHelper.accessor("location_name", {
        header: "Location Name",
        cell: (info) => (
          <Typography.Paragraph weight="medium" className="text-zinc-900">{info.getValue()}</Typography.Paragraph>
        ),
      }),
      columnHelper.accessor((row) => row.state ?? "", {
        id: "state",
        header: "State",
        cell: (info) => info.getValue() || "—",
      }),
      columnHelper.accessor("country", { header: "Country" }),
      columnHelper.accessor((row) => row.currency?.currency_name ?? "", {
        id: "currency",
        header: "Currency",
        cell: (info) => {
          const currency = info.row.original.currency
          return currency ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
              <span className="font-mono font-semibold">{currency.symbol}</span>
              <span>{currency.currency_name}</span>
            </span>
          ) : (
            "—"
          )
        },
      }),
    ] as ColumnDef<LocationWithCurrency, unknown>[],
    []
  )

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Typography.Heading level={4} className="text-zinc-900">Locations</Typography.Heading>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <SearchToggle
            value={search}
            onChange={setSearch}
            placeholder="Search locations..."
            ariaLabel="Search locations"
          />

          <Button
            onPress={handleAddClick}
            variant="primary"
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-10 px-4 cursor-pointer"
          >
            <Plus className="mr-1.5" />
            Add Location
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <DataTable
        data={filteredData}
        columns={columns}
        ariaLabel="Locations table"
        isLoading={isLoading}
        emptyMessage="No locations found"
        entityName="Location"
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
                    {editingRecord ? "Edit Location" : "Add New Location"}
                  </Modal.Header>
                  <Modal.Body className="py-6 flex flex-col gap-4">
                    {isDuplicate && <FormAlert message="A location with this name already exists." />}
                    <FormTextField
                      control={control}
                      name="location_name"
                      label="Location Name *"
                      placeholder="e.g. Mumbai Flagship Store"
                      error={errors.location_name?.message}
                    />
                    <FormTextField
                      control={control}
                      name="state"
                      label="State / Province"
                      placeholder="e.g. Maharashtra (optional)"
                      error={errors.state?.message}
                    />
                    <FormTextField
                      control={control}
                      name="country"
                      label="Country *"
                      placeholder="e.g. India"
                      error={errors.country?.message}
                    />

                    <Controller
                      name="currency_id"
                      control={control}
                      render={({ field }) => (
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="text-xs font-semibold text-zinc-700">Default Currency *</label>
                          <Select
                            selectedKey={field.value || null}
                            onSelectionChange={(key) => {
                              field.onChange(key ? String(key) : "")
                            }}
                            className="w-full"
                            isInvalid={!!errors.currency_id}
                          >
                            <Select.Trigger className={`w-full bg-white border ${errors.currency_id ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-zinc-200/80 hover:border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500"} rounded-xl px-3.5 h-11 flex items-center justify-between text-sm text-zinc-900 transition-colors focus:outline-hidden focus:ring-1 cursor-pointer`}>
                              <Select.Value className="text-left font-normal placeholder-zinc-400">
                                {currencies.find(c => c.id === field.value)?.currency_name || (isCurrenciesLoading ? "Loading currencies..." : "Select currency")}
                              </Select.Value>
                              <Select.Indicator className="text-zinc-400">
                                <ChevronDown />
                              </Select.Indicator>
                            </Select.Trigger>
                            <Select.Popover className="bg-white border border-zinc-200 shadow-xl rounded-2xl overflow-hidden p-1.5 min-w-[280px] z-50 animate-in fade-in-50 slide-in-from-top-1 duration-100">
                              <ScrollerShadow size="max-h-60" className="outline-hidden flex flex-col gap-0.5">
                                <ListBox className="outline-hidden flex flex-col gap-0.5">
                                  {currencies.map((c) => (
                                    <ListBoxItem
                                      key={c.id}
                                      id={c.id}
                                      className="px-3 py-2 text-sm rounded-xl text-zinc-900 cursor-pointer outline-hidden flex items-center justify-between transition-colors hover:bg-zinc-50 focus:bg-zinc-50 data-selected:bg-indigo-50 data-selected:text-indigo-700"
                                    >
                                      <span>{c.currency_name} ({c.symbol})</span>
                                      {field.value === c.id && (
                                        <CheckIcon className="text-indigo-600" />
                                      )}
                                    </ListBoxItem>
                                  ))}
                                </ListBox>
                              </ScrollerShadow>
                            </Select.Popover>
                          </Select>
                          {errors.currency_id && (
                            <p className="text-xs text-red-600 font-medium">{errors.currency_id.message}</p>
                          )}
                        </div>
                      )}
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
                      {isSubmitting ? "Saving..." : (editingRecord ? "Save Changes" : "Create Location")}
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
                    <TriangleExclamation width="20" height="20" className="text-red-500" />
                    Delete Location?
                  </Modal.Header>
                  <Modal.Body className="py-6">
                    <Typography.Paragraph size="sm" className="text-zinc-600">
                      Are you sure you want to delete{" "}
                      <span className="font-semibold text-zinc-955">
                        {deletingRecord?.location_name} ({deletingRecord?.country})
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


