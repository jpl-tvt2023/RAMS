import { describe, test, expect } from 'vitest';
import {
  CHECK, LEGEND, entryStatus, noteStatus, cellFindings, paiseFrom, balance, signed,
} from '../ledgerText';
import { AUTOFILL_LEGEND } from '../autofillText';
import { OUTCOMES } from '../matchReasons';
import { NO_NARRATION } from '../highlights';

describe('ledger text', () => {
  test('one colour, one meaning: no colour stands for two things on Ledgers', () => {
    const colors = Object.values(CHECK).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(LEGEND.map((l) => l.key)).toEqual(Object.keys(CHECK));
    // Red only ever means missing on the other side.
    expect(entryStatus({ status: 'missing' }).color).toBe('red');
    expect(noteStatus({ status: 'not_entered', entries: [] }).color).toBe('red');
    expect(entryStatus({ status: 'amount_differs', tally: { number: '904', amount_paise: 12000 } }).color).toBe('purple');
    expect(noteStatus({ status: 'booked_twice', entries: [], also_on: { number: '907', date: '2026-10-01' } })).toMatchObject({ color: 'purple', label: 'DN booked twice' });
    // The yellow highlight is nobody's badge colour.
    expect(NO_NARRATION.className).toMatch(/yellow/);
    expect(colors.join(' ')).not.toMatch(/yellow/);
  });

  test('the other legends use each colour for one meaning too', () => {
    for (const legend of [AUTOFILL_LEGEND, Object.values(OUTCOMES)]) {
      const colors = legend.map((l) => l.color);
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  test('a cell is tinted with its most urgent finding, with a chip per kind', () => {
    const f = cellFindings({
      missing: 1, not_entered: 1, amount_differs: 1, booked_twice: 0, by_amount: 2, waiting: 0,
    }, 'DN');
    expect(f.tint).toBe('bg-red-50');
    expect(f.chips.map((c) => [c.meaning, c.count])).toEqual([['missing', 2], ['differs', 1], ['by_amount', 2]]);
    expect(f.sentence).toBe('1 DN not in Tally, 1 in Tally not entered here, 1 amount differs, 2 matched by amount');
    expect(cellFindings({ waiting: 1 }).tint).toBe('');
    expect(cellFindings({}).chips).toEqual([]);
  });

  test('a matched-by-amount note says what to fix in Tally', () => {
    const s = entryStatus({ status: 'by_amount', number: 'ZPDN123456', tally: { number: '906', date: '2026-09-15', voucher_type: 'Credit Note' } });
    expect(s.detail).toMatch(/^CN 906 on 15 Sept? 2026 has the same amount\. Add ZPDN123456 to its narration in Tally\.$/);
    expect(noteStatus({ status: 'not_checked', entries: [] }).color).toBeNull(); // plain text, no badge
  });

  test('amounts', () => {
    expect(paiseFrom('1,180.50')).toBe(118050);
    expect(paiseFrom('-5')).toBeNull();
    expect(balance(101900)).toBe('₹1,019.00 Dr');
    expect(balance(-500)).toBe('₹5.00 Cr');
    expect(signed(-300)).toBe('−₹3.00');
    expect(signed(0)).toBe('—');
  });
});
