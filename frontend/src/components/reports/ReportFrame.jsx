import { useState } from 'react';
import { Search, FileSpreadsheet } from 'lucide-react';
import AppShell from '../layout/AppShell';
import Button from '../ui/Button';
import HelpLink from '../shared/HelpLink';
import {
  TABLE_BOX, FIT_SCREEN, STICKY_HEAD, HEAD_CELL,
} from '../ui/tableBox';

export const selectCls = 'px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/30';

// The frame every Reports page shares: title (Help at the right edge, lined
// up with the downloads), a line on what it shows, the company filter (All =
// consolidated, unless allCompanies is false: one company at a time), a search
// box, extra filters (before the search box with filtersFirst), and the
// download -- onDownload() gives "Download Excel" (utils/download.js). Excel
// only: no CSV (the user, 2026-11-29).
export default function ReportFrame({
  title, help, intro, companies = [], companyId, onCompany, allCompanies = true, search, onSearch, searchHint, filters, filtersFirst = false, onDownload, children,
}) {
  const [text, setText] = useState(search || '');
  return (
    <AppShell>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-brand">{title}</h1>
          <HelpLink section={help} />
        </div>
        <p className="text-gray-500 text-sm mt-1 max-w-4xl">{intro}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {onCompany && (
          <select aria-label="Company" value={companyId} onChange={(e) => onCompany(e.target.value)} className={selectCls}>
            {allCompanies && <option value="">All companies (consolidated)</option>}
            {companies.map((c) => <option key={c.id} value={c.id}>{c.code || c.name}</option>)}
          </select>
        )}
        {filtersFirst && filters}
        {onSearch && (
          <form onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()); }} className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input aria-label="Search" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== search && onSearch(text.trim())}
              placeholder={searchHint} className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-64 max-w-full" />
          </form>
        )}
        {!filtersFirst && filters}
        {onDownload && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onDownload()}><FileSpreadsheet size={14} /> Download Excel</Button>
          </div>
        )}
      </div>
      {children}
    </AppShell>
  );
}

// A table with a header row, loading rows and an empty line. It scrolls
// inside its box -- at most the screen's height (ui/tableBox.js), or the
// maxHeight (a Tailwind max-h class) given -- its header staying in view; a
// foot that should stay put too gives its <tfoot> `sticky bottom-0`. A head
// cell may be a string or { label, right, className }.
export function ReportTable({
  head, loading, empty, children, foot, maxHeight = FIT_SCREEN,
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`${TABLE_BOX} ${maxHeight}`}>
        <table className="w-full text-sm">
          <thead className={STICKY_HEAD}>
            <tr>
              {head.map((h, i) => (
                <th
                  key={`${i}-${typeof h === 'string' ? h : h.label}`}
                  className={`px-3 py-3 font-semibold text-gray-600 whitespace-nowrap ${HEAD_CELL} ${h.right ? 'text-right' : 'text-left'} ${h.className || ''}`}
                >
                  {typeof h === 'string' ? h : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={head.length} className="px-3 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>)
              : children}
          </tbody>
          {foot}
        </table>
        {empty}
      </div>
    </div>
  );
}

export const td = 'px-3 py-2.5';
export const num = 'px-3 py-2.5 text-right tabular-nums whitespace-nowrap';
