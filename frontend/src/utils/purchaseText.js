import {
  Circle, Clock, CheckCircle2, Undo2, RefreshCw, Trash2,
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

// The line under the status: why a head sent it back. (The approvals have
// their own columns.)
export function statusDetail(r) {
  if (r.status === 'sent_back' && r.sent_back) return [`By the ${HEAD_OF[r.sent_back.step] || 'head'} (${r.sent_back.name || 'someone'}): ${r.sent_back.reason}`];
  return [];
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
