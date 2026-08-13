-- "Lär Handymate" (#12) — business_knowledge.knowledge_type saknade ett
-- värde för ägar-dikterade regler (bara insight/pattern/anomaly/
-- recommendation fanns, alla agent-genererade). Upptäckt live när
-- POST /api/business-rules kraschade mot CHECK-constrainten.
ALTER TABLE business_knowledge
  DROP CONSTRAINT business_knowledge_knowledge_type_check;

ALTER TABLE business_knowledge
  ADD CONSTRAINT business_knowledge_knowledge_type_check
  CHECK (knowledge_type = ANY (ARRAY['insight'::text, 'pattern'::text, 'anomaly'::text, 'recommendation'::text, 'business_rule'::text]));
