import { describe, test, expect } from 'vitest';
import {
  CHECK, LEGEND, noteStatus, dnNumbers, cellFindings, paiseFrom, balance, signed,
} from '../statementText';
import { AUTOFILL_LEGEND } from '../autofillText';
import { OUTCOMES } from '../matchReasons';
import { NO_NARRATION, NO_FILE } from '../highlights';

describe('ledger text', () => {
  test('one colour, one meaning: no colour stands for two things on Party Statements', () => {
    const colors = Object.values(CHECK).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(LEGEND.map((l) => l.key)).toEqual(Object.keys(CHECK));
    // Every row is Tally's, so the only finding is two readings that disagree.
    expect(noteStatus({ status: 'booked_twice', also_on: { number: '907', date: '2026-10-01' } })).toMatchObject({ color: 'purple', label: 'DN booked twice' });
    // Nothing is missing on the other side any more: no red on Party Statements.
    expect(colors).not.toContain('red');
    // The yellow highlight is nobody's badge colour.
    expect(NO_NARRATION.className).toMatch(/yellow/);
    expect(colors.join(' ')).not.toMatch(/yellow/);
    // Orange means only "a Tally row with no file": not a badge, not the
    // narration highlight.
    expect(NO_FILE.className).toMatch(/orange/);
    expect(NO_FILE.row).toMatch(/orange/);
    expect(colors.join(' ')).not.toMatch(/orange/);
    expect(NO_NARRATION.className).not.toMatch(/orange/);
    expect(`${NO_FILE.className} ${NO_FILE.row}`).not.toMatch(/red|yellow/);
  });

  test('the other legends use each colour for one meaning too', () => {
    for (const legend of [AUTOFILL_LEGEND, Object.values(OUTCOMES)]) {
      const colors = legend.map((l) => l.color);
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  test('a credit note: the DN numbers its narration names, and a DN booked twice', () => {
    expect(dnNumbers({ status: null, named: ['FKIDN51803946'] })).toBe('DN FKIDN51803946');
    expect(dnNumbers({ status: null, named: ['RTDN00019933', 'FKIDN51463346'] })).toBe('DN RTDN00019933, FKIDN51463346');
    expect(dnNumbers({ status: null, named: [] })).toBe(''); // our own CN
    expect(dnNumbers(null)).toBe('');
    const twice = noteStatus({ status: 'booked_twice', named: ['D499900DN2631041'], also_on: { number: '907', date: '2026-10-01' } });
    expect(twice.detail).toBe('Also on CN 907 of 01 Oct 2026');
    expect(noteStatus({ status: null, named: [] })).toBeNull();
    expect(noteStatus(null)).toBeNull();
  });

  test('a cell is tinted when a DN is booked twice there, with a chip and a sentence', () => {
    const f = cellFindings({ booked_twice: 2 });
    expect(f.tint).toBe('bg-purple-50');
    expect(f.chips.map((c) => [c.meaning, c.count])).toEqual([['differs', 2]]);
    expect(f.sentence).toBe('2 DN booked twice');
    expect(cellFindings({ booked_twice: 0 })).toEqual({ chips: [], tint: '', sentence: '' });
    expect(cellFindings().chips).toEqual([]);
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
