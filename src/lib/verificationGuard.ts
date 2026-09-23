import { supabase } from "@/lib/supabase/client"
import { useVerificationStore } from "@/stores/verificationStore"

/**
 * Wraps a mutation that may add, move, or remove a Serial Number under one or more SKUs.
 * A DB trigger auto-resets any affected SKU's `is_verified` back to false as a side effect
 * of that mutation — this looks up which of the given SKUs were verified beforehand and,
 * if the mutation succeeds, surfaces them via the shared re-approval acknowledgment modal.
 */
export async function runWithVerificationGuard<T>(
  catalogIds: Array<string | null | undefined>,
  action: () => Promise<T>
): Promise<T> {
  const ids = Array.from(new Set(catalogIds.filter((id): id is string => !!id)))

  let previouslyVerifiedSkus: string[] = []
  if (ids.length > 0) {
    const { data } = await (supabase.from("catalog" as any) as any).select("sku, is_verified").in("id", ids)
    previouslyVerifiedSkus = ((data as any[]) ?? [])
      .filter((r: any) => r.is_verified && r.sku)
      .map((r: any) => r.sku as string)
  }

  const result = await action()

  if (previouslyVerifiedSkus.length > 0) {
    useVerificationStore.getState().addPending(previouslyVerifiedSkus)
  }

  return result
}
