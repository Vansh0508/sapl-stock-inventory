-- Migration to track whether a physical inventory piece has been sold.
-- Additive only: new nullable-safe column with a default, no data rewritten destructively.

ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inventory.is_sold IS 'True once this specific physical piece has been sold. Used to fade it out of pricing/inventory grids without deleting its record.';

-- Refresh the dependent views so is_sold is available to frontend reads.

CREATE OR REPLACE VIEW view_inventory_full AS
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
JOIN catalog      c   ON c.id  = i.catalog_id
JOIN product_types pt ON pt.id = c.product_type_id
JOIN sizes         s  ON s.id  = c.size_id
JOIN locations     l  ON l.id  = i.location_id
JOIN currencies    cu ON cu.id = l.currency_id;

CREATE OR REPLACE VIEW view_inventory_gallery AS
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
JOIN catalog cat ON cat.id = i.catalog_id
JOIN view_catalog_full c ON c.id = i.catalog_id
JOIN locations l ON l.id = i.location_id
JOIN currencies cu ON cu.id = l.currency_id;

COMMENT ON VIEW view_inventory_full IS 'Full inventory read view with catalog and location details resolved.';
COMMENT ON VIEW view_inventory_gallery IS 'Full denormalized view for the physical inventory items gallery view.';
