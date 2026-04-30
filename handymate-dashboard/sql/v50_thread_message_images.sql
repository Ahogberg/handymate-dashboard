-- V50: Bilder i thread_message
--
-- Användaren kan bifoga bilder i Matte-chatten. Vi sparar metadata
-- (URL + ev. hash/dimensions) i thread_message.images. Själva bild-
-- bytena lever i Supabase Storage (bucket: quote-images, prefix:
-- matte/<business_id>/<timestamp>.<ext>) — vi återanvänder befintlig
-- bucket istället för att skapa en ny.
--
-- Format: array av { url: string, base64?: string, media_type?: string,
--                    width?: number, height?: number, size_bytes?: number }
--
-- 90-dagars retention på storage hanteras separat (cleanup-cron).

ALTER TABLE thread_message
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
