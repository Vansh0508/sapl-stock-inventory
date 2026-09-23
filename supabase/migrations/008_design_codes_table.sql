-- ============================================================
--  008_design_codes_table.sql
--
--  Restructure: 1 design → many design codes.
--
--  Changes (all ADDITIVE — no data is destroyed):
--
--  1. Create the `design_codes` child table.
--  2. Migrate existing design_code column from `designs`
--     into `design_codes` child rows.
--  3. Drop view_catalog_full (references designs), then drop
--     the design_code column from `designs`.
--  4. Recreate view_catalog_full sourcing design_code from
--     catalog's own stored column (already denormalized).
--  5. Update fn_catalog_set_codes to look up design_code from
--     design_codes (respects caller's value; falls back to
--     first child). Also fixes the quality_code/design_code
--     overwrite bug: caller-supplied non-empty values are kept.
--  6. Fix fn_catalog_recompute_sku (broken since migration 007:
--     it still JOINed qualities for quality_prefix, which was
--     removed in 007). Now reads quality_prefix from
--     quality_codes matching catalog.quality_code, and
--     design_code from catalog's stored column.
--  7. Enable RLS + authenticated policies on design_codes.
--
--  Wrapped in a single transaction: failure rolls back all.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
--  1. Create design_codes child table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE design_codes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id   UUID        NOT NULL REFERENCES designs(id)
                                ON UPDATE CASCADE ON DELETE CASCADE,
    design_code VARCHAR(20) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  design_codes             IS 'Child codes belonging to a design. One design can have many codes.';
COMMENT ON COLUMN design_codes.design_code IS 'Short unique code, e.g. "D001", "D002".';

CREATE INDEX idx_design_codes_design_id ON design_codes(design_id);


-- ─────────────────────────────────────────────────────────────
--  2. Migrate existing design_code values into design_codes
-- ─────────────────────────────────────────────────────────────

INSERT INTO design_codes (design_id, design_code)
SELECT id, design_code
FROM   designs
WHERE  design_code IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
--  3. Drop view_catalog_full, then drop designs.design_code
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS view_catalog_full;

ALTER TABLE designs DROP COLUMN IF EXISTS design_code;


-- ─────────────────────────────────────────────────────────────
--  4. Recreate view_catalog_full
--     design_code is already denormalized on catalog — use it.
--     quality_prefix sourced from quality_codes (as in 007).
-- ─────────────────────────────────────────────────────────────

CREATE VIEW view_catalog_full AS
SELECT
    c.id,
    c.sku,
    c.product_code,
    c.quality_code,
    c.design_code,
    c.is_active,

    pt.product_name,
    s.size_label,
    'SO' || s.so_seq            AS so_number,
    q.quality_name,

    (
        SELECT qc.quality_prefix
        FROM   quality_codes qc
        WHERE  qc.quality_id   = q.id
          AND  qc.quality_code = c.quality_code
        LIMIT  1
    ) AS quality_prefix,

    d.design_name,
    col.collection_name,
    con.construction_name,

    (
        SELECT STRING_AGG(co.color_name, ' / ' ORDER BY co.color_name)
        FROM   catalog_colors cc
        JOIN   colors co ON co.id = cc.color_id
        WHERE  cc.catalog_id = c.id
    ) AS color_names,

    (
        SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
        FROM   catalog_colors cc
        JOIN   colors co ON co.id = cc.color_id
        WHERE  cc.catalog_id = c.id
    ) AS color_codes,

    (
        SELECT STRING_AGG(fl.fiber_name || ' ' || cf.percentage || '%', ', '
                          ORDER BY cf.percentage DESC)
        FROM   catalog_fibers cf
        JOIN   fiber_list fl ON fl.id = cf.fiber_id
        WHERE  cf.catalog_id = c.id
    ) AS fiber_configuration,

    c.created_at,
    c.updated_at

FROM catalog c
JOIN product_types  pt  ON pt.id  = c.product_type_id
JOIN sizes           s  ON s.id   = c.size_id
JOIN qualities       q  ON q.id   = c.quality_id
JOIN designs         d  ON d.id   = c.design_id
LEFT JOIN collections   col ON col.id = c.collection_id
LEFT JOIN constructions con ON con.id = c.construction_id;

COMMENT ON VIEW view_catalog_full IS 'Denormalized read view for the frontend. Joins all dimension tables and aggregates colors/fibers.';


-- ─────────────────────────────────────────────────────────────
--  5. Update fn_catalog_set_codes
--     - Looks up design_code from design_codes (first child).
--     - Respects caller's non-empty value for both quality_code
--       and design_code (COALESCE + NULLIF pattern).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_catalog_set_codes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_quality_code   VARCHAR(20);
    v_design_code    VARCHAR(20);
BEGIN
    -- Fallback quality_code: first child for this quality
    SELECT qc.quality_code
      INTO v_quality_code
      FROM quality_codes qc
     WHERE qc.quality_id = NEW.quality_id
     ORDER BY qc.created_at
     LIMIT 1;

    -- Fallback design_code: first child for this design
    SELECT dc.design_code
      INTO v_design_code
      FROM design_codes dc
     WHERE dc.design_id = NEW.design_id
     ORDER BY dc.created_at
     LIMIT 1;

    -- Respect caller's value; fall back to first child only when empty
    NEW.quality_code := COALESCE(NULLIF(NEW.quality_code, ''), v_quality_code, '');
    NEW.design_code  := COALESCE(NULLIF(NEW.design_code,  ''), v_design_code,  '');

    RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
--  6. Fix fn_catalog_recompute_sku
--     Was broken since migration 007: still JOINed qualities
--     for quality_prefix (column removed in 007) and designs
--     for design_code (column removed in this migration).
--
--     Now:
--     - quality_prefix: looked up from quality_codes row that
--       matches catalog.quality_code (user's chosen code).
--     - design_code: read from catalog's own stored column.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_catalog_recompute_sku()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cat_id         UUID;
    v_quality_prefix VARCHAR(10);
    v_design_code    VARCHAR(20);
    v_color_codes    VARCHAR(200);
    v_product_code   VARCHAR(100);
    v_so_number      TEXT;
    v_sku            VARCHAR(200);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_cat_id := OLD.catalog_id;
    ELSE
        v_cat_id := NEW.catalog_id;
    END IF;

    -- quality_prefix: from the quality_codes row matching the
    -- stored quality_code on this catalog entry.
    -- design_code: already stored on catalog — use directly.
    SELECT
        (SELECT qc.quality_prefix
         FROM   quality_codes qc
         WHERE  qc.quality_id   = c.quality_id
           AND  qc.quality_code = c.quality_code
         LIMIT  1),
        c.design_code
    INTO v_quality_prefix, v_design_code
    FROM catalog c
    WHERE c.id = v_cat_id;

    SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
    INTO   v_color_codes
    FROM   catalog_colors cc
    JOIN   colors co ON co.id = cc.color_id
    WHERE  cc.catalog_id = v_cat_id;

    v_product_code := COALESCE(v_quality_prefix, '') || v_design_code || COALESCE(v_color_codes, '');

    SELECT 'SO' || s.so_seq
    INTO   v_so_number
    FROM   catalog c
    JOIN   sizes s ON s.id = c.size_id
    WHERE  c.id = v_cat_id;

    v_sku := 'SA' || v_product_code || v_so_number;

    UPDATE catalog
    SET    product_code = v_product_code,
           sku          = v_sku,
           updated_at   = NOW()
    WHERE  id = v_cat_id;

    RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
--  7. RLS + grants on design_codes
-- ─────────────────────────────────────────────────────────────

ALTER TABLE design_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select design_codes"
  ON design_codes FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert design_codes"
  ON design_codes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update design_codes"
  ON design_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete design_codes"
  ON design_codes FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON design_codes TO anon, authenticated, service_role;


COMMIT;
