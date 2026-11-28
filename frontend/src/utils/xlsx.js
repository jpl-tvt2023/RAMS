import { zipStore } from './zip';
import { saveBlob } from './csv';

// A list as an Excel workbook (.xlsx) the browser downloads: one sheet, the
// header row bold, frozen and with a filter, columns sized to their contents.
// Columns are the CSV's: [header, row => value, type?]. A JS number is a
// number in Excel; type 'money' takes paise and shows rupees with two decimals;
// anything else is text as it is, so a PO "095" keeps its zero. No library:
// an .xlsx is a zip of a few XML files (utils/zip.js).

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_TEXT = 32767; // Excel's longest cell
const STYLE = { head: 1, money: 2 };

const xml = (s) => String(s)
  // characters XML can't carry at all
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// A, B, ... Z, AA, AB ...
export function colName(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// What one value becomes: { text } | { num, style } | null for an empty cell.
function cellOf(value, type) {
  if (value == null || value === '') return null;
  if (type === 'money') {
    const n = Number(value) / 100;
    return Number.isFinite(n) ? { num: Math.round(n * 100) / 100, style: STYLE.money } : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? { num: value } : null;
  return { text: String(value).slice(0, MAX_TEXT) };
}

const cellXml = (ref, c, style) => {
  const s = style ?? c.style;
  const sAttr = s ? ` s="${s}"` : '';
  if (c.num != null) return `<c r="${ref}"${sAttr}><v>${c.num}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${sAttr}><is><t xml:space="preserve">${xml(c.text)}</t></is></c>`;
};

// An Excel sheet name: at most 31 characters, none of []:*?/\.
const sheetName = (s) => (String(s || 'Sheet1').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet1');

function sheetXml(columns, rows) {
  const width = columns.map(([h]) => String(h).length);
  const body = rows.map((row, i) => {
    const r = i + 2;
    const cells = columns.map(([, get, type], j) => {
      const c = cellOf(get(row), type);
      if (!c) return '';
      const shown = c.num != null ? (type === 'money' ? c.num.toFixed(2).length + 3 : String(c.num).length) : c.text.length;
      width[j] = Math.max(width[j], Math.min(shown, 60));
      return cellXml(`${colName(j)}${r}`, c);
    }).join('');
    return `<row r="${r}">${cells}</row>`;
  });
  const head = `<row r="1">${columns.map(([h], j) => cellXml(`${colName(j)}1`, { text: h }, STYLE.head)).join('')}</row>`;
  const last = `${colName(Math.max(columns.length - 1, 0))}${rows.length + 1}`;
  const cols = columns.map((_, j) => `<col min="${j + 1}" max="${j + 1}" width="${Math.max(8, width[j] + 2)}" customWidth="1"/>`).join('');
  return `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL}">`
    + `<dimension ref="A1:${last}"/>`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${cols}</cols>`
    + `<sheetData>${head}${body.join('')}</sheetData>`
    + `<autoFilter ref="A1:${last}"/>`
    + '</worksheet>';
}

const STYLES = `${HEAD}<styleSheet xmlns="${NS}">`
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/** The workbook's bytes. columns: [[header, row => value, type?]]. */
export function toXlsx(columns, rows, { sheet = 'Sheet1' } = {}) {
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: `${HEAD}<Relationships xmlns="${PKG}">`
        + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets>`
        + `<sheet name="${xml(sheetName(sheet))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${HEAD}<Relationships xmlns="${PKG}">`
        + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
        + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(columns, rows) },
  ]);
}

export function downloadXlsx(filename, columns, rows, opts) {
  saveBlob(filename, new Blob([toXlsx(columns, rows, opts)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
