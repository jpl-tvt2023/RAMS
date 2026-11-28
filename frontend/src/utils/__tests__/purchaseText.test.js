import { describe, test, expect } from 'vitest';
import {
  notesOf, maySend, mayAttach, mayApprove, mayRecall, maySendBack, QUEUES, isTab, rowFill,
} from '../purchaseText';

const base = {
  id: 1, status: 'to_check', lines: [{ key: 'r1' }], files: [], check: null, purchase_approval: null, accounts_approval: null, sent_back: null, changed: null,
};
const rec = (over) => ({ ...base, ...over });
const texts = (r) => notesOf(r).map((n) => n.text);
const tones = (r) => notesOf(r).map((n) => n.tone);
const CHECK = { name: 'Asha', at: '2026-11-20 05:00:00', note: null };
const PIA = { name: 'Pia', at: '2026-11-21 05:00:00' };
const RAVI = { name: 'Ravi', at: '2026-11-22 05:00:00' };

describe('the Note column: one note per stage, oldest first', () => {
  test('a new line says it has no bill; attaching one says how many files', () => {
    expect(texts(rec())).toEqual(['No bill attached']);
    expect(tones(rec())).toEqual(['muted']);
    expect(texts(rec({ files: [{ id: 1 }] }))).toEqual(['Bill attached · 1 file']);
    expect(texts(rec({ files: [{ id: 1 }, { id: 2 }] }))).toEqual(['Bill attached · 2 files']);
  });

  test('each stage adds a line: sent (with the note if typed), then each head', () => {
    expect(texts(rec({ status: 'with_purchase_head', check: CHECK }))).toEqual(['No bill attached', 'Sent for approval by Asha']);
    expect(texts(rec({ status: 'with_purchase_head', check: { ...CHECK, note: 'Matches the PO' } }))[1]).toBe('Sent for approval by Asha: “Matches the PO”');
    expect(texts(rec({
      status: 'approved', files: [{ id: 1 }], check: CHECK, purchase_approval: PIA, accounts_approval: RAVI,
    }))).toEqual(['Bill attached · 1 file', 'Sent for approval by Asha', 'Purchase Head approved (Pia)', 'Accountant Head approved (Ravi)']);
  });

  test('sent back is the one red note, with who, which head and why, in whichever queue it went to', () => {
    const r = rec({
      status: 'with_purchase_head', check: CHECK, sent_back: { ...RAVI, step: 'accounts', reason: 'Paid twice' },
    });
    expect(texts(r)).toEqual(['No bill attached', 'Sent for approval by Asha', 'Sent back by Ravi (Accountant Head): Paid twice']);
    expect(tones(r)).toEqual(['muted', 'plain', 'red']);
    // RAMS sent back the lines that had reached a head without a bill.
    expect(texts(rec({ sent_back: { name: null, at: '2026-11-29 05:00:00', step: null, reason: 'No bill attached — attach the bill and send it again' } })).at(-1))
      .toBe('Sent back by RAMS: No bill attached — attach the bill and send it again');
  });

  test('a ROMS change (To check) lists up to three changes, with its time; removed in ROMS is muted', () => {
    const changes = [1, 2, 3, 4].map((i) => ({ field: `F${i}`, old: String(i), new: null }));
    const changed = notesOf(rec({ status: 'to_check', check: CHECK, changed: { at: '2026-11-23 05:00:00', changes } })).at(-1);
    expect(changed.text).toBe('Changes were made in ROMS: F1: 1 → —; F2: 2 → —; F3: 3 → —; and 1 more (see the history)');
    expect(changed.at).toBe('2026-11-23 05:00:00');
    expect(notesOf(rec({ status: 'removed' })).at(-1)).toMatchObject({ text: 'Removed in ROMS', tone: 'muted' });
  });
});

describe('who may do what on a line', () => {
  const checker = { check: true };
  const ph = { purchase: true };
  const ah = { accounts: true };
  const admin = { check: true, purchase: true, accounts: true };

  const BILL = [{ id: 1 }];

  test('send: the checker, while the line is with them, still in ROMS, and only with a bill', () => {
    expect(maySend(rec({ files: BILL }), checker)).toBe(true);
    expect(maySend(rec(), checker)).toBe(false);
    expect(mayAttach(rec(), checker)).toBe(true);
    expect(maySend(rec({ status: 'with_purchase_head', files: BILL }), checker)).toBe(false);
    expect(mayAttach(rec({ status: 'with_purchase_head' }), checker)).toBe(false);
    expect(maySend(rec({ files: BILL }), ph)).toBe(false);
    expect(maySend(rec({ files: BILL, lines: [{ key: 'r1', removed: true }] }), checker)).toBe(false);
  });

  test('approve: the head whose step it waits for, with a bill', () => {
    expect(mayApprove(rec({ status: 'with_purchase_head', files: BILL }), ph)).toBe(true);
    expect(mayApprove(rec({ status: 'with_purchase_head' }), ph)).toBe(false);
    expect(mayApprove(rec({ status: 'with_purchase_head', files: BILL }), ah)).toBe(false);
    expect(mayApprove(rec({ status: 'with_accounts_head', files: BILL }), ah)).toBe(true);
    expect(mayApprove(rec({ status: 'approved', files: BILL }), admin)).toBe(false);
  });

  test('recall: one\'s own step until the next person acts; never an approved line', () => {
    expect(mayRecall(rec({ status: 'with_purchase_head' }), checker)).toBe(true);
    expect(mayRecall(rec({ status: 'with_purchase_head' }), ph)).toBe(false);
    expect(mayRecall(rec({ status: 'with_accounts_head' }), ph)).toBe(true);
    expect(mayRecall(rec({ status: 'with_accounts_head' }), checker)).toBe(false);
    expect(mayRecall(rec({ status: 'approved' }), admin)).toBe(false);
    expect(mayRecall(rec({ status: 'to_check' }), admin)).toBe(false);
    // The Accountant Head sent it back to the Purchase Head: not the checker's to recall.
    expect(mayRecall(rec({ status: 'with_purchase_head', sent_back: { ...RAVI, step: 'accounts', reason: 'x' } }), checker)).toBe(false);
  });

  test('send back: a head at their step or after it, even once approved', () => {
    expect(['with_purchase_head', 'with_accounts_head', 'approved'].map((status) => maySendBack(rec({ status }), 'purchase', ph))).toEqual([true, true, true]);
    expect(['with_purchase_head', 'with_accounts_head', 'approved'].map((status) => maySendBack(rec({ status }), 'accounts', ah))).toEqual([false, true, true]);
    expect(maySendBack(rec({ status: 'approved' }), 'accounts', ph)).toBe(false);
    expect(maySendBack(rec({ status: 'to_check' }), 'purchase', admin)).toBe(false);
  });
});

describe('the five tabs and the two colours', () => {
  test('four queues, then All; an old saved tab is not one of them', () => {
    expect(QUEUES.map((q) => q.label)).toEqual(['To check', 'With Purchase Head', 'With Accountant Head', 'Approved']);
    expect(['to_check', 'all', 'sent_back', 'changed', 'removed'].map(isTab)).toEqual([true, true, false, false, false]);
  });

  test('green when approved, red while sent back, else nothing', () => {
    expect(rowFill(rec({ status: 'approved' }))).toBe('bg-green-50');
    expect(rowFill(rec({ status: 'with_purchase_head', sent_back: { step: 'accounts', reason: 'x' } }))).toBe('bg-red-50');
    expect(rowFill(rec({ status: 'to_check', changed: { changes: [] } }))).toBe('');
    expect(rowFill(rec())).toBe('');
  });
});
