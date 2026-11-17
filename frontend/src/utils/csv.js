// A list as a CSV file the browser downloads. columns: [[header, row => value]].
export function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(([h]) => cell(h)).join(','), ...rows.map((r) => columns.map(([, f]) => cell(f(r))).join(','))].join('\n');
}

// Hands a Blob to the browser to save under `filename`.
export function saveBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename, columns, rows) {
  saveBlob(filename, new Blob([`\uFEFF${toCsv(columns, rows)}`], { type: 'text/csv;charset=utf-8' }));
}

// Paise as plain rupees for a spreadsheet: 12988395 -> 129883.95
export const rupeesForCsv = (paise) => (paise == null ? '' : (Number(paise) / 100).toFixed(2));
