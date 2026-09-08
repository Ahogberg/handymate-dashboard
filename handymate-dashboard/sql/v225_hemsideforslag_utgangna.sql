-- v225 — Väntande hemsideförslag (publish_microsite) markeras utgångna
-- (beslut Andreas 2026-09-08): kortet kunde publicera sidan på internet utan
-- att den visats. Cronen är pausad bakom HEMSIDA_FORSLAG_ENABLED och Godkänn
-- publicerar inte längre; de fem kort som redan låg ute ska inte kunna tryckas.
-- Storefront-utkasten ligger kvar opublicerade och nås via /dashboard/website.
UPDATE pending_approvals
   SET status = 'expired', resolved_at = now()
 WHERE approval_type = 'publish_microsite'
   AND status = 'pending';

-- Samma beslut: väntande Lars-SMS som redan bär projektnamnet skrivs om till
-- den generiska texten (koden: lib/project-stages/automation-engine.ts).
UPDATE pending_approvals
   SET payload = jsonb_set(payload, '{message}', to_jsonb(
         regexp_replace(
           regexp_replace(payload->>'message', '^Hej! Vi har nu startat arbetet med .* Följ projektets framsteg i din portal\. // ', 'Hej! Vi har nu startat arbetet hos dig. Följ projektets framsteg i din portal. // '),
           '^Hej! Vi har mottagit er signerade offert för .*\. Vi återkommer snart med startdatum\. // ', 'Hej! Vi har mottagit er signerade offert. Vi återkommer snart med startdatum. // ')))
 WHERE status = 'pending'
   AND (payload->>'message' ~ '^Hej! Vi har nu startat arbetet med ' OR payload->>'message' ~ '^Hej! Vi har mottagit er signerade offert för ');
