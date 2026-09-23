-- ============================================================
-- ALL-IN-ONE SUPABASE VECTOR SETUP SCRIPT
-- Paste and RUN this entire script in your Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to inventory_images table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory_images' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE inventory_images ADD COLUMN embedding vector(512);
  END IF;
END $$;

-- 3. Make inventory_id in inventory_images nullable for standalone Content Library images
ALTER TABLE inventory_images ALTER COLUMN inventory_id DROP NOT NULL;

-- 4. Add embedding column to catalog table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'catalog' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE catalog ADD COLUMN embedding vector(512);
  END IF;
END $$;

-- 4b. Add is_verified column to catalog table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'catalog' AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE catalog ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 4c. Add is_verified column to inventory table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE inventory ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 5. Create storage_image_vectors table (for Supabase Storage Vector search)
CREATE TABLE IF NOT EXISTS storage_image_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL DEFAULT 'images',
  storage_path TEXT UNIQUE NOT NULL,
  public_url TEXT NOT NULL,
  embedding vector(512),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Disable RLS & Grant permissions to ensure PostgREST writes succeed
ALTER TABLE storage_image_vectors DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_images DISABLE ROW LEVEL SECURITY;
ALTER TABLE catalog DISABLE ROW LEVEL SECURITY;

GRANT ALL ON storage_image_vectors TO anon, authenticated, service_role;
GRANT ALL ON inventory_images TO anon, authenticated, service_role;
GRANT ALL ON catalog TO anon, authenticated, service_role;

-- 7. Create HNSW Cosine Similarity Indexes for ultra-fast vector search
CREATE INDEX IF NOT EXISTS idx_inventory_images_embedding_hnsw 
ON inventory_images USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_embedding_hnsw 
ON catalog USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_storage_image_vectors_hnsw 
ON storage_image_vectors USING hnsw (embedding vector_cosine_ops);

-- 8. Drop previous RPC function signatures if return type changed
DROP FUNCTION IF EXISTS match_storage_images(vector, double precision, integer, text);
DROP FUNCTION IF EXISTS match_storage_images;

DROP FUNCTION IF EXISTS match_similar_images(vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS match_similar_images;

DROP FUNCTION IF EXISTS match_similar_catalog(vector, double precision, integer, uuid);
DROP FUNCTION IF EXISTS match_similar_catalog;

-- 9. Create match_storage_images RPC function
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

-- 10. Create match_similar_images RPC function
CREATE OR REPLACE FUNCTION match_similar_images(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 20,
  exclude_image_id uuid DEFAULT NULL
)
RETURNS TABLE (
  image_id uuid,
  inventory_id uuid,
  storage_path text,
  public_url text,
  similarity float,
  sku text,
  serial_number text,
  product_name text,
  quality_name text,
  design_name text,
  color_names text,
  collection_name text,
  size_label text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    img.id AS image_id,
    img.inventory_id,
    img.storage_path,
    img.public_url,
    (1 - (img.embedding <=> query_embedding))::float AS similarity,
    cat.sku,
    inv.serial_number,
    pt.product_name,
    q.quality_name,
    d.design_name,
    COALESCE(
      (
        SELECT string_agg(c.color_name, ', ')
        FROM catalog_colors cc
        JOIN colors c ON c.id = cc.color_id
        WHERE cc.catalog_id = cat.id
      ),
      ''
    ) AS color_names,
    col.collection_name,
    s.size_label
  FROM inventory_images img
  LEFT JOIN inventory inv ON inv.id = img.inventory_id
  LEFT JOIN catalog cat ON cat.id = inv.catalog_id
  LEFT JOIN product_types pt ON pt.id = cat.product_type_id
  LEFT JOIN qualities q ON q.id = cat.quality_id
  LEFT JOIN designs d ON d.id = cat.design_id
  LEFT JOIN collections col ON col.id = cat.collection_id
  LEFT JOIN sizes s ON s.id = cat.size_id
  WHERE img.embedding IS NOT NULL
    AND (exclude_image_id IS NULL OR img.id <> exclude_image_id)
    AND (1 - (img.embedding <=> query_embedding)) >= match_threshold
  ORDER BY img.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 11. Create match_similar_catalog RPC function
CREATE OR REPLACE FUNCTION match_similar_catalog(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 20,
  exclude_catalog_id uuid DEFAULT NULL
)
RETURNS TABLE (
  catalog_id uuid,
  sku text,
  product_name text,
  quality_name text,
  design_name text,
  color_names text,
  collection_name text,
  size_label text,
  construction_name text,
  fiber_configuration text,
  similarity float,
  sample_image_url text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS catalog_id,
    c.sku,
    pt.product_name,
    q.quality_name,
    d.design_name,
    COALESCE(
      (
        SELECT string_agg(col.color_name, ', ')
        FROM catalog_colors cc
        JOIN colors col ON col.id = cc.color_id
        WHERE cc.catalog_id = c.id
      ),
      ''
    ) AS color_names,
    col.collection_name,
    s.size_label,
    con.construction_name,
    COALESCE(
      (
        SELECT string_agg(f.fiber_name || ' (' || cf.percentage || '%)', ', ')
        FROM catalog_fibers cf
        JOIN fiber_list f ON f.id = cf.fiber_id
        WHERE cf.catalog_id = c.id
      ),
      ''
    ) AS fiber_configuration,
    (1 - (c.embedding <=> query_embedding))::float AS similarity,
    (
      SELECT img.public_url
      FROM inventory inv
      JOIN inventory_images img ON img.inventory_id = inv.id
      WHERE inv.catalog_id = c.id
      ORDER BY img.sort_order ASC
      LIMIT 1
    ) AS sample_image_url
  FROM catalog c
  LEFT JOIN product_types pt ON pt.id = c.product_type_id
  LEFT JOIN qualities q ON q.id = c.quality_id
  LEFT JOIN designs d ON d.id = c.design_id
  LEFT JOIN collections col ON col.id = c.collection_id
  LEFT JOIN sizes s ON s.id = c.size_id
  LEFT JOIN constructions con ON con.id = c.construction_id
  WHERE c.embedding IS NOT NULL
    AND (exclude_catalog_id IS NULL OR c.id <> exclude_catalog_id)
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
