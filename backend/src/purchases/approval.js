// Purchase Reports: the bill check and the two approvals (the user's flow,
// 2026-11-28), on each line's own record. Every move is one transaction with
// its audit row on the record (entity purchase_records), so its history shows
// who did what and when. The checker may save one check on several lines of
// a delivery at once, and a head may approve several lines at once -- each
// line still gets its own history row.
//
// The status is the queue the line is in (the user, 2026-11-29: five tabs --
// To check, With Purchase Head, With Accountant Head, Approved, All):
//
//   to_check --(bill check, with a file)--> with_purchase_head
//   with_purchase_head --(Purchase Head approves)--> with_accounts_head
//   with_accounts_head --(Accountant Head approves)--> approved
//   Purchase Head sends back (at their step or later) --> to_check
//   Accountant Head sends back (at their step or later) --> with_purchase_head
//   with_purchase_head --(recall: the checker takes it back)--> to_check
//   with_accounts_head --(recall: the Purchase Head takes back their approval)--> with_purchase_head
//
// Sending back is the heads' "reject": the line goes to the queue before the
// head who sent it, with the reason (sent_back_*, the red note) until the
// person it went to sends it on. A head may send back a line they already
// approved, even after the final approval. A recall undoes one's own step
// until the next person acts on it; an approved line is not recalled but sent
// back. A change in ROMS after the bill check puts the line back To check,
// with a note of what changed (refresh.js). A line never goes on without a
// file: the bill check and the approvals refuse one that has none.
const { logAction } = require('../services/auditLog.service');
const { snapshotOf, recordLabel } = require('./lines');
const { currentLines } = require('./records');

const NOTE_MAX = 500;
const REASON_MAX = 500;
const APPROVE_MAX = 500;

// The statuses in which the checker has the record: a bill check can be saved
// and files added or removed.
const WITH_CHECKER = ['to_check'];

const STEPS = {
  purchase: {
    from: 'with_purchase_head', to: 'with_accounts_head', head: 'Purchase Head', by: 'purchase_approved_by', at: 'purchase_approved_at',
  },
  accounts: {
    from: 'with_accounts_head', to: 'approved', head: 'Accountant Head', by: 'accounts_approved_by', at: 'accounts_approved_at',
  },
};

// Where a head's send back puts the line: the queue before that head.
const SEND_BACK_TO = { purchase: 'to_check', accounts: 'with_purchase_head' };
const BACK_TO_WORDS = { to_check: 'the checker', with_purchase_head: 'the Purchase Head' };

const NO_FILE_SEND = 'Attach the bill before sending it for approval';
const NO_FILE_APPROVE = 'No bill attached — send it back to the checker to attach one';

const STATUS_WORDS = {
  to_check: 'To check',
  with_purchase_head: 'With Purchase Head',
  with_accounts_head: 'With Accountant Head',
  approved: 'Approved',
  removed: 'Removed in ROMS',
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;

async function inTx(db, work) {
  const tx = await db.transaction('write');
  try {
    const out = await work(tx);
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Why a record can't take this move, in words for the page.
function notNow(status, step) {
  if (status === 'removed') return 'This record was removed in ROMS, so it can\'t be checked or approved';
  if (status === 'approved') return 'This record is already approved';
  if (WITH_CHECKER.includes(status)) return step ? 'This record needs its bill check saved first' : null;
  const words = (STATUS_WORDS[status] || status).toLowerCase();
  if (!step) return `This record is ${words} — it can be changed again once a head sends it back`;
  if (status !== STEPS[step].from) return `This record is ${words}, not waiting for the ${STEPS[step].head}`;
  return null;
}

// The statuses a head may send a line back from: their own step, and any
// later one (they approved it, and change their mind).
const SEND_BACK_FROM = {
  purchase: ['with_purchase_head', 'with_accounts_head', 'approved'],
  accounts: ['with_accounts_head', 'approved'],
};

function cantSendBack(status, step) {
  if (SEND_BACK_FROM[step].includes(status)) return null;
  if (status === 'removed') return 'This record was removed in ROMS, so it can\'t be sent back';
  const words = (STATUS_WORDS[status] || status).toLowerCase();
  if (WITH_CHECKER.includes(status)) return 'This record is with the checker already';
  return `This record is ${words}, not yet with the ${STEPS[step].head}`;
}

async function recordFor(tx, id) {
  const [r] = await rowsOf(tx, 'SELECT id, kind, status FROM purchase_records WHERE id = ?', [Number(id) || 0]);
  if (!r) throw fail(404, 'That purchase record isn’t in RAMS');
  return r;
}

// How many files a record has (a line never goes on without one).
async function fileCount(tx, id) {
  const [{ n }] = await rowsOf(tx, 'SELECT COUNT(*) AS n FROM purchase_files WHERE record_id = ?', [Number(id)]);
  return Number(n);
}

const noteOf = (note) => {
  const text = String(note ?? '').trim();
  if (text.length > NOTE_MAX) throw fail(400, `Keep the note to ${NOTE_MAX} characters`);
  return text;
};

// The bill check on one record, inside the caller's transaction: null when
// saved, else why it couldn't be (in words for the page).
async function checkOne(tx, id, user, text) {
  const [r] = await rowsOf(tx, 'SELECT id, kind, status FROM purchase_records WHERE id = ?', [Number(id) || 0]);
  if (!r) return { status: 404, reason: 'That purchase record isn’t in RAMS' };
  if (!WITH_CHECKER.includes(r.status)) return { status: 409, reason: notNow(r.status) };
  const lines = await currentLines(tx, r.id);
  if (!lines.length) return { status: 409, reason: 'This line was removed in ROMS' };
  if (!(await fileCount(tx, r.id))) return { status: 409, reason: NO_FILE_SEND };
  const res = await tx.execute({
    sql: `UPDATE purchase_records
             SET status = 'with_purchase_head', checked_by = ?, checked_at = datetime('now'), check_note = ?, snapshot = ?,
                 purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL,
                 sent_back_by = NULL, sent_back_at = NULL, sent_back_step = NULL, sent_back_reason = NULL,
                 changed_at = NULL, changes = NULL, updated_at = datetime('now')
           WHERE id = ? AND status = ?`,
    args: [user.id, text || null, JSON.stringify(snapshotOf(lines)), r.id, r.status],
  });
  if (!res.rowsAffected) return { status: 409, reason: 'Someone changed this record just now — open it again' };
  await logAction({
    client: tx,
    userId: user.id,
    actionType: 'PURCHASE_CHECK',
    description: `Bill check saved — ${recordLabel(r.kind, lines)}${text ? `. Note: ${text}` : ''}`,
    entityType: 'purchase_records',
    entityId: r.id,
    changes: [{ field: 'Status', old: STATUS_WORDS[r.status], new: STATUS_WORDS.with_purchase_head }],
  });
  return null;
}

/** Saves the bill check on one record: it goes to the Purchase Head. */
async function saveCheck(db, id, user, { note } = {}) {
  const text = noteOf(note);
  return inTx(db, async (tx) => {
    const why = await checkOne(tx, id, user, text);
    if (why) throw fail(why.status, why.reason);
    return { id: Number(id), status: 'with_purchase_head' };
  });
}

/**
 * Saves the bill check on several records at once (the lines of one delivery
 * the checker ticked), with the same note -- each its own history row. Those
 * the checker doesn't have are skipped with the reason. { checked, skipped }
 */
async function saveChecks(db, ids, user, { note } = {}) {
  const text = noteOf(note);
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) throw fail(400, 'Choose the lines to check');
  if (list.length > APPROVE_MAX) throw fail(400, `Check at most ${APPROVE_MAX} lines at a time`);
  return inTx(db, async (tx) => {
    const skipped = [];
    let checked = 0;
    for (const id of list) {
      const why = await checkOne(tx, id, user, text);
      if (why) skipped.push({ id, reason: why.reason });
      else checked += 1;
    }
    return { checked, skipped };
  });
}

/**
 * A head approves one or more records at their step. Those not waiting for
 * this head are skipped with the reason. { approved, skipped: [{ id, reason }] }
 */
async function approve(db, ids, step, user) {
  const s = STEPS[step];
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) throw fail(400, 'Choose the records to approve');
  if (list.length > APPROVE_MAX) throw fail(400, `Approve at most ${APPROVE_MAX} records at a time`);
  return inTx(db, async (tx) => {
    const rows = await rowsOf(tx, `SELECT id, kind, status FROM purchase_records WHERE id IN (${list.map(() => '?').join(',')})`, list);
    const found = new Map(rows.map((r) => [Number(r.id), r]));
    const skipped = [];
    let approved = 0;
    for (const id of list) {
      const r = found.get(id);
      if (!r) { skipped.push({ id, reason: 'That purchase record isn’t in RAMS' }); continue; }
      const why = notNow(r.status, step);
      if (why) { skipped.push({ id, reason: why }); continue; }
      if (!(await fileCount(tx, id))) { skipped.push({ id, reason: NO_FILE_APPROVE }); continue; }
      // Approving sends it on, so a send back that brought it here is done with.
      const res = await tx.execute({
        sql: `UPDATE purchase_records SET status = ?, ${s.by} = ?, ${s.at} = datetime('now'),
                     sent_back_by = NULL, sent_back_at = NULL, sent_back_step = NULL, sent_back_reason = NULL, updated_at = datetime('now')
               WHERE id = ? AND status = ?`,
        args: [s.to, user.id, id, s.from],
      });
      if (!res.rowsAffected) { skipped.push({ id, reason: 'Someone changed this record just now' }); continue; }
      const label = recordLabel(r.kind, await currentLines(tx, id));
      await logAction({
        client: tx,
        userId: user.id,
        actionType: 'PURCHASE_APPROVE',
        description: `Approved as ${s.head} — ${label}`,
        entityType: 'purchase_records',
        entityId: id,
        changes: [{ field: 'Status', old: STATUS_WORDS[s.from], new: STATUS_WORDS[s.to] }],
      });
      approved += 1;
    }
    return { approved, skipped };
  });
}

/**
 * A head sends a record back, with a reason, to the queue before them: the
 * Purchase Head to the checker, the Accountant Head to the Purchase Head. Both
 * approvals are cleared either way (the Purchase Head approves it again).
 */
async function sendBack(db, id, step, user, { reason } = {}) {
  const s = STEPS[step];
  const why = String(reason ?? '').trim();
  if (!why) throw fail(400, 'Say why it is being sent back');
  if (why.length > REASON_MAX) throw fail(400, `Keep the reason to ${REASON_MAX} characters`);
  return inTx(db, async (tx) => {
    const r = await recordFor(tx, id);
    const blocked = cantSendBack(r.status, step);
    if (blocked) throw fail(409, blocked);
    const to = SEND_BACK_TO[step];
    const res = await tx.execute({
      sql: `UPDATE purchase_records
               SET status = ?, sent_back_by = ?, sent_back_at = datetime('now'), sent_back_step = ?, sent_back_reason = ?,
                   purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL,
                   updated_at = datetime('now')
             WHERE id = ? AND status = ?`,
      args: [to, user.id, step, why, r.id, r.status],
    });
    if (!res.rowsAffected) throw fail(409, 'Someone changed this record just now — open it again');
    const label = recordLabel(r.kind, await currentLines(tx, r.id));
    const after = r.status === s.from ? '' : ' after approving it';
    await logAction({
      client: tx,
      userId: user.id,
      actionType: 'PURCHASE_SEND_BACK',
      description: `Sent back by the ${s.head}${after} to ${BACK_TO_WORDS[to]} — ${label}. Reason: ${why}`,
      entityType: 'purchase_records',
      entityId: r.id,
      changes: [{ field: 'Status', old: STATUS_WORDS[r.status], new: STATUS_WORDS[to] }],
    });
    return { id: Number(r.id), status: to };
  });
}

// A recall: the step it undoes, who may do it, and what it clears.
const RECALL = {
  with_purchase_head: {
    to: 'to_check',
    need: 'check',
    what: 'Recalled from the Purchase Head, back to the bill check',
    // The bill check is undone; its note stays as a draft for the next send.
    clear: 'checked_by = NULL, checked_at = NULL, purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL',
    notAllowed: 'Only someone who does the bill check can take it back from the Purchase Head',
  },
  with_accounts_head: {
    to: 'with_purchase_head',
    need: 'purchase',
    what: 'Purchase Head approval taken back from the Accountant Head',
    clear: 'purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL',
    notAllowed: 'Only the Purchase Head can take back their approval',
  },
};

// "29 Nov, 14:05" in Indian time, for a reason shown on the page.
function istText(at) {
  const d = new Date(`${String(at).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Why a line can't be recalled now. from: where the caller saw it, so a line
// that moved on meanwhile is refused, not recalled from a later step.
function cantRecall(r, from, can) {
  const who = (name, at) => `${name || 'Someone'}${at ? ` (${istText(at)})` : ''}`;
  if (from && r.status !== from) {
    if (from === 'with_purchase_head' && r.purchase_approved_at) {
      return `${who(r.purchase_name, r.purchase_approved_at)} approved it already, so it can’t be recalled. Ask them to send it back`;
    }
    if (from === 'with_accounts_head' && r.accounts_approved_at) {
      return `${who(r.accounts_name, r.accounts_approved_at)} approved it already, so it can’t be recalled. Ask them to send it back`;
    }
  }
  if (r.status === 'approved') return 'An approved line can’t be recalled. A head can send it back instead';
  if (WITH_CHECKER.includes(r.status)) return 'It is with the checker already';
  if (r.status === 'removed') return 'This line was removed in ROMS';
  const m = RECALL[r.status];
  if (!m) return `This line is ${(STATUS_WORDS[r.status] || r.status).toLowerCase()}`;
  if (from && r.status !== from) return 'Someone changed this line just now. Open it again';
  // The Accountant Head sent it back to the Purchase Head: theirs to decide now.
  if (r.status === 'with_purchase_head' && r.sent_back_step === 'accounts') {
    return 'The Accountant Head sent it back to the Purchase Head. Ask the Purchase Head to send it back to you';
  }
  if (!can[m.need]) return m.notAllowed;
  return null;
}

/**
 * Takes lines back one step, before the next person acts on them: the checker
 * from the Purchase Head (back to the bill check, files unlocked, the note kept
 * as a draft), or the Purchase Head their approval from the Accountant Head.
 * items: [{ id, from? }] -- from is the status the caller saw.
 * can: { check, purchase } -- the caller's permissions.
 * { recalled, skipped: [{ id, reason }] }
 */
async function recall(db, items, user, can) {
  const list = [];
  const seen = new Set();
  for (const it of Array.isArray(items) ? items : []) {
    const id = Number(it && typeof it === 'object' ? it.id : it);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, from: it && typeof it === 'object' && RECALL[it.from] ? it.from : null });
  }
  if (!list.length) throw fail(400, 'Choose the lines to recall');
  if (list.length > APPROVE_MAX) throw fail(400, `Recall at most ${APPROVE_MAX} lines at a time`);
  return inTx(db, async (tx) => {
    const rows = await rowsOf(tx, `
      SELECT r.id, r.kind, r.status, r.purchase_approved_at, r.accounts_approved_at, r.sent_back_step,
             pa.name AS purchase_name, aa.name AS accounts_name
        FROM purchase_records r
        LEFT JOIN users pa ON pa.id = r.purchase_approved_by
        LEFT JOIN users aa ON aa.id = r.accounts_approved_by
       WHERE r.id IN (${list.map(() => '?').join(',')})`, list.map((l) => l.id));
    const found = new Map(rows.map((r) => [Number(r.id), r]));
    const skipped = [];
    let recalled = 0;
    for (const { id, from } of list) {
      const r = found.get(id);
      if (!r) { skipped.push({ id, reason: 'That purchase record isn’t in RAMS' }); continue; }
      const why = cantRecall(r, from, can);
      if (why) { skipped.push({ id, reason: why }); continue; }
      const m = RECALL[r.status];
      const res = await tx.execute({
        sql: `UPDATE purchase_records SET status = ?, ${m.clear}, updated_at = datetime('now') WHERE id = ? AND status = ?`,
        args: [m.to, id, r.status],
      });
      if (!res.rowsAffected) { skipped.push({ id, reason: 'Someone changed this line just now. Open it again' }); continue; }
      const label = recordLabel(r.kind, await currentLines(tx, id));
      await logAction({
        client: tx,
        userId: user.id,
        actionType: 'PURCHASE_RECALL',
        description: `${m.what} — ${label}`,
        entityType: 'purchase_records',
        entityId: id,
        changes: [{ field: 'Status', old: STATUS_WORDS[r.status], new: STATUS_WORDS[m.to] }],
      });
      recalled += 1;
    }
    return { recalled, skipped };
  });
}

module.exports = {
  saveCheck, saveChecks, approve, sendBack, recall, WITH_CHECKER, STEPS, STATUS_WORDS, notNow, SEND_BACK_FROM, SEND_BACK_TO,
};
