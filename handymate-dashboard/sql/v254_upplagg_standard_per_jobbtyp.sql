-- v254 (2026-09-17): två nivåer — jobbtypen är ett färdigt upplägg, och
-- inuti jobbtypen kan det finnas specifika varianter.
--
-- Andreas: "Det bästa vore att jobbtypen blir ett färdigt upplägg men att man
-- sedan i en jobbtyp kan skapa specifika mallar." Ett tryck på jobbtypen ska
-- lägga in STANDARDUPPLÄGGET; varianterna är egna tryck bredvid. Då måste
-- databasen veta vilket upplägg som är jobbtypens eget. Exakt ett per
-- jobbtyp och företag — den partiella unika indexen gör det omöjligt att
-- ha två.
--
-- Backfill: firmans egna standardrader (id qstd_<jobbtyp-id>, skapade av
-- "Förbered standardrader") är standard där de finns. Inget annat rörs —
-- en jobbtyp med bara ett upplägg behöver ingen flagga (koden faller
-- tillbaka på det enda), och en med flera utan flagga visar dem som val.
--
-- Verifierat läsande 2026-09-17: kolumnen fanns inte; 2 qstd_-rader i
-- produktion (en riktig, en TEST).

ALTER TABLE public.quote_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS quote_templates_one_default_per_job
  ON public.quote_templates (business_id, job_type_slug)
  WHERE is_default AND job_type_slug IS NOT NULL;

COMMENT ON COLUMN public.quote_templates.is_default IS
  'Jobbtypens eget standardupplägg: ett tryck på jobbtypen lägger in det. Högst ett per (business_id, job_type_slug).';

UPDATE public.quote_templates
SET is_default = true
WHERE id LIKE 'qstd_%'
  AND job_type_slug IS NOT NULL
  AND is_default = false;

-- Read-only verifiering efter körning:
SELECT count(*) FILTER (WHERE is_default) AS standardupplagg,
       count(*) FILTER (WHERE is_default AND job_type_slug IS NULL) AS fel_utan_jobbtyp
FROM public.quote_templates;
