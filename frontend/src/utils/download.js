import { downloadCsv, rupeesForCsv } from './csv';
import { downloadXlsx } from './xlsx';

// A report's rows as a file the browser downloads: 'csv' or 'xlsx' (Excel),
// from one list of columns, so both carry the same figures.
//   columns: [[header, row => value, type?]]
//   type 'money': the value is paise -- rupees with two decimals in the CSV
//   (as rupeesForCsv always wrote them) and a number in Excel.
// name is the file name without its extension; sheet names the Excel sheet
// (else the file name).
export function downloadTable(format, name, columns, rows, { sheet } = {}) {
  if (format === 'xlsx') return downloadXlsx(`${name}.xlsx`, columns, rows, { sheet: sheet || name });
  return downloadCsv(`${name}.csv`, columns.map(([h, get, type]) => [h, type === 'money' ? (r) => rupeesForCsv(get(r)) : get]), rows);
}
