const { sanitize, parseXml, txt, field, num, tallyDate, findAll } = require('../src/tally/parse');
const {
  exactKey, normKey, compactKey, splitRefs, serialOf, withoutLabel, mask, howTyped, DocIndex,
} = require('../src/docno');
const {
  tallyDateArg, isoFromTally, companiesRequest, mastersRequest, vouchersRequest, ledgerBalancesRequest, eduSafeRange, describeRequest,
  VOUCHER_COLLECTION, BALANCES_COLLECTION,
} = require('../src/tally/requests');
const {
  baseTypeResolver, groupResolver, ledgersFrom, voucherFrom, balancesFrom, GSTIN_RE, panOf, LEDGER_READING, NARRATION_MAX,
} = require('../src/tally/normalize');
const { pullBalances } = require('../src/tally/pull');
const { periods, fyOf, previousFyStart, readEnvFile } = require('../src/util');
const { parseArgs } = require('../src/cli');
const xml = require('../mock/xml');
const { buildDataset } = require('../mock/dataset');

describe('parse', () => {
  test('strips the &#4; prefix and control bytes Tally emits, keeps legal entities', () => {
    expect(sanitize('<A>&#4; Not Applicable</A><B>a&#10;b &amp; c\x01</B>')).toBe('<A> Not Applicable</A><B>a&#10;b &amp; c</B>');
    const t = parseXml('<X><A>&#4; Primary</A><B TYPE="Number"> 0012</B></X>');
    expect(txt(t.X.A)).toBe('Primary');
    expect(txt(t.X.B)).toBe('0012'); // kept as text, not 12
  });

  test('reads fields from child tags or attributes, numbers with units and commas, Tally dates', () => {
    const t = parseXml('<L NAME="Zepto &amp; Co"><PARENT>Debtors</PARENT></L>');
    expect(field(t.L, 'NAME')).toBe('Zepto & Co');
    expect(field(t.L, 'PARENT')).toBe('Debtors');
    expect(num('-1,180.50')).toBe(-1180.5);
    expect(num(' 12 Pcs')).toBe(12);
    expect(num('50.00/Pcs')).toBe(50);
    expect(num('')).toBeNull();
    expect(tallyDate('20260401')).toBe('2026-04-01');
  });

  test('findAll skips scalar nodes that share a tag name (CMPINFO/COMPANY counts)', () => {
    const t = parseXml('<E><CMPINFO><COMPANY>0</COMPANY></CMPINFO><COLLECTION><COMPANY NAME="A"/><COMPANY NAME="B"/></COLLECTION></E>');
    expect(findAll(t, 'COMPANY').map((c) => field(c, 'NAME'))).toEqual(['A', 'B']);
  });
});

describe('docno', () => {
  test('three strengths', () => {
    expect(exactKey(' rm/26-27/001 ')).toBe('RM/26-27/001');
    expect(normKey('RM/26-27/001')).toBe(normKey('RM-26-27-1'));
    expect(normKey('RM / 26_27 . 001')).toBe('RM-26-27-1');
    expect(compactKey('RM/26-27/006')).toBe('RM2627006');
    expect(normKey('RM/26-27/006')).not.toBe(normKey('RM2627006'));
  });

  test('describes how ROMS typed a Tally number', () => {
    expect(howTyped('RM/26-27/1', 'RM/26-27/1')).toBe('as in Tally');
    expect(howTyped('rm-1', 'RM-1')).toBe('case differs');
    expect(howTyped('RM-26-27-001', 'RM/26-27/001')).toBe("'/' typed as '-'");
    expect(howTyped('RM26-27001', 'RM/26-27/001')).toBe("'/' left out");
    expect(howTyped('RM2627001', 'RM/26-27/001')).toBe('all separators left out');
    expect(howTyped('RM-26-27-1', 'RM/26-27/001')).toBe('separators or leading zeros differ');
    expect(howTyped('607', '607/RM/26-27')).toBe('serial only');
    expect(howTyped('0601', '601/RM/26-27')).toBe('serial only, leading zeros differ');
    expect(howTyped('1819', '1219/RM/26-27')).toBe('other');
    expect(howTyped('XYZ', 'RM/26-27/001')).toBe('other');
  });

  test('serial of a voucher number, and a PO number without its label', () => {
    expect(serialOf('607/RM/26-27')).toBe('607');
    expect(serialOf('RM/26-27/012')).toBe('012');
    expect(serialOf('4')).toBe('4');
    expect(serialOf('RM/26-27')).toBe('');
    expect(serialOf('12/RM/34')).toBe(''); // two candidates: no guess
    expect(withoutLabel('P4588464- Dry')).toBe('P4588464');
    expect(withoutLabel('P5120874 - SS')).toBe('P5120874');
    expect(withoutLabel('ZPO-778812')).toBe('');
    expect(withoutLabel('P4741737')).toBe('');
  });

  test('DocIndex answers at the strongest level with a hit, and ignores tiny compact keys', () => {
    const idx = new DocIndex();
    idx.add('RM/26-27/001', 'a');
    idx.add('RM-26-27-001', 'b');
    expect(idx.find('rm-26-27-001')).toEqual({ level: 'exact', entries: ['b'] });
    expect(idx.find('RM_26_27_1')).toEqual({ level: 'normalised', entries: ['a', 'b'] });
    expect(idx.find('RM2627001').level).toBe('compact');
    const tiny = new DocIndex();
    tiny.add('1/2', 'x');
    expect(tiny.find('12').level).toBeNull();
  });

  test('splits multi-PO fields, masks shapes', () => {
    expect(splitRefs('ZPO-1, ZPO-2 & ZPO-3;ZPO-4')).toEqual(['ZPO-1', 'ZPO-2', 'ZPO-3', 'ZPO-4']);
    expect(mask('RM/26-27/012')).toBe('AA/99-99/999');
  });
});

describe('requests', () => {
  test('date forms', () => {
    expect(tallyDateArg('2026-04-01')).toBe('20260401');
    expect(isoFromTally('1-Apr-2026')).toBe('2026-04-01');
    expect(isoFromTally('20260401')).toBe('2026-04-01');
    expect(() => tallyDateArg('01/04/2026')).toThrow();
  });

  test('every request is an export and reads back to what it asks for', () => {
    const company = 'Roymax & Sons <MH>';
    const balances = ledgerBalancesRequest({ company, from: '2026-06-01', to: '2027-03-31' });
    for (const r of [companiesRequest(), mastersRequest({ company, accountType: 'Ledgers' }), vouchersRequest({ company, from: '2026-04-01', to: '2026-04-30' }), balances]) {
      expect(r).toContain('<TALLYREQUEST>Export</TALLYREQUEST>');
      expect(r).not.toMatch(/Import|Create|Alter|Delete/i);
    }
    expect(balances).toContain('ISMODIFY="No"');
    expect(describeRequest(mastersRequest({ company, accountType: 'Ledgers' }))).toMatchObject({ id: 'List of Accounts', company, accountType: 'Ledgers' });
    expect(describeRequest(vouchersRequest({ company, from: '2026-04-01', to: '2026-04-30' }))).toMatchObject({ type: 'Collection', id: VOUCHER_COLLECTION, company, from: '2026-04-01', to: '2026-04-30' });
    expect(describeRequest(balances)).toMatchObject({ type: 'Collection', id: BALANCES_COLLECTION, company, from: '2026-06-01', to: '2027-03-31' });
    expect(describeRequest(companiesRequest()).type).toBe('Collection');
  });

  test('ledger balances are read only as at a date Educational mode keeps, and an empty answer is refused', async () => {
    const company = { name: 'Roymax MH' };
    await expect(pullBalances(null, company, { from: '2026-06-08', asOf: '2027-03-30' })).rejects.toThrow(/1st, 2nd or 31st/);
    const asked = [];
    const client = (data) => ({ post: async (request) => { asked.push(describeRequest(request)); return { tree: parseXml(`<ENVELOPE><BODY><DATA><COLLECTION>${data}</COLLECTION></DATA></BODY></ENVELOPE>`) }; } });
    await expect(pullBalances(client(''), company, { from: '2026-06-08', asOf: '2027-03-31' })).rejects.toThrow(/no ledgers/);
    const list = await pullBalances(client('<LEDGER NAME="A"><GUID>g1</GUID><CLOSINGBALANCE>-5.00</CLOSINGBALANCE></LEDGER>'), company, { from: '2026-06-08', asOf: '2027-03-31' });
    expect(list).toEqual([{ guid: 'g1', name: 'A', closing: -5 }]);
    expect(asked[1]).toMatchObject({ from: '2026-06-01', to: '2027-03-31' }); // the start widened, the date kept
  });

  test('periods are widened to dates Educational mode accepts (1st, 2nd, 31st)', () => {
    expect(eduSafeRange('2026-06-08', '2026-06-30')).toEqual({ from: '2026-06-01', to: '2026-07-01' });
    expect(eduSafeRange('2026-07-01', '2026-07-31')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(eduSafeRange('2026-07-02', '2026-07-02')).toEqual({ from: '2026-07-02', to: '2026-07-02' });
    expect(eduSafeRange('2026-12-05', '2026-12-30')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('normalize', () => {
  test('ledger balances: rupees, negative for a debit, an empty (nil) balance as 0', () => {
    const mh = buildDataset().companies.find((c) => c.code === 'MH');
    const list = balancesFrom(parseXml(xml.balancesXml(mh, '2027-03-31')));
    expect(list).toHaveLength(mh.ledgers.length);
    const zepto = mh.ledgers.findIndex((l) => l.opening);
    expect(list[zepto]).toMatchObject({ guid: `ledger-${zepto}`, name: mh.ledgers[zepto].name });
    expect(list[zepto].closing).toBeLessThan(0); // Zepto owes Roymax
    const bank = mh.ledgers.findIndex((l) => l.name === 'HDFC Bank');
    expect(list.find((b) => b.guid === `ledger-${bank}`).closing).toBe(-7000); // Zepto's receipt, a debit
    const unused = mh.ledgers.findIndex((l) => l.name === 'Input IGST');
    expect(list.find((b) => b.guid === `ledger-${unused}`).closing).toBe(0);
  });

  test('base types: custom → custom → reserved, and a guess without masters', () => {
    const base = baseTypeResolver([
      { name: 'Sales', parent: 'Sales', reserved: 'Sales' },
      { name: 'Sales-Zepto', parent: 'Sales', reserved: '' },
      { name: 'Sales-Zepto-B2B', parent: 'Sales-Zepto', reserved: '' },
      { name: 'CN Marketplace', parent: 'Credit Note', reserved: '' }, // parent not exported
      { name: 'Loop A', parent: 'Loop B', reserved: '' },
      { name: 'Loop B', parent: 'Loop A', reserved: '' },
    ]);
    expect(base('Sales-Zepto-B2B')).toBe('Sales');
    expect(base('CN Marketplace')).toBe('Credit Note');
    expect(base('Loop A')).toBe('Unknown');
    expect(baseTypeResolver([])('Debit Note')).toBe('Debit Note');
    expect(baseTypeResolver([])('Sales GST')).toBe('Sales');
  });

  test('groups resolve to Sundry Debtors through sub-groups', () => {
    const g = groupResolver([
      { name: 'Sundry Debtors', parent: 'Current Assets', reserved: 'Sundry Debtors' },
      { name: 'Current Assets', parent: 'Primary', reserved: 'Current Assets' },
      { name: 'Marketplaces', parent: 'Sundry Debtors', reserved: '' },
    ]);
    expect(g('Marketplaces')).toMatchObject({ debtor: true, primary: 'Current Assets', chain: ['Marketplaces', 'Sundry Debtors', 'Current Assets'] });
  });

  test('ledger GSTIN in either TallyPrime shape; PAN marks our own registrations', () => {
    const ds = buildDataset();
    const mh = ds.companies.find((c) => c.code === 'MH');
    const hr = ds.companies.find((c) => c.code === 'HR');
    const tp3 = ledgersFrom(parseXml(xml.mastersXml(mh, 'Ledgers'))).find((l) => l.name === 'Roymax Haryana Branch');
    const legacy = ledgersFrom(parseXml(xml.mastersXml(hr, 'Ledgers'))).find((l) => /MH$/.test(l.name));
    expect(tp3).toMatchObject({ gstins: ['06ABGFR0562B1ZM'], state: 'Haryana', parent: 'Branch / Divisions' });
    expect(legacy).toMatchObject({ gstins: ['27ABGFR0562B1ZI'], state: 'Maharashtra' });
    expect(GSTIN_RE.test('27ABGFR0562B1ZI')).toBe(true);
    expect(panOf('27ABGFR0562B1ZI')).toBe('ABGFR0562B');
  });

  test('a ledger’s state is its latest dated address, never a GST rate block’s "Any"', () => {
    const mh = buildDataset().companies.find((c) => c.code === 'MH');
    const tree = parseXml(xml.mastersXml(mh, 'Ledgers'));
    const scootsy = ledgersFrom(tree).find((l) => l.name === 'Scootsy Logistics Pvt Ltd');
    expect(scootsy).toMatchObject({ state: 'Maharashtra', gstins: ['27AAICS4785M1ZW'] }); // not West Bengal (2022), not Any
    // Read as of a day before the correction, the older entry applies.
    const before = ledgersFrom(tree, { asOf: '2024-01-01' }).find((l) => l.name === 'Scootsy Logistics Pvt Ltd');
    expect(before.state).toBe('West Bengal');
    expect(LEDGER_READING).toBe(2);
  });

  test('a long narration is kept whole, up to 2,000 characters', () => {
    const long = 'Being payment received against :- '.concat(Array.from({ length: 120 }, (_, i) => `${500 + i}/RM/26-27`).join(','));
    const v = voucherFrom({ VOUCHERTYPENAME: 'Receipt', GUID: 'g1', DATE: '20260701', NARRATION: long });
    expect(long.length).toBeGreaterThan(300);
    expect(v.narration).toBe(long.slice(0, NARRATION_MAX));
    expect(NARRATION_MAX).toBe(2000);
  });

  test('vouchers in invoice view and accounting view', () => {
    const ds = buildDataset();
    const mh = ds.companies.find((c) => c.code === 'MH');
    const parse = (num) => voucherFrom(findAll(parseXml(xml.voucherXml(mh.vouchers.find((v) => v.number === num), mh)), 'VOUCHER')[0]);
    const sale = parse('RM/26-27/001');
    expect(sale).toMatchObject({ number: 'RM/26-27/001', date: '2026-04-05', invoice: true, cmpGstin: '27ABGFR0562B1ZI', total: 7875, orders: [{ no: 'ZPO-778812', date: '2026-04-02' }] });
    expect(sale.inventoryLines.map((i) => [i.item, i.qty, i.unit, i.rate])).toEqual([['RMB-RED-01', 100, 'Pcs', 50], ['RMB-BLU-01', 50, 'Pcs', 50]]);
    expect(sale.ledgerLines[0]).toMatchObject({ isParty: true, debit: true, bills: [{ name: 'RM/26-27/001', type: 'New Ref', amount: -7875 }] });
    expect(sale.docFields['INVOICEORDERLIST.LIST/BASICPURCHASEORDERNO']).toEqual(['ZPO-778812']);
    const cn = parse('CN/26-27/001');
    expect(cn).toMatchObject({ invoice: false, reference: 'ZCN-9981', party: 'Kiranakart Technologies Pvt Ltd (Zepto)' });
    expect(cn.ledgerLines.flatMap((l) => l.bills)).toEqual([{ name: 'RM/26-27/001', type: 'Agst Ref', amount: 262.5 }]);
    // "Not Applicable" order numbers are not kept as references.
    expect(parse('RM/26-27/006').docFields['ALLINVENTORYENTRIES.LIST/BATCHALLOCATIONS.LIST/ORDERNO']).toBeUndefined();
  });
});

describe('util and cli args', () => {
  test('periods by month and by days, financial years', () => {
    expect(periods('2026-03-15', '2026-05-02')).toEqual([
      { from: '2026-03-15', to: '2026-03-31' }, { from: '2026-04-01', to: '2026-04-30' }, { from: '2026-05-01', to: '2026-05-02' },
    ]);
    expect(periods('2026-02-27', '2026-03-03', 2)).toEqual([
      { from: '2026-02-27', to: '2026-02-28' }, { from: '2026-03-01', to: '2026-03-02' }, { from: '2026-03-03', to: '2026-03-03' },
    ]);
    expect(fyOf('2026-03-31')).toBe('2025-26');
    expect(fyOf('2026-04-01')).toBe('2026-27');
    expect(previousFyStart('2026-10-03')).toBe('2025-04-01');
  });

  test('parseArgs: repeatable flags, --k=v, booleans', () => {
    expect(parseArgs(['probe', '--company', 'MH', '--company=HR', '--keep-raw', '--from', '2026-04-01'])).toEqual({
      _: ['probe'], company: ['MH', 'HR'], 'keep-raw': true, from: '2026-04-01',
    });
  });

  test('readEnvFile handles quotes, comments and export', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rams-env-')), '.env');
    fs.writeFileSync(f, '# c\nexport A="x y"\nB=z # note\nC=\'q\'\n');
    expect(readEnvFile(f)).toEqual({ A: 'x y', B: 'z', C: 'q' });
  });
});
