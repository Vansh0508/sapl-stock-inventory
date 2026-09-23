-- Migration to change the SKU formula to hyphen-separated segments:
--   SA-{PRODUCT_CODE}-{SIZE_CODE}   e.g. SA-QDXCOLX-SO12
-- Previously: SA{PRODUCT_CODE}{SIZE_CODE} with no separators.
-- Additive only: replaces the trigger function and reformats existing sku
-- values in place — no rows dropped, no columns removed.

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
    -- Determine which catalog row to update
    IF TG_OP = 'DELETE' THEN
        v_cat_id := OLD.catalog_id;
    ELSE
        v_cat_id := NEW.catalog_id;
    END IF;

    -- Gather components
    SELECT q.quality_prefix, d.design_code
    INTO   v_quality_prefix, v_design_code
    FROM   catalog c
    JOIN   qualities q ON q.id = c.quality_id
    JOIN   designs   d ON d.id = c.design_id
    WHERE  c.id = v_cat_id;

    -- Aggregate color codes sorted for determinism, joined by X
    SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
    INTO   v_color_codes
    FROM   catalog_colors cc
    JOIN   colors co ON co.id = cc.color_id
    WHERE  cc.catalog_id = v_cat_id;

    v_product_code := v_quality_prefix || v_design_code || COALESCE(v_color_codes, '');

    -- SO number from sizes
    SELECT 'SO' || s.so_seq
    INTO   v_so_number
    FROM   catalog c
    JOIN   sizes s ON s.id = c.size_id
    WHERE  c.id = v_cat_id;

    v_sku := 'SA-' || v_product_code || '-' || v_so_number;

    UPDATE catalog
    SET    product_code = v_product_code,
           sku          = v_sku,
           updated_at   = NOW()
    WHERE  id = v_cat_id;

    RETURN NEW;
END;
$$;

COMMENT ON COLUMN catalog.sku IS 'Formula: SA-{product_code}-SO{so_seq}. Written by trigger. Globally unique.';

-- Backfill existing rows to the new hyphenated format.
UPDATE catalog c
SET    sku        = 'SA-' || c.product_code || '-SO' || s.so_seq,
       updated_at = NOW()
FROM   sizes s
WHERE  s.id = c.size_id
  AND  c.product_code <> '';
