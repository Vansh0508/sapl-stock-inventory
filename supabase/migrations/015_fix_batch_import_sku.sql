-- Migration to allow bulk/batch catalog insertion without SKU collisions.
-- Redefine fn_catalog_recompute_sku to assign a temporary unique SKU on INSERT.
-- This gets cleaned up to the correct value once color mapping rows are inserted.

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

        -- Aggregate colors (will be empty on initial INSERT because colors are inserted after catalog)
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
        
        IF TG_OP = 'INSERT' THEN
            -- Assign temporary unique SKU to avoid unique constraints during batch imports
            NEW.sku := 'SA-' || v_product_code || '-' || v_so_number || '-TEMP-' || SUBSTRING(NEW.id::text FROM 1 FOR 8);
        ELSE
            -- Clean SKU on UPDATE (when colors already exist in the database)
            NEW.sku := 'SA-' || v_product_code || '-' || v_so_number;
        END IF;

        NEW.updated_at := NOW();
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

        -- This update will trigger the BEFORE UPDATE on catalog, cleaning up the SKU
        UPDATE catalog
        SET    product_code = v_product_code,
               sku          = v_sku,
               updated_at   = NOW()
        WHERE  id = v_cat_id;

        RETURN NEW;
    END IF;
END;
$$;
