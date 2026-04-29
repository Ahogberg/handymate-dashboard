-- v48: Säkerställ att storage-buckets för dokument är korrekt konfigurerade.
--
-- BAKGRUND
-- Filer som laddats upp på kunder/deals/projekt har inte kunnat öppnas. Två
-- huvudorsaker:
-- 1) ensureBucket() i lib/storage.ts skapar bucketen som privat (`public: false`)
--    om den inte redan finns. Tidigare versioner av koden skapade ibland
--    customer-documents som privat — då fungerar getPublicUrl() inte.
-- 2) storage.objects saknar policy som tillåter SELECT — även "publika"
--    buckets behöver en RLS-regel för att service-role och authenticated
--    klienter ska kunna läsa filer.
--
-- LÖSNING
-- Klient-koden använder nu signerade URL:er via API-endpoints
-- (/api/customers/[id]/documents/[docId] och /api/projects/[id]/documents/[docId]).
-- Dessa fungerar oavsett bucket-konfiguration eftersom signering sker med
-- service-role.
--
-- Som extra säkerhet: säkerställ att buckets är publika OCH att en SELECT-
-- policy finns. Det betyder att även äldre direktlänkar (t.ex. i sparade
-- offerter) kan fungera utan att tvingas gå genom API:t.

-- ─── 1. Säkerställ att buckets är publika ──────────────────────────────
-- Skapar buckets om de saknas; ändrar deras visibility till public om de finns.
insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do update set public = true;

-- ─── 2. SELECT-policy på storage.objects för dessa buckets ─────────────
-- Tillåt alla att läsa (signerade URL:er + direkta publika länkar).
-- Skriv-rättigheter sker enbart via service-role i API-rutterna.

drop policy if exists "Public read customer-documents" on storage.objects;
create policy "Public read customer-documents"
  on storage.objects for select
  using (bucket_id = 'customer-documents');

drop policy if exists "Public read project-files" on storage.objects;
create policy "Public read project-files"
  on storage.objects for select
  using (bucket_id = 'project-files');

-- ─── 3. Service-role har full access (default men explicit för tydlighet) ───
-- Service-role bypassar RLS automatiskt, så ingen extra policy behövs för det.
-- Authenticated/anon-rollerna får läsa via "Public read"-policyn ovan.

-- ROLLBACK (manuellt om behövs):
-- update storage.buckets set public = false where id in ('customer-documents', 'project-files');
-- drop policy if exists "Public read customer-documents" on storage.objects;
-- drop policy if exists "Public read project-files" on storage.objects;
