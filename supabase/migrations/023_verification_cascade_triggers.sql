-- ============================================================
-- VERIFICATION CASCADE RULES
--
-- 1. Approving a SKU (catalog.is_verified: false -> true) automatically
--    approves every Serial Number (inventory row) currently under it.
-- 2. Any change to a verified SKU's piece composition — a new Serial
--    Number added under it, an existing one moved to/from it, or one
--    deleted — resets that SKU back to unverified so it can be
--    re-checked. The application layer surfaces this with a popup.
-- ============================================================

-- 1. Cascade: catalog.is_verified turning true verifies all its current pieces
CREATE OR REPLACE FUNCTION fn_catalog_verified_cascades_to_inventory()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_verified = true THEN
    UPDATE inventory SET is_verified = true WHERE catalog_id = NEW.id AND is_verified = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_verified_cascade ON catalog;
CREATE TRIGGER trg_catalog_verified_cascade
AFTER UPDATE OF is_verified ON catalog
FOR EACH ROW
WHEN (NEW.is_verified IS DISTINCT FROM OLD.is_verified)
EXECUTE FUNCTION fn_catalog_verified_cascades_to_inventory();

-- 2. Reset: a SKU's piece composition changing resets it to unverified
CREATE OR REPLACE FUNCTION fn_inventory_change_resets_catalog_verification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.catalog_id IS NOT NULL THEN
      UPDATE catalog SET is_verified = false WHERE id = NEW.catalog_id AND is_verified = true;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.catalog_id IS DISTINCT FROM OLD.catalog_id THEN
      IF OLD.catalog_id IS NOT NULL THEN
        UPDATE catalog SET is_verified = false WHERE id = OLD.catalog_id AND is_verified = true;
      END IF;
      IF NEW.catalog_id IS NOT NULL THEN
        UPDATE catalog SET is_verified = false WHERE id = NEW.catalog_id AND is_verified = true;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.catalog_id IS NOT NULL THEN
      UPDATE catalog SET is_verified = false WHERE id = OLD.catalog_id AND is_verified = true;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_insert_resets_verification ON inventory;
CREATE TRIGGER trg_inventory_insert_resets_verification
AFTER INSERT ON inventory
FOR EACH ROW EXECUTE FUNCTION fn_inventory_change_resets_catalog_verification();

DROP TRIGGER IF EXISTS trg_inventory_catalog_move_resets_verification ON inventory;
CREATE TRIGGER trg_inventory_catalog_move_resets_verification
AFTER UPDATE OF catalog_id ON inventory
FOR EACH ROW EXECUTE FUNCTION fn_inventory_change_resets_catalog_verification();

DROP TRIGGER IF EXISTS trg_inventory_delete_resets_verification ON inventory;
CREATE TRIGGER trg_inventory_delete_resets_verification
AFTER DELETE ON inventory
FOR EACH ROW EXECUTE FUNCTION fn_inventory_change_resets_catalog_verification();
