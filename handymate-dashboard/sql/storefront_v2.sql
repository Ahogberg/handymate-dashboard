-- Add certifications column to storefront
ALTER TABLE storefront ADD COLUMN IF NOT EXISTS certifications TEXT;
