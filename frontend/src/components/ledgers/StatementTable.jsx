import { Highlighter } from 'lucide-react';
import { ReportTable, td, num } from '../reports/ReportFrame';
import Legend from '../shared/Legend';
import {
  COLUMNS, LEGEND, STATE_DIFFERS, cellFindings, balance, signed,
} from '../../utils/ledgerText';

// Written out whole, so Tailwind keeps them.
const CHIP_TEXT = {
  red: 'text-red-700', purple: 'text-purple-700', blue: 'text-blue-700', gray: 'text-gray-500', green: 'text-green-700',
};

// A DN or CN figure: Tally's, tinted with the most urgent thing the check found
// there, with an icon and count per kind of finding.
function NoteCell({ value, counts, kind }) {
  const f = cellFindings(counts, kind);
  return (
    <td className={`${num} ${f.tint}`} title={f.sentence || undefined}>
      {signed(value)}
      {f.chips.length > 0 && (
        <span className="flex justify-end gap-1.5 mt-0.5 text-xs font-medium">
          {f.chips.map((c) => {
            const Icon = c.icon;
            return (
              <span key={c.meaning} className={`inline-flex items-center gap-0.5 ${CHIP_TEXT[c.color]}`}>
                <Icon size={12} aria-hidden="true" />
                {c.count}
              </span>
            );
          })}
        </span>
      )}
    </td>
  );
}

export function StateLine({ party }) {
  return (
    <>
      {party.state || <span className="text-gray-400">State not set</span>}
      {party.state_differs && (
        <span className="ml-1.5 inline-flex items-center gap-0.5 text-purple-700 font-medium" title="Tally’s state and the GSTIN’s disagree. Correct the ledger in Tally.">
          <STATE_DIFFERS.icon size={12} aria-hidden="true" />
          {STATE_DIFFERS.label}: Tally says {party.tally_state}
        </span>
      )}
    </>
  );
}

/**
 * The bill-to-bill statement: one row per party, every figure Tally's, so each
 * row adds up to Tally's closing. A row opens that party's detail.
 */
export default function StatementTable({
  data, loading, selected, onOpen, showCompany,
}) {
  const rows = data?.rows || [];
  const keyOf = (r) => `${r.party.company_id}:${r.party.guid}`;
  const head = ['Party', { label: 'Opening', right: true }, ...COLUMNS.map((c) => ({ label: c.label, right: true })), { label: 'Closing', right: true }];
  const t = data?.totals;
  return (
    <>
      <ReportTable
        loading={loading}
        head={head}
        empty={!loading && !rows.length && <p className="text-center text-gray-400 py-8 text-sm">No party matches these filters.</p>}
        foot={t && rows.length > 1 ? (
          <tfoot>
            <tr className="bg-gray-50 font-semibold border-t border-gray-200">
              <td className={td}>
                Total
                {t.placeholders > 0 && <p className="text-xs font-normal text-gray-500">{t.placeholders} opening{t.placeholders > 1 ? 's are placeholders' : ' is a placeholder'}, not from Tally</p>}
              </td>
              <td className={num}>{balance(t.opening_paise)}</td>
              {COLUMNS.map((c) => <td key={c.key} className={num}>{signed(t.columns[c.key])}</td>)}
              <td className={num}>{balance(t.closing_paise)}</td>
            </tr>
          </tfoot>
        ) : null}
      >
        {rows.map((r) => (
          <tr key={keyOf(r)} className={`border-b border-gray-100 align-top ${selected === keyOf(r) ? 'bg-brand-surface' : 'hover:bg-gray-50'}`}>
            <td className={`${td} max-w-[18rem]`}>
              <button type="button" className="text-left font-medium text-brand hover:underline" onClick={() => onOpen(r)}>{r.party.name}</button>
              <p className="text-xs text-gray-500">
                {showCompany && `${r.party.company} · `}
                <StateLine party={r.party} />
              </p>
              {r.narration_missing > 0 && (
                <p className="mt-0.5"><span className="inline-flex items-center gap-1 px-1.5 rounded text-xs font-medium bg-yellow-200 text-yellow-900"><Highlighter size={11} aria-hidden="true" />{r.narration_missing} without narration</span></p>
              )}
            </td>
            <td className={num}>
              {balance(r.opening_paise)}
              {r.start.source === 'placeholder' && <p className="text-xs text-gray-400">placeholder</p>}
            </td>
            {COLUMNS.map((c) => (c.key === 'dn' || c.key === 'cn'
              ? <NoteCell key={c.key} value={r.columns[c.key]} counts={r.checks[c.key]} kind={c.key === 'dn' ? 'DN' : 'CN'} />
              : <td key={c.key} className={num}>{signed(r.columns[c.key])}</td>))}
            <td className={`${num} font-medium`}>{balance(r.closing_paise)}</td>
          </tr>
        ))}
      </ReportTable>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <Legend items={LEGEND} withNarration />
        <p className="text-xs text-gray-500">+ adds to what the party owes, − takes it off. Every figure is Tally’s.</p>
      </div>
    </>
  );
}
