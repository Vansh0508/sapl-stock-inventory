-- ============================================================
-- 017: ENABLE VECTOR EXTENSION AND ADD EMBEDDING COLUMNS
-- ============================================================

-- 1. Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add 512-dimensional vector embedding column to inventory_images
ALTER TABLE inventory_images 
ADD COLUMN IF NOT EXISTS embedding vector(512);

-- 3. Add 512-dimensional vector embedding column to catalog
ALTER TABLE catalog 
ADD COLUMN IF NOT EXISTS embedding vector(512);

-- 4. Create HNSW Cosine Similarity Index on inventory_images.embedding
CREATE INDEX IF NOT EXISTS idx_inventory_images_embedding_hnsw 
ON inventory_images 
USING hnsw (embedding vector_cosine_ops);

-- 5. Create HNSW Cosine Similarity Index on catalog.embedding
CREATE INDEX IF NOT EXISTS idx_catalog_embedding_hnsw 
ON catalog 
USING hnsw (embedding vector_cosine_ops);

-- Comments
COMMENT ON COLUMN inventory_images.embedding IS '512-dimensional CLIP vision vector embedding for pattern and color similarity search.';
COMMENT ON COLUMN catalog.embedding IS '512-dimensional CLIP text vector embedding for metadata specification similarity search.';
