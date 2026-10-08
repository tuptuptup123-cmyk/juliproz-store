ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unisex';
ALTER TABLE public.products ADD CONSTRAINT products_gender_check CHECK (gender IN ('women', 'men', 'unisex'));
COMMENT ON COLUMN public.products.gender IS 'Catalogue audience: women, men, or unisex (shown in both sections).';
GRANT SELECT (gender) ON public.products TO anon, authenticated;
GRANT INSERT (gender), UPDATE (gender) ON public.products TO authenticated;
NOTIFY pgrst, 'reload schema';
