-- Purchase Reports, five queues (the user, 2026-11-29): To check, With
-- Purchase Head, With Accountant Head, Approved, All. A line's status is the
-- queue it is in. "Sent back" and "Changed in ROMS" are no longer statuses but
-- notes on the line, kept in the columns they always used (sent_back_*,
-- changed_at/changes):
--   - a line a head sent back goes to the queue before that head: the
--     Purchase Head's to the checker (to_check), the Accountant Head's to the
--     Purchase Head (with_purchase_head)
--   - a line changed in ROMS goes back To check, with its note of what changed
--   - a line never goes on without a file: one with a head, or approved, that
--     has none goes back To check, sent back by RAMS with the reason, and its
--     approvals are cleared (a row in its history says so)
-- The CHECK on status still allows the old values. Nothing here needs the new
-- code, and every statement can run again (for a send back made by the old
-- code between this and the deploy).

UPDATE purchase_records SET status = 'with_purchase_head', updated_at = datetime('now')
 WHERE status = 'sent_back' AND sent_back_step = 'accounts';

UPDATE purchase_records SET status = 'to_check', updated_at = datetime('now')
 WHERE status IN ('sent_back', 'changed');

INSERT INTO audit_logs (user_id, action_type, description, entity_type, entity_id, entity_ref, changes)
SELECT NULL, 'PURCHASE_SEND_BACK', 'Sent back to the checker by RAMS — no bill attached. A line can be sent for approval only with its bill',
       'purchase_records', r.id, NULL,
       json_array(json_object('field', 'Status', 'old',
         CASE r.status WHEN 'with_purchase_head' THEN 'With Purchase Head' WHEN 'with_accounts_head' THEN 'With Accountant Head' ELSE 'Approved' END,
         'new', 'To check'))
  FROM purchase_records r
 WHERE r.status IN ('with_purchase_head', 'with_accounts_head', 'approved')
   AND NOT EXISTS (SELECT 1 FROM purchase_files f WHERE f.record_id = r.id);

UPDATE purchase_records
   SET status = 'to_check',
       purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL,
       sent_back_by = NULL, sent_back_at = datetime('now'), sent_back_step = NULL,
       sent_back_reason = 'No bill attached — attach the bill and send it again',
       updated_at = datetime('now')
 WHERE status IN ('with_purchase_head', 'with_accounts_head', 'approved')
   AND NOT EXISTS (SELECT 1 FROM purchase_files f WHERE f.record_id = purchase_records.id)
