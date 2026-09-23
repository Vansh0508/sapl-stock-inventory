-- ============================================================
-- 020: SUPABASE STORAGE VECTOR INDEX FOR IMAGES BUCKET
-- According to Supabase Storage Vector introduction guide.
-- Links storage objects in 'images' bucket to 512-dim CLIP vectors
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- Table mapping Supabase Storage objects to vector embeddings
CREATE TABLE IF NOT EXISTS storage_image_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_object_id UUID REFERENCES storage.objects(id) ON DELETE CASCADE,
  bucket_id TEXT NOT NULL DEFAULT 'images',
  storage_path TEXT UNIQUE NOT NULL,
  public_url TEXT NOT NULL,
  embedding vector(512),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for storage_path lookups
CREATE INDEX IF NOT EXISTS idx_storage_image_vectors_path 
ON storage_image_vectors (storage_path);

-- Fast HNSW Cosine Similarity Index for instant vector search
CREATE INDEX IF NOT EXISTS idx_storage_image_vectors_hnsw 
ON storage_image_vectors 
USING hnsw (embedding vector_cosine_ops);

-- RPC for searching similar storage images
CREATE OR REPLACE FUNCTION match_storage_images(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 20,
  exclude_path text DEFAULT NULL
)
RETURNS TABLE (
  storage_path text,
  public_url text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.storage_path,
    v.public_url,
    (1 - (v.embedding <=> query_embedding))::float AS similarity
  FROM storage_image_vectors v
  WHERE v.embedding IS NOT NULL
    AND (exclude_path IS NULL OR v.storage_path <> exclude_path)
    AND (1 - (v.embedding <=> query_embedding)) >= match_threshold
  ORDER BY v.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
