-- ============================================================
-- 019: MAKE INVENTORY_ID NULLABLE IN INVENTORY_IMAGES & ADD UNIQUE INDEX
-- Allows standalone Content Library images (unassigned to inventory items)
-- to be vector-indexed for similarity search.
-- ============================================================

ALTER TABLE inventory_images 
ALTER COLUMN inventory_id DROP NOT NULL;

-- Create unique index on storage_path for upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_images_storage_path 
ON inventory_images (storage_path);
