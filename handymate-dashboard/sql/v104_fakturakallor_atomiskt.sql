-- ═══════════════════════════════════════════════════════════════════════════
-- v104 — Fakturaunderlagets källor markeras ATOMISKT
-- (2026-08-09, Project System Audit P0-4)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- När en faktura skapas markeras källorna — tidrapporter, material, ÄTA —
-- som fakturerade i TRE separata anrop från sex olika rutter. Varje anrop
-- kan lyckas eller misslyckas oberoende. Halvläget är den farligaste
-- dataklassen i systemet: en ÄTA som inte markerades faktureras en gång
-- till nästa körning (dubbeldebitering), och en tidrapport som markerades
-- fast fakturan rullades tillbaka faktureras aldrig (missad intäkt).
--
-- En Postgres-funktion körs i EN transaktion: antingen markeras allt,
-- eller ingenting. Dessutom idempotent — samma faktura kan markera om
-- sina egna källor (retry är ofarligt), men kan ALDRIG ta över en källa
-- som redan hör till en annan faktura.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_invoice_sources(
  p_business_id TEXT,
  p_invoice_id TEXT,
  p_time_entry_ids TEXT[] DEFAULT NULL,
  p_material_ids TEXT[] DEFAULT NULL,
  p_change_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_time INT := 0;
  v_material INT := 0;
  v_ata INT := 0;
BEGIN
  IF p_business_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'business_id och invoice_id krävs';
  END IF;

  IF p_time_entry_ids IS NOT NULL AND array_length(p_time_entry_ids, 1) > 0 THEN
    UPDATE public.time_entry
    SET invoiced = TRUE, invoice_id = p_invoice_id
    WHERE business_id = p_business_id
      AND time_entry_id = ANY(p_time_entry_ids)
      -- Idempotent för SAMMA faktura; stjäl aldrig från en annan.
      AND (invoice_id IS NULL OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_time = ROW_COUNT;
  END IF;

  IF p_material_ids IS NOT NULL AND array_length(p_material_ids, 1) > 0 THEN
    UPDATE public.project_material
    SET invoiced = TRUE, invoice_id = p_invoice_id
    WHERE business_id = p_business_id
      AND material_id = ANY(p_material_ids)
      AND (invoice_id IS NULL OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_material = ROW_COUNT;
  END IF;

  IF p_change_ids IS NOT NULL AND array_length(p_change_ids, 1) > 0 THEN
    UPDATE public.project_change
    SET status = 'invoiced', invoice_id = p_invoice_id, invoiced_at = NOW()
    WHERE business_id = p_business_id
      AND change_id = ANY(p_change_ids)
      -- Bara lagliga vägar in i invoiced (lib/ata/lifecycle.ts), plus
      -- idempotent omkörning för samma faktura.
      AND (status IN ('approved', 'signed') OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_ata = ROW_COUNT;
  END IF;

  -- Begärda men inte uppdaterade rader = konflikter (annan faktura äger
  -- källan, eller ÄTA i fel status). Anroparen avgör om det är ett fel.
  RETURN jsonb_build_object(
    'time_entries_marked', v_time,
    'materials_marked', v_material,
    'atas_marked', v_ata,
    'time_entries_requested', COALESCE(array_length(p_time_entry_ids, 1), 0),
    'materials_requested', COALESCE(array_length(p_material_ids, 1), 0),
    'atas_requested', COALESCE(array_length(p_change_ids, 1), 0)
  );
END;
$$;

-- Endast servern. Klienter markerar aldrig källor själva.
REVOKE ALL ON FUNCTION public.mark_invoice_sources(TEXT, TEXT, TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_sources(TEXT, TEXT, TEXT[], TEXT[], TEXT[]) TO service_role;

-- Verifiering:
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'mark_invoice_sources';
