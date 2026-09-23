-- ============================================================
-- SPLIT BACK: restore view_inventory_full to its original thin
-- shape, and introduce view_inventory_gallery as its own, freshly
-- named view for the Gallery/Kanban/RecordView/Dashboard use case.
--
-- 024 consolidated both views under the view_inventory_full name,
-- but that name has now been dropped/recreated twice and the app
-- still isn't seeing data through it. Rather than keep fighting
-- that specific view, this migration leaves view_inventory_full
-- untouched going forward (restored to its pre-024 definition) and
-- adds a distinctly-named view for the richer dataset instead.
-- ============================================================

DROP VIEW IF EXISTS view_inventory_full;

CREATE VIEW view_inventory_full AS
SELECT
    i.id,
    i.serial_number,
    c.sku,
    pt.product_name,
    s.size_label,
    l.location_name,
    l.state,
    l.country,
    cu.symbol        AS currency_symbol,
    i.created_at,
    i.updated_at,
    i.is_sold
FROM inventory i
LEFT JOIN catalog      c   ON c.id  = i.catalog_id
LEFT JOIN product_types pt ON pt.id = c.product_type_id
LEFT JOIN sizes         s  ON s.id  = c.size_id
LEFT JOIN locations     l  ON l.id  = i.location_id
LEFT JOIN currencies    cu ON cu.id = l.currency_id;

COMMENT ON VIEW view_inventory_full IS 'Full inventory read view with catalog and location details resolved.';

GRANT SELECT ON view_inventory_full TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
CREATE VIEW view_inventory_gallery AS
SELECT
    i.id,
    i.serial_number,
    i.catalog_id,
    i.location_id,
    l.location_name,
    l.state AS location_state,
    l.country AS location_country,
    cu.symbol AS currency_symbol,

    -- Catalog attributes
    c.sku,
    c.product_code,
    c.quality_code,
    c.design_code,
    c.is_active,
    c.product_name,
    c.size_label,
    c.so_number,
    c.quality_name,
    c.quality_prefix,
    c.design_name,
    c.collection_name,
    c.construction_name,
    c.color_names,
    c.color_codes,
    c.fiber_configuration,

    -- Catalog ForeignKey fields for filtering
    cat.product_type_id,
    cat.quality_id,
    cat.design_id,
    cat.collection_id,
    cat.construction_id,
    cat.size_id,

    i.created_at,
    i.updated_at,
    i.is_sold
FROM inventory i
LEFT JOIN catalog cat ON cat.id = i.catalog_id
LEFT JOIN view_catalog_full c ON c.id = i.catalog_id
LEFT JOIN locations l ON l.id = i.location_id
LEFT JOIN currencies cu ON cu.id = l.currency_id;

COMMENT ON VIEW view_inventory_gallery IS 'Full denormalized view for the physical inventory items gallery view.';

GRANT SELECT ON view_inventory_gallery TO anon, authenticated, service_role;
