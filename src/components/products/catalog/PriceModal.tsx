"use client"

import { useEffect, useRef, useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, Modal, toast, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import type { PriceRow } from "@/hooks/usePrices"
import { cn } from "@/lib/utils"

const schema = z.object({
  price: z.number().min(0, "Price must be 0 or more"),
})

type FormValues = z.infer<typeof schema>

interface PriceModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  catalogId: string
  inventoryId: string
  serialNumber: string
  locationId: string
  locationName: string
  currencyId: string
  currencySymbol: string
  existingPrice?: PriceRow | null
  onSaved: (row: PriceRow) => void
}

export default function PriceModal({
  isOpen,
  onOpenChange,
  catalogId,
  inventoryId,
  serialNumber,
  locationId,
  locationName,
  currencyId,
  currencySymbol,
  existingPrice,
  onSaved,
}: PriceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const priceInputRef = useRef<HTMLInputElement>(null)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { price: existingPrice?.price ?? 0 },
  })

  useEffect(() => {
    if (!isOpen) return
    reset({ price: existingPrice?.price ?? 0 })
  }, [isOpen, existingPrice, reset])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => priceInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true)
    try {
      if (existingPrice) {
        const { error: err } = await (supabase
          .from("prices" as any) as any)
          .update({ price: values.price })
          .eq("id", existingPrice.id)
        if (err) throw err

        onSaved({ ...existingPrice, price: values.price })
      } else {
        const { data, error: err } = await (supabase
          .from("prices" as any) as any)
          .insert({
            catalog_id: catalogId,
            inventory_id: inventoryId,
            location_id: locationId,
            currency_id: currencyId,
            price: values.price,
          })
          .select("id, catalog_id, inventory_id, location_id, currency_id, price, valid_from, valid_to")
          .single()
        if (err) throw err

        onSaved({
          id: (data as any).id,
          catalog_id: (data as any).catalog_id,
          inventory_id: (data as any).inventory_id,
          location_id: (data as any).location_id,
          location_name: locationName,
          currency_id: (data as any).currency_id,
          currency_symbol: currencySymbol,
          price: (data as any).price,
          valid_from: (data as any).valid_from,
          valid_to: (data as any).valid_to,
        })
      }

      toast.success("Price saved successfully!")
      onOpenChange(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save price"
      toast.danger(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-[200]">
        <Modal.Container size="sm" className="z-[200]">
          <Modal.Dialog>
            {({ close }) => (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col bg-white rounded-2xl overflow-hidden">
                <Modal.Header className="border-b border-zinc-100 text-zinc-900 font-semibold shrink-0">
                  {existingPrice ? "Edit Price" : "Add Price"}
                </Modal.Header>

                <Modal.Body className="py-6 flex flex-col gap-4">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <div>
                      <Typography.Paragraph size="xs" className="text-zinc-400 uppercase tracking-wider">SP Number</Typography.Paragraph>
                      <Typography.Code weight="semibold" className="text-sm text-zinc-800">{serialNumber}</Typography.Code>
                    </div>
                    <div>
                      <Typography.Paragraph size="xs" className="text-zinc-400 uppercase tracking-wider">Location</Typography.Paragraph>
                      <Typography.Paragraph size="sm" weight="medium" className="text-zinc-800">{locationName}</Typography.Paragraph>
                    </div>
                  </div>

                  <Controller
                    control={control}
                    name="price"
                    render={({ field }) => (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-zinc-700">
                          Price <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400 font-medium">
                            {currencySymbol}
                          </span>
                          <input
                            ref={priceInputRef}
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value === "" ? 0 : Number(e.target.value))}
                            className={cn(
                              "h-10 w-full rounded-xl border pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all",
                              errors.price ? "border-red-400 bg-red-50" : "border-zinc-200 hover:border-zinc-300"
                            )}
                          />
                        </div>
                        {errors.price && (
                          <Typography.Paragraph size="xs" className="text-red-500">{errors.price.message}</Typography.Paragraph>
                        )}
                      </div>
                    )}
                  />
                </Modal.Body>

                <Modal.Footer className="border-t border-zinc-100 bg-zinc-50/50 shrink-0">
                  <Button
                    variant="outline"
                    onPress={close}
                    isDisabled={isSubmitting}
                    className="bg-zinc-200 text-zinc-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    isDisabled={isSubmitting}
                    className="bg-indigo-600 text-white rounded-xl cursor-pointer font-medium"
                  >
                    {isSubmitting ? "Saving…" : existingPrice ? "Save Changes" : "Add Price"}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}
