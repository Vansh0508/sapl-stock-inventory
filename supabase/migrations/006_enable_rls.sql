-- ============================================================
--  006_enable_rls.sql
--  Enable Row Level Security on all application tables and
--  create CRUD policies for the `authenticated` role.
--
--  Strategy
--  ─────────
--  • RLS is enabled on every table.
--  • A single permissive policy per operation is created for
--    the `authenticated` role (SELECT / INSERT / UPDATE / DELETE).
--  • The `anon` role retains the GRANT from migration 003 but
--    will be blocked by RLS unless explicit anon policies are
--    added later.
--  • `service_role` bypasses RLS by Supabase convention and
--    is unaffected.
--
--  ADDITIVE ONLY — no tables, columns, or data are modified.
-- ============================================================


-- ============================================================
--  Helper: enable RLS + four CRUD policies for one table.
--  Called once per table below for clarity and safety.
-- ============================================================


-- ───────────────────────────────────────────
--  1. currencies
-- ───────────────────────────────────────────
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select currencies"
  ON currencies FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert currencies"
  ON currencies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update currencies"
  ON currencies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete currencies"
  ON currencies FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  2. product_types
-- ───────────────────────────────────────────
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select product_types"
  ON product_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert product_types"
  ON product_types FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update product_types"
  ON product_types FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete product_types"
  ON product_types FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  3. lengths
-- ───────────────────────────────────────────
ALTER TABLE lengths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select lengths"
  ON lengths FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert lengths"
  ON lengths FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update lengths"
  ON lengths FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete lengths"
  ON lengths FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  4. widths
-- ───────────────────────────────────────────
ALTER TABLE widths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select widths"
  ON widths FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert widths"
  ON widths FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update widths"
  ON widths FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete widths"
  ON widths FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  5. sizes
-- ───────────────────────────────────────────
ALTER TABLE sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select sizes"
  ON sizes FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert sizes"
  ON sizes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update sizes"
  ON sizes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete sizes"
  ON sizes FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  6. constructions
-- ───────────────────────────────────────────
ALTER TABLE constructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select constructions"
  ON constructions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert constructions"
  ON constructions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update constructions"
  ON constructions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete constructions"
  ON constructions FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  7. fiber_list
-- ───────────────────────────────────────────
ALTER TABLE fiber_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select fiber_list"
  ON fiber_list FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert fiber_list"
  ON fiber_list FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update fiber_list"
  ON fiber_list FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete fiber_list"
  ON fiber_list FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  8. qualities
-- ───────────────────────────────────────────
ALTER TABLE qualities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select qualities"
  ON qualities FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert qualities"
  ON qualities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update qualities"
  ON qualities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete qualities"
  ON qualities FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  9. designs
-- ───────────────────────────────────────────
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select designs"
  ON designs FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert designs"
  ON designs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update designs"
  ON designs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete designs"
  ON designs FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  10. collections
-- ───────────────────────────────────────────
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select collections"
  ON collections FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert collections"
  ON collections FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update collections"
  ON collections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete collections"
  ON collections FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  11. colors
-- ───────────────────────────────────────────
ALTER TABLE colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select colors"
  ON colors FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert colors"
  ON colors FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update colors"
  ON colors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete colors"
  ON colors FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  12. catalog
-- ───────────────────────────────────────────
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select catalog"
  ON catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert catalog"
  ON catalog FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update catalog"
  ON catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete catalog"
  ON catalog FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  13. catalog_colors
-- ───────────────────────────────────────────
ALTER TABLE catalog_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select catalog_colors"
  ON catalog_colors FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert catalog_colors"
  ON catalog_colors FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update catalog_colors"
  ON catalog_colors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete catalog_colors"
  ON catalog_colors FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  14. catalog_fibers
-- ───────────────────────────────────────────
ALTER TABLE catalog_fibers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select catalog_fibers"
  ON catalog_fibers FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert catalog_fibers"
  ON catalog_fibers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update catalog_fibers"
  ON catalog_fibers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete catalog_fibers"
  ON catalog_fibers FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  15. locations
-- ───────────────────────────────────────────
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select locations"
  ON locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert locations"
  ON locations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update locations"
  ON locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete locations"
  ON locations FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  16. inventory
-- ───────────────────────────────────────────
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select inventory"
  ON inventory FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert inventory"
  ON inventory FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update inventory"
  ON inventory FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete inventory"
  ON inventory FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  17. prices
-- ───────────────────────────────────────────
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select prices"
  ON prices FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert prices"
  ON prices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update prices"
  ON prices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete prices"
  ON prices FOR DELETE TO authenticated USING (true);


-- ───────────────────────────────────────────
--  18. inventory_images
-- ───────────────────────────────────────────
ALTER TABLE inventory_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select inventory_images"
  ON inventory_images FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert inventory_images"
  ON inventory_images FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update inventory_images"
  ON inventory_images FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete inventory_images"
  ON inventory_images FOR DELETE TO authenticated USING (true);
