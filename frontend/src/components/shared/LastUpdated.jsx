import { useState } from 'react';
import { History } from 'lucide-react';
import HistoryDrawer from './HistoryDrawer';
import { formatDateTime } from '../../utils/formatters';
import { lastUpdatedText } from '../../utils/lastUpdated';

/**
 * A row's "Last updated by" cell: the person who last changed it in RAMS, with
 * the date and time (IST) underneath. Clicking it opens the row's change
 * history. "—" when no person has changed the row yet.
 *
 * name, at       who and when (at is the server's UTC datetime)
 * entityType/Id  the record whose history opens (as HistoryButton takes them)
 * title          the history window's title
 * what           the row, for the screen-reader label ("Minutes", "PO P123")
 * description    the change, shown on hover
 */
export function LastUpdatedCell({
  name, at, entityType, entityId, title, what = '', description = '',
}) {
  const [open, setOpen] = useState(false);
  if (!at) return <span className="text-gray-400">—</span>;
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label={`History of ${what || 'this row'}: last updated by ${name || 'Someone'}`}
        title={description || 'See every change'}
        className="text-left text-brand hover:underline"
      >
        <span className="inline-flex items-center gap-1 whitespace-nowrap"><History size={12} aria-hidden="true" />{name || 'Someone'}</span>
        <span className="block text-xs text-gray-500 whitespace-nowrap">{formatDateTime(at)}</span>
      </button>
      {open && (
        // Clicks inside the window must not reach a clickable row behind it.
        <div onClick={(e) => e.stopPropagation()}>
          <HistoryDrawer open onClose={() => setOpen(false)} entityType={entityType} entityId={entityId} title={title || `History — ${what}`} />
        </div>
      )}
    </>
  );
}

/**
 * The same, as one line of text for a page or panel that holds a single
 * record (a settings panel). `empty` is shown when nobody has changed it yet
 * (nothing by default).
 */
export function LastUpdatedLine({
  name, at, empty = null, className = 'text-xs text-gray-400',
}) {
  const text = lastUpdatedText(name, at) || empty;
  return text ? <p className={className}>{text}</p> : null;
}
