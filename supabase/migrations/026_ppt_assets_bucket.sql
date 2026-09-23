-- ============================================================
--  026_ppt_assets_bucket.sql
--
--  Creates public storage bucket: ppt-assets
--  Folders inside ppt-assets:
--    - cover-images/
--    - back-images/
--    - logo/
--    - grouper-images/
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ppt-assets', 'ppt-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ppt-assets bucket
CREATE POLICY "read ppt assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'ppt-assets');

CREATE POLICY "insert ppt assets"
ON storage.objects FOR INSERT
TO authenticated, anon, service_role
WITH CHECK (bucket_id = 'ppt-assets');

CREATE POLICY "update ppt assets"
ON storage.objects FOR UPDATE
TO authenticated, anon, service_role
WITH CHECK (bucket_id = 'ppt-assets');

CREATE POLICY "delete ppt assets"
ON storage.objects FOR DELETE
TO authenticated, anon, service_role
USING (bucket_id = 'ppt-assets');
