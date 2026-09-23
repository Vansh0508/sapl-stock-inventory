-- ============================================================
--  009_fix_design_codes_unique.sql
--
--  Allow duplicate design codes across different design names.
--  Changes the unique constraint on design_codes from 
--  (design_code) to (design_id, design_code).
-- ============================================================

BEGIN;

DO $$
DECLARE
    conname text;
BEGIN
    SELECT tc.constraint_name INTO conname
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'design_codes'
      AND ccu.column_name = 'design_code'
      AND tc.constraint_type = 'UNIQUE'
      -- Ensure it's a single column unique constraint to avoid dropping a composite one by accident
      AND (
          SELECT COUNT(*) 
          FROM information_schema.constraint_column_usage ccu2 
          WHERE ccu2.constraint_name = tc.constraint_name
      ) = 1;

    IF conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE design_codes DROP CONSTRAINT ' || conname;
    END IF;
END $$;

ALTER TABLE design_codes ADD CONSTRAINT design_codes_design_id_design_code_key UNIQUE (design_id, design_code);

COMMIT;
