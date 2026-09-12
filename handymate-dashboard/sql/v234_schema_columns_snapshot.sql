-- v234 (2026-09-12): en lasvag for kolumnsnapshoten.
--
-- Kolumnvakten (tests/column-contract.spec.ts) behover ett facit som ar
-- DATABASEN och inte repot — se tasks/codex-paket-kolumnkontraktet-2026-09-12.md
-- for varfor. Skriptet som genererar snapshoten behover darfor en definierad,
-- read-only lasvag.
--
-- Varfor inte PostgREST:s OpenAPI-schema (som dagens 6-tabellsfil anger som
-- kalla): det omfattar aven VYER, beror pa vilka rattigheter nyckeln har, och
-- kan vara inaktuellt genom PostgREST:s schemacache. Ett facit som tyst kan
-- vara ofullstandigt ar precis den felklass vakten finns for att stoppa.
-- information_schema gar heller inte att lasa direkt over PostgREST.
--
-- Darfor den har funktionen. Den laser pg_catalog direkt, tar BARA riktiga
-- tabeller (relkind 'r' och 'p' — inga vyer, inga materialiserade vyer, inga
-- frammande tabeller), hoppar over systemkolumner och droppade attribut, och
-- lamnar tillbaka antalet tabeller i samma svar sa anroparen kan vagra skriva
-- en halv snapshot over en fullstandig.
--
-- Deterministisk: jsonb normaliserar nyckelordningen och kolumnlistorna
-- sorteras pa namn. Samma databas ger byte-identisk 'tables' varje korning.
--
-- Ingen skrivning, ingen DDL, ingen radata. STABLE och SECURITY INVOKER:
-- funktionen hojer ingens behorighet. Bara service_role far kora den — en
-- anonym besokare ska inte kunna rakna upp schemat.

-- En hjalpvy vore enklare att lasa men skulle sjalv dyka upp i PostgREST:s
-- schema; CTE:n haller hela lasvagen inne i en enda funktion.
CREATE OR REPLACE FUNCTION public.schema_columns_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH tabeller AS (
    SELECT c.relname,
           jsonb_agg(a.attname ORDER BY a.attname) AS cols
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
    GROUP BY c.relname
  )
  SELECT jsonb_build_object(
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'table_count', (SELECT count(*) FROM tabeller),
    'column_count', (SELECT coalesce(sum(jsonb_array_length(cols)), 0) FROM tabeller),
    'tables', (SELECT coalesce(jsonb_object_agg(relname, cols), '{}'::jsonb) FROM tabeller)
  );
$$;

REVOKE ALL ON FUNCTION public.schema_columns_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schema_columns_snapshot() FROM anon;
REVOKE ALL ON FUNCTION public.schema_columns_snapshot() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.schema_columns_snapshot() TO service_role;
