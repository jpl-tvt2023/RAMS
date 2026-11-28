// Purchase Reports: the bill check and the two approvals (the user's flow,
// 2026-11-28), on each line's own record. Every move is one transaction with
// its audit row on the record (entity purchase_records), so its history shows
// who did what and when. The checker may save one check on several lines of
// a delivery at once, and a head may approve several lines at once -- each
// line still gets its own history row.
//
//   to_check / sent_back / changed --(bill check)--> with_purchase_head
//   with_purchase_head --(Purchase Head approves)--> with_accounts_head
//   with_accounts_head --(Accountant Head approves)--> approved
//   with_purchase_head / with_accounts_head --(that head sends back, with a reason)--> sent_back
//
// Sending back is the heads' "reject": the record returns to the bill check,
// and once it is saved again it starts over at the Purchase Head. A change in
// ROMS after the bill check also sends it back (refresh.js).
const { logAction } = require('../services/auditLog.service');
const { snapshotOf, recordLabel } = require('./lines');
const { currentLines } = require('./records');

const NOTE_MAX = 500;
const REASON_MAX = 500;
const APPROVE_MAX = 500;

// The statuses in which the checker has the record: a bill check can be saved
// and files added or removed.
const WITH_CHECKER = ['to_check', 'sent_back', 'changed'];

const STEPS = {
  purchase: {
    from: 'with_purchase_head', to: 'with_accounts_head', head: 'Purchase Head', by: 'purchase_approved_by', at: 'purchase_approved_at',
  },
  accounts: {
    from: 'with_accounts_head', to: 'approved', head: 'Accountant Head', by: 'accounts_approved_by', at: 'accounts_approved_at',
  },
};

const STATUS_WORDS = {
  to_check: 'To check',
  with_purchase_head: 'With Purchase Head',
  with_accounts_head: 'With Accountant Head',
  approved: 'Approved',
  sent_back: 'Sent back',
  changed: 'Changed in ROMS',
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
  if (!step) return `This record is ${STATUS_WORDS[status].toLowerCase()} — it can be changed again once a head sends it back`;
  if (status !== STEPS[step].from) return `This record is ${STATUS_WORDS[status].toLowerCase()}, not waiting for the ${STEPS[step].head}`;
  return null;
}

async function recordFor(tx, id) {
  const [r] = await rowsOf(tx, 'SELECT id, kind, status FROM purchase_records WHERE id = ?', [Number(id) || 0]);
  if (!r) throw fail(404, 'That purchase record isn’t in RAMS');
  return r;
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
      const res = await tx.execute({
        sql: `UPDATE purchase_records SET status = ?, ${s.by} = ?, ${s.at} = datetime('now'), updated_at = datetime('now')
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

/** A head sends a record back to the bill check, with a reason. */
async function sendBack(db, id, step, user, { reason } = {}) {
  const s = STEPS[step];
  const why = String(reason ?? '').trim();
  if (!why) throw fail(400, 'Say why it is being sent back');
  if (why.length > REASON_MAX) throw fail(400, `Keep the reason to ${REASON_MAX} characters`);
  return inTx(db, async (tx) => {
    const r = await recordFor(tx, id);
    const blocked = notNow(r.status, step);
    if (blocked) throw fail(409, blocked);
    const res = await tx.execute({
      sql: `UPDATE purchase_records
               SET status = 'sent_back', sent_back_by = ?, sent_back_at = datetime('now'), sent_back_step = ?, sent_back_reason = ?,
                   purchase_approved_by = NULL, purchase_approved_at = NULL, accounts_approved_by = NULL, accounts_approved_at = NULL,
                   updated_at = datetime('now')
             WHERE id = ? AND status = ?`,
      args: [user.id, step, why, r.id, s.from],
    });
    if (!res.rowsAffected) throw fail(409, 'Someone changed this record just now — open it again');
    const label = recordLabel(r.kind, await currentLines(tx, r.id));
    await logAction({
      client: tx,
      userId: user.id,
      actionType: 'PURCHASE_SEND_BACK',
      description: `Sent back by the ${s.head} — ${label}. Reason: ${why}`,
      entityType: 'purchase_records',
      entityId: r.id,
      changes: [{ field: 'Status', old: STATUS_WORDS[s.from], new: STATUS_WORDS.sent_back }],
    });
    return { id: Number(r.id), status: 'sent_back' };
  });
}

module.exports = {
  saveCheck, saveChecks, approve, sendBack, WITH_CHECKER, STEPS, STATUS_WORDS, notNow,
};
