-- ============================================================
--  007_quality_codes_table.sql
--
--  Restructure: 1 quality → many quality codes.
--
--  Changes (all ADDITIVE — no data is destroyed):
--
--  1. Create the `quality_codes` child table.
--  2. Migrate existing quality_code + quality_prefix columns
--     from `qualities` into `quality_codes` child rows.
--  3. Drop the now-redundant columns from `qualities` — must
--     first drop then recreate view_catalog_full (which
--     references quality_prefix on qualities).
--  4. Recreate view_catalog_full sourcing quality_prefix from
--     quality_codes (first child, by created_at).
--  5. Update the catalog trigger fn_catalog_set_codes to
--     look up quality_code from quality_codes.
--  6. Enable RLS + authenticated policies on quality_codes.
--
--  Wrapped in a single transaction: failure rolls back all.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
--  1. Create quality_codes child table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE quality_codes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_id     UUID         NOT NULL REFERENCES qualities(id)
                                    ON UPDATE CASCADE ON DELETE CASCADE,
    quality_code   VARCHAR(20)  NOT NULL UNIQUE,
    quality_prefix VARCHAR(10)  NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  quality_codes                IS 'Child codes belonging to a quality grade. One quality can have many codes.';
COMMENT ON COLUMN quality_codes.quality_code   IS 'Short unique code, e.g. "Q100", "Q200".';
COMMENT ON COLUMN quality_codes.quality_prefix IS 'Prefix for the Product Code formula, e.g. "SA", "SB".';

CREATE INDEX idx_quality_codes_quality_id ON quality_codes(quality_id);


-- ─────────────────────────────────────────────────────────────
--  2. Migrate existing quality_code + quality_prefix into
--     quality_codes child rows (one child per existing quality)
-- ─────────────────────────────────────────────────────────────

INSERT INTO quality_codes (quality_id, quality_code, quality_prefix)
SELECT id, quality_code, quality_prefix
FROM   qualities
WHERE  quality_code   IS NOT NULL
  AND  quality_prefix IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
--  3. Drop view_catalog_full (references quality_prefix on
--     qualities), then drop the columns.
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS view_catalog_full;

ALTER TABLE qualities DROP COLUMN IF EXISTS quality_code;
ALTER TABLE qualities DROP COLUMN IF EXISTS quality_prefix;


-- ─────────────────────────────────────────────────────────────
--  4. Recreate view_catalog_full — quality_prefix is now
--     sourced from the first quality_codes child row.
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

    -- Sourced from first quality_codes child (by created_at)
    (
        SELECT qc.quality_prefix
        FROM   quality_codes qc
        WHERE  qc.quality_id = q.id
        ORDER  BY qc.created_at
        LIMIT  1
    ) AS quality_prefix,

    d.design_name,
    col.collection_name,
    con.construction_name,

    -- Aggregated colors as display string
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

    -- Aggregated fiber configuration as display string
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
LEFT JOIN collections col ON col.id = c.collection_id
LEFT JOIN constructions con ON con.id = c.construction_id;

COMMENT ON VIEW view_catalog_full IS 'Denormalized read view for the frontend. Joins all dimension tables and aggregates colors/fibers.';


-- ─────────────────────────────────────────────────────────────
--  5. Update catalog trigger: look up quality_code from
--     quality_codes (first child) instead of qualities.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_catalog_set_codes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_quality_code   VARCHAR(20);
    v_design_code    VARCHAR(20);
BEGIN
    -- Pick the first quality_code child for this quality
    SELECT qc.quality_code
      INTO v_quality_code
      FROM quality_codes qc
     WHERE qc.quality_id = NEW.quality_id
     ORDER BY qc.created_at
     LIMIT 1;

    SELECT design_code INTO v_design_code FROM designs WHERE id = NEW.design_id;

    NEW.quality_code := COALESCE(v_quality_code, '');
    NEW.design_code  := v_design_code;

    RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────
--  6. RLS + grants on quality_codes
-- ─────────────────────────────────────────────────────────────

ALTER TABLE quality_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can select quality_codes"
  ON quality_codes FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert quality_codes"
  ON quality_codes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can update quality_codes"
  ON quality_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can delete quality_codes"
  ON quality_codes FOR DELETE TO authenticated USING (true);

-- Mirror the grant from migration 003
GRANT SELECT, INSERT, UPDATE, DELETE ON quality_codes TO anon, authenticated, service_role;


COMMIT;
