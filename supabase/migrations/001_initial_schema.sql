-- ============================================================
--  SHYAM AHUJA — INVENTORY MANAGEMENT SYSTEM
--  Database Schema v1.0
--  PostgreSQL 15+
-- ============================================================
--  TABLE ORDER (dependency-safe)
--    1. currencies
--    2. product_types
--    3. lengths
--    4. widths
--    5. sizes
--    6. constructions
--    7. fiber_list
--    8. qualities
--    9. designs
--   10. collections
--   11. colors
--   12. catalog
--   13. catalog_colors        (junction: catalog ↔ fiber_list)
--   14. locations
--   15. inventory
--   16. prices
-- ============================================================


-- ============================================================
--  EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()


-- ============================================================
--  1. CURRENCIES
-- ============================================================

CREATE TABLE currencies (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_name VARCHAR(100) NOT NULL UNIQUE,
    symbol        VARCHAR(10)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  currencies              IS 'Master list of currencies used across locations and prices.';
COMMENT ON COLUMN currencies.symbol       IS 'Display symbol, e.g. ₹, $, AED.';


-- ============================================================
--  2. PRODUCT TYPES
-- ============================================================

CREATE TABLE product_types (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name VARCHAR(100) NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE product_types IS 'Master list of product categories: Rugs, Dhurries, Carpets, Madeups, Towels, etc.';


-- ============================================================
--  3. LENGTHS
-- ============================================================

CREATE TABLE lengths (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    length_name VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. "6 ft", "9 ft", "12 ft"
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  lengths             IS 'Discrete length values. Each name must be unique.';
COMMENT ON COLUMN lengths.length_name IS 'Human-readable length label, e.g. "6 ft".';


-- ============================================================
--  4. WIDTHS
-- ============================================================

CREATE TABLE widths (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    width_name VARCHAR(50) NOT NULL UNIQUE,    -- e.g. "4 ft", "6 ft", "8 ft"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  widths            IS 'Discrete width values. Each name must be unique.';
COMMENT ON COLUMN widths.width_name IS 'Human-readable width label, e.g. "4 ft".';


-- ============================================================
--  5. SIZES
-- ============================================================

CREATE TABLE sizes (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    width_id   UUID         NOT NULL REFERENCES widths(id)  ON UPDATE CASCADE ON DELETE RESTRICT,
    length_id  UUID         NOT NULL REFERENCES lengths(id) ON UPDATE CASCADE ON DELETE RESTRICT,

    -- Formula: "{width_name} x {length_name} ft"
    -- Stored as a generated column for fast lookup & uniqueness enforcement.
    -- Recomputed automatically whenever width/length name changes.
    -- NOTE: Because width_name and length_name live in other tables,
    --       the composed label is maintained by an application-layer trigger
    --       or a view (see view_sizes below). The column below stores the
    --       computed value written by that trigger.
    size_label VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. "4 x 6 ft"

    -- SO Number: auto-incrementing, display value = "SO" || so_seq
    so_seq     BIGINT       NOT NULL UNIQUE GENERATED ALWAYS AS IDENTITY
                            (START WITH 1 INCREMENT BY 1),

    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    UNIQUE (width_id, length_id)   -- one row per width+length combination
);

COMMENT ON TABLE  sizes            IS 'All valid width × length combinations. size_label is computed and stored by a trigger.';
COMMENT ON COLUMN sizes.size_label IS 'Computed label: "{width} x {length} ft". Unique. Written by trigger fn_sizes_set_label.';
COMMENT ON COLUMN sizes.so_seq     IS 'Auto-increment integer. Frontend displays as SO1, SO2, …';

-- Helper view so the frontend can read the SO label directly
CREATE VIEW view_sizes AS
SELECT
    s.id,
    s.width_id,
    w.width_name,
    s.length_id,
    l.length_name,
    s.size_label,
    'SO' || s.so_seq  AS so_number,
    s.so_seq,
    s.created_at,
    s.updated_at
FROM sizes s
JOIN widths  w ON w.id = s.width_id
JOIN lengths l ON l.id = s.length_id;


CREATE OR REPLACE FUNCTION fn_sizes_set_label()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_width  VARCHAR(50);
    v_length VARCHAR(50);
BEGIN
    SELECT width_name  INTO v_width  FROM widths  WHERE id = NEW.width_id;
    SELECT length_name INTO v_length FROM lengths WHERE id = NEW.length_id;
    NEW.size_label := v_width || ' x ' || v_length || ' ft';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sizes_set_label
BEFORE INSERT ON sizes
FOR EACH ROW EXECUTE FUNCTION fn_sizes_set_label();


-- ============================================================
--  6. CONSTRUCTIONS
-- ============================================================

CREATE TABLE constructions (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    construction_name VARCHAR(100) NOT NULL UNIQUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE constructions IS 'Weave / construction methods, e.g. Hand-knotted, Flatweave, Tufted.';


-- ============================================================
--  7. FIBER LIST
-- ============================================================

CREATE TABLE fiber_list (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fiber_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE fiber_list IS 'Raw material / fiber types, e.g. Wool, Cotton, Silk, Jute.';


-- ============================================================
--  8. QUALITIES
-- ============================================================

CREATE TABLE qualities (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_name VARCHAR(100) NOT NULL UNIQUE,
    quality_code VARCHAR(20)  NOT NULL UNIQUE,   -- unique per quality, used in lookups
    quality_prefix VARCHAR(10) NOT NULL UNIQUE,  -- used in Product Code formula
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  qualities              IS 'Quality grades. Each has a unique code and a unique prefix used in the Product Code formula.';
COMMENT ON COLUMN qualities.quality_code IS 'Short unique code, e.g. "Q100".';
COMMENT ON COLUMN qualities.quality_prefix IS 'Prefix for the Product Code formula, e.g. "SA", "SB".';


-- ============================================================
--  9. DESIGNS
-- ============================================================

CREATE TABLE designs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    design_name VARCHAR(100) NOT NULL UNIQUE,
    design_code VARCHAR(20)  NOT NULL UNIQUE,   -- unique per design
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  designs             IS 'Design patterns. Each has a unique code used in the Product Code formula.';
COMMENT ON COLUMN designs.design_code IS 'Short unique code, e.g. "D001".';


-- ============================================================
--  10. COLLECTIONS
-- ============================================================

CREATE TABLE collections (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_name VARCHAR(100) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE collections IS 'Named product collections / ranges, e.g. Heritage, Nomadic, Contemporary.';


-- ============================================================
--  11. COLORS
-- ============================================================

CREATE TABLE colors (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    color_name VARCHAR(100) NOT NULL UNIQUE,
    color_code VARCHAR(20)  NOT NULL UNIQUE,   -- unique per color
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  colors            IS 'Color master. Each color has a unique code used in the Product Code formula.';
COMMENT ON COLUMN colors.color_code IS 'Short unique code, e.g. "C01", "C02".';


-- ============================================================
--  12. CATALOG
-- ============================================================

CREATE TABLE catalog (
    id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ---------- Dimension links ----------
    product_type_id UUID  NOT NULL REFERENCES product_types(id)  ON UPDATE CASCADE ON DELETE RESTRICT,
    size_id         UUID  NOT NULL REFERENCES sizes(id)           ON UPDATE CASCADE ON DELETE RESTRICT,
    quality_id      UUID  NOT NULL REFERENCES qualities(id)       ON UPDATE CASCADE ON DELETE RESTRICT,
    design_id       UUID  NOT NULL REFERENCES designs(id)         ON UPDATE CASCADE ON DELETE RESTRICT,
    collection_id   UUID           REFERENCES collections(id)     ON UPDATE CASCADE ON DELETE SET NULL,
    construction_id UUID           REFERENCES constructions(id)   ON UPDATE CASCADE ON DELETE SET NULL,

    -- ---------- Computed / formula fields ----------
    -- These are STORED generated columns where the formula depends only
    -- on columns within this table (via FK-resolved values written by trigger).
    -- For fields that depend on other tables, we use a trigger approach.

    -- quality_code: looked up from qualities.quality_code — stored by trigger
    quality_code    VARCHAR(20)  NOT NULL,

    -- design_code: looked up from designs.design_code — stored by trigger
    design_code     VARCHAR(20)  NOT NULL,

    -- product_code: quality_prefix + design_code + color_codes (X-separated)
    -- Written by trigger after catalog_colors junction is updated.
    product_code    VARCHAR(100) NOT NULL DEFAULT '',

    -- sku: 'SA' + product_code + so_number
    -- Written by trigger.
    sku             VARCHAR(200) NOT NULL DEFAULT '' UNIQUE,

    -- ---------- Status ----------
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  catalog              IS 'Central product record. One row = one product + size combination (a specific SKU).';
COMMENT ON COLUMN catalog.quality_code IS 'Denormalized from qualities.quality_code for fast lookup. Kept in sync by trigger.';
COMMENT ON COLUMN catalog.design_code  IS 'Denormalized from designs.design_code. Kept in sync by trigger.';
COMMENT ON COLUMN catalog.product_code IS 'Formula: quality_prefix + design_code + color_code(s joined by X). Written by trigger.';
COMMENT ON COLUMN catalog.sku          IS 'Formula: SA + product_code + SO{so_seq}. Written by trigger. Globally unique.';

-- Trigger: populate denormalized lookup fields on INSERT / UPDATE
CREATE OR REPLACE FUNCTION fn_catalog_set_codes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_quality_code   VARCHAR(20);
    v_design_code    VARCHAR(20);
BEGIN
    SELECT quality_code INTO v_quality_code FROM qualities WHERE id = NEW.quality_id;
    SELECT design_code  INTO v_design_code  FROM designs   WHERE id = NEW.design_id;

    NEW.quality_code := v_quality_code;
    NEW.design_code  := v_design_code;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalog_set_codes
BEFORE INSERT OR UPDATE ON catalog
FOR EACH ROW EXECUTE FUNCTION fn_catalog_set_codes();


-- ============================================================
--  12a. CATALOG → COLORS  (many-to-many junction)
--       One catalog row can carry multiple colors.
--       product_code and sku are recomputed after this table changes.
-- ============================================================

CREATE TABLE catalog_colors (
    catalog_id UUID NOT NULL REFERENCES catalog(id)  ON UPDATE CASCADE ON DELETE CASCADE,
    color_id   UUID NOT NULL REFERENCES colors(id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    PRIMARY KEY (catalog_id, color_id)
);

COMMENT ON TABLE catalog_colors IS 'A catalog entry can have multiple colors. Color codes are joined with "X" in the Product Code formula.';

-- Trigger: recompute product_code and sku after color assignments change
CREATE OR REPLACE FUNCTION fn_catalog_recompute_sku()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cat_id         UUID;
    v_quality_prefix VARCHAR(10);
    v_design_code    VARCHAR(20);
    v_color_codes    VARCHAR(200);
    v_product_code   VARCHAR(100);
    v_so_number      TEXT;
    v_sku            VARCHAR(200);
BEGIN
    -- Determine which catalog row to update
    IF TG_OP = 'DELETE' THEN
        v_cat_id := OLD.catalog_id;
    ELSE
        v_cat_id := NEW.catalog_id;
    END IF;

    -- Gather components
    SELECT q.quality_prefix, d.design_code
    INTO   v_quality_prefix, v_design_code
    FROM   catalog c
    JOIN   qualities q ON q.id = c.quality_id
    JOIN   designs   d ON d.id = c.design_id
    WHERE  c.id = v_cat_id;

    -- Aggregate color codes sorted for determinism, joined by X
    SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
    INTO   v_color_codes
    FROM   catalog_colors cc
    JOIN   colors co ON co.id = cc.color_id
    WHERE  cc.catalog_id = v_cat_id;

    v_product_code := v_quality_prefix || v_design_code || COALESCE(v_color_codes, '');

    -- SO number from sizes
    SELECT 'SO' || s.so_seq
    INTO   v_so_number
    FROM   catalog c
    JOIN   sizes s ON s.id = c.size_id
    WHERE  c.id = v_cat_id;

    v_sku := 'SA' || v_product_code || v_so_number;

    UPDATE catalog
    SET    product_code = v_product_code,
           sku          = v_sku,
           updated_at   = NOW()
    WHERE  id = v_cat_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalog_colors_recompute
AFTER INSERT OR UPDATE OR DELETE ON catalog_colors
FOR EACH ROW EXECUTE FUNCTION fn_catalog_recompute_sku();


-- ============================================================
--  12b. CATALOG → FIBER_LIST  (many-to-many junction)
--       Includes fiber percentage — must total 100% per catalog row.
-- ============================================================

CREATE TABLE catalog_fibers (
    catalog_id   UUID           NOT NULL REFERENCES catalog(id)    ON UPDATE CASCADE ON DELETE CASCADE,
    fiber_id     UUID           NOT NULL REFERENCES fiber_list(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    percentage   NUMERIC(5,2)   NOT NULL CHECK (percentage > 0 AND percentage <= 100),
    PRIMARY KEY (catalog_id, fiber_id)
);

COMMENT ON TABLE  catalog_fibers            IS 'Fiber composition of a catalog entry. Percentages must sum to 100 per catalog_id.';
COMMENT ON COLUMN catalog_fibers.percentage IS 'Share of this fiber in the blend, e.g. 70.00 for 70%. All fibers per catalog_id must sum to 100.';

-- Constraint: enforce 100% total via a trigger
CREATE OR REPLACE FUNCTION fn_catalog_fibers_check_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_total NUMERIC(6,2);
BEGIN
    SELECT COALESCE(SUM(percentage), 0)
    INTO   v_total
    FROM   catalog_fibers
    WHERE  catalog_id = NEW.catalog_id;

    IF v_total > 100 THEN
        RAISE EXCEPTION
            'Fiber percentages for catalog_id % exceed 100 percent (current total: % percent)',
            NEW.catalog_id, v_total;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalog_fibers_check_total
AFTER INSERT OR UPDATE ON catalog_fibers
FOR EACH ROW EXECUTE FUNCTION fn_catalog_fibers_check_total();


-- ============================================================
--  13. LOCATIONS
-- ============================================================

CREATE TABLE locations (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name VARCHAR(100) NOT NULL,
    state         VARCHAR(100),
    country       VARCHAR(100) NOT NULL,
    currency_id   UUID         NOT NULL REFERENCES currencies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  locations             IS 'Physical or logical locations: stores, warehouses, online channel nodes.';
COMMENT ON COLUMN locations.currency_id IS 'Default transactional currency for this location.';


-- ============================================================
--  14. INVENTORY
-- ============================================================

CREATE TABLE inventory (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number VARCHAR(50)  NOT NULL UNIQUE,   -- SP Number — unique physical piece ID
    catalog_id    UUID         NOT NULL REFERENCES catalog(id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    location_id   UUID         NOT NULL REFERENCES locations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  inventory               IS 'Each row represents one unique physical piece (serialized). Linked to a catalog SKU and its current location.';
COMMENT ON COLUMN inventory.serial_number IS 'SP Number — unique identifier for a specific physical piece.';


-- ============================================================
--  15. PRICES
-- ============================================================

CREATE TABLE prices (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id   UUID          NOT NULL REFERENCES catalog(id)   ON UPDATE CASCADE ON DELETE RESTRICT,
    inventory_id UUID                   REFERENCES inventory(id) ON UPDATE CASCADE ON DELETE SET NULL,
    location_id  UUID          NOT NULL REFERENCES locations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    currency_id  UUID          NOT NULL REFERENCES currencies(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    price        NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    valid_from   DATE          NOT NULL DEFAULT CURRENT_DATE,
    valid_to     DATE,                  -- NULL means currently active / no expiry
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_price_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE  prices              IS 'Price list. One SKU can have different prices per location, currency, and validity window.';
COMMENT ON COLUMN prices.inventory_id IS 'Optional: pin a price to a specific physical piece (for one-of-a-kind pricing).';
COMMENT ON COLUMN prices.valid_from   IS 'Inclusive start date of price validity.';
COMMENT ON COLUMN prices.valid_to     IS 'Inclusive end date of price validity. NULL = open-ended (currently active).';


-- ============================================================
--  INDEXES  (performance for common query patterns)
-- ============================================================

-- Sizes
CREATE INDEX idx_sizes_width_id  ON sizes(width_id);
CREATE INDEX idx_sizes_length_id ON sizes(length_id);

-- Catalog
CREATE INDEX idx_catalog_sku             ON catalog(sku);
CREATE INDEX idx_catalog_product_type_id ON catalog(product_type_id);
CREATE INDEX idx_catalog_quality_id      ON catalog(quality_id);
CREATE INDEX idx_catalog_design_id       ON catalog(design_id);
CREATE INDEX idx_catalog_collection_id   ON catalog(collection_id);
CREATE INDEX idx_catalog_size_id         ON catalog(size_id);
CREATE INDEX idx_catalog_is_active       ON catalog(is_active);

-- Junction tables
CREATE INDEX idx_catalog_colors_color_id  ON catalog_colors(color_id);
CREATE INDEX idx_catalog_fibers_fiber_id  ON catalog_fibers(fiber_id);

-- Inventory
CREATE INDEX idx_inventory_catalog_id  ON inventory(catalog_id);
CREATE INDEX idx_inventory_location_id ON inventory(location_id);

-- Prices
CREATE INDEX idx_prices_catalog_id    ON prices(catalog_id);
CREATE INDEX idx_prices_location_id   ON prices(location_id);
CREATE INDEX idx_prices_currency_id   ON prices(currency_id);
CREATE INDEX idx_prices_valid_from    ON prices(valid_from);
CREATE INDEX idx_prices_valid_to      ON prices(valid_to);

-- Locations
CREATE INDEX idx_locations_currency_id ON locations(currency_id);


-- ============================================================
--  UPDATED_AT TRIGGER  (auto-maintain timestamp on all tables)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'currencies', 'product_types', 'lengths', 'widths', 'sizes',
        'constructions', 'fiber_list', 'qualities', 'designs', 'collections',
        'colors', 'catalog', 'locations', 'inventory', 'prices'
    ] LOOP
        EXECUTE FORMAT(
            'CREATE TRIGGER trg_%1$s_updated_at
             BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
            tbl
        );
    END LOOP;
END;
$$;


-- ============================================================
--  SEED DATA — reference values
-- ============================================================

INSERT INTO currencies (currency_name, symbol) VALUES
    ('Indian Rupee',      '₹'),
    ('US Dollar',         '$'),
    ('UAE Dirham',        'AED'),
    ('British Pound',     '£'),
    ('Euro',              '€');

INSERT INTO product_types (product_name) VALUES
    ('Dhurrie'),
    ('Rug'),
    ('Carpet'),
    ('Madeup'),
    ('Towel');

INSERT INTO widths (width_name) VALUES
    ('2 ft'), ('3 ft'), ('4 ft'), ('5 ft'), ('6 ft'),
    ('8 ft'), ('9 ft'), ('10 ft'), ('12 ft'), ('14 ft');

INSERT INTO lengths (length_name) VALUES
    ('3 ft'), ('4 ft'), ('5 ft'), ('6 ft'), ('8 ft'),
    ('9 ft'), ('10 ft'), ('12 ft'), ('14 ft'), ('16 ft');

INSERT INTO constructions (construction_name) VALUES
    ('Hand-knotted'),
    ('Hand-tufted'),
    ('Flatweave'),
    ('Hand-loomed'),
    ('Machine-made');

INSERT INTO fiber_list (fiber_name) VALUES
    ('Wool'),
    ('Cotton'),
    ('Silk'),
    ('Jute'),
    ('Viscose'),
    ('Bamboo Silk'),
    ('Linen');


-- ============================================================
--  USEFUL VIEWS
-- ============================================================

-- Full catalog view with all resolved names (for frontend reads)
CREATE VIEW view_catalog_full AS
SELECT
    c.id,
    c.sku,
    c.product_code,
    c.quality_code,
    c.design_code,
    c.is_active,

    pt.product_name,
    s.size_label,
    'SO' || s.so_seq            AS so_number,
    q.quality_name,
    q.quality_prefix,
    d.design_name,
    col.collection_name,
    con.construction_name,

    -- Aggregated colors as display string
    (
        SELECT STRING_AGG(co.color_name, ' / ' ORDER BY co.color_name)
        FROM   catalog_colors cc
        JOIN   colors co ON co.id = cc.color_id
        WHERE  cc.catalog_id = c.id
    ) AS color_names,

    (
        SELECT STRING_AGG(co.color_code, 'X' ORDER BY co.color_code)
        FROM   catalog_colors cc
        JOIN   colors co ON co.id = cc.color_id
        WHERE  cc.catalog_id = c.id
    ) AS color_codes,

    -- Aggregated fiber configuration as display string
    (
        SELECT STRING_AGG(fl.fiber_name || ' ' || cf.percentage || '%', ', '
                          ORDER BY cf.percentage DESC)
        FROM   catalog_fibers cf
        JOIN   fiber_list fl ON fl.id = cf.fiber_id
        WHERE  cf.catalog_id = c.id
    ) AS fiber_configuration,

    c.created_at,
    c.updated_at

FROM catalog c
JOIN product_types  pt  ON pt.id  = c.product_type_id
JOIN sizes           s  ON s.id   = c.size_id
JOIN qualities       q  ON q.id   = c.quality_id
JOIN designs         d  ON d.id   = c.design_id
LEFT JOIN collections col ON col.id = c.collection_id
LEFT JOIN constructions con ON con.id = c.construction_id;

COMMENT ON VIEW view_catalog_full IS 'Denormalized read view for the frontend. Joins all dimension tables and aggregates colors/fibers.';


-- Active price per catalog + location (most recent valid price)
CREATE VIEW view_active_prices AS
SELECT DISTINCT ON (p.catalog_id, p.location_id, p.currency_id)
    p.id,
    p.catalog_id,
    c.sku,
    p.location_id,
    l.location_name,
    p.price,
    p.currency_id,
    cu.symbol       AS currency_symbol,
    cu.currency_name,
    p.valid_from,
    p.valid_to
FROM prices p
JOIN catalog    c  ON c.id  = p.catalog_id
JOIN locations  l  ON l.id  = p.location_id
JOIN currencies cu ON cu.id = p.currency_id
WHERE (p.valid_to IS NULL OR p.valid_to >= CURRENT_DATE)
  AND p.valid_from <= CURRENT_DATE
ORDER BY p.catalog_id, p.location_id, p.currency_id, p.valid_from DESC;

COMMENT ON VIEW view_active_prices IS 'Returns the current active price per catalog + location + currency.';


-- Inventory with catalog and location details
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
    i.updated_at
FROM inventory i
JOIN catalog      c   ON c.id  = i.catalog_id
JOIN product_types pt ON pt.id = c.product_type_id
JOIN sizes         s  ON s.id  = c.size_id
JOIN locations     l  ON l.id  = i.location_id
JOIN currencies    cu ON cu.id = l.currency_id;

COMMENT ON VIEW view_inventory_full IS 'Full inventory read view with catalog and location details resolved.';


-- ============================================================
--  END OF SCHEMA
-- ============================================================
