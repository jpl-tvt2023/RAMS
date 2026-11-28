import {
  Circle, Clock, CheckCircle2, Undo2, RefreshCw, Trash2, Paperclip, Send, Minus,
} from 'lucide-react';
import { ROLES } from './roles';

// Purchase Reports' statuses, in the order the page lists them. Colour is kept
// simple (the user, 2026-11-28): only an APPROVED record is green and a record
// SENT BACK by a head is red -- the row and its status. Everything else is
// plain words, no highlight.
export const STATUSES = [
  { key: 'to_check', label: 'To check', icon: Circle },
  { key: 'with_purchase_head', label: 'With Purchase Head', icon: Clock },
  { key: 'with_accounts_head', label: 'With Accountant Head', icon: Clock },
  { key: 'sent_back', label: 'Sent back', icon: Undo2 },
  { key: 'changed', label: 'Changed in ROMS', icon: RefreshCw },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'removed', label: 'Removed in ROMS', icon: Trash2 },
];
const BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export const statusOf = (key) => BY_KEY[key] || { key, label: key, icon: Circle };

// The only two highlights on the page.
export const ROW_FILL = { approved: 'bg-green-50', sent_back: 'bg-red-50' };
export const STATUS_TEXT = { approved: 'text-green-700', sent_back: 'text-red-700' };

// The session key for a page's filters, per person, so whoever signs in next
// on the tab opens on their own step (File storage's "Open on Purchase
// Reports" writes it too).
export const purchasesKey = (page, user) => `purchases-${page}-${user?.id ?? 'anyone'}`;

// While the checker has the record: the bill check can be saved and files changed.
export const WITH_CHECKER = ['to_check', 'sent_back', 'changed'];

export const HEAD_OF = { purchase: 'Purchase Head', accounts: 'Accountant Head' };

// Which head's step a record waits on, if any.
export const stepOf = (status) => ({ with_purchase_head: 'purchase', with_accounts_head: 'accounts' }[status] || null);

// The status list a person opens on: the step they act on.
export function defaultStatus(user, can, perms) {
  const roles = user?.roles || [];
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.OWNER)) return 'all';
  if (roles.includes(ROLES.ACCOUNTANT_HEAD) && can(perms.PURCHASES_APPROVE_ACCOUNTS)) return 'with_accounts_head';
  if (roles.includes(ROLES.PURCHASE_HEAD) && can(perms.PURCHASES_APPROVE_PURCHASE)) return 'with_purchase_head';
  if (can(perms.PURCHASES_CHECK)) return 'to_check';
  return 'all';
}

// Consecutive rows of one delivery (an Incoming No from one vendor, or one
// challan), as the server sorted them: [{ key, rows }].
export function deliveryRuns(rows) {
  const runs = [];
  for (const r of rows) {
    const key = r.delivery?.key ?? `record-${r.id}`;
    if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].rows.push(r);
    else runs.push({ key, rows: [r] });
  }
  return runs;
}

// "2,450" / "12.5" -- quantities and rates as ROMS shows them, no rounding away.
export const numText = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 }));

// What this person may do on a line. can: { check, purchase, accounts }.
//   maySend: send it for approval (and attach files) -- it is with the checker.
//   mayApprove: approve it -- it waits for a step this person holds.
//   mayRecall: take back the last step before the next person acts on it --
//     from the Purchase Head (a checker), or the Purchase Head's own approval
//     from the Accountant Head.
//   maySendBack(r, step): send it back as that head -- at their step or after
//     it, even once approved (the user, 2026-11-29: a head may change their mind).
const removed = (r) => r.status === 'removed' || Boolean(r.lines?.[0]?.removed);
export const maySend = (r, can) => Boolean(can.check) && WITH_CHECKER.includes(r.status) && !removed(r);
export const mayApprove = (r, can) => {
  const step = stepOf(r.status);
  return (step === 'purchase' && Boolean(can.purchase)) || (step === 'accounts' && Boolean(can.accounts));
};
export const RECALL_FROM = { with_purchase_head: 'check', with_accounts_head: 'purchase' };
export const mayRecall = (r, can) => Boolean(RECALL_FROM[r.status] && can[RECALL_FROM[r.status]]);
export const SEND_BACK_FROM = {
  purchase: ['with_purchase_head', 'with_accounts_head', 'approved'],
  accounts: ['with_accounts_head', 'approved'],
};
export const maySendBack = (r, step, can) => Boolean(can[step]) && SEND_BACK_FROM[step].includes(r.status);

// The Note column (the user, 2026-11-29): one short note per stage the line
// has been through in this round, oldest first, so each stage adds a line at
// the bottom. A send back, a ROMS change or a recall clears what came after,
// so it shows the current round; History keeps everything.
//   -> [{ key, text, tone: 'muted'|'plain'|'red', icon }]
export function notesOf(r) {
  const out = [];
  const n = r.files?.length || 0;
  out.push(n
    ? { key: 'files', text: `Bill attached · ${n} ${n === 1 ? 'file' : 'files'}`, tone: 'plain', icon: Paperclip }
    : { key: 'files', text: 'No bill attached', tone: 'muted', icon: Minus });
  if (r.check) {
    out.push({
      key: 'sent', text: `Sent for approval by ${r.check.name || 'someone'}${r.check.note ? `: “${r.check.note}”` : ''}`, tone: 'plain', icon: Send,
    });
  }
  if (r.purchase_approval) out.push({ key: 'purchase', text: `Purchase Head approved (${r.purchase_approval.name || 'someone'})`, tone: 'plain', icon: CheckCircle2 });
  if (r.accounts_approval) out.push({ key: 'accounts', text: `Accountant Head approved (${r.accounts_approval.name || 'someone'})`, tone: 'plain', icon: CheckCircle2 });
  if (r.status === 'sent_back' && r.sent_back) {
    out.push({
      key: 'sent_back',
      text: `Sent back by ${r.sent_back.name || 'someone'} (${HEAD_OF[r.sent_back.step] || 'head'}): ${r.sent_back.reason}`,
      tone: 'red',
      icon: Undo2,
    });
  }
  if (r.status === 'changed' && r.changed) {
    const changes = r.changed.changes || [];
    const shown = changes.slice(0, 3).map((c) => `${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`);
    if (changes.length > 3) shown.push(`and ${changes.length - 3} more (see the history)`);
    out.push({
      key: 'changed', text: `Changed in ROMS after it was sent${shown.length ? `: ${shown.join('; ')}` : ''}`, tone: 'plain', icon: RefreshCw, at: r.changed.at,
    });
  }
  if (r.status === 'removed') out.push({ key: 'removed', text: 'Removed in ROMS', tone: 'muted', icon: Trash2 });
  return out;
}

// A head's column (the user, 2026-11-28): "Approved by <name>" (green) once
// that head approved; "Pending approval" only while the line waits for that
// head; "Not approved" otherwise -- before it reaches them, and after a send
// back or a ROMS change cleared the approvals. No highlight but the green.
//   step: 'purchase' | 'accounts' -> { state: 'approved'|'pending'|'not', text, name, at }
export function approvalOf(r, step) {
  const a = step === 'purchase' ? r.purchase_approval : r.accounts_approval;
  if (a) return { state: 'approved', text: `Approved by ${a.name || 'someone'}`, name: a.name || 'someone', at: a.at };
  if (stepOf(r.status) === step) return { state: 'pending', text: 'Pending approval' };
  return { state: 'not', text: 'Not approved' };
}
