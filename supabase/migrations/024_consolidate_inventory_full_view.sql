-- ============================================================
-- CONSOLIDATE view_inventory_gallery INTO view_inventory_full
--
-- The app had two parallel inventory read views (view_inventory_full,
-- a thin view from 001; view_inventory_gallery, the denormalized view
-- from 011 that the Gallery/Kanban/RecordView/dashboard actually query).
-- Deployed environments only ever had view_inventory_full, causing
-- "table not found in schema cache" errors wherever the app queried
-- view_inventory_gallery. This migration merges the two under the
-- view_inventory_full name so there's a single source of truth.
-- ============================================================

DROP VIEW IF EXISTS view_inventory_gallery;

-- CREATE OR REPLACE can't be used here: it requires existing columns to keep
-- their name at the same ordinal position, and this new shape reorders/renames
-- columns (e.g. position 3 goes from "sku" to "catalog_id"). Nothing else in
-- the schema depends on view_inventory_full (verified: no other view/function
-- references it), so a plain drop + recreate is safe.
DROP VIEW IF EXISTS view_inventory_full;

CREATE VIEW view_inventory_full AS
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

COMMENT ON VIEW view_inventory_full IS 'Full denormalized view for the physical inventory items (Gallery/Kanban/RecordView/dashboard). Consolidated from the former view_inventory_gallery.';

-- Dropping and recreating a view does NOT carry over its old grants, and
-- ALTER DEFAULT PRIVILEGES only reapplies automatically if this statement
-- runs as the same role that owns the default privilege entry. Grant
-- explicitly so a fresh view is never left unreadable by the API roles.
GRANT SELECT ON view_inventory_full TO anon, authenticated, service_role;
