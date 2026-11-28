import {
  Circle, Clock, CheckCircle2, Undo2, RefreshCw, Trash2, Paperclip, Send, Minus,
} from 'lucide-react';
import { ROLES } from './roles';

// Purchase Reports' queues (the user, 2026-11-29): a line's status is the
// queue it is in, and the page has a tab for each, then All. Sent back and
// Changed in ROMS are notes on a line, not queues: a head's send back puts it
// in the queue before them, and a ROMS change puts it back To check. A line
// removed in ROMS is in no queue, only under All.
export const QUEUES = [
  { key: 'to_check', label: 'To check', icon: Circle },
  { key: 'with_purchase_head', label: 'With Purchase Head', icon: Clock },
  { key: 'with_accounts_head', label: 'With Accountant Head', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
];
export const STATUSES = [...QUEUES, { key: 'removed', label: 'Removed in ROMS', icon: Trash2 }];
const BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

export const statusOf = (key) => BY_KEY[key] || { key, label: key, icon: Circle };

// The tab a saved filter opens on: one of the queues or All, else none.
export const isTab = (key) => key === 'all' || QUEUES.some((q) => q.key === key);

// Colour is kept simple (the user, 2026-11-28): only an APPROVED line is green
// and a line SENT BACK (waiting on whoever it was sent back to) is red -- the
// row and its status. Everything else is plain words, no highlight.
const toneOf = (r) => {
  if (r.status === 'approved') return 'approved';
  if (r.sent_back && r.status !== 'removed') return 'sent_back';
  return null;
};
export const rowFill = (r) => ({ approved: 'bg-green-50', sent_back: 'bg-red-50' }[toneOf(r)] || '');

// The session key for a page's filters, per person, so whoever signs in next
// on the tab opens on their own step (File storage's "Open on Purchase
// Reports" writes it too).
export const purchasesKey = (page, user) => `purchases-${page}-${user?.id ?? 'anyone'}`;

// While the checker has the record: the bill check can be saved and files changed.
export const WITH_CHECKER = ['to_check'];

export const HEAD_OF = { purchase: 'Purchase Head', accounts: 'Accountant Head' };

// Where a head's send back puts the line: the queue before them (the user,
// 2026-11-29).
export const SENT_BACK_TO = { purchase: 'the checker', accounts: 'the Purchase Head' };

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
//   mayAttach: attach or remove files -- it is with the checker.
//   maySend: send it for approval -- with the checker, and a bill attached
//     (the user, 2026-11-29: a line never goes on with no file).
//   mayApprove: approve it -- it waits for a step this person holds, with a bill.
//   mayRecall: take back the last step before the next person acts on it --
//     from the Purchase Head (a checker), or the Purchase Head's own approval
//     from the Accountant Head. Not a line the Accountant Head sent back to the
//     Purchase Head: that is theirs to decide.
//   maySendBack(r, step): send it back as that head -- at their step or after
//     it, even once approved (the user, 2026-11-29: a head may change their mind).
const removed = (r) => r.status === 'removed' || Boolean(r.lines?.[0]?.removed);
export const hasBill = (r) => (r.files?.length || 0) > 0;
export const mayAttach = (r, can) => Boolean(can.check) && WITH_CHECKER.includes(r.status) && !removed(r);
export const maySend = (r, can) => mayAttach(r, can) && hasBill(r);
export const mayApprove = (r, can) => {
  const step = stepOf(r.status);
  return hasBill(r) && ((step === 'purchase' && Boolean(can.purchase)) || (step === 'accounts' && Boolean(can.accounts)));
};
export const RECALL_FROM = { with_purchase_head: 'check', with_accounts_head: 'purchase' };
export const mayRecall = (r, can) => Boolean(RECALL_FROM[r.status] && can[RECALL_FROM[r.status]])
  && !(r.status === 'with_purchase_head' && r.sent_back?.step === 'accounts');
export const SEND_BACK_FROM = {
  purchase: ['with_purchase_head', 'with_accounts_head', 'approved'],
  accounts: ['with_accounts_head', 'approved'],
};
export const maySendBack = (r, step, can) => Boolean(can[step]) && SEND_BACK_FROM[step].includes(r.status);

// "Sent back by Pia (Purchase Head): reason". RAMS itself sent back the lines
// that had reached a head with no bill (migration 024).
export function sentBackText(s) {
  if (!s.step) return `Sent back by RAMS: ${s.reason}`;
  return `Sent back by ${s.name || 'someone'} (${HEAD_OF[s.step] || 'head'}): ${s.reason}`;
}

// "Changes were made in ROMS: Qty: 103 → 100" -- the first three, then a count.
export function changedText(c) {
  const changes = c.changes || [];
  const shown = changes.slice(0, 3).map((x) => `${x.field}: ${x.old ?? '—'} → ${x.new ?? '—'}`);
  if (changes.length > 3) shown.push(`and ${changes.length - 3} more (see the history)`);
  return `Changes were made in ROMS${shown.length ? `: ${shown.join('; ')}` : ''}`;
}

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
  if (r.sent_back && r.status !== 'removed') {
    out.push({ key: 'sent_back', text: sentBackText(r.sent_back), tone: 'red', icon: Undo2 });
  }
  if (r.changed && r.status === 'to_check') {
    out.push({
      key: 'changed', text: changedText(r.changed), tone: 'plain', icon: RefreshCw, at: r.changed.at,
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
