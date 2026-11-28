import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

// The user's rule (2026-11-28): every table in RAMS keeps its header row in
// view while it scrolls (components/ui/tableBox.js). This reads every screen's
// source and fails on a <thead> that isn't sticky, so a new table can't miss it.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' || name === 'test' ? [] : sources(p);
    return p.endsWith('.jsx') ? [p] : [];
  });
}

describe('every table keeps its header in view', () => {
  test('each <thead> is sticky (STICKY_HEAD)', () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(20);
    const missing = [];
    let heads = 0;
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/<thead\b[^>]*>/g)) {
        heads += 1;
        if (!/STICKY_HEAD|sticky top-0/.test(m[0])) missing.push(`${relative(SRC, f)}: ${m[0]}`);
      }
    }
    expect(heads).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});
