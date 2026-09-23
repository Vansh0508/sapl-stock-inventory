"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { motion, AnimatePresence } from "motion/react"
import { Button, Input, TextField, Label, FieldError, toast, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import Logo from "@/components/shared/Logo"

const authSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type AuthFormData = z.infer<typeof authSchema>

const LoginForm = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect") || "/products"

  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthFormData>({ resolver: zodResolver(authSchema) })

  const onSubmit = async (formData: AuthFormData) => {
    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })
      if (error) throw error
      // Cookies are now set by the browser client; refresh so the server
      // (proxy + RSC) sees the new session, then navigate in.
      router.replace(redirectTo)
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Sign in failed: ${msg}`)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#141937] px-4 py-10 relative overflow-hidden">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-pink-600/20 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative w-full max-w-md"
      >
        <div className="bg-white rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
          {/* Brand Header */}
          <div className="flex flex-col items-center gap-5 px-8 pt-10 pb-6">
            <Logo height={30} priority />
            <div className="text-center">
              <Typography.Heading level={1} className="text-xl text-zinc-900">Welcome back</Typography.Heading>
              <Typography.Paragraph size="xs" className="text-zinc-500 mt-1">
                Inventory Management System
              </Typography.Paragraph>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="px-8 pt-2 pb-8 flex flex-col gap-4">
            <TextField isInvalid={!!errors.email} className="w-full flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-zinc-700">Email</Label>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                variant="primary"
                className="w-full text-zinc-900 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl px-3.5 h-11 text-sm transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                {...register("email")}
              />
              <FieldError className="text-xs text-red-500 font-medium">
                {errors.email?.message}
              </FieldError>
            </TextField>

            <TextField isInvalid={!!errors.password} className="w-full flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-zinc-700">Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  variant="primary"
                  className="w-full text-zinc-900 bg-white border border-zinc-200/80 hover:border-zinc-300 rounded-xl px-3.5 pr-11 h-11 text-sm transition-colors focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              <FieldError className="text-xs text-red-500 font-medium">
                {errors.password?.message}
              </FieldError>
            </TextField>

            <Button
              type="submit"
              variant="primary"
              isDisabled={isSubmitting}
              className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium h-11 cursor-pointer"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isSubmitting ? "loading" : "idle"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  {isSubmitting ? "Signing in..." : "Sign In"}
                </motion.span>
              </AnimatePresence>
            </Button>

            <Typography.Paragraph size="xs" align="center" className="text-zinc-400 mt-1">
              Access is restricted to authorized accounts.
            </Typography.Paragraph>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#141937]" />}>
      <LoginForm />
    </Suspense>
  )
}
