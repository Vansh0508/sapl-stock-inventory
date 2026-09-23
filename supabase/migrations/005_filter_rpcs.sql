CREATE OR REPLACE FUNCTION get_catalog_ids_by_colors(
  color_id_list UUID[],
  match_type TEXT   -- 'any' | 'all' | 'none' | 'exactly'
)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT catalog_id), '{}'::UUID[])
  FROM (
    SELECT cc.catalog_id,
           COUNT(*) FILTER (WHERE cc.color_id = ANY(color_id_list)) AS matched,
           COUNT(*)                                                  AS total,
           CARDINALITY(color_id_list)                                AS requested
    FROM catalog_colors cc
    GROUP BY cc.catalog_id
  ) sub
  WHERE
    CASE match_type
      WHEN 'any'     THEN matched > 0
      WHEN 'all'     THEN matched = requested
      WHEN 'none'    THEN matched = 0
      WHEN 'exactly' THEN matched = requested AND total = requested
      ELSE FALSE
    END;
$$;

CREATE OR REPLACE FUNCTION get_catalog_ids_by_fibers(
  fiber_id_list UUID[],
  match_type TEXT
)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT catalog_id), '{}'::UUID[])
  FROM (
    SELECT cf.catalog_id,
           COUNT(*) FILTER (WHERE cf.fiber_id = ANY(fiber_id_list)) AS matched,
           COUNT(*)                                                  AS total,
           CARDINALITY(fiber_id_list)                                AS requested
    FROM catalog_fibers cf
    GROUP BY cf.catalog_id
  ) sub
  WHERE
    CASE match_type
      WHEN 'any'     THEN matched > 0
      WHEN 'all'     THEN matched = requested
      WHEN 'none'    THEN matched = 0
      WHEN 'exactly' THEN matched = requested AND total = requested
      ELSE FALSE
    END;
$$;
