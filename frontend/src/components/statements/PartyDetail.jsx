import { X, Paperclip } from 'lucide-react';
import Badge from '../ui/Badge';
import Narration from '../shared/Narration';
import Legend from '../shared/Legend';
import { ReportTable, td, num } from '../reports/ReportFrame';
import {
  COLUMN, LEGEND, STATE_DIFFERS, OPENING_SOURCE, noteStatus, dnNumbers, balance, signed,
} from '../../utils/statementText';
import { NO_FILE } from '../../utils/highlights';
import { formatDay, formatDateTime } from '../../utils/formatters';

function Status({ s }) {
  if (!s) return null;
  return (
    <>
      <Badge color={s.color} icon={s.icon}>{s.label}</Badge>
      {s.detail && <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>}
    </>
  );
}

// A row's files: a paperclip with how many, which opens them. A flagged row
// with none says "No file" on the orange fill; any other row with none is
// just a dash. Anyone who may attach files gets an Add button too.
export function FilesCell({
  files = [], what, flagged = false, canFiles, onOpen,
}) {
  if (files.length) {
    return (
      <button type="button" aria-label={`Files on ${what}`} onClick={onOpen} className="inline-flex items-center gap-1 text-brand hover:underline whitespace-nowrap">
        <Paperclip size={14} aria-hidden="true" />
        {files.length} {files.length === 1 ? 'file' : 'files'}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {flagged && (
        <span title={NO_FILE.help} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${NO_FILE.className}`}>
          <Paperclip size={12} aria-hidden="true" />
          {NO_FILE.label}
        </span>
      )}
      {canFiles && (
        <button type="button" aria-label={`Add a file to ${what}`} onClick={onOpen} className="text-xs font-medium text-brand hover:underline whitespace-nowrap">Add</button>
      )}
      {!flagged && !canFiles && <span className="text-gray-400">—</span>}
    </span>
  );
}

/**
 * One party over the range: its header (both states, the opening's source)
 * and Tally's vouchers -- every row is Tally's -- with their narrations, the
 * DN numbers a credit note names, a DN booked twice, the files and the running
 * balance. A row without a file is highlighted orange, and "Without a file"
 * shows only those.
 */
export default function PartyDetail({
  day, canFiles = false, onlyNoFile = false, onToggleNoFile, onFiles, onClose,
}) {
  const { party } = day;
  const src = OPENING_SOURCE[day.start.source] || OPENING_SOURCE.placeholder;
  const noFile = day.vouchers.filter((v) => !(v.files || []).length);
  const rows = onlyNoFile ? noFile : day.vouchers;
  return (
    <section aria-label={`Statement of ${party.name}`} className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">{party.name}</h2>
          <p className="text-sm text-gray-500">
            {party.vendor} · {party.company} · {formatDay(day.from)} to {formatDay(day.to)}
            {party.suggested && <span className="ml-2 text-xs text-gray-500">(marketplace suggested — confirm on Matching → Party ledgers)</span>}
          </p>
          <p className="text-sm text-gray-600 mt-0.5">
            State: {party.state || 'not set'}
            {party.state_differs && (
              <span className="ml-2 inline-flex"><Badge color={STATE_DIFFERS.color} icon={STATE_DIFFERS.icon}>State differs</Badge></span>
            )}
          </p>
          {party.state_differs && (
            <p className="text-xs text-purple-700 mt-0.5">Tally says {party.tally_state}, the GSTIN ({party.gstin}) says {party.gst_state}. Correct the ledger in Tally.</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Tally figures as of {day.as_of ? formatDateTime(day.as_of) : 'the last sync'}</span>
          <button type="button" aria-label="Close the party" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
        <span>Opening <strong className="tabular-nums">{balance(day.opening_paise)}</strong> <span className="text-xs text-gray-500">({src.label})</span></span>
        <span>Closing <strong className="tabular-nums">{balance(day.closing_paise)}</strong></span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5 mb-2">
        <h3 className="text-sm font-semibold text-gray-700">In Tally</h3>
        {(noFile.length > 0 || onlyNoFile) && (
          <button type="button" aria-pressed={onlyNoFile} onClick={() => onToggleNoFile?.(!onlyNoFile)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${onlyNoFile ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}>
            <Paperclip size={12} aria-hidden="true" />
            Without a file ({noFile.length})
          </button>
        )}
      </div>
      <ReportTable
        head={['Date', 'Type', 'No', 'Narration', 'Column', { label: 'Amount', right: true }, { label: 'Balance', right: true }, 'Files']}
        empty={!rows.length && (
          <p className="text-center text-gray-400 py-6 text-sm">
            {onlyNoFile ? 'Every row here has a file.' : 'Tally has nothing on this party for these dates.'}
          </p>
        )}
      >
        {!onlyNoFile && (
          <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
            <td className={td} colSpan={6}>Opening on {formatDay(day.from)}</td>
            <td className={num}>{balance(day.opening_paise)}</td>
            <td />
          </tr>
        )}
        {rows.map((v) => {
          const files = v.files || [];
          const dn = dnNumbers(v.note);
          return (
            <tr key={v.guid} className={`border-b border-gray-100 align-top ${files.length ? '' : NO_FILE.row}`}>
              <td className={`${td} whitespace-nowrap`}>{formatDay(v.date)}</td>
              <td className={`${td} whitespace-nowrap`}>{v.voucher_type}</td>
              <td className={td}>
                {v.number || <span className="text-gray-400">—</span>}
                {dn && <p className="text-xs text-gray-500">{dn}</p>}
                {noteStatus(v.note) && <div className="mt-0.5"><Status s={noteStatus(v.note)} /></div>}
              </td>
              <td className={td}><Narration text={v.narration} missing={v.narration_missing} /></td>
              <td className={`${td} whitespace-nowrap`}>{COLUMN[v.column]?.label || v.column}</td>
              <td className={num}>{signed(v.effect_paise)}</td>
              <td className={num}>{balance(v.balance_paise)}</td>
              <td className={td}>
                <FilesCell files={files} what={`${v.voucher_type} ${v.number || ''}`.trim()} flagged canFiles={canFiles} onOpen={() => onFiles?.({ voucherGuid: v.guid })} />
              </td>
            </tr>
          );
        })}
        {!onlyNoFile && (
          <tr className="bg-gray-50 font-semibold">
            <td className={td} colSpan={6}>Closing on {formatDay(day.to)}</td>
            <td className={num}>{balance(day.closing_paise)}</td>
            <td />
          </tr>
        )}
      </ReportTable>
      <Legend items={LEGEND} withNarration withNoFile className="mt-2" />
    </section>
  );
}
