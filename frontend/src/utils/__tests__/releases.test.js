import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HELD, PERM_SCREENS, isReleased, permissionReleased } from '../releases';
import { NAV, PERM } from '../roles';
import { HELP_SECTIONS } from '../../help';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.resolve(HERE, '../../App.jsx'), 'utf8');
const routes = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);

// The Reports screens are delivered one at a time: a held screen is built and
// routed, but not shown anywhere.
describe('screens held for later delivery', () => {
  test('every held or permission-governed screen is a real route', () => {
    for (const p of [...HELD, ...Object.values(PERM_SCREENS).flat()]) {
      expect({ path: p, routed: routes.includes(p) }).toEqual({ path: p, routed: true });
    }
  });

  test('the addresses the renamed pages had before still lead to them', () => {
    expect(appSource).toContain('<Route path="/reports/debtors" element={<Navigate to="/reports/bills-receivable" replace />} />');
    expect(appSource).toContain('<Route path="/ledgers" element={<Navigate to="/reports/party-statements" replace />} />');
    const leaves = NAV.flatMap((n) => (n.children ? n.children : [n])).map((n) => n.path);
    expect(leaves).toEqual(expect.arrayContaining(['/reports/bills-receivable', '/reports/party-statements']));
    expect(leaves).not.toContain('/reports/debtors');
    expect(leaves).not.toContain('/ledgers');
  });

  test('a held screen is not in the top bar, and no group is left empty', () => {
    for (const entry of NAV) {
      if (entry.children) {
        expect(entry.children.length).toBeGreaterThan(0);
        for (const c of entry.children) expect(isReleased(c.path)).toBe(true);
      } else {
        expect(isReleased(entry.path)).toBe(true);
      }
    }
    expect(NAV.map((n) => n.label)).toContain('Matching');
    expect(NAV.find((n) => n.label === 'Tally Reports').children.map((c) => c.label)).toEqual(['Bills Receivable', 'Party Statements', 'Attachments']);
    expect(NAV.find((n) => n.label === 'Party Statements')).toBeUndefined(); // only under Tally Reports
    expect(NAV.find((n) => n.label === 'Purchase Reports').children.map((c) => [c.label, c.path, c.permission]))
      .toEqual([['Warehouse', '/purchases/warehouse', 'purchases.view'], ['Stitching', '/purchases/stitching', 'purchases.view']]);
    expect(NAV.some((n) => n.comingSoon)).toBe(false);
  });

  test('a held screen has no Help section', () => {
    for (const s of HELP_SECTIONS) if (s.path) expect(isReleased(s.path)).toBe(true);
  });

  test('a permission shows on Roles & permissions once any of its screens is released', () => {
    for (const key of Object.keys(PERM_SCREENS)) {
      expect(Object.values(PERM)).toContain(key);
      expect(permissionReleased(key)).toBe(PERM_SCREENS[key].some(isReleased));
    }
    expect(permissionReleased(PERM.MATCHING_VIEW)).toBe(true);
    expect(permissionReleased(PERM.AUTOFILL_APPROVE)).toBe(true);
  });
});
