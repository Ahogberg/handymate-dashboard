-- Next Best Action Engine — Christoffers prioriteringsprinciper behöver en
-- egen knowledge_type, skild från 'business_rule' (Daniels offertmotor,
-- se sql/v129_business_rule_knowledge_type.sql). Samma "Lär Handymate"-
-- mekanism (textarea, ägar-gate, soft delete), men annan konsument och
-- annan capture-sektion — utan en egen typ konkurrerar de om samma
-- .limit(5)-pool i fetchBusinessRules() (lib/ai-quote-generator.ts) och
-- läcker in i Daniels offertprompt, som aldrig ska se dem.
ALTER TABLE business_knowledge
  DROP CONSTRAINT business_knowledge_knowledge_type_check;

ALTER TABLE business_knowledge
  ADD CONSTRAINT business_knowledge_knowledge_type_check
  CHECK (knowledge_type = ANY (ARRAY['insight'::text, 'pattern'::text, 'anomaly'::text, 'recommendation'::text, 'business_rule'::text, 'priority_rule'::text]));

-- Verifiering:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'business_knowledge_knowledge_type_check';
--   → arrayen ska innehålla 'priority_rule'
