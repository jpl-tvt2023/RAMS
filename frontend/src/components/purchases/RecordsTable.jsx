import { CircleAlert, RefreshCw } from 'lucide-react';
import { ReportTable, td, num } from '../reports/ReportFrame';
import FilesCell from '../files/FilesCell';
import Button from '../ui/Button';
import { LastUpdatedCell } from '../shared/LastUpdated';
import { HistoryButton } from '../shared/HistoryDrawer';
import { formatDate, formatDateTime } from '../../utils/formatters';
import {
  statusOf, statusDetail, ROW_FILL, STATUS_TEXT, WITH_CHECKER, stepOf, numText,
} from '../../utils/purchaseText';

/**
 * Purchase Reports' table: one record per block, its ROMS lines one per row.
 * The record's own cells (Incoming, Files, Bill check by, Status, actions)
 * span its lines. Only an approved record (green) and one sent back (red) are
 * highlighted.
 *
 * can: { check, purchase, accounts } -- what this person may do.
 * selected / onSelect: the records ticked for "Approve selected".
 */
export default function RecordsTable({
  rows, loading, can, selected, onSelect, onFiles, onCheck, onApprove, onSendBack, empty,
}) {
  const selectable = can.purchase || can.accounts;
  const head = [
    ...(selectable ? [''] : []),
    'Incoming', 'Date', 'Billing / Challan', 'PO', 'Article', { label: 'Rate', right: true }, { label: 'Qty', right: true }, 'UOM',
    'Files', 'Bill check by', 'Status', 'Actions',
  ];
  return (
    <ReportTable head={head} loading={loading} empty={!loading && !rows.length ? empty : null}>
      {rows.map((r) => {
        const lines = r.lines.length ? r.lines : [{ key: 'none', removed: true }];
        const span = lines.length;
        const status = statusOf(r.status);
        const Icon = status.icon;
        const step = stepOf(r.status);
        const mayApprove = (step === 'purchase' && can.purchase) || (step === 'accounts' && can.accounts);
        const filesOpen = can.check && WITH_CHECKER.includes(r.status);
        const fill = ROW_FILL[r.status] || '';
        const what = r.label;
        return lines.map((l, i) => (
          <tr key={`${r.id}-${l.key}`} className={`${i === span - 1 ? 'border-b border-gray-200' : ''} ${fill} align-top`}>
            {i === 0 && selectable && (
              <td rowSpan={span} className={td}>
                {mayApprove && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${what}`}
                    checked={selected.has(r.id)}
                    onChange={(e) => onSelect(r.id, e.target.checked)}
                    className="w-4 h-4 accent-brand"
                  />
                )}
              </td>
            )}
            {i === 0 && (
              <td rowSpan={span} className={`${td} whitespace-nowrap`}>
                {r.incoming
                  ? <span className="font-mono font-medium text-gray-900">{r.incoming}</span>
                  : r.no_incoming
                    ? <span className="inline-flex items-center gap-1 text-gray-600" title="ROMS has no Incoming No on this receipt. Add it in ROMS and RAMS groups it with its delivery."><CircleAlert size={12} aria-hidden="true" />No Incoming No in ROMS</span>
                    : <span className="text-gray-400">—</span>}
                <span className="block text-xs text-gray-500">{r.kind === 'challan' ? r.party : r.vendor}</span>
              </td>
            )}
            <td className={`${td} whitespace-nowrap ${l.removed ? 'line-through text-gray-400' : ''}`}>{l.date ? formatDate(l.date) : '—'}</td>
            <td className={`${td} ${l.removed ? 'line-through text-gray-400' : ''}`}>
              <span className="font-mono">{l.billing || '—'}</span>
              {l.from_stage && <span className="block text-xs text-gray-500 whitespace-nowrap">{l.from_stage} → {l.to_stage}</span>}
            </td>
            <td className={`${td} ${l.removed ? 'line-through text-gray-400' : ''}`}>{l.po || '—'}</td>
            <td className={`${td} ${l.removed ? 'line-through text-gray-400' : ''}`}>{l.article || '—'}</td>
            <td className={`${num} ${l.removed ? 'line-through text-gray-400' : ''}`}>{numText(l.rate)}</td>
            <td className={`${num} ${l.removed ? 'line-through text-gray-400' : ''}`}>{numText(l.qty)}</td>
            <td className={`${td} ${l.removed ? 'line-through text-gray-400' : ''}`}>{l.uom || '—'}</td>
            {i === 0 && (
              <>
                <td rowSpan={span} className={td}>
                  <FilesCell files={r.files} what={what} canFiles={filesOpen} onOpen={() => onFiles(r)} />
                </td>
                <td rowSpan={span} className={td}>
                  <LastUpdatedCell
                    name={r.check?.name}
                    at={r.check?.at}
                    entityType="purchase_records"
                    entityId={r.id}
                    what={what}
                    title={`History — ${what}`}
                    description={r.check?.note ? `Note: ${r.check.note}` : 'Bill check — see every change'}
                  />
                </td>
                <td rowSpan={span} className={`${td} max-w-xs`}>
                  <span className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${STATUS_TEXT[r.status] || 'text-gray-700'}`}>
                    <Icon size={14} aria-hidden="true" />{status.label}
                  </span>
                  {statusDetail(r).map((t) => (
                    <span key={t} className={`block text-xs ${STATUS_TEXT[r.status] || 'text-gray-500'}`}>{t}</span>
                  ))}
                  {r.status === 'changed' && r.changed?.changes?.length > 0 && (
                    <ul className="mt-0.5 text-xs text-gray-500 space-y-0.5" aria-label="What ROMS changed">
                      {r.changed.changes.slice(0, 3).map((c) => (
                        <li key={`${c.field}-${c.new}`}>{c.field}: {c.old ?? '—'} → {c.new ?? '—'}</li>
                      ))}
                      {r.changed.changes.length > 3 && <li>and {r.changed.changes.length - 3} more (see the history)</li>}
                    </ul>
                  )}
                </td>
                <td rowSpan={span} className={`${td} whitespace-nowrap`}>
                  <div className="flex items-center gap-1">
                    {can.check && WITH_CHECKER.includes(r.status) && (
                      <Button size="sm" onClick={() => onCheck(r)}>{r.status === 'to_check' ? 'Bill check' : 'Check again'}</Button>
                    )}
                    {mayApprove && (
                      <>
                        <Button size="sm" onClick={() => onApprove(r)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => onSendBack(r)}>Send back</Button>
                      </>
                    )}
                    <HistoryButton entityType="purchase_records" entityId={r.id} title={`History — ${what}`} />
                  </div>
                  {r.status === 'changed' && r.changed?.at && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 mt-1"><RefreshCw size={11} aria-hidden="true" />ROMS changed it {formatDateTime(r.changed.at)}</span>
                  )}
                </td>
              </>
            )}
          </tr>
        ));
      })}
    </ReportTable>
  );
}
