// Financial years, April to March, for the pages that pick one: Attachments
// and Purchase Reports. A year goes by the calendar year it starts in (2026 is
// FY 2026-27). RAMS holds Tally's books from SYNC_FROM, so the years offered
// run from SYNC_FROM's year to today's, newest first.
const { SYNC_FROM } = require('../config/env');
const { fyOf } = require('../matching/engine');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fail = (status, message) => Object.assign(new Error(message), { status });

const fyLabel = (fy) => `${fy}-${String(fy + 1).slice(2)}`;

// The months of a financial year, April first: { month: 'YYYY-MM', from, to }.
function monthsOf(fy) {
  return Array.from({ length: 12 }, (_, i) => {
    const y = i < 9 ? fy : fy + 1;
    const m = ((i + 3) % 12) + 1;
    const month = `${y}-${String(m).padStart(2, '0')}`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { month, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
  });
}

const monthLabel = (month) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// Every financial year from SYNC_FROM's to today's, newest first.
function yearsOf(today) {
  const out = [];
  for (let fy = fyOf(today); fy >= fyOf(SYNC_FROM); fy -= 1) out.push({ fy, label: fyLabel(fy) });
  return out;
}

// The year asked for, else the current one. 400 outside the years offered.
function pickYear(value, today) {
  const years = yearsOf(today);
  if (value == null || value === '') return { fy: years[0].fy, years };
  const fy = Number(value);
  if (!years.some((y) => y.fy === fy)) throw fail(400, `RAMS holds Tally from ${SYNC_FROM}: choose a financial year from ${years.at(-1).label} to ${years[0].label}`);
  return { fy, years };
}

// The months of a year that have begun by today, newest first (YYYY-MM).
const begunMonths = (fy, today) => monthsOf(fy).filter((m) => m.from <= today).map((m) => m.month).reverse();

module.exports = {
  fyOf, fyLabel, monthsOf, monthLabel, yearsOf, pickYear, begunMonths, MONTH_NAMES,
};
