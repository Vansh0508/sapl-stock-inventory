-- Make catalog_id and location_id nullable in inventory table
ALTER TABLE inventory ALTER COLUMN catalog_id DROP NOT NULL;
ALTER TABLE inventory ALTER COLUMN location_id DROP NOT NULL;

-- Refresh the dependent views using LEFT JOIN instead of JOIN
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
LEFT JOIN catalog      c   ON c.id  = i.catalog_id
LEFT JOIN product_types pt ON pt.id = c.product_type_id
LEFT JOIN sizes         s  ON s.id  = c.size_id
LEFT JOIN locations     l  ON l.id  = i.location_id
LEFT JOIN currencies    cu ON cu.id = l.currency_id;

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
LEFT JOIN catalog cat ON cat.id = i.catalog_id
LEFT JOIN view_catalog_full c ON c.id = i.catalog_id
LEFT JOIN locations l ON l.id = i.location_id
LEFT JOIN currencies cu ON cu.id = l.currency_id;
