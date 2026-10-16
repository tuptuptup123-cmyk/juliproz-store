-- Apply only AFTER product-photo edge, website gateway, admin and both storefronts are deployed.
-- Uses stable bucket identity, never replaces stored objects or product URLs.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-photos','product-photos',false,6291456,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
commit;
