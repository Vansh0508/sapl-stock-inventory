"use client"

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form"
import { TextField, Input, Label, FieldError } from "@heroui/react"

interface FormTextFieldProps<T extends FieldValues> {
  control: Control<T>
  name: Path<T>
  label: string
  placeholder?: string
  /** Validation error message, if any. */
  error?: string
  type?: string
}

/**
 * Controlled text field bridging React Hook Form and HeroUI's TextField.
 * HeroUI/react-aria fields manage their own value state, so they must be driven
 * via `value`/`onChange` (Controller) — using `register` alone leaves edit
 * forms blank because reset() can't reach react-aria's internal state.
 */
export default function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  error,
  type,
}: FormTextFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          isInvalid={!!error}
          value={(field.value as string | undefined) ?? ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          className="w-full flex flex-col gap-1.5"
        >
          <Label className="text-xs font-semibold text-zinc-700">{label}</Label>
          <Input
            ref={field.ref}
            type={type}
            placeholder={placeholder}
            variant="primary"
            className="w-full text-zinc-900 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl px-3.5 h-11 text-sm transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <FieldError className="text-xs text-red-500 font-medium">{error}</FieldError>
        </TextField>
      )}
    />
  )
}
