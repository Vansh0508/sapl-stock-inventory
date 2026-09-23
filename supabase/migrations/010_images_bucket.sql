-- ============================================================
--  IMAGES STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for images bucket
CREATE POLICY "read images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

CREATE POLICY "insert images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images');

CREATE POLICY "update images"
ON storage.objects FOR UPDATE
TO authenticated
WITH CHECK (bucket_id = 'images');

CREATE POLICY "delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'images');
