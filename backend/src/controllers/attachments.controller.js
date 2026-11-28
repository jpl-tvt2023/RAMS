const db = require('../config/db');
const { SYNC_FROM } = require('../config/env');
const { todayIst } = require('../matching/load');
const { loadNarrationRule } = require('../services/narration');
const { asOfFor } = require('../statements/statement');
const {
  pickCompany, pickYear, fyLabel, loadMonths, loadVouchers,
} = require('../attachments/attachments');

// Tally Reports -> Attachments (src/attachments/attachments.js). Seeing it is
// attachments.view. Files are added and removed through /api/files
// (statements.files), the same files Party Statements and Bills Receivable show.

const sendError = (res, next, err) => (err.status && err.status < 500 ? res.status(err.status).json({ message: err.message }) : next(err));

// GET /api/attachments/months?company_id|default&fy -- every tab's months.
async function months(req, res, next) {
  try {
    const today = todayIst();
    const { company, companies } = await pickCompany(db, req.query.company_id);
    const { fy, years } = pickYear(req.query.fy, today);
    const rule = await loadNarrationRule(db);
    const [{ tabs }, asOf] = await Promise.all([
      loadMonths(db, { companyId: company.id, fy, rule }),
      asOfFor(db, company.id),
    ]);
    res.json({
      company_id: company.id,
      companies,
      fy,
      fy_label: fyLabel(fy),
      years,
      today,
      sync_from: SYNC_FROM,
      as_of: asOf,
      narration: { types: rule.types, required_from: rule.required_from },
      tabs,
    });
  } catch (err) { sendError(res, next, err); }
}

// GET /api/attachments/vouchers?company_id&fy&tab&month=YYYY-MM&only=attention&q&page&page_size
async function vouchers(req, res, next) {
  try {
    const q = req.query;
    const { company } = await pickCompany(db, q.company_id);
    const { fy } = pickYear(q.fy, todayIst());
    const out = await loadVouchers(db, {
      companyId: company.id, fy, tab: q.tab, month: q.month, only: q.only, q: q.q, page: q.page, pageSize: q.page_size,
    });
    res.json({
      company_id: company.id, company: company.code || company.name, fy, fy_label: fyLabel(fy), ...out,
    });
  } catch (err) { sendError(res, next, err); }
}

module.exports = { months, vouchers };
