-- Migration to create view_inventory_gallery for inventory-level image gallery

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
    i.updated_at
FROM inventory i
JOIN catalog cat ON cat.id = i.catalog_id
JOIN view_catalog_full c ON c.id = i.catalog_id
JOIN locations l ON l.id = i.location_id
JOIN currencies cu ON cu.id = l.currency_id;

COMMENT ON VIEW view_inventory_gallery IS 'Full denormalized view for the physical inventory items gallery view.';
