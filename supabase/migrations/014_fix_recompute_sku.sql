-- Migration to fix the fn_catalog_recompute_sku trigger function to:
-- 1. Source quality_prefix from quality_codes and design_code from catalog instead of non-existent columns.
-- 2. Support being called from both 'catalog' (BEFORE INSERT/UPDATE) and 'catalog_colors' (AFTER INSERT/UPDATE/DELETE) tables.
-- 3. Add a trigger to 'catalog' table BEFORE INSERT OR UPDATE to compute initial SKU immediately and prevent empty SKU duplicate constraints.

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
    IF TG_TABLE_NAME = 'catalog' THEN
        -- BEFORE INSERT OR UPDATE trigger on catalog
        
        -- Sourced quality_prefix from quality_codes
        SELECT qc.quality_prefix
          INTO v_quality_prefix
          FROM quality_codes qc
         WHERE qc.quality_id = NEW.quality_id
           AND qc.quality_code = NEW.quality_code
         LIMIT 1;

        -- Aggregate colors
        SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
          INTO v_color_codes
          FROM catalog_colors cc
          JOIN colors co ON co.id = cc.color_id
         WHERE cc.catalog_id = NEW.id;

        v_product_code := COALESCE(v_quality_prefix, '') || NEW.design_code || COALESCE(v_color_codes, '');

        -- SO number
        SELECT 'SO' || s.so_seq
          INTO v_so_number
          FROM sizes s
         WHERE s.id = NEW.size_id;

        NEW.product_code := v_product_code;
        NEW.sku          := 'SA-' || v_product_code || '-' || v_so_number;
        NEW.updated_at   := NOW();

        RETURN NEW;
    ELSE
        -- AFTER INSERT OR UPDATE OR DELETE trigger on catalog_colors
        v_cat_id := COALESCE(NEW.catalog_id, OLD.catalog_id);

        -- Gather components
        SELECT
            (SELECT qc.quality_prefix
               FROM quality_codes qc
              WHERE qc.quality_id = c.quality_id
                AND qc.quality_code = c.quality_code
              LIMIT 1),
            c.design_code
        INTO   v_quality_prefix, v_design_code
        FROM   catalog c
        WHERE  c.id = v_cat_id;

        -- Aggregate color codes
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

        v_sku := 'SA-' || v_product_code || '-' || v_so_number;

        UPDATE catalog
        SET    product_code = v_product_code,
               sku          = v_sku,
               updated_at   = NOW()
        WHERE  id = v_cat_id;

        RETURN NEW;
    END IF;
END;
$$;

-- Add BEFORE INSERT OR UPDATE trigger on catalog table
DROP TRIGGER IF EXISTS trg_catalog_recompute_sku ON catalog;
CREATE TRIGGER trg_catalog_recompute_sku
BEFORE INSERT OR UPDATE OF quality_id, quality_code, design_id, design_code, size_id ON catalog
FOR EACH ROW EXECUTE FUNCTION fn_catalog_recompute_sku();
