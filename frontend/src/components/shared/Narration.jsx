import { Highlighter } from 'lucide-react';
import { NO_NARRATION } from '../../utils/highlights';

// A Tally record's narration, as every screen shows it: the text with its line
// breaks, two lines at most (all of it on hover). When the narration check
// says the record needs one and it has none, a bright yellow highlighter fill
// with the words "No narration" -- a fill, never a badge, so it can't be read
// as one of a screen's statuses.
export default function Narration({ text, missing = false, className = '' }) {
  if (text) {
    return <span title={text} className={`block max-w-xs whitespace-pre-line line-clamp-2 text-xs text-gray-600 ${className}`}>{text}</span>;
  }
  if (missing) {
    return (
      <span title={NO_NARRATION.help} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${NO_NARRATION.className} ${className}`}>
        <Highlighter size={12} aria-hidden="true" />
        {NO_NARRATION.label}
      </span>
    );
  }
  return <span className="text-xs text-gray-400">—</span>;
}
