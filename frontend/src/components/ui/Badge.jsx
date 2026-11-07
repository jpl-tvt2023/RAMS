import { BADGE_COLORS } from '../../utils/highlights';

// icon: a lucide icon shown before the words, so a status never rests on its
// colour alone.
export default function Badge({ children, color = 'gray', icon: Icon = null, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${BADGE_COLORS[color] || BADGE_COLORS.gray} ${className}`}>
      {Icon && <Icon size={12} aria-hidden="true" className="shrink-0" />}
      {children}
    </span>
  );
}
