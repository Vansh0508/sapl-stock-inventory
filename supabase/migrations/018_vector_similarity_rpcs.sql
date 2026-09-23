-- ============================================================
-- 018: VECTOR SIMILARITY SEARCH RPC FUNCTIONS
-- ============================================================

-- 1. Match Similar Images (Image-to-Image / Pattern Similarity)
CREATE OR REPLACE FUNCTION match_similar_images(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 20,
  exclude_image_id uuid DEFAULT NULL
)
RETURNS TABLE (
  image_id uuid,
  inventory_id uuid,
  storage_path varchar(500),
  public_url varchar(500),
  similarity float,
  sku varchar(200),
  serial_number varchar(100),
  product_name text,
  quality_name varchar(100),
  design_name varchar(100),
  color_names text,
  collection_name varchar(100),
  size_label varchar(50)
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    img.id AS image_id,
    img.inventory_id,
    img.storage_path,
    img.public_url,
    (1 - (img.embedding <=> query_embedding))::float AS similarity,
    vig.sku,
    vig.serial_number,
    vig.product_name,
    vig.quality_name,
    vig.design_name,
    vig.color_names,
    vig.collection_name,
    vig.size_label
  FROM inventory_images img
  LEFT JOIN view_inventory_gallery vig ON vig.id = img.inventory_id
  WHERE img.embedding IS NOT NULL
    AND (exclude_image_id IS NULL OR img.id <> exclude_image_id)
    AND (1 - (img.embedding <=> query_embedding)) >= match_threshold
  ORDER BY img.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 2. Match Similar Catalog SKUs (Metadata / Data-Point Similarity)
CREATE OR REPLACE FUNCTION match_similar_catalog(
  query_embedding vector(512),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 20,
  exclude_catalog_id uuid DEFAULT NULL
)
RETURNS TABLE (
  catalog_id uuid,
  sku varchar(200),
  product_name text,
  quality_name varchar(100),
  design_name varchar(100),
  color_names text,
  collection_name varchar(100),
  size_label varchar(50),
  construction_name varchar(100),
  fiber_configuration text,
  similarity float,
  sample_image_url varchar(500)
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS catalog_id,
    vcf.sku,
    vcf.product_name,
    vcf.quality_name,
    vcf.design_name,
    vcf.color_names,
    vcf.collection_name,
    vcf.size_label,
    vcf.construction_name,
    vcf.fiber_configuration,
    (1 - (c.embedding <=> query_embedding))::float AS similarity,
    (
      SELECT img.public_url 
      FROM inventory i 
      JOIN inventory_images img ON img.inventory_id = i.id 
      WHERE i.catalog_id = c.id 
      ORDER BY img.sort_order ASC, img.created_at ASC 
      LIMIT 1
    ) AS sample_image_url
  FROM catalog c
  JOIN view_catalog_full vcf ON vcf.id = c.id
  WHERE c.embedding IS NOT NULL
    AND (exclude_catalog_id IS NULL OR c.id <> exclude_catalog_id)
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 3. Get Vector Indexing Stats for Dashboard / Manage Tab
CREATE OR REPLACE FUNCTION get_vector_indexing_stats()
RETURNS TABLE (
  total_images bigint,
  indexed_images bigint,
  total_catalog bigint,
  indexed_catalog bigint
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM inventory_images)::bigint AS total_images,
    (SELECT COUNT(*) FROM inventory_images WHERE embedding IS NOT NULL)::bigint AS indexed_images,
    (SELECT COUNT(*) FROM catalog)::bigint AS total_catalog,
    (SELECT COUNT(*) FROM catalog WHERE embedding IS NOT NULL)::bigint AS indexed_catalog;
END;
$$;
