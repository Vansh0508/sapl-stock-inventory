import type { FilterField } from "@/types/app.types"
import { supabase } from "@/lib/supabase/client"

export const catalogFilterFields: FilterField[] = [
  {
    key: "sku",
    label: "SKU",
    type: "text",
  },
  {
    key: "product_type_id",
    label: "Product type",
    type: "enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("product_types" as any) as any)
        .select("id, product_name, catalog!inner(id)")
        .order("product_name")
      if (error) throw error
      return ((data as any[]) || []).map((pt: any) => ({
        label: pt.product_name,
        value: pt.id,
      }))
    },
  },
  {
    key: "quality_id",
    label: "Quality",
    type: "enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("qualities" as any) as any)
        .select("id, quality_name, catalog!inner(id)")
        .order("quality_name")
      if (error) throw error
      return ((data as any[]) || []).map((q: any) => ({
        label: q.quality_name,
        value: q.id,
      }))
    },
  },
  {
    key: "design_id",
    label: "Design",
    type: "enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("designs" as any) as any)
        .select("id, design_name, catalog!inner(id)")
        .order("design_name")
      if (error) throw error
      return ((data as any[]) || []).map((d: any) => ({
        label: d.design_name,
        value: d.id,
      }))
    },
  },
  {
    key: "collection_id",
    label: "Collection",
    type: "enum_nullable",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("collections" as any) as any)
        .select("id, collection_name, catalog!inner(id)")
        .order("collection_name")
      if (error) throw error
      return ((data as any[]) || []).map((c: any) => ({
        label: c.collection_name,
        value: c.id,
      }))
    },
  },
  {
    key: "construction_id",
    label: "Construction",
    type: "enum_nullable",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("constructions" as any) as any)
        .select("id, construction_name, catalog!inner(id)")
        .order("construction_name")
      if (error) throw error
      return ((data as any[]) || []).map((c: any) => ({
        label: c.construction_name,
        value: c.id,
      }))
    },
  },
  {
    key: "color_ids",
    label: "Colors",
    type: "multi_enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("colors" as any) as any)
        .select("id, color_name, catalog_colors!inner(catalog!inner(is_active))")
        .eq("catalog_colors.catalog.is_active", true)
        .order("color_name")
      if (error) throw error
      return ((data as any[]) || []).map((c: any) => ({
        label: c.color_name,
        value: c.id,
      }))
    },
  },
  {
    key: "fiber_ids",
    label: "Fibers",
    type: "multi_enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("fiber_list" as any) as any)
        .select("id, fiber_name, catalog_fibers!inner(catalog_id)")
        .order("fiber_name")
      if (error) throw error
      return ((data as any[]) || []).map((f: any) => ({
        label: f.fiber_name,
        value: f.id,
      }))
    },
  },
  {
    key: "size_id",
    label: "Size",
    type: "enum",
    fetchOptions: async () => {
      const { data, error } = await (supabase
        .from("sizes" as any) as any)
        .select("id, size_label, catalog!inner(id)")
        .order("size_label")
      if (error) throw error
      return ((data as any[]) || []).map((s: any) => ({
        label: s.size_label,
        value: s.id,
      }))
    },
  },
  {
    key: "is_active",
    label: "Status",
    type: "boolean",
  },
  {
    key: "created_at",
    label: "Date added",
    type: "date",
  },
]

export const galleryFilterFields: FilterField[] = catalogFilterFields
