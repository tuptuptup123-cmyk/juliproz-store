begin;
alter table public.products drop constraint if exists products_finite_price_valid;
alter table public.products drop constraint if exists products_price_currency_valid;
alter table public.products add constraint products_finite_price_valid check (
 (price is null or (price>=0 and price::text not in ('NaN','Infinity','-Infinity')))
 and currency is not null and currency in ('EUR','USD','AED','GBP')
);
alter table public.products add constraint products_price_currency_valid check ((price is null or price>=0) and currency in ('EUR','USD','AED','GBP'));
notify pgrst,'reload schema';
commit;
