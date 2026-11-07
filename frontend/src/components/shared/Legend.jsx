import { Highlighter } from 'lucide-react';
import { BADGE_COLORS, NO_NARRATION } from '../../utils/highlights';

// One line saying what each colour on a screen means. Each screen builds its
// items from the same status map its badges use, so the two can't drift.
// items: [{ key, color, icon, label, help }]. withNarration adds the yellow
// "No narration" highlight.
export default function Legend({ items, withNarration = false, className = '' }) {
  return (
    <div role="note" aria-label="What the colours mean" className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 ${className}`}>
      <span className="font-medium text-gray-600">What the colours mean:</span>
      {items.map(({
        key, color, icon: Icon, label, help,
      }) => (
        <span key={key} title={help} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${BADGE_COLORS[color] || BADGE_COLORS.gray}`}>
          {Icon && <Icon size={12} aria-hidden="true" />}
          {label}
        </span>
      ))}
      {withNarration && (
        <span title={NO_NARRATION.help} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${NO_NARRATION.className}`}>
          <Highlighter size={12} aria-hidden="true" />
          {NO_NARRATION.label}
        </span>
      )}
    </div>
  );
}
