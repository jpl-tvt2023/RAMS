// The narration check: which Tally records need a narration (narration_settings,
// set by whoever holds narration.settings), and each record's narration with
// whether it is missing. Every screen that lists Tally records shows the
// narration and highlights a missing one, so the flag is worked out here once.

const rowsOf = async (client, sql, args = []) => (await client.execute({ sql, args })).rows;
const CHUNK = 400;

function parseTypes(text) {
  if (text == null || text === '') return null;
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) && list.length ? list.map(String) : null;
  } catch {
    return null;
  }
}

async function loadNarrationRule(client) {
  const [r] = await rowsOf(client, `
    SELECT s.*, u.name AS updated_by_name FROM narration_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1`);
  return {
    types: parseTypes(r?.types),
    required_from: r?.required_from || null,
    updated_at: r?.updated_at ?? null,
    updated_by_name: r?.updated_by_name ?? null,
  };
}

// Whether the rule asks this record for a narration.
const needsNarration = (rule, v) => (!rule.types || rule.types.includes(v.base_type))
  && (!rule.required_from || !v.date || v.date >= rule.required_from);

// { narration, narration_missing } for a voucher row ({ narration, base_type, date }).
function narrationOf(rule, v) {
  const text = v?.narration == null ? '' : String(v.narration).trim();
  return { narration: text || null, narration_missing: Boolean(v) && !text && needsNarration(rule, v) };
}

/**
 * A lookup for records whose voucher row isn't at hand: given (company, GUID)
 * pairs, reads their vouchers in chunks and returns
 * (companyId, guid) => { narration, narration_missing }.
 */
async function narrationLookup(client, pairs, rule = null) {
  const r = rule || await loadNarrationRule(client);
  const guids = [...new Set(pairs.map(([, g]) => g).filter(Boolean))];
  const found = new Map();
  for (let i = 0; i < guids.length; i += CHUNK) {
    const part = guids.slice(i, i + CHUNK);
    const rows = await rowsOf(client, `SELECT company_id, guid, narration, base_type, date FROM tally_vouchers
                                        WHERE guid IN (${part.map(() => '?').join(',')})`, part);
    for (const v of rows) found.set(`${Number(v.company_id)}|${v.guid}`, v);
  }
  return (companyId, guid) => {
    const v = found.get(`${Number(companyId)}|${guid}`);
    return v ? narrationOf(r, v) : { narration: null, narration_missing: false };
  };
}

module.exports = {
  loadNarrationRule, needsNarration, narrationOf, narrationLookup, parseTypes,
};
