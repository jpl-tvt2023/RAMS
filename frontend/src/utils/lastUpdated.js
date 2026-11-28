import { formatDateTime } from './formatters';

// "Last updated by": who last changed a record in RAMS, and when.
// components/shared/LastUpdated.jsx draws it.

/** The column header every editable table uses. */
export const LAST_UPDATED = 'Last updated by';

/** "Last updated by Asha · 27 Nov 2026, 10:15", or '' when nobody has yet. */
export const lastUpdatedText = (name, at) => (at ? `${LAST_UPDATED} ${name || 'Someone'} · ${formatDateTime(at)}` : '');
