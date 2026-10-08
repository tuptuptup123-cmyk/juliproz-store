-- Apply to the JULI.PROZ database BEFORE publishing the updated frontend.
-- Additive change only: existing rows stay in stock; hidden rows stay hidden.
BEGIN;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'in_stock';
DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_fulfillment_status_check'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_fulfillment_status_check
      CHECK (fulfillment_status IN ('in_stock', 'on_order'));
  END IF;
END
$block$;
COMMENT ON COLUMN public.products.fulfillment_status IS
  'in_stock or on_order. available separately controls catalog visibility.';
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Read-only verification:
SELECT fulfillment_status, available, count(*) FROM public.products
GROUP BY fulfillment_status, available;
