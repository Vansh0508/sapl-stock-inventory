"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast, Typography } from "@heroui/react"
import { supabase } from "@/lib/supabase/client"
import { ArrowRightFromSquare } from "@gravity-ui/icons"

/**
 * Sidebar footer control: shows the signed-in user's email and signs them out.
 * After sign-out it refreshes so middleware redirects to /login.
 */
export default function SignOutButton() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.replace("/login")
      router.refresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.danger(`Sign out failed: ${msg}`)
      setIsSigningOut(false)
    }
  }

  return (
    <div className="border-t border-indigo-950/40 p-4">
      {email && (
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-200 uppercase shrink-0">
            {email.charAt(0)}
          </div>
          <Typography.Paragraph
            size="xs"
            truncate
            className="text-indigo-200/70"
            title={email}
          >
            {email}
          </Typography.Paragraph>
        </div>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-indigo-200/80 hover:bg-indigo-500/10 hover:text-white transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowRightFromSquare width="18" height="18" className="text-indigo-300" aria-hidden="true" />
        <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
      </button>
    </div>
  )
}
