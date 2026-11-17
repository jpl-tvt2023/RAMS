import {
  Plus, Pencil, Trash2, X, Paperclip,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Narration from '../shared/Narration';
import Legend from '../shared/Legend';
import { HistoryButton } from '../shared/HistoryDrawer';
import { ReportTable, td, num } from '../reports/ReportFrame';
import {
  KIND, COLUMN, LEGEND, STATE_DIFFERS, OPENING_SOURCE, entryStatus, noteStatus, balance, signed,
} from '../../utils/ledgerText';
import { NO_FILE } from '../../utils/highlights';
import { formatDay, formatDateTime, formatRupees } from '../../utils/formatters';

function Status({ s }) {
  if (!s) return null;
  return (
    <>
      {s.color ? <Badge color={s.color} icon={s.icon}>{s.label}</Badge> : <span className="text-xs text-gray-500">{s.label}</span>}
      {s.detail && <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>}
    </>
  );
}

// A row's files: a paperclip with how many, which opens them. A note typed
// here with none says "No file" on the orange fill; a Tally row with none is
// just a dash. Anyone who may attach files gets an Add button instead.
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
 * One party over the range: its header (both states, the opening's source),
 * the debit and credit notes typed here with what Tally has for each and their
 * files, and Tally's vouchers with their narrations, files and the running
 * balance. A note typed here without a file is highlighted orange.
 */
export default function PartyDetail({
  day, canEnter, canFiles = false, onlyNoFile = false, onToggleNoFile, onAdd, onEdit, onRemove, onFiles, onClose,
}) {
  const { party } = day;
  const src = OPENING_SOURCE[day.start.source] || OPENING_SOURCE.placeholder;
  const noFile = day.entries.filter((e) => !(e.files || []).length);
  const entries = onlyNoFile ? noFile : day.entries;
  const what = (e) => `${KIND[e.kind]?.label || e.kind} ${e.number}`;
  return (
    <section aria-label={`Ledger of ${party.name}`} className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
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
        <h3 className="text-sm font-semibold text-gray-700">Debit and credit notes entered here</h3>
        {(noFile.length > 0 || onlyNoFile) && (
          <button type="button" aria-pressed={onlyNoFile} onClick={() => onToggleNoFile?.(!onlyNoFile)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium transition-colors ${onlyNoFile ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}>
            <Paperclip size={12} aria-hidden="true" />
            Without a file ({noFile.length})
          </button>
        )}
        {canEnter && <Button size="sm" className="ml-auto" onClick={onAdd}><Plus size={14} /> Add a DN or CN</Button>}
      </div>
      <ReportTable
        head={['Date', 'Type', 'No', 'Against invoice', { label: 'Amount', right: true }, 'In Tally?', 'Files', ...(canEnter ? [''] : [])]}
        empty={!entries.length && (
          <p className="text-center text-gray-400 py-6 text-sm">
            {onlyNoFile ? 'Every note here has a file.' : `Nothing entered for these dates.${canEnter ? ' Click “Add a DN or CN”.' : ''}`}
          </p>
        )}
      >
        {entries.map((e) => {
          const files = e.files || [];
          return (
            <tr key={e.id} className={`border-b border-gray-100 align-top ${files.length ? '' : NO_FILE.row}`}>
              <td className={`${td} whitespace-nowrap`}>{formatDay(e.date)}</td>
              <td className={`${td} whitespace-nowrap`}>{KIND[e.kind]?.label || e.kind}</td>
              <td className={td}>
                <span className="font-medium">{e.number}</span>
                {e.note && <p className="text-xs text-gray-500">{e.note}</p>}
              </td>
              <td className={td}>{e.reference || <span className="text-gray-400">—</span>}</td>
              <td className={num}>{formatRupees(e.amount_paise)}</td>
              <td className={td}><Status s={entryStatus(e, day.settings)} /></td>
              <td className={td}>
                <FilesCell files={files} what={what(e)} flagged canFiles={canFiles} onOpen={() => onFiles?.({ entryId: e.id })} />
              </td>
              {canEnter && (
                <td className={`${td} whitespace-nowrap text-right`}>
                  <button type="button" aria-label={`Change ${e.number}`} onClick={() => onEdit(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Pencil size={14} /></button>
                  <button type="button" aria-label={`Remove ${e.number}`} onClick={() => onRemove(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><Trash2 size={14} /></button>
                  <HistoryButton entityType="ledger_entries" entityId={e.id} title={`History — ${KIND[e.kind]?.label} ${e.number}`} />
                </td>
              )}
            </tr>
          );
        })}
      </ReportTable>

      <h3 className="text-sm font-semibold text-gray-700 mt-5 mb-2">In Tally</h3>
      <ReportTable
        head={['Date', 'Type', 'No', 'Narration', 'Column', { label: 'Amount', right: true }, { label: 'Balance', right: true }, 'Files']}
        empty={!day.vouchers.length && <p className="text-center text-gray-400 py-6 text-sm">Tally has nothing on this party for these dates.</p>}
      >
        <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
          <td className={td} colSpan={6}>Opening on {formatDay(day.from)}</td>
          <td className={num}>{balance(day.opening_paise)}</td>
          <td />
        </tr>
        {day.vouchers.map((v) => (
          <tr key={v.guid} className="border-b border-gray-100 align-top">
            <td className={`${td} whitespace-nowrap`}>{formatDay(v.date)}</td>
            <td className={`${td} whitespace-nowrap`}>{v.voucher_type}</td>
            <td className={td}>
              {v.number || <span className="text-gray-400">—</span>}
              {v.note && <div className="mt-0.5"><Status s={noteStatus(v.note)} /></div>}
            </td>
            <td className={td}><Narration text={v.narration} missing={v.narration_missing} /></td>
            <td className={`${td} whitespace-nowrap`}>{COLUMN[v.column]?.label || v.column}</td>
            <td className={num}>{signed(v.effect_paise)}</td>
            <td className={num}>{balance(v.balance_paise)}</td>
            <td className={td}>
              <FilesCell files={v.files || []} what={`${v.voucher_type} ${v.number || ''}`.trim()} canFiles={canFiles} onOpen={() => onFiles?.({ voucherGuid: v.guid })} />
            </td>
          </tr>
        ))}
        <tr className="bg-gray-50 font-semibold">
          <td className={td} colSpan={6}>Closing on {formatDay(day.to)}</td>
          <td className={num}>{balance(day.closing_paise)}</td>
          <td />
        </tr>
      </ReportTable>
      <Legend items={LEGEND} withNarration withNoFile className="mt-2" />
    </section>
  );
}
