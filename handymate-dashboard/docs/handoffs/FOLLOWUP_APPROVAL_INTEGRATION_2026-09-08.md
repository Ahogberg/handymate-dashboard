# Isolated integration proof: PR 29 + PR 26

This branch combines PR 29 (7fe24e446300c8999cc8b16c715b67099b02a232) and PR 26 (a28e06779e4fa00525d8031949f2c0e20de5b9b6) for review. It does not merge either PR to main and does not activate production.

Resolved seven conflicts: approval surfaces use signed reviewedApprovalFetch; its final submission preserves postKortbeslut and the existing explicit 428 mass-recipient confirmation. Lost responses are never automatically retried. The quote delivery envelope uses canonical buildQuoteSmsText so preview, actual delivery and the public demo share content. Quote creator lookup remains tenant-scoped. Automation retains both durable followup ownership and reviewed message rendering. Mission and customer relief content from PR 28 remain intact.

Local validation of this combined tree: TypeScript passed; all 36 durable SQL/API/browser tests passed; real approval route harness passed; all 23 quote delivery harness scenarios passed; actual client queue-event harness passed including mass confirmation accepted/cancelled and lost response without resend. Providers were isolated: this is not a real-device or live delivery proof.

PR 29 itself has green GitHub checks including PostgreSQL 16 multi-connection tests and browser suites. Release still requires reviewed diff, green checks on the chosen merge tree and the documented database migration/runner heartbeat/pilot gates. Do not run production operation SQL from this integration proof as part of review.
