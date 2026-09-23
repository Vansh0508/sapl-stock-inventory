-- ============================================================
--  INVENTORY IMAGES TABLE
-- ============================================================

CREATE TABLE inventory_images (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID         NOT NULL REFERENCES inventory(id) ON UPDATE CASCADE ON DELETE CASCADE,
    storage_path VARCHAR(500) NOT NULL,
    public_url   VARCHAR(500) NOT NULL,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_images_inventory_id ON inventory_images(inventory_id);

COMMENT ON TABLE  inventory_images              IS 'Stores references to image uploads for physical inventory items.';
COMMENT ON COLUMN inventory_images.storage_path  IS 'Relative file path inside the Supabase Storage bucket.';
COMMENT ON COLUMN inventory_images.public_url    IS 'Full public URL resolving the image.';
COMMENT ON COLUMN inventory_images.sort_order    IS 'Sort order weight for display sequences.';


-- ============================================================
--  STORAGE BUCKET: inventory-images
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-images', 'inventory-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for inventory-images bucket
CREATE POLICY "read inventory images"
ON storage.objects FOR SELECT
USING (bucket_id = 'inventory-images');

CREATE POLICY "insert inventory images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inventory-images');

CREATE POLICY "update inventory images"
ON storage.objects FOR UPDATE
TO authenticated
WITH CHECK (bucket_id = 'inventory-images');

CREATE POLICY "delete inventory images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inventory-images');
