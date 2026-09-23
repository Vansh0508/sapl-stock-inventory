"use client"

import { useEffect } from "react"
import { supabase } from "./client"

/**
 * Subscribes to Postgres changes (insert/update/delete) on a public table and
 * invokes `onChange` whenever the table changes, so lists stay live without a
 * browser refresh. The table must be in the `supabase_realtime` publication.
 */
export function useTableRealtime(table: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`rt:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        onChange()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, onChange])
}
