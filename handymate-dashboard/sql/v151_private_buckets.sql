-- v151: Privata lagringsbuckets — kundfiler slutar vara publikt läsbara.
--
-- BAKGRUND (verifierat 2026-08-18, flaggat i docs/audits/QUOTE_SYSTEM_AUDIT.md:744)
-- Tre buckets är publika idag:
--   * customer-documents  (v48)  — offertbilagor, kunddokument, jobbfoton
--   * project-files       (v48)  — projektdokument
--   * business-assets     (v92)  — företagslogotyper
-- Publik bucket + öppen SELECT-policy = vem som helst med URL:en kan läsa
-- kundens dokument för alltid. URL:erna är svårgissade men permanenta och
-- sprids i mejl/DB. Detta är ett lanseringsproblem oavsett jobbpasset.
--
-- BESLUT PER BUCKET (dokumenterade, avsiktliga):
--   * customer-documents → PRIVAT. All läsning via kortlivade signerade
--     URL:er från API-rutter (service-role). Prejudikat finns redan:
--     /api/customers/[id]/documents/[docId] och /api/projects/.../[docId].
--   * project-files      → PRIVAT. Samma modell.
--   * business-assets    → FÖRBLIR PUBLIK. Innehåller ENBART logotyper
--     (enda skrivvägen är /api/business/logo). logo_url persisteras i
--     business_config och är inbäddad i redan skickade offertmejl, PDF:er
--     och den publika kundportalen — en logotyp är avsiktligt publikt
--     material. Skulle bucketen någonsin få annat innehåll måste beslutet
--     omprövas (facit i kodbasen bevakar att inga andra skrivvägar uppstår).
--   * meeting-audio      → redan privat sedan v119 (verifieras nedan).
--
-- KODSIDAN (samma etapp, deployas ihop med denna migration):
-- alla getPublicUrl-vägar för customer-documents/project-files migreras
-- till createSignedUrl vid läsning; webbläsaruppladdningarna (quotes/new,
-- quotes/edit, pipeline) flyttas till API-rutter med service-role.
-- Signerade URL:er lagras ALDRIG i databasen — path lagras, signering
-- sker vid läsning.

-- ─── 0. Diagnostik FÖRE: se vilka policies som faktiskt finns ───────────
-- (policies kan ha skapats via Supabase-dashboarden utanför git — kör
-- denna SELECT först och spara utfallet i chatten)
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- ─── 1. Gör kundbuckets privata ─────────────────────────────────────────
UPDATE storage.buckets SET public = false
WHERE id IN ('customer-documents', 'project-files');

-- ─── 2. Ta bort de öppna läspolicyerna ──────────────────────────────────
-- Service-role bypassar RLS — API-rutterna (uppladdning + signering)
-- behöver ingen policy. Utan policy = ingen anon/authenticated-åtkomst
-- alls direkt mot storage, vilket är avsikten.
DROP POLICY IF EXISTS "Public read customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Public read project-files" ON storage.objects;

-- Om diagnostiken i steg 0 visade FLER policies för dessa två buckets
-- (t.ex. INSERT-policies skapade i dashboarden): droppa dem också manuellt
-- med DROP POLICY IF EXISTS "<namn>" ON storage.objects; och notera i chatten.

-- ─── 3. business-assets: rör INTE — avsiktligt publik (bara logotyper) ──
-- (ingen åtgärd; raden finns för att beslutet ska synas i migrationen)

-- ─── 4. Verifiering ─────────────────────────────────────────────────────
-- Förväntat: customer-documents=false, project-files=false,
--            business-assets=true, meeting-audio=false
SELECT id, public FROM storage.buckets
WHERE id IN ('customer-documents', 'project-files', 'business-assets', 'meeting-audio')
ORDER BY id;

-- Förväntat: inga rader för customer-documents/project-files
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND (qual LIKE '%customer-documents%' OR qual LIKE '%project-files%');

-- ROLLBACK (manuellt om något går sönder akut):
-- UPDATE storage.buckets SET public = true WHERE id IN ('customer-documents', 'project-files');
-- CREATE POLICY "Public read customer-documents" ON storage.objects FOR SELECT USING (bucket_id = 'customer-documents');
-- CREATE POLICY "Public read project-files" ON storage.objects FOR SELECT USING (bucket_id = 'project-files');
