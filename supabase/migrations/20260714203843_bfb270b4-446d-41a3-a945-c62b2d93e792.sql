CREATE OR REPLACE FUNCTION public.clear_wishlist_item_when_owned()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.wishlist_items
  WHERE user_id = NEW.user_id
    AND item_id = NEW.item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_wishlist_item_after_inventory_insert ON public.user_inventory;
CREATE TRIGGER clear_wishlist_item_after_inventory_insert
AFTER INSERT ON public.user_inventory
FOR EACH ROW
EXECUTE FUNCTION public.clear_wishlist_item_when_owned();

CREATE OR REPLACE FUNCTION public.prevent_owned_item_on_wishlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_inventory
    WHERE user_id = NEW.user_id
      AND item_id = NEW.item_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_owned_item_before_wishlist_write ON public.wishlist_items;
CREATE TRIGGER prevent_owned_item_before_wishlist_write
BEFORE INSERT OR UPDATE OF user_id, item_id ON public.wishlist_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_owned_item_on_wishlist();