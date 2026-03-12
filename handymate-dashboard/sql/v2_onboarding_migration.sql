-- ============================================================
-- V2: Onboarding migration — befintliga kunder
-- Run BEFORE deploying onboarding upgrade
-- ============================================================

-- Bump existing completed onboarding to new max step (10)
UPDATE business_config SET onboarding_step = 10 WHERE onboarding_step >= 8;
