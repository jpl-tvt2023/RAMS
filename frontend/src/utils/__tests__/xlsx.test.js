import {
  describe, test, expect, vi, beforeEach,
} from 'vitest';
import { toXlsx, colName } from '../xlsx';
import { crc32 } from '../zip';
import { downloadTable } from '../download';
import { saveBlob } from '../csv';

vi.mock('../csv', async (original) => ({ ...(await original()), saveBlob: vi.fn() }));

// Reads back a stored (uncompressed) zip: { name: text }, checking each CRC.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 8, true)).toBe(0); // stored
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}
const wellFormed = (xml) => new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('parsererror').length === 0;

const COLUMNS = [
  ['PO', (r) => r.po], ['Rate', (r) => r.rate], ['Amount', (r) => r.amount, 'money'], ['Note', (r) => r.note], ['Empty', () => null],
];
const ROWS = [
  {
    po: '095', rate: 19.75, amount: 12988395, note: 'A & B <c> "d"',
  },
  {
    po: '161', rate: 0, amount: null, note: 'ok',
  },
];

describe('Excel downloads (utils/xlsx.js, no library)', () => {
  beforeEach(() => vi.clearAllMocks());

  test('a zip of the parts Excel needs, every part well-formed', () => {
    const files = unzip(toXlsx(COLUMNS, ROWS, { sheet: 'Warehouse' }));
    expect(Object.keys(files)).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml',
    ]);
    for (const [name, xml] of Object.entries(files)) expect(wellFormed(xml), name).toBe(true);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Warehouse" sheetId="1" r:id="rId1"/>');
  });

  test('a bold, frozen header with a filter; numbers as numbers, money in rupees, text as text', () => {
    const sheet = unzip(toXlsx(COLUMNS, ROWS))['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">PO</t></is></c>');
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<autoFilter ref="A1:E3"/>');
    // PO "095" keeps its zero: it is text.
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">095</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>19.75</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0</v></c>');
    expect(sheet).toContain('<c r="C2" s="2"><v>129883.95</v></c>');
    expect(sheet).not.toContain('r="C3"'); // no amount: an empty cell
    expect(sheet).not.toContain('r="E2"');
    expect(sheet).toContain('A &amp; B &lt;c&gt; &quot;d&quot;');
  });

  test('a sheet name Excel takes; column letters past Z', () => {
    const wb = unzip(toXlsx(COLUMNS, [], { sheet: 'Q1/Q2: [draft] report for the whole year 2026' }))['xl/workbook.xml'];
    expect(wb).toContain('<sheet name="Q1 Q2   draft  report for the w" '); // 31 characters, no [ ] : /
    expect([0, 25, 26, 51, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
  });

  test('downloadTable: the CSV keeps writing money as rupees; Excel is an .xlsx', async () => {
    // The CSV goes through csv.js's own link (its saveBlob isn't the mocked export).
    const made = [];
    URL.createObjectURL = vi.fn((blob) => { made.push(blob); return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function remember() { made.push(this.download); });
    downloadTable('csv', 'rams-test', COLUMNS, ROWS);
    click.mockRestore();
    expect(made[1]).toBe('rams-test.csv');
    const text = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsText(made[0]); });
    expect(text.replace(String.fromCharCode(0xfeff), '').split(String.fromCharCode(10))).toEqual([
      'PO,Rate,Amount,Note,Empty', '095,19.75,129883.95,"A & B <c> ""d""",', '161,0,,ok,',
    ]);
    downloadTable('xlsx', 'rams-test', COLUMNS, ROWS);
    expect(saveBlob.mock.calls[0][0]).toBe('rams-test.xlsx');
  });
});
