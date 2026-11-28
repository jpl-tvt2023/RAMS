import { downloadXlsx } from './xlsx';

// A report's rows as an Excel file the browser downloads (Excel only, the
// user 2026-11-29: no CSV -- Excel can save a CSV itself if one is needed).
//   columns: [[header, row => value, type?]]; type 'money': the value is
//   paise, written as rupees, a number Excel can add up.
// name is the file name without its extension; sheet names the Excel sheet
// (else the file name).
export function downloadTable(name, columns, rows, { sheet } = {}) {
  return downloadXlsx(`${name}.xlsx`, columns, rows, { sheet: sheet || name });
}
